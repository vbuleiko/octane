"""The dealer's app: stock, enquiries, portals, website and settings."""
import io
import json
import re
import zipfile
from datetime import timedelta
from pathlib import Path

from flask import (
    Blueprint,
    abort,
    current_app,
    flash,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

from . import accounts, catalog, disc, hours, leads, photos, portals, seed, site, stats, stock, themes
from .db import get_db
from .public import EMAIL_RE
from .security import limiter
from .utils import (
    TIMEZONES,
    clean_line,
    clean_plate,
    clean_text,
    is_number,
    local_today,
    normalize_phone,
    parse_amount,
    parse_coords,
    parse_decimal,
    phone_is_valid,
    plate_key,
    ts,
    utc_bounds_month,
    zone,
)

bp = Blueprint("owner", __name__, url_prefix="/app")
DEMO_UPLOADS = 15  # photos a demo can add: demos are deleted after a day, their files too
MAX_PHOTOS = 40


@bp.before_request
def load_tenant():
    tenant_id = session.get("tenant_id")
    if not tenant_id:
        return redirect(url_for("public.login", next=request.path if request.method == "GET" else None))
    db = get_db()
    tenant = db.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,)).fetchone()
    if tenant is None or not tenant["session_key"] or session.get("key") != tenant["session_key"]:
        session.pop("tenant_id", None)
        return redirect(url_for("public.login"))
    if g.host and g.host["id"] != tenant["id"]:  # a dealer's own address opens only its own app
        abort(404)
    if tenant["is_disabled"]:
        session.pop("tenant_id", None)
        flash("This account is paused. Please contact support.", "error")
        return redirect(url_for("public.login"))
    if tenant["is_demo"] and tenant["created_at"] < seed.demo_cutoff():
        session.pop("tenant_id", None)
        flash("That demo has ended. Here's a fresh one whenever you like.")
        return redirect(url_for("public.landing"))
    g.tenant = tenant
    g.tz = zone(tenant["timezone"])
    g.today = local_today(g.tz)
    g.sub = accounts.subscription(tenant, g.today)
    g.new_leads = leads.count_new(db, tenant_id)
    g.site_url = site.home_url(tenant)
    now = ts()
    if not tenant["last_seen_at"] or tenant["last_seen_at"][:15] != now[:15]:  # at most every 10 minutes
        with db:
            db.execute("UPDATE tenants SET last_seen_at = ? WHERE id = ?", (now, tenant_id))


def _tid() -> int:
    return g.tenant["id"]


def _media() -> Path:
    return Path(current_app.config["MEDIA_DIR"])


def _fetch() -> bool:
    return request.headers.get("X-Requested-With") == "fetch"


def _car_or_404(vehicle_id: int) -> dict:
    car = stock.get(get_db(), _tid(), vehicle_id)
    if car is None:
        abort(404)
    return car


def _reload_tenant():
    g.tenant = get_db().execute("SELECT * FROM tenants WHERE id = ?", (_tid(),)).fetchone()


# --- stock ------------------------------------------------------------------------------

SHOW = {"sale": ("available", "reserved"), "draft": ("draft",), "sold": ("sold",)}


@bp.get("/")
def stock_list():
    db = get_db()
    show = request.args.get("show", "sale")
    if show not in SHOW:
        show = "sale"
    q = " ".join(request.args.get("q", "").split())[:40]
    statuses = SHOW[show]
    marks = ",".join("?" * len(statuses))
    rows = db.execute(
        f"SELECT v.*, (SELECT COUNT(*) FROM leads l WHERE l.vehicle_id = v.id) AS lead_count FROM vehicles v "
        f"WHERE v.tenant_id = ? AND v.status IN ({marks}) ORDER BY "
        + ("v.sold_at DESC" if show == "sold" else "COALESCE(v.listed_at, v.created_at) DESC") + ", v.id DESC",
        (_tid(), *statuses),
    ).fetchall()
    cars = stock.attach_photos(db, [stock.as_dict(r) | {"lead_count": r["lead_count"]} for r in rows], first_only=True)
    if q:
        words = q.lower().split()
        cars = [c for c in cars if all(w in f"{c['full_title']} {c['stock_no']} {c['reg_no']} {c['colour']}".lower()
                                       for w in words)]
    seen = stats.per_car(db, _tid(), g.today)
    for c in cars:
        c["days"] = stock.days_in_stock(c)
        c["stats"] = seen.get(c["id"])
    counts = dict(db.execute("SELECT status, COUNT(*) FROM vehicles WHERE tenant_id = ? GROUP BY status",
                             (_tid(),)).fetchall())
    return render_template("app/stock.html", cars=cars, show=show, q=q, counts=counts, summary=_summary(db),
                           first_run=not counts)


