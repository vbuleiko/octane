"""Your own back office: every dealer, trials and payments, own addresses, websites for dealers that haven't
signed up yet, and portal connections to set up."""
import calendar
import re
import secrets
from datetime import date, timedelta

from flask import (
    Blueprint,
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
from werkzeug.security import generate_password_hash

from . import accounts, portals, public, seed, site, themes
from .db import get_db
from .security import client_ip, limiter, same
from .utils import DEFAULT_TZ, clean_line, days_ago, local_today, normalize_phone, phone_is_valid, ts, zone

bp = Blueprint("admin", __name__, url_prefix="/admin")

DOMAIN_RE = re.compile(r"(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}")
MAPS_RE = re.compile(r"https://(maps\.app\.goo\.gl|goo\.gl/maps|(www\.)?google\.[a-z.]+/maps|maps\.google\.[a-z.]+)[/?]\S*")
PROSPECT_DAYS = 365  # its website stays up while we talk; the pilot starts when the owner gets the login


def add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    year, month = d.year + m // 12, m % 12 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


@bp.before_request
def require_admin():
    if not current_app.config["ADMIN_PASSWORD"] or g.host:
        abort(404)
    if request.endpoint != "admin.login" and not session.get("admin"):
        return redirect(url_for("admin.login"))


@bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        if not limiter.allow(f"admin:{client_ip()}", 5, 900):
            flash("Too many attempts. Wait 15 minutes.", "error")
        elif same(request.form.get("password", ""), current_app.config["ADMIN_PASSWORD"]):
            session["admin"] = True
            session.permanent = True
            return redirect(url_for("admin.index"))
        else:
            flash("Wrong password.", "error")
    return render_template("admin/login.html")


@bp.post("/logout")
def logout():
    session.pop("admin", None)
    return redirect(url_for("admin.login"))


@bp.get("/")
def index():
    db = get_db()
    since = ts(days_ago(30))
    tenants = [dict(r) for r in db.execute(
        "SELECT t.*, "
        "(SELECT COUNT(*) FROM vehicles v WHERE v.tenant_id = t.id AND v.status IN ('available', 'reserved')) AS on_sale, "
        "(SELECT COUNT(*) FROM vehicles v WHERE v.tenant_id = t.id AND v.status = 'sold' AND v.sold_at >= ?) AS sold_30d, "
        "(SELECT COUNT(*) FROM leads l WHERE l.tenant_id = t.id AND l.created_at >= ?) AS leads_30d, "
        "(SELECT MAX(created_at) FROM vehicles v WHERE v.tenant_id = t.id) AS last_car "
        "FROM tenants t WHERE t.is_demo = 0 ORDER BY t.id DESC",
        (since, since),
    )]
    today = local_today(zone(DEFAULT_TZ))
    for t in tenants:
        t["days_left"] = (date.fromisoformat(t["paid_until"]) - today).days
        t["page_url"] = site.home_url(t)
        t["preview_url"] = url_for("site.home", slug=t["slug"])
    prospects = [t for t in tenants if accounts.is_prospect(t)]
    tenants = [t for t in tenants if not accounts.is_prospect(t)]
    requests_ = [dict(r) for r in db.execute(
        "SELECT c.*, t.name, t.email, t.phone, t.feed_key, t.domain, t.slug FROM channels c "
        "JOIN tenants t ON t.id = c.tenant_id WHERE t.is_demo = 0 AND c.status = 'requested' ORDER BY c.requested_at")]
    for r in requests_:
        r["portal"] = portals.CHANNELS.get(r["channel"], {}).get("name", r["channel"])
        r["feed_url"] = portals.feed_url(r, r["channel"]) if r["channel"] in portals.CHANNELS else ""
    stats = {
        "total": len(tenants),
        "prospects": len(prospects),
        "paid": sum(1 for t in tenants if t["plan"] == "paid" and t["days_left"] >= 0),
        "trial": sum(1 for t in tenants if t["plan"] == "trial" and t["days_left"] >= 0),
        "expired": sum(1 for t in tenants if t["days_left"] < 0),
        "on_sale": sum(t["on_sale"] for t in tenants),
        "leads_30d": sum(t["leads_30d"] for t in tenants),
        "demos_24h": db.execute(
            "SELECT COUNT(*) FROM tenants WHERE is_demo = 1 AND created_at >= ?", (ts(days_ago(1)),)
        ).fetchone()[0],
    }
    return render_template("admin/index.html", tenants=tenants, prospects=prospects, stats=stats, today=today,
                           requests=requests_, themes=themes.THEMES, default_look=themes.default())


def _tenant_or_404(tenant_id: int):
    tenant = get_db().execute("SELECT * FROM tenants WHERE id = ? AND is_demo = 0", (tenant_id,)).fetchone()
    if tenant is None:
        abort(404)
    return tenant


@bp.post("/prospects")
def add_prospects():
    """Dealers that haven't signed up, one per line: Name | Address | City | WhatsApp | Google Maps link.
    Each gets a website with example cars to show its owner. A line with the name of one already here
    updates it (only the fields that aren't empty)."""
    db = get_db()
    added, updated, skipped = [], [], []
    for line in request.form.get("lines", "").splitlines()[:50]:
        if not line.strip():
            continue
        name, address, city, phone, maps = ([part.strip() for part in line.split("|")] + [""] * 4)[:5]
        name, address, city = clean_line(name, 60), clean_line(address, 120), clean_line(city, 60)
        phone = normalize_phone(phone, "27")
        if not name or (phone and not phone_is_valid(phone)):
            skipped.append(f"{line.strip()} (needs a name and a valid WhatsApp number)")
            continue
        if maps and not MAPS_RE.fullmatch(maps):
            skipped.append(f"{name} (the Google Maps link should start with https://maps.app.goo.gl/ "
                           "or https://www.google.com/maps)")
            continue
        here = db.execute("SELECT * FROM tenants WHERE name = ? AND is_demo = 0 AND email IS NULL", (name,)).fetchone()
        with db:
            if here:
                db.execute("UPDATE tenants SET address = ?, city = ?, phone = ?, maps_url = ? WHERE id = ?",
                           (address or here["address"], city or here["city"], phone or here["phone"],
                            maps or here["maps_url"], here["id"]))
                updated.append(name)
            else:
                tid = seed.create_tenant(db, name=name, phone=phone, city=city, address=address,
                                         trial_days=PROSPECT_DAYS)
                db.execute("UPDATE tenants SET maps_url = ? WHERE id = ?", (maps, tid))
                added.append(name)
    if added:
        flash(f"Added {len(added)}: {', '.join(added)}.")
    if updated:
        flash(f"Updated {len(updated)}: {', '.join(updated)}.")
    for line in skipped:
        flash(f"Skipped: {line}", "error")
    return redirect(url_for("admin.index", _anchor="prospects"))


@bp.post("/tenant/<int:tid>/owner")
def hand_over(tid):
    """The owner said yes: their login, the look they picked, and the free pilot from today."""
    tenant = _tenant_or_404(tid)
    email = request.form.get("email", "").strip().lower()[:120]
    look = request.form.get("theme", "")
    db = get_db()
    if not accounts.is_prospect(tenant):
        flash(f"{tenant['name']} already has an owner.", "error")
    elif not public.EMAIL_RE.match(email):
        flash("Enter the owner's email.", "error")
    elif db.execute("SELECT 1 FROM tenants WHERE email = ?", (email,)).fetchone():
        flash("That email already has an account.", "error")
    else:
        password = secrets.token_urlsafe(8)
        until = local_today(zone(DEFAULT_TZ)) + timedelta(days=current_app.config["PILOT_DAYS"])
        with db:
            db.execute(
                "UPDATE tenants SET email = ?, password_hash = ?, theme = ?, plan = 'trial', paid_until = ? "
                "WHERE id = ?",
                (email, generate_password_hash(password), look if look in themes.THEMES else tenant["theme"],
                 until.isoformat(), tid),
            )
        accounts.session_key(db, tid, rotate=True)
        flash(f"{tenant['name']} is theirs now. Login: {email}, password: {password} — send it to the owner and "
              f"ask them to change it. Free pilot until {until:%d %b %Y}. The example cars are gone from the "
              f"website: it shows their own cars as they add them.")
    return redirect(url_for("admin.index"))


@bp.post("/tenant/<int:tid>/extend")
def extend(tid):
    tenant = _tenant_or_404(tid)
    today = local_today(zone(DEFAULT_TZ))
    months = 12 if request.form.get("months") == "12" else 1
    base = max(date.fromisoformat(tenant["paid_until"]), today)
    until = add_months(base, months)
    db = get_db()
    with db:
        db.execute("UPDATE tenants SET paid_until = ?, plan = 'paid' WHERE id = ?", (until.isoformat(), tid))
    flash(f"{tenant['name']}: paid until {until:%d %b %Y}.")
    return redirect(url_for("admin.index"))


@bp.post("/tenant/<int:tid>/date")
def set_date(tid):
    tenant = _tenant_or_404(tid)
    try:
        until = date.fromisoformat(request.form.get("paid_until", ""))
    except ValueError:
        flash("Pick a date.", "error")
        return redirect(url_for("admin.index"))
    db = get_db()
    with db:
        db.execute("UPDATE tenants SET paid_until = ? WHERE id = ?", (until.isoformat(), tid))
    flash(f"{tenant['name']}: active until {until:%d %b %Y}.")
    return redirect(url_for("admin.index"))


@bp.post("/tenant/<int:tid>/toggle")
def toggle(tid):
    tenant = _tenant_or_404(tid)
    db = get_db()
    with db:
        db.execute("UPDATE tenants SET is_disabled = 1 - is_disabled WHERE id = ?", (tid,))
    flash(f"{tenant['name']}: {'enabled' if tenant['is_disabled'] else 'paused — website and feeds are off'}.")
    return redirect(url_for("admin.index"))


@bp.post("/tenant/<int:tid>/password")
def reset_password(tid):
    tenant = _tenant_or_404(tid)
    if accounts.is_prospect(tenant):
        abort(400)
    password = secrets.token_urlsafe(8)
    db = get_db()
    with db:
        db.execute("UPDATE tenants SET password_hash = ? WHERE id = ?", (generate_password_hash(password), tid))
    accounts.session_key(db, tid, rotate=True)
    flash(f"New password for {tenant['email']}: {password} — send it to the owner and ask them to change it.")
    return redirect(url_for("admin.index"))


@bp.post("/tenant/<int:tid>/open")
def open_as(tid):
    """Look at a dealer's app exactly as the owner sees it (support), or fill in a prospect's cars."""
    _tenant_or_404(tid)
    session["tenant_id"] = tid
    session["key"] = accounts.session_key(get_db(), tid)
    return redirect(url_for("owner.stock_list"))


@bp.post("/tenant/<int:tid>/domain")
def set_domain(tid):
    """The dealer's own address: its website on /, its app on /app."""
    tenant = _tenant_or_404(tid)
    domain = re.sub(r"^https?://", "", request.form.get("domain", "").strip().lower()).split("/")[0].rstrip(".")
    db = get_db()
    if domain and not DOMAIN_RE.fullmatch(domain):
        flash("Domain: an address like www.joesmotors.co.za, without https://.", "error")
    elif domain and domain == re.sub(r":\d+$", "", request.host.lower()):
        flash("That's this site's own address. Use the dealer's domain.", "error")
    elif domain and db.execute("SELECT 1 FROM tenants WHERE domain = ? AND id != ?", (domain, tid)).fetchone():
        flash("Another dealer already has that domain.", "error")
    else:
        with db:
            db.execute("UPDATE tenants SET domain = ? WHERE id = ?", (domain, tid))
        flash(f"{tenant['name']}: " + (f"website on https://{domain}/ once its DNS points here."
                                        if domain else "own address removed."))
    return redirect(url_for("admin.index"))


@bp.post("/tenant/<int:tid>/portal/<key>")
def portal(tid, key):
    """A portal connection we arranged: mark it connected (with the dealer's id there), or back to requested."""
    tenant = _tenant_or_404(tid)
    if key not in portals.CHANNELS:
        abort(404)
    db = get_db()
    account = clean_line(request.form.get("account"), 60)
    with db:
        if request.form.get("action") == "connected":
            db.execute(
                "INSERT INTO channels (tenant_id, channel, status, account, requested_at, connected_at) "
                "VALUES (?, ?, 'connected', ?, ?, ?) ON CONFLICT (tenant_id, channel) DO UPDATE SET "
                "status = 'connected', account = COALESCE(NULLIF(excluded.account, ''), channels.account), "
                "connected_at = excluded.connected_at",
                (tid, key, account, ts(), ts()))
            flash(f"{tenant['name']}: {portals.CHANNELS[key]['name']} connected.")
        else:
            db.execute("DELETE FROM channels WHERE tenant_id = ? AND channel = ?", (tid, key))
            flash(f"{tenant['name']}: {portals.CHANNELS[key]['name']} switched off.")
    return redirect(url_for("admin.index", _anchor="portals"))
