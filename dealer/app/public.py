"""Landing page, sign up / log in, the no-signup demo, and uploaded photos."""
import re
import sqlite3
from pathlib import Path

from flask import (
    Blueprint,
    Response,
    abort,
    current_app,
    flash,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

from . import accounts, seed, site, themes
from .db import get_db
from .security import client_ip, limiter
from .utils import normalize_phone, phone_is_valid

bp = Blueprint("public", __name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MEDIA_RE = re.compile(r"\d+/(logo-)?[0-9a-f]{12,16}(-\d{2,4})?\.(jpg|webp|png)")
YEAR = 365 * 86400


def start_session(tenant_id: int):
    key = accounts.session_key(get_db(), tenant_id)
    csrf = session.get("csrf")
    session.clear()
    session.permanent = True
    session["tenant_id"] = tenant_id
    session["key"] = key
    if csrf:
        session["csrf"] = csrf


@bp.before_request
def on_dealer_address():
    """On a dealer's own address: its website, its app and its login — no sign-up, demo or landing."""
    if g.host and request.endpoint in ("public.signup", "public.demo", "public.theme", "public.privacy"):
        abort(404)


@bp.get("/")
def landing():
    if g.host:
        return site.home_page(g.host)
    return render_template("public/landing.html")


@bp.route("/signup", methods=["GET", "POST"])
def signup():
    form = {}
    pilot = request.values.get("plan") == "pilot"
    days = current_app.config["PILOT_DAYS" if pilot else "TRIAL_DAYS"]
    if request.method == "POST":
        form = request.form
        name = " ".join(form.get("name", "").split())[:60]
        email = form.get("email", "").strip().lower()[:120]
        password = form.get("password", "")
        phone = normalize_phone(form.get("phone"), "27")
        errors = []
        if not name:
            errors.append("Enter your dealership's name.")
        if not EMAIL_RE.match(email):
            errors.append("Enter a valid email.")
        if len(password) < 8:
            errors.append("Password needs at least 8 characters.")
        if not phone_is_valid(phone):
            errors.append("Enter your WhatsApp number: buyers will message you on it.")
        db = get_db()
        if not errors and db.execute("SELECT 1 FROM tenants WHERE email = ?", (email,)).fetchone():
            errors.append("This email already has an account. Log in instead.")
        if not errors and not limiter.allow(f"signup:{client_ip()}", 5, 3600):
            errors.append("Too many sign-ups from this network. Try again in an hour.")
        if not errors:
            try:
                with db:
                    tenant_id = seed.create_tenant(
                        db, name=name, email=email, password_hash=generate_password_hash(password),
                        phone=phone, city=" ".join(form.get("city", "").split())[:60],
                        trial_days=days, theme=themes.picked(),
                    )
            except sqlite3.IntegrityError:  # the same form sent twice
                flash("This email already has an account. Log in instead.", "error")
                return render_template("public/signup.html", form=form, pilot=pilot, days=days)
            start_session(tenant_id)
            flash(f"Welcome! Your {days}-day free {'pilot' if pilot else 'trial'} has started. Add your first car.")
            return redirect(url_for("owner.stock_list"))
        for e in errors:
            flash(e, "error")
    return render_template("public/signup.html", form=form, pilot=pilot, days=days)


@bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        if not limiter.allow(f"login:{client_ip()}", 10, 900):
            flash("Too many attempts. Wait 15 minutes and try again.", "error")
            return render_template("public/login.html", email=email), 429
        tenant = get_db().execute(
            "SELECT * FROM tenants WHERE email = ? AND is_demo = 0", (email,)
        ).fetchone()
        if g.host and tenant and tenant["id"] != g.host["id"]:  # a dealer's address is for its owner only
            tenant = None
        if tenant and check_password_hash(tenant["password_hash"] or "", request.form.get("password", "")):
            if tenant["is_disabled"]:
                flash("This account is paused. Please contact support.", "error")
            else:
                start_session(tenant["id"])
                target = request.args.get("next", "")
                return redirect(target if target.startswith("/app") and target.isprintable() else url_for("owner.stock_list"))
        else:
            flash("Wrong email or password.", "error")
        return render_template("public/login.html", email=email)
    return render_template("public/login.html", email="")


@bp.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("public.landing"))


@bp.post("/demo")
def demo():
    db = get_db()

    def go(tenant_id):
        if request.form.get("next") == "site":
            slug = db.execute("SELECT slug FROM tenants WHERE id = ?", (tenant_id,)).fetchone()[0]
            return redirect(url_for("site.home", slug=slug))
        return redirect(url_for("owner.stock_list"))

    current = session.get("tenant_id")
    if current and db.execute(
        "SELECT 1 FROM tenants WHERE id = ? AND is_demo = 1 AND session_key = ? AND session_key != '' "
        "AND created_at >= ?",
        (current, session.get("key", ""), seed.demo_cutoff()),
    ).fetchone():
        return go(current)
    if not limiter.allow(f"demo:{client_ip()}", 10, 3600):
        flash("Too many demos from this network. Try again later.", "error")
        return redirect(url_for("public.landing"))
    with db:
        tenant_id = seed.create_demo(db, theme=themes.picked())
        seed.cleanup_demos(db, Path(current_app.config["MEDIA_DIR"]))
    start_session(tenant_id)
    return go(tenant_id)


@bp.post("/theme")
def theme():
    name = request.form.get("theme", "")
    back = request.form.get("next", "")  # a website we made for a dealer that hasn't signed up
    if request.headers.get("X-Requested-With") == "fetch":  # app.js switches the look in place
        resp = jsonify(ok=True)
    elif back.startswith("/site/") and back.isprintable():
        resp = redirect(back)
    else:
        resp = redirect(url_for("public.landing", _anchor="look"))
    return themes.remember(resp, name) if name in themes.THEMES else resp


@bp.get("/media/<path:path>")
def media(path):
    """Uploaded photos. Names are content hashes, so a file never changes: phones keep it for a year."""
    if not MEDIA_RE.fullmatch(path):
        abort(404)
    resp = send_from_directory(current_app.config["MEDIA_DIR"], path, max_age=YEAR)
    resp.cache_control.public = True
    resp.cache_control.immutable = True
    return resp


@bp.get("/privacy")
def privacy():
    return render_template("public/privacy.html")


@bp.get("/robots.txt")
def robots():
    if g.host:
        return site.robots(g.host)
    lines = ["User-agent: *", "Disallow: /app", "Disallow: /admin", "Disallow: /demo", "Disallow: /feeds", ""]
    for t in get_db().execute("SELECT slug FROM tenants WHERE domain = '' AND email IS NOT NULL AND is_demo = 0 "
                              "AND is_disabled = 0 ORDER BY id"):  # dealers' websites on our address
        lines.append("Sitemap: " + url_for("site.sitemap", slug=t["slug"], _external=True))
    return Response("\n".join(lines) + "\n", mimetype="text/plain")


@bp.get("/tls-check")
def tls_check():
    """Caddy asks before it gets an HTTPS certificate for a dealer's own address."""
    domain = request.args.get("domain", "").lower()
    found = domain and get_db().execute("SELECT 1 FROM tenants WHERE domain = ?", (domain,)).fetchone()
    return ("ok", 200) if found else ("unknown", 404)


@bp.get("/healthz")
def healthz():
    get_db().execute("SELECT 1")
    return "ok"