def _summary(db) -> dict:
    on_sale = [stock.as_dict(r) for r in db.execute(
        "SELECT * FROM vehicles WHERE tenant_id = ? AND status IN ('available', 'reserved')", (_tid(),))]
    month_start, _ = utc_bounds_month(g.today, g.tz)
    sold = db.execute("SELECT price, cost, recon FROM vehicles WHERE tenant_id = ? AND status = 'sold' AND sold_at >= ?",
                      (_tid(), month_start)).fetchall()
    days = [d for d in (stock.days_in_stock(c) for c in on_sale) if d is not None]
    costed = [s for s in sold if s["cost"]]
    return {
        "for_sale": len(on_sale),
        "value": sum(c["price"] for c in on_sale),
        "avg_days": round(sum(days) / len(days)) if days else None,
        "old": sum(1 for d in days if d >= 60),
        "sold_month": len(sold),
        "profit_month": sum(s["price"] - s["cost"] - s["recon"] for s in costed) if costed else None,
        "week": stats.totals(db, _tid(), g.today),
    }


def _form_context(car: dict | None, form: dict | None = None) -> dict:
    db = get_db()
    form = form or {}
    channels = portals.dealer_channels(db, g.tenant)
    photo_rows = []
    ids = form.get("photo_ids")
    if ids is not None:  # the form came back with an error: keep the photos it had, in its order
        photo_rows = _photos_by_ids(db, ids, car["id"] if car else None)
    elif car:
        photo_rows = car["photos"]
    return {
        "car": car,
        "form": form,
        "photos": photo_rows,
        "makes": catalog.MAKES,
        "channels": [c for c in channels if c["status"] in ("connected", "requested")],
        "max_photos": MAX_PHOTOS,
        "this_year": g.today.year,
    }


def _photos_by_ids(db, ids: list[int], vehicle_id: int | None) -> list[dict]:
    if not ids:
        return []
    marks = ",".join("?" * len(ids))
    rows = {r["id"]: dict(r) for r in db.execute(
        f"SELECT * FROM photos WHERE tenant_id = ? AND id IN ({marks}) AND lead_id IS NULL "
        "AND (vehicle_id IS NULL OR vehicle_id = ?)", (_tid(), *ids, vehicle_id or 0))}
    return [rows[i] for i in ids if i in rows]


def _read_car_form(car: dict | None) -> tuple[dict, list[str]]:
    f = request.form
    errors = []
    make = catalog.nice_make(clean_line(f.get("make"), 30)) if f.get("make", "").strip() else ""
    model = clean_line(f.get("model"), 40)
    if not make:
        errors.append("Choose the make.")
    if not model:
        errors.append("Enter the model, e.g. Corolla or Polo Vivo.")
    year = int(f["year"]) if is_number(f.get("year")) else 0
    if not 1950 <= year <= g.today.year + 1:
        errors.append("Enter the year, e.g. 2019.")
    status = f.get("status", "available")
    if status not in stock.STATUSES:
        status = "available"
    price = parse_amount(f.get("price"))
    if price is None and f.get("price", "").strip():
        errors.append("Price should be a number in rand, e.g. 189 995.")
    if not price and status in ("available", "reserved"):
        errors.append("Enter the price, or save the car as a draft.")
    was_price = parse_amount(f.get("was_price")) or 0
    mileage = parse_amount(f.get("mileage"), 2_000_000)
    if mileage is None and f.get("mileage", "").strip():
        errors.append("Mileage should be a number of km, e.g. 84 000.")
    cost = parse_amount(f.get("cost"))
    recon = parse_amount(f.get("recon"))
    vin = plate_key(f.get("vin"))[:17]
    if vin and len(vin) != 17:
        errors.append("A VIN has 17 letters and numbers. Check it or leave it empty.")

    def pick(name, options, limit=30):
        value = clean_line(f.get(name), limit)
        lower = {o.lower(): o for o in options}
        return lower.get(value.lower(), value)

    def small_int(name, top):
        value = f.get(name, "").strip()
        return int(value) if is_number(value) and int(value) <= top else 0

    features = f.getlist("feature") + [x for x in re.split(r"[,\n]", f.get("more_features", "")) if x.strip()]
    shown = {c["key"] for c in portals.dealer_channels(get_db(), g.tenant) if c["status"] in ("connected", "requested")}
    before = set((car or {}).get("channels_off", []))
    channels_off = sorted((before - shown) | (shown - set(f.getlist("advertise")))) if f.get("advertise_shown") \
        else sorted(before)
    data = {
        "make": make, "model": model, "variant": clean_line(f.get("variant"), 60), "year": year,
        "price": price or 0, "was_price": was_price if price and was_price > price else 0,
        "mileage": mileage or 0, "status": status,
        "body": pick("body", catalog.BODIES), "fuel": pick("fuel", catalog.FUELS),
        "transmission": pick("transmission", catalog.TRANSMISSIONS), "drive": pick("drive", catalog.DRIVES, 10),
        "engine": clean_line(f.get("engine"), 20), "colour": clean_line(f.get("colour"), 30).capitalize(),
        "doors": small_int("doors", 9), "seats": small_int("seats", 60),
        "condition": f.get("condition") if f.get("condition") in catalog.CONDITIONS else "used",
        "service_history": f.get("service_history") if f.get("service_history") in catalog.SERVICE_HISTORY else "",
        "features": json.loads(catalog.features_json(features)),
        "description": clean_text(f.get("description"), 5000),
        "featured": f.get("featured") == "1",
        "stock_no": clean_line(f.get("stock_no"), 20),
        "reg_no": clean_plate(f.get("reg_no")), "vin": vin, "engine_no": plate_key(f.get("engine_no"))[:20],
        "cost": cost or 0, "recon": recon or 0,
        "channels_off": channels_off,
        "photo_ids": [int(x) for x in f.getlist("photo") if is_number(x)][:MAX_PHOTOS],
    }
    return data, errors


