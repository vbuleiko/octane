"""Dealer websites: /site/<slug>/... on our address, and the same pages at / on a dealer's own domain.

Every view takes the dealer from the address. On our domain that's the slug, on the dealer's domain it's
g.host (find_host). site_url() builds links for whichever address the visitor is on.
"""
import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import quote

from flask import (
    Blueprint,
    Response,
    abort,
    current_app,
    flash,
    g,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from . import accounts, catalog, hours, leads, photos, samples, seed, stats, stock, themes
from .db import get_db
from .security import client_ip, limiter
from .utils import (
    clean_line,
    clean_text,
    is_number,
    local_phone,
    local_today,
    monthly_payment,
    normalize_phone,
    now_utc,
    parse_amount,
    parse_decimal,
    phone_is_valid,
    rand,
    thousands,
    ts,
    wa_link,
    zone,
)

bp = Blueprint("site", __name__)
PAGES = {  # endpoint -> path after the dealer's address
    "home": "/",
    "cars": "/cars",
    "car": "/cars/<car>",
    "finance": "/finance",
    "sell": "/sell",
    "contact": "/contact",
    "privacy": "/privacy",
    "thanks": "/thanks",
    "sitemap": "/sitemap.xml",
}
ENQUIRY_KINDS = ("enquiry", "test_drive", "finance", "sell", "contact")


def find_host():
    """A dealer's own address (www.joesmotors.co.za): its website on /, its app on /app."""
    g.host = None
    if request.endpoint != "static":
        host = re.sub(r":\d+$", "", request.host.lower())
        g.host = get_db().execute("SELECT * FROM tenants WHERE domain = ? AND is_demo = 0", (host,)).fetchone()


def use(tenant):
    """Checks a dealer's website can be shown and makes it the page's dealer (look, time zone).
    A subscription that ended more than a week ago leaves only the contact details up."""
    if tenant is None or tenant["is_disabled"] or (tenant["is_demo"] and tenant["created_at"] < seed.demo_cutoff()):
        abort(404)
    g.site = tenant
    g.tz = zone(tenant["timezone"])
    if not accounts.site_live(tenant, local_today(g.tz)):
        abort(Response(_render("site/closed.html", tenant), 503))
    return tenant


def _tenant(slug: str | None):
    if g.host:
        if slug is not None:  # /site/<slug> on a dealer's own address: only its own pages, at /
            abort(404)
        return use(g.host)
    if slug is None:
        abort(404)
    return use(get_db().execute("SELECT * FROM tenants WHERE slug = ?", (slug,)).fetchone())


def site_url(endpoint: str, tenant=None, external: bool = False, **values) -> str:
    tenant = tenant or g.site
    if g.get("host") and g.host["id"] == tenant["id"]:
        if endpoint == "home":
            return url_for("public.landing", _external=external, **values)
        return url_for(f"site.{endpoint}_d", _external=external, **values)
    return url_for(f"site.{endpoint}", slug=tenant["slug"], _external=external, **values)


def public_url(tenant, endpoint: str = "home", **values) -> str:
    """The address people, Google and the portals should use: the dealer's own domain if it has one."""
    if tenant["domain"]:
        path = "/" if endpoint == "home" else url_for(f"site.{endpoint}_d", **values)
        return f"https://{tenant['domain']}{path}"
    return url_for(f"site.{endpoint}", slug=tenant["slug"], _external=True, **values)


def home_url(tenant) -> str:
    return public_url(tenant)


def place(tenant) -> str:
    parts = [tenant["address"], tenant["city"]]
    if parts[0] and parts[1] and parts[1].lower() in parts[0].lower():
        parts.pop()
    return ", ".join(p for p in parts if p)


def map_url(tenant) -> str:
    return tenant["maps_url"] or "https://www.google.com/maps/search/?api=1&query=" + quote(
        ", ".join(p for p in (tenant["name"], place(tenant)) if p))


def _wa(tenant, text: str) -> str:
    return accounts.chat_link(tenant, tenant["phone"], text) if tenant["phone"] else ""


def _owner_view(tenant) -> bool:
    return session.get("tenant_id") == tenant["id"] and session.get("key") == tenant["session_key"]


def _stock(tenant) -> list[dict]:
    """The cars on the website. A dealer we made a website for shows example cars until it adds its own."""
    cars = stock.public_cars(get_db(), tenant["id"])
    if not cars and accounts.is_prospect(tenant):
        return samples.as_stock(tenant["created_at"])
    return cars


def _perks(tenant) -> list[tuple[str, str]]:
    try:
        keys = json.loads(tenant["perks"] or "[]")
    except ValueError:
        keys = []
    return [catalog.PERKS[k] for k in keys if k in catalog.PERKS]


def _common(tenant) -> dict:
    now_local = now_utc().astimezone(g.tz)
    prospect = accounts.is_prospect(tenant)
    open_now, open_text = hours.status(tenant, now_local)
    return {
        "t": tenant,
        "su": lambda endpoint, **values: site_url(endpoint, tenant, **values),
        "pu": lambda endpoint="home", **values: public_url(tenant, endpoint, **values),
        "opening_hours": hours.schema_org(tenant),
        "place": place(tenant),
        "map_url": map_url(tenant),
        "hours_rows": hours.rows(tenant),
        "open_now": open_now,
        "open_text": open_text,
        "wa": _wa(tenant, f"Hi {tenant['name']}! I saw your cars online."),
        "logo": photos.logo(tenant["logo"]),
        "perks": _perks(tenant),
        "prospect": prospect,
        "has_own_cars": prospect and get_db().execute(
            "SELECT 1 FROM vehicles WHERE tenant_id = ? AND status IN ('available', 'reserved')", (tenant["id"],)
        ).fetchone() is not None,
        "owner_view": _owner_view(tenant) and not prospect,
        "noindex": prospect or tenant["is_demo"],
        "home_url": home_url(tenant),
        "year": date.today().year,
        "phone_text": tenant["landline"] or local_phone(tenant["phone"]),
        "finance_on": bool(tenant["finance_on"]),
    }


def _render(template: str, tenant, **context):
    return render_template(template, **_common(tenant), **context)


def _count(tenant, vehicle_id: int = 0):
    """A visitor's view: not robots or link previews, not the dealer looking at their own website."""
    if stats.counts_visitor() and not accounts.is_prospect(tenant) and not _owner_view(tenant):
        stats.add(get_db(), tenant, vehicle_id)


def _add_finance(tenant, cars: list[dict]) -> list[dict]:
    for c in cars:
        c["finance"] = stock.finance(tenant, c["price"])
    return cars


# --- pages ---------------------------------------------------------------------------

def home_page(tenant):
    use(tenant)
    _count(tenant)
    cars = _stock(tenant)
    makes = sorted({c["make"] for c in cars})
    bodies = [b for b in catalog.BODIES if any(c["body"] == b for c in cars)]
    return _render("site/home.html", tenant, cars=_add_finance(tenant, stock.home_cars(cars)), total=len(cars),
                   makes=makes, bodies=bodies,
                   sold=stock.recently_sold(get_db(), tenant["id"]) if cars and not cars[0].get("sample") else [],
                   max_price=max((c["price"] for c in cars), default=0), price_steps=stock.PRICE_STEPS)


def home(slug=None):
    tenant = _tenant(slug)
    return home_page(tenant)


def cars(slug=None):
    tenant = _tenant(slug)
    _count(tenant)
    all_cars = _stock(tenant)
    f = stock.parse_filters(request.args)
    result = stock.search(all_cars, f)
    _add_finance(tenant, result["cars"])
    return _render("site/cars.html", tenant, f=f, r=result, total=len(all_cars), sorts=stock.SORTS,
                   price_steps=[p for p in stock.PRICE_STEPS if p <= max((c["price"] for c in all_cars), default=0)
                                * 1.5], km_steps=stock.KM_STEPS)


def car(car, slug=None):
    tenant = _tenant(slug)
    db = get_db()
    all_cars = _stock(tenant)
    found = stock.by_slug(db, tenant["id"], car)
    if found is None and all_cars and all_cars[0].get("sample"):
        found = next((c for c in all_cars if c["slug"] == car), None)
    if found is None:
        abort(404)
    _count(tenant, found["id"])
    page_url = public_url(tenant, "car", car=found["slug"])
    found["finance"] = stock.finance(tenant, found["price"])
    title = found["full_title"]
    wa_text = f"Hi {tenant['name']}! I'm interested in the {title} ({rand(found['price'])}). {page_url}"
    return _render(
        "site/car.html", tenant, car=found, specs=stock.specs(found), page_url=page_url,
        description=stock.full_description(found, tenant), similar=_add_finance(tenant, stock.similar(all_cars, found)),
        car_wa=_wa(tenant, wa_text), json_ld=stock.json_ld(found, tenant, page_url, home_url(tenant)),
        credits=[p["credit"] for p in found["photos"] if p.get("credit")],
    )


TERMS = [12, 24, 36, 48, 54, 60, 72, 84]


def finance(slug=None):
    """The calculator (works without JavaScript: the form reloads the page) and the finance application."""
    tenant = _tenant(slug)
    if not tenant["finance_on"]:
        abort(404)
    a = request.args
    picked = None
    if is_number(a.get("car", "")):
        picked = stock.get(get_db(), tenant["id"], int(a["car"]))
        if picked and picked["status"] not in stock.PUBLIC:
            picked = None
    price = picked["price"] if picked else (parse_amount(a.get("price")) or 250_000)
    base = stock.finance(tenant, price)
    deposit = parse_amount(a.get("deposit"))
    deposit = min(price, base["deposit"] if deposit is None else deposit)
    months = int(a["months"]) if a.get("months", "").isdigit() and int(a["months"]) in TERMS else base["months"]
    rate = parse_decimal(a.get("rate"), 0, 40)
    rate = base["rate"] if rate is None else rate
    balloon_pct = int(a["balloon"]) if a.get("balloon", "").isdigit() and int(a["balloon"]) <= 50 else base["balloon_pct"]
    calc = {"price": price, "deposit": deposit, "months": months, "rate": rate, "balloon_pct": balloon_pct,
            "monthly": monthly_payment(price, deposit, rate, months, round(price * balloon_pct / 100))}
    return _render("site/finance.html", tenant, picked=picked, calc=calc, terms=TERMS)


def sell(slug=None):
    return _render("site/sell.html", _tenant(slug))


def contact(slug=None):
    return _render("site/contact.html", _tenant(slug))


def privacy(slug=None):
    return _render("site/privacy.html", _tenant(slug))


def thanks(slug=None):
    tenant = _tenant(slug)
    kind = request.args.get("k", "")
    return _render("site/thanks.html", tenant, kind=kind if kind in leads.KINDS else "contact")


def sitemap(slug=None):
    tenant = _tenant(slug)
    if accounts.is_prospect(tenant) or tenant["is_demo"]:
        abort(404)
    urls = [public_url(tenant, e) for e in ("home", "cars", "contact", "sell")]
    if tenant["finance_on"]:
        urls.append(public_url(tenant, "finance"))
    for c in stock.public_cars(get_db(), tenant["id"]):
        urls.append(public_url(tenant, "car", car=c["slug"]))
    body = "".join(f"<url><loc>{u}</loc></url>" for u in urls)
    return Response('<?xml version="1.0" encoding="UTF-8"?>'
                    f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>',
                    mimetype="application/xml")


def robots(tenant) -> Response:
    lines = ["User-agent: *", "Disallow: /app", "Disallow: /login", "Disallow: /thanks"]
    if tenant["is_disabled"]:
        lines.append("Disallow: /")
    return Response("\n".join(lines) + f"\nSitemap: https://{tenant['domain']}/sitemap.xml\n", mimetype="text/plain")


# --- enquiries ------------------------------------------------------------------------

def _back(tenant, errors):
    for e in errors:
        flash(e, "error")
    back = request.form.get("back", "")
    return redirect(back if back.startswith("/") and back.isprintable() and not back.startswith("//")
                    else site_url("contact", tenant))


def enquire(slug=None):
    """Every form on the website posts here: a car enquiry, a test drive, finance, selling a car, a message."""
    tenant = _tenant(slug)
    db = get_db()
    f = request.form
    kind = f.get("kind", "contact")
    if kind not in ENQUIRY_KINDS:
        abort(400)
    if f.get("website"):  # the hidden field only robots fill in
        return redirect(site_url("thanks", tenant, k=kind))
    name = clean_line(f.get("name"), 60)
    phone = normalize_phone(f.get("phone"), tenant["country_code"])
    email = clean_line(f.get("email"), 120).lower()
    errors = []
    if not name:
        errors.append("Please enter your name.")
    if not phone_is_valid(phone):
        errors.append("Please enter your phone number, so we can get back to you.")
    if email and "@" not in email:
        errors.append("That email doesn't look right.")
    vehicle = None
    if is_number(f.get("car", "")):
        vehicle = stock.get(db, tenant["id"], int(f["car"]))
        if vehicle and vehicle["status"] not in stock.PUBLIC:
            vehicle = None
    details = {}
    if kind == "test_drive":
        details["when"] = clean_line(f.get("when"), 60)
    if kind == "finance":
        deposit = parse_amount(f.get("deposit"))
        income = parse_amount(f.get("income"))
        details.update(deposit=rand(deposit) if deposit else "", income=rand(income) if income else "",
                       employment=clean_line(f.get("employment"), 40))
    if kind == "sell":
        mileage = parse_amount(f.get("mileage"))
        asking = parse_amount(f.get("asking"))
        details.update(car=clean_line(f.get("their_car"), 80), year=clean_line(f.get("year"), 4),
                       mileage=f"{thousands(mileage)} km" if mileage else "", asking=rand(asking) if asking else "",
                       condition=clean_line(f.get("condition"), 40), tradein="Yes" if f.get("tradein") else "")
        if not details["car"]:
            errors.append("Tell us which car you'd like to sell: make, model and year.")
    if errors:
        return _back(tenant, errors)
    if not limiter.allow(f"lead:{tenant['id']}:{client_ip()}", 8, 3600):  # mobile networks share addresses
        return _back(tenant, ["Too many messages from this network. Please call or WhatsApp us instead."])
    with db:
        lead_id = leads.create(db, tenant["id"], kind=kind, name=name, phone=phone, email=email,
                               message=clean_text(f.get("message"), 1000), vehicle=vehicle, details=details)
        if kind == "sell":
            _sell_photos(tenant, lead_id)
    return redirect(site_url("thanks", tenant, k=kind))


def _sell_photos(tenant, lead_id: int):
    db = get_db()
    media = Path(current_app.config["MEDIA_DIR"])
    for i, upload in enumerate(request.files.getlist("photos")[:6]):
        data = upload.read(15 * 1024 * 1024 + 1)
        if not data or len(data) > 15 * 1024 * 1024:
            continue
        saved = photos.save(media, tenant["id"], data)
        if saved:
            db.execute("INSERT INTO photos (tenant_id, lead_id, key, width, height, color, position, created_at) "
                       "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                       (tenant["id"], lead_id, saved["key"], saved["width"], saved["height"], saved["color"], i, ts()))


def tap(slug=None):
    """A tap on WhatsApp or Call (site.js sends it with sendBeacon): counted for the dealer's figures."""
    tenant = _tenant(slug)
    kind = request.form.get("kind", "")
    car_id = int(request.form["car"]) if is_number(request.form.get("car", "")) else 0
    if kind in ("whatsapp", "calls") and stats.counts_visitor() and not _owner_view(tenant) \
            and limiter.allow(f"tap:{tenant['id']}:{client_ip()}", 30, 3600):
        if car_id and not get_db().execute("SELECT 1 FROM vehicles WHERE id = ? AND tenant_id = ?",
                                           (car_id, tenant["id"])).fetchone():
            car_id = 0
        stats.add(get_db(), tenant, car_id, kind)
    return ("", 204)


def pick(slug=None):
    """"I like this look" on a website we made: a WhatsApp to us with the dealer and the look."""
    tenant = _tenant(slug)
    number = current_app.config["SUPPORT_WHATSAPP"]
    if not accounts.is_prospect(tenant) or not number:
        abort(404)
    look = themes.THEMES[themes.current()]["name"]
    page = public_url(tenant)
    return redirect(wa_link(number, f"Hi! This is {tenant['name']}. We like the {look} look for our website: {page}"))


for _endpoint, _path in PAGES.items():
    _view = globals()[_endpoint]
    bp.add_url_rule(f"/site/<slug>{_path}" if _path != "/" else "/site/<slug>/", _endpoint, _view)
    if _endpoint != "home":  # on a dealer's own address "/" is the landing route, which hands over to home_page
        bp.add_url_rule(_path, f"{_endpoint}_d", _view)
bp.add_url_rule("/site/<slug>/enquire", "enquire", enquire, methods=["POST"])
bp.add_url_rule("/enquire", "enquire_d", enquire, methods=["POST"])
bp.add_url_rule("/site/<slug>/pick", "pick", pick)
bp.add_url_rule("/site/<slug>/tap", "tap", tap, methods=["POST"])
bp.add_url_rule("/tap", "tap_d", tap, methods=["POST"])


@bp.before_request
def only_on_dealer_address():
    """The root-level pages (/cars, /finance ...) exist only on a dealer's own address."""
    if request.endpoint and request.endpoint.endswith("_d") and not g.host:
        abort(404)