def _save_car(data: dict, car: dict | None) -> int:
    db = get_db()
    now = ts()
    data = dict(data)
    if not data["stock_no"]:
        data["stock_no"] = car["stock_no"] if car and car["stock_no"] else stock.next_stock_no(db, _tid())
    slug = stock.unique_slug(db, _tid(), data, car["id"] if car else 0)
    if car and car["slug"] and car["year"] == data["year"] and car["make"] == data["make"] \
            and car["model"] == data["model"] and car["variant"] == data["variant"]:
        slug = car["slug"]  # keep its address (portals and Google know it) unless the car itself changed
    listed = (car or {}).get("listed_at")
    if data["status"] in ("available", "reserved", "sold") and not listed:
        listed = now
    sold_at = (car or {}).get("sold_at")
    if data["status"] == "sold" and not sold_at:
        sold_at = now
    elif data["status"] != "sold":
        sold_at = None
    columns = ["stock_no", "slug", "status", "make", "model", "variant", "year", "price", "was_price", "mileage",
               "body", "fuel", "transmission", "drive", "engine", "colour", "doors", "seats", "condition",
               "service_history", "features", "description", "featured", "reg_no", "vin", "engine_no", "cost",
               "recon", "channels_off", "updated_at", "listed_at", "sold_at"]
    values = {**data, "slug": slug, "features": json.dumps(data["features"]), "featured": int(data["featured"]),
              "channels_off": json.dumps(data["channels_off"]), "updated_at": now, "listed_at": listed,
              "sold_at": sold_at}
    if car:
        db.execute(f"UPDATE vehicles SET {', '.join(c + ' = ?' for c in columns)} WHERE id = ? AND tenant_id = ?",
                   (*(values[c] for c in columns), car["id"], _tid()))
        vehicle_id = car["id"]
    else:
        cur = db.execute(
            f"INSERT INTO vehicles (tenant_id, created_at, {', '.join(columns)}) "
            f"VALUES (?, ?, {', '.join('?' * len(columns))})",
            (_tid(), now, *(values[c] for c in columns)),
        )
        vehicle_id = cur.lastrowid
    for position, photo_id in enumerate(data["photo_ids"]):
        db.execute("UPDATE photos SET vehicle_id = ?, position = ? WHERE id = ? AND tenant_id = ? AND lead_id IS NULL "
                   "AND (vehicle_id IS NULL OR vehicle_id = ?)", (vehicle_id, position, photo_id, _tid(), vehicle_id))
    if not g.tenant["is_demo"]:
        catalog.learn(db, data)
    return vehicle_id


def _plain_uploads(vehicle_id: int):
    """Photos sent with the form itself (a phone without JavaScript): shrink and attach them in order."""
    db = get_db()
    start = db.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM photos WHERE vehicle_id = ?",
                       (vehicle_id,)).fetchone()[0]
    for i, upload in enumerate(f for f in request.files.getlist("photos") if f.filename):
        saved = _store_photo(upload.read())
        if saved:
            db.execute("INSERT INTO photos (tenant_id, vehicle_id, key, width, height, color, position, created_at) "
                       "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                       (_tid(), vehicle_id, saved["key"], saved["width"], saved["height"], saved["color"],
                        start + i, ts()))


def _store_photo(data: bytes) -> dict | None:
    if not data or not _upload_allowed():
        return None
    return photos.save(_media(), _tid(), data)


def _upload_allowed() -> bool:
    db = get_db()
    if g.tenant["is_demo"]:
        made = db.execute("SELECT COUNT(*) FROM photos WHERE tenant_id = ? AND key NOT LIKE 'samples/%'",
                          (_tid(),)).fetchone()[0]
        if made >= DEMO_UPLOADS:
            return False
    return limiter.allow(f"photo:{_tid()}", 400, 3600)


@bp.route("/car/new", methods=["GET", "POST"])
def new_car():
    if not g.sub["active"]:
        flash("Your subscription has ended: renew it to add cars.", "error")
        return redirect(url_for(".settings_account"))
    if request.method == "POST":
        data, errors = _read_car_form(None)
        if not errors:
            db = get_db()
            with db:
                vehicle_id = _save_car(data, None)
                _plain_uploads(vehicle_id)
            flash(_saved_message(data["status"]))
            return redirect(url_for(".edit_car", vid=vehicle_id))
        for e in errors:
            flash(e, "error")
        return render_template("app/car.html", **_form_context(None, data))
    return render_template("app/car.html", **_form_context(None))


def _saved_message(status: str) -> str:
    return {"draft": "Saved as a draft: only you can see it.",
            "sold": "Saved. Sold cars come off your website and the portals.",
            "reserved": "Saved. It shows as reserved on your website."}.get(status, "Saved. It's on your website now.")


@bp.route("/car/<int:vid>", methods=["GET", "POST"])
def edit_car(vid):
    car = _car_or_404(vid)
    if request.method == "POST":
        data, errors = _read_car_form(car)
        if not errors:
            db = get_db()
            with db:
                _save_car(data, car)
                _plain_uploads(vid)
            flash(_saved_message(data["status"]))
            return redirect(url_for(".edit_car", vid=vid))
        for e in errors:
            flash(e, "error")
        return render_template("app/car.html", **_form_context(car, data))
    context = _form_context(car)
    context["leads"] = [leads.as_dict(r) for r in get_db().execute(
        "SELECT * FROM leads WHERE tenant_id = ? AND vehicle_id = ? ORDER BY created_at DESC LIMIT 20", (_tid(), vid))]
    context["page_url"] = site.public_url(g.tenant, "car", car=car["slug"])
    context["days"] = stock.days_in_stock(car)
    context["seen"] = stats.per_car(get_db(), _tid(), g.today).get(vid)
    context["ad_text"] = portals.ad_text(g.tenant, car)
    context["share_urls"] = [photos.jpeg(p, external=False) for p in car["photos"]]
    return render_template("app/car.html", **context)


STATIC = Path(__file__).parent / "static"


@bp.get("/car/<int:vid>/photos.zip")
def photos_zip(vid):
    """The car's photos as JPEGs, to put it on a portal by hand."""
    car = _car_or_404(vid)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:  # JPEGs don't get smaller in a zip
        for i, p in enumerate(car["photos"], start=1):
            path = (STATIC if p["key"].startswith("samples/") else _media()) / f"{p['key']}.jpg"
            if path.is_file():
                z.write(path, f"{car['slug']}-{i:02d}.jpg")
    buf.seek(0)
    return send_file(buf, mimetype="application/zip", as_attachment=True, download_name=f"{car['slug']}-photos.zip")


@bp.post("/car/<int:vid>/status")
def set_status(vid):
    car = _car_or_404(vid)
    status = request.form.get("status", "")
    if status not in stock.STATUSES:
        abort(400)
    if status in ("available", "reserved") and not car["price"]:
        flash("Add a price before putting the car on sale.", "error")
        return redirect(url_for(".edit_car", vid=vid))
    now = ts()
    db = get_db()
    with db:
        db.execute(
            "UPDATE vehicles SET status = ?, updated_at = ?, listed_at = COALESCE(listed_at, CASE WHEN ? != 'draft' "
            "THEN ? END), sold_at = CASE WHEN ? = 'sold' THEN COALESCE(sold_at, ?) END WHERE id = ? AND tenant_id = ?",
            (status, now, status, now, status, now, vid, _tid()),
        )
    if _fetch():
        return jsonify(ok=True)
    flash(_saved_message(status))
    back = request.form.get("next", "")
    return redirect(back if back.startswith("/app") and back.isprintable() else url_for(".edit_car", vid=vid))


@bp.post("/car/<int:vid>/delete")
def delete_car(vid):
    car = _car_or_404(vid)
    db = get_db()
    with db:
        for p in car["photos"]:
            _forget_photo(db, p)
        db.execute("DELETE FROM vehicles WHERE id = ? AND tenant_id = ?", (vid, _tid()))
    flash(f"{car['full_title']} deleted.")
    return redirect(url_for(".stock_list"))


def _forget_photo(db, photo):
    db.execute("DELETE FROM photos WHERE id = ?", (photo["id"],))
    if not db.execute("SELECT 1 FROM photos WHERE key = ?", (photo["key"],)).fetchone():
        photos.delete_files(_media(), photo["key"], photo["width"])


@bp.post("/photos")
def upload_photo():
    """One photo from the car form (already made smaller on the phone)."""
    upload = request.files.get("photo")
    vehicle_id = int(request.form["car"]) if is_number(request.form.get("car")) else None
    db = get_db()
    if vehicle_id and not db.execute("SELECT 1 FROM vehicles WHERE id = ? AND tenant_id = ?",
                                     (vehicle_id, _tid())).fetchone():
        abort(404)
    if g.tenant["is_demo"] and db.execute(
            "SELECT COUNT(*) FROM photos WHERE tenant_id = ? AND key NOT LIKE 'samples/%'", (_tid(),)
    ).fetchone()[0] >= DEMO_UPLOADS:
        return jsonify(ok=False, error=f"The demo takes up to {DEMO_UPLOADS} photos. Sign up to add as many as you like."), 400
    saved = _store_photo(upload.read() if upload else b"")
    if not saved:
        return jsonify(ok=False, error="That file isn't a photo we can read. Try a JPEG or PNG."), 400
    with db:  # a saved car keeps the photo straight away; a new one gets it when the form is saved
        position = db.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM photos WHERE vehicle_id = ?",
                              (vehicle_id,)).fetchone()[0] if vehicle_id else 999
        cur = db.execute(
            "INSERT INTO photos (tenant_id, vehicle_id, key, width, height, color, position, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (_tid(), vehicle_id, saved["key"], saved["width"], saved["height"], saved["color"], position, ts()),
        )
    return jsonify(ok=True, id=cur.lastrowid, src=photos.src(saved, 400), color=saved["color"])


@bp.post("/photo/<int:pid>/delete")
def delete_photo(pid):
    db = get_db()
    photo = db.execute("SELECT * FROM photos WHERE id = ? AND tenant_id = ?", (pid, _tid())).fetchone()
    if photo is None:
        abort(404)
    with db:
        _forget_photo(db, photo)
    if _fetch():
        return jsonify(ok=True)
    return redirect(url_for(".edit_car", vid=photo["vehicle_id"]) if photo["vehicle_id"] else url_for(".stock_list"))


@bp.get("/catalog")
def catalog_lookup():
    """Models for a make, or variants (with their specs) for a model: the car form's suggestions."""
    db = get_db()
    make = catalog.nice_make(request.args.get("make", "")[:30])
    model = request.args.get("model", "")[:40].strip()
    if model:
        return jsonify(variants=catalog.variants_for(db, make, model))
    return jsonify(models=catalog.models_for(db, make))


@bp.get("/disc")
def disc_lookup():
    """A scanned licence disc -> make, model, colour, body, VIN and registration for the car form."""
    found = disc.parse(request.args.get("code", "")[:2000])
    if not found:
        return jsonify(found=False)
    return jsonify(found=True, **found)


@bp.post("/describe")
def describe():
    f = request.form
    car = {k: clean_line(f.get(k), 60) for k in ("make", "model", "variant", "transmission", "fuel", "engine",
                                                  "service_history")}
    car["year"] = f.get("year", "")[:4]
    car["mileage"] = parse_amount(f.get("mileage"), 2_000_000) or 0
    car["features"] = f.getlist("feature")[:20]
    return jsonify(text=stock.describe(car))


# --- enquiries ------------------------------------------------------------------------

LEAD_TABS = {"open": ("new", "contacted"), "won": ("won",), "lost": ("lost",)}


@bp.get("/leads")
def lead_list():
    db = get_db()
    show = request.args.get("show", "open")
    if show not in LEAD_TABS:
        show = "open"
    marks = ",".join("?" * len(LEAD_TABS[show]))
    rows = db.execute(
        f"SELECT l.*, v.slug AS car_slug, v.status AS car_status FROM leads l LEFT JOIN vehicles v ON v.id = l.vehicle_id "
        f"WHERE l.tenant_id = ? AND l.status IN ({marks}) ORDER BY l.status = 'new' DESC, l.created_at DESC LIMIT 300",
        (_tid(), *LEAD_TABS[show]),
    ).fetchall()
    items = []
    for r in rows:
        lead = leads.as_dict(r)
        lead["reply"] = leads.reply_link(g.tenant, lead)
        lead["reply_text"] = leads.reply_text(g.tenant, lead)
        items.append(lead)
    counts = dict(db.execute("SELECT status, COUNT(*) FROM leads WHERE tenant_id = ? GROUP BY status",
                             (_tid(),)).fetchall())
    return render_template("app/leads.html", items=items, show=show, counts=counts)


def _lead_or_404(lid: int) -> dict:
    row = get_db().execute("SELECT * FROM leads WHERE id = ? AND tenant_id = ?", (lid, _tid())).fetchone()
    if row is None:
        abort(404)
    return leads.as_dict(row)


@bp.route("/lead/<int:lid>", methods=["GET", "POST"])
def lead(lid):
    item = _lead_or_404(lid)
    db = get_db()
    if request.method == "POST":
        status = request.form.get("status", item["status"])
        if status not in leads.STATUSES:
            abort(400)
        with db:
            db.execute("UPDATE leads SET status = ?, notes = ?, updated_at = ? WHERE id = ?",
                       (status, clean_text(request.form.get("notes"), 2000), ts(), lid))
        flash("Saved.")
        return redirect(url_for(".lead", lid=lid))
    car = stock.get(db, _tid(), item["vehicle_id"]) if item["vehicle_id"] else None
    item["reply"] = leads.reply_link(g.tenant, item)
    item["reply_text"] = leads.reply_text(g.tenant, item)
    pics = [dict(r) for r in db.execute("SELECT * FROM photos WHERE lead_id = ? ORDER BY position", (lid,))]
    others = [leads.as_dict(r) for r in db.execute(
        "SELECT * FROM leads WHERE tenant_id = ? AND phone = ? AND phone != '' AND id != ? ORDER BY created_at DESC",
        (_tid(), item["phone"], lid))]
    return render_template("app/lead.html", lead=item, car=car, pics=pics, others=others)


@bp.post("/lead/<int:lid>/contacted")
def lead_contacted(lid):
    """The WhatsApp answer was opened: the enquiry moves from New to Contacted."""
    item = _lead_or_404(lid)
    if item["status"] == "new":
        db = get_db()
        with db:
            db.execute("UPDATE leads SET status = 'contacted', updated_at = ? WHERE id = ?", (ts(), lid))
    if _fetch():
        return jsonify(ok=True)
    return redirect(url_for(".lead", lid=lid))


@bp.route("/lead/new", methods=["GET", "POST"])
def new_lead():
    """A walk-in or a phone call, written down so it isn't forgotten."""
    db = get_db()
    on_sale = [stock.as_dict(r) for r in db.execute(
        "SELECT * FROM vehicles WHERE tenant_id = ? AND status IN ('available', 'reserved') ORDER BY make, model",
        (_tid(),))]
    if request.method == "POST":
        f = request.form
        name = clean_line(f.get("name"), 60)
        phone = normalize_phone(f.get("phone"), g.tenant["country_code"])
        errors = []
        if not name:
            errors.append("Enter their name.")
        if phone and not phone_is_valid(phone):
            errors.append("That phone number doesn't look right.")
        kind = f.get("kind") if f.get("kind") in leads.KINDS else "enquiry"
        source = f.get("source") if f.get("source") in leads.SOURCES else "walk-in"
        vehicle = stock.get(db, _tid(), int(f["car"])) if is_number(f.get("car")) else None
        if not errors:
            with db:
                lid = leads.create(db, _tid(), kind=kind, name=name, phone=phone,
                                   email=clean_line(f.get("email"), 120).lower(), vehicle=vehicle,
                                   message=clean_text(f.get("message"), 1000), source=source, status="contacted")
                db.execute("UPDATE leads SET emailed_at = created_at WHERE id = ?", (lid,))  # they typed it in
            flash("Saved.")
            return redirect(url_for(".lead", lid=lid))
        for e in errors:
            flash(e, "error")
    return render_template("app/lead_new.html", cars=on_sale, form=request.form)


# --- portals ----------------------------------------------------------------------------

@bp.get("/portals")
def portal_list():
    db = get_db()
    on_sale = db.execute("SELECT COUNT(*) FROM vehicles WHERE tenant_id = ? AND status IN ('available', 'reserved')",
                         (_tid(),)).fetchone()[0]
    return render_template("app/portals.html", channels=portals.dealer_channels(db, g.tenant), on_sale=on_sale,
                           feeds=portals.feed_urls(g.tenant), fb_missing=portals.missing_for_facebook(g.tenant))


@bp.post("/portals/<key>")
def portal_update(key):
    """Ask us to connect a portal (we do the paperwork), pause it, or switch a self-serve one on."""
    if key not in portals.CHANNELS:
        abort(404)
    action = request.form.get("action", "")
    db = get_db()
    now = ts()
    with db:
        if action == "connect":
            account = clean_line(request.form.get("account"), 60)
            note = clean_text(request.form.get("note"), 500)
            status = "connected" if portals.CHANNELS[key]["self_serve"] else "requested"
            db.execute(
                "INSERT INTO channels (tenant_id, channel, status, account, note, requested_at, connected_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (tenant_id, channel) DO UPDATE SET status = "
                "CASE WHEN channels.status = 'connected' OR excluded.status = 'connected' THEN 'connected' "
                "ELSE 'requested' END, account = excluded.account, note = excluded.note, "
                "requested_at = excluded.requested_at",
                (_tid(), key, status, account, note, now, now if status == "connected" else None),
            )
            flash(portals.CHANNELS[key]["after_connect"])
        elif action == "pause":
            db.execute("UPDATE channels SET status = 'paused' WHERE tenant_id = ? AND channel = ?", (_tid(), key))
            flash(f"{portals.CHANNELS[key]['name']}: paused. Your cars come off it at its next update.")
        elif action == "resume":
            db.execute("UPDATE channels SET status = CASE WHEN connected_at IS NULL THEN 'requested' ELSE 'connected' "
                       "END WHERE tenant_id = ? AND channel = ?", (_tid(), key))
            flash(f"{portals.CHANNELS[key]['name']}: on again.")
        else:
            abort(400)
    return redirect(url_for(".portal_list", _anchor=key))


# --- website and settings -----------------------------------------------------------------

@bp.get("/website")
def website():
    db = get_db()
    on_sale = db.execute("SELECT COUNT(*) FROM vehicles WHERE tenant_id = ? AND status IN ('available', 'reserved')",
                         (_tid(),)).fetchone()[0]
    return render_template("app/website.html", on_sale=on_sale, logo=photos.logo(g.tenant["logo"]))


@bp.get("/settings")
def settings():
    return render_template("app/settings.html")


@bp.route("/settings/business", methods=["GET", "POST"])
def settings_business():
    db = get_db()
    week = hours.week(g.tenant)
    rows = [(i, name, bool(span), *(span or ("08:30", "17:00"))) for i, (name, span) in
            enumerate(zip(hours.WEEKDAYS, week))]
    if request.method == "POST":
        f = request.form
        name = clean_line(f.get("name"), 60)
        country_code = re.sub(r"\D", "", f.get("country_code", "")).lstrip("0") or "27"
        phone = normalize_phone(f.get("phone"), country_code)
        public_email = clean_line(f.get("public_email"), 120).lower()
        lead_email = clean_line(f.get("lead_email"), 120).lower()
        maps_url = clean_line(f.get("maps_url"), 300)
        coords_text = clean_line(f.get("coords"), 80)
        coords = parse_coords(coords_text) or (parse_coords(maps_url) if not coords_text else None)
        province = f.get("province", "") if f.get("province", "") in catalog.PROVINCES else ""
        errors = []
        if not name:
            errors.append("Enter your dealership's name.")
        if phone and not phone_is_valid(phone):
            errors.append("That WhatsApp number doesn't look right.")
        for value, label in ((public_email, "Email on the website"), (lead_email, "Email for enquiries")):
            if value and not EMAIL_RE.match(value):
                errors.append(f"{label}: that email doesn't look right.")
        if maps_url and not maps_url.startswith("https://"):
            errors.append("The Google Maps link should start with https://")
        if coords_text and not coords:
            errors.append("Map coordinates: two numbers like -33.9249, 18.4241.")
        rows = [(i, day, f.get(f"open_{i}") == "1", f.get(f"from_{i}", ""), f.get(f"to_{i}", ""))
                for i, day in enumerate(hours.WEEKDAYS)]
        for _, day, is_open, a, b in rows:
            if is_open and not (a in hours.TIMES and b in hours.TIMES and a < b):
                errors.append(f"{day}: closing time should be after opening time.")
        if f.get("timezone") not in TIMEZONES:
            errors.append("Choose a time zone.")
        if not errors:
            week_json = json.dumps([[a, b] if is_open else None for _, _, is_open, a, b in rows])
            with db:
                db.execute(
                    "UPDATE tenants SET name = ?, phone = ?, landline = ?, public_email = ?, lead_email = ?, "
                    "address = ?, city = ?, province = ?, postal_code = ?, latitude = ?, longitude = ?, maps_url = ?, "
                    "hours = ?, country_code = ?, timezone = ? WHERE id = ?",
                    (name, phone, clean_line(f.get("landline"), 30), public_email, lead_email,
                     clean_line(f.get("address"), 120), clean_line(f.get("city"), 60), province,
                     clean_line(f.get("postal_code"), 10), coords[0] if coords else None,
                     coords[1] if coords else None, maps_url, week_json, country_code[:4], f["timezone"], _tid()),
                )
            flash("Saved.")
            return redirect(url_for(".settings"))
        for e in errors:
            flash(e, "error")
    return render_template("app/settings_business.html", rows=rows, times=hours.TIMES, timezones=TIMEZONES,
                           provinces=catalog.PROVINCES)


@bp.route("/settings/site", methods=["GET", "POST"])
def settings_site():
    db = get_db()
    if request.method == "POST":
        f = request.form
        perks = [k for k in f.getlist("perk") if k in catalog.PERKS]
        with db:
            db.execute(
                "UPDATE tenants SET tagline = ?, about = ?, perks = ?, desc_footer = ?, msg_reply = ? WHERE id = ?",
                (clean_line(f.get("tagline"), 90), clean_text(f.get("about"), 1500), json.dumps(perks),
                 clean_text(f.get("desc_footer"), 600), clean_text(f.get("msg_reply"), 600), _tid()),
            )
            upload = request.files.get("logo")
            if upload and upload.filename:
                value = photos.save_logo(_media(), _tid(), upload.read(8 * 1024 * 1024))
                if value:
                    photos.delete_logo(_media(), g.tenant["logo"])
                    db.execute("UPDATE tenants SET logo = ? WHERE id = ?", (value, _tid()))
                else:
                    flash("That logo file isn't an image we can read. Try a PNG or JPEG.", "error")
            elif f.get("remove_logo") == "1" and g.tenant["logo"]:
                photos.delete_logo(_media(), g.tenant["logo"])
                db.execute("UPDATE tenants SET logo = '' WHERE id = ?", (_tid(),))
        flash("Saved. Your website shows it now.")
        return redirect(url_for(".website"))
    try:
        perks = json.loads(g.tenant["perks"] or "[]")
    except ValueError:
        perks = []
    return render_template("app/settings_site.html", perks=perks, logo=photos.logo(g.tenant["logo"]),
                           msg_reply=leads.MSG_REPLY)


@bp.route("/settings/finance", methods=["GET", "POST"])
def settings_finance():
    if request.method == "POST":
        f = request.form
        rate = parse_decimal(f.get("rate"), 0, 40)
        months = int(f["months"]) if is_number(f.get("months")) else 0
        deposit = int(f["deposit"]) if is_number(f.get("deposit")) else -1
        balloon = int(f["balloon"]) if is_number(f.get("balloon")) else -1
        errors = []
        if rate is None:
            errors.append("Interest rate: a number such as 12.5.")
        if months not in (12, 24, 36, 48, 54, 60, 72, 84):
            errors.append("Choose the term.")
        if not 0 <= deposit <= 90:
            errors.append("Deposit: 0 to 90 percent.")
        if not 0 <= balloon <= 50:
            errors.append("Balloon: 0 to 50 percent.")
        if not errors:
            db = get_db()
            with db:
                db.execute("UPDATE tenants SET finance_on = ?, finance_rate = ?, finance_months = ?, finance_deposit = ?, "
                           "finance_balloon = ? WHERE id = ?",
                           (int(f.get("finance_on") == "1"), rate, months, deposit, balloon, _tid()))
            flash("Saved.")
            return redirect(url_for(".website"))
        for e in errors:
            flash(e, "error")
    _reload_tenant()
    example = stock.finance(g.tenant, 250_000) if g.tenant["finance_on"] else None
    return render_template("app/settings_finance.html", example=example)


@bp.route("/settings/theme", methods=["GET", "POST"])
def settings_theme():
    if request.method == "POST":
        name = request.form.get("theme", "")
        if name not in themes.THEMES:
            abort(400)
        db = get_db()
        with db:
            db.execute("UPDATE tenants SET theme = ? WHERE id = ?", (name, _tid()))
        back = request.form.get("next", "")  # the website's own look switch for its owner
        if _fetch():
            return themes.remember(jsonify(ok=True), name)
        ok = back.isprintable() and (back.startswith("/site/") or back == "/" or (g.host and back.startswith("/")))
        return themes.remember(redirect(back if ok else url_for(".settings_theme")), name)
    return render_template("app/settings_theme.html")


@bp.route("/settings/account", methods=["GET", "POST"])
def settings_account():
    db = get_db()
    if request.method == "POST" and not g.tenant["is_demo"]:
        current, new = request.form.get("current", ""), request.form.get("new", "")
        if not check_password_hash(g.tenant["password_hash"] or "", current):
            flash("Current password is wrong.", "error")
        elif len(new) < 8:
            flash("New password needs at least 8 characters.", "error")
        else:
            with db:
                db.execute("UPDATE tenants SET password_hash = ? WHERE id = ?", (generate_password_hash(new), _tid()))
            session["key"] = accounts.session_key(db, _tid(), rotate=True)
            flash("Password changed. Other phones are logged out.")
        return redirect(url_for(".settings_account"))
    return render_template("app/settings_account.html", grace=accounts.GRACE_DAYS,
                           site_until=g.sub["until"] + timedelta(days=accounts.GRACE_DAYS) if g.sub["until"] else None)
