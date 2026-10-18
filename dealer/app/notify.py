"""Emails: new enquiries to each dealer within a minute; to you (NOTIFY_EMAIL) each new sign-up, each portal a
dealer asks to connect, and a daily report at 22:00. Also tidies up photos that never got a car.

`flask --app app notify` runs the loop (the `notify` service in docker-compose.yml).
`flask --app app report` sends today's report right away, to check the email settings.
"""
import logging
import smtplib
import ssl
import time
import traceback
from collections import defaultdict
from datetime import date, datetime, time as dtime, timedelta
from email.message import EmailMessage
from email.utils import formatdate
from pathlib import Path

import click
from flask import current_app, g, request
from flask.cli import with_appcontext

from . import accounts, leads, photos, portals
from .db import connect, get_db
from .utils import DEFAULT_TZ, format_phone, now_utc, rand, to_local, ts, wa_link, zone

log = logging.getLogger(__name__)
TZ = zone(DEFAULT_TZ)
REPORT_AT = dtime(22, 0)
KEEP_DAYS = 30
MAX_ERRORS_PER_DAY = 1000
APP_DIR = Path(__file__).resolve().parent


# --- server errors --------------------------------------------------------------

def record_error(sender, exception, **_):
    """got_request_exception: keep the error for the daily report."""
    try:
        frames = [f for f in traceback.extract_tb(exception.__traceback__)
                  if Path(f.filename).resolve().is_relative_to(APP_DIR)]
        place = f"{Path(frames[-1].filename).name}:{frames[-1].lineno} in {frames[-1].name}" if frames else ""
        tenant = g.get("tenant") or g.get("site")
        row = (ts(), tenant["id"] if tenant else None, request.method, request.path[:300],
               traceback.format_exception_only(exception)[-1].strip()[:300], place,
               "".join(traceback.format_exception(exception))[-4000:])
        conn = connect(sender.config["DATABASE"])
        try:
            with conn:
                day_ago = ts(now_utc() - timedelta(days=1))
                if conn.execute("SELECT COUNT(*) FROM errors WHERE at >= ?", (day_ago,)).fetchone()[0] < MAX_ERRORS_PER_DAY:
                    conn.execute("INSERT INTO errors (at, tenant_id, method, path, error, place, trace) "
                                 "VALUES (?, ?, ?, ?, ?, ?, ?)", row)
        finally:
            conn.close()
    except Exception:
        log.exception("could not record the error")


# --- sending --------------------------------------------------------------------

def configured(config) -> bool:
    return all(config[k] for k in ("SMTP_HOST", "SMTP_PASSWORD", "MAIL_FROM"))


def send(config, subject: str, body: str, to: str | None = None, reply_to: str = ""):
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Date"] = config["MAIL_FROM"], to or config["NOTIFY_EMAIL"], formatdate(usegmt=True)
    msg["Subject"] = " ".join(subject.split())
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(body)
    port, tls = config["SMTP_PORT"], ssl.create_default_context()
    if port == 465:
        smtp = smtplib.SMTP_SSL(config["SMTP_HOST"], port, timeout=30, context=tls)
    else:
        smtp = smtplib.SMTP(config["SMTP_HOST"], port, timeout=30)
    with smtp:
        if port != 465:
            smtp.starttls(context=tls)
        smtp.login(config["SMTP_USER"], config["SMTP_PASSWORD"])
        smtp.send_message(msg)


def _sent(db, key: str) -> bool:
    return db.execute("SELECT 1 FROM mails_sent WHERE key = ?", (key,)).fetchone() is not None


def _mark(db, key: str):
    with db:
        db.execute("INSERT OR IGNORE INTO mails_sent (key, sent_at) VALUES (?, ?)", (key, ts()))


def tick(db, config, now: datetime | None = None):
    """Once a minute: enquiries to dealers, sign-ups and portal requests to you, the report once it's 22:00."""
    now = now or now_utc()
    send_leads(db, config, now)
    if config["NOTIFY_EMAIL"]:
        for t in db.execute("SELECT * FROM tenants WHERE is_demo = 0 AND email IS NOT NULL AND created_at >= ? "
                            "ORDER BY id", (ts(now - timedelta(days=1)),)).fetchall():
            key = f"signup:{t['id']}:{t['created_at']}"
            if not _sent(db, key):
                send(config, *signup_mail(t, config))
                _mark(db, key)
        for r in db.execute("SELECT c.*, t.name, t.email, t.phone, t.feed_key FROM channels c "
                            "JOIN tenants t ON t.id = c.tenant_id WHERE t.is_demo = 0 AND c.status = 'requested' "
                            "AND c.requested_at >= ?", (ts(now - timedelta(days=1)),)).fetchall():
            key = f"portal:{r['tenant_id']}:{r['channel']}:{r['requested_at']}"
            if not _sent(db, key):
                send(config, *portal_mail(r, config))
                _mark(db, key)
        local = now.astimezone(TZ)
        key = f"report:{local.date()}"
        if local.time() >= REPORT_AT and not _sent(db, key):
            send(config, *daily_report(db, config, local.date()))
            _mark(db, key)
            with db:
                old = ts(now - timedelta(days=KEEP_DAYS))
                db.execute("DELETE FROM errors WHERE at < ?", (old,))
                db.execute("DELETE FROM mails_sent WHERE sent_at < ?", (old,))
    forget_lost_photos(db, Path(config["MEDIA_DIR"]), now)


def send_leads(db, config, now: datetime):
    """Each new enquiry to its dealer (a website we made for a dealer without an owner yet: to you)."""
    rows = db.execute(
        "SELECT l.*, t.name AS dealer, t.email AS login, t.lead_email, t.is_demo, t.slug, t.domain "
        "FROM leads l JOIN tenants t ON t.id = l.tenant_id WHERE l.emailed_at IS NULL AND l.created_at >= ? "
        "ORDER BY l.id LIMIT 50", (ts(now - timedelta(days=2)),)).fetchall()
    for r in rows:
        to = "" if r["is_demo"] else (r["lead_email"] or r["login"] or config["NOTIFY_EMAIL"])
        if to:
            send(config, *lead_mail(r, config), to=to, reply_to=r["email"])
        with db:
            db.execute("UPDATE leads SET emailed_at = ? WHERE id = ?", (ts(now), r["id"]))


def forget_lost_photos(db, media_dir: Path, now: datetime):
    """Photos uploaded on a car form that was never saved: gone after a day."""
    lost = db.execute("SELECT * FROM photos WHERE vehicle_id IS NULL AND lead_id IS NULL AND created_at < ?",
                      (ts(now - timedelta(days=1)),)).fetchall()
    for p in lost:
        with db:
            db.execute("DELETE FROM photos WHERE id = ?", (p["id"],))
        if not db.execute("SELECT 1 FROM photos WHERE key = ?", (p["key"],)).fetchone():
            photos.delete_files(media_dir, p["key"], p["width"])


# --- what the emails say --------------------------------------------------------

def _n(count: int, word: str, plural: str = "") -> str:
    return f"{count} {word if count == 1 else plural or word + 's'}"


def _site(config, r) -> str:
    if r["domain"]:
        return f"https://{r['domain']}"
    return f"{config['SITE_URL']}/site/{r['slug']}" if config["SITE_URL"] else ""


def lead_mail(r, config) -> tuple[str, str]:
    lead = leads.as_dict(r)
    at = to_local(r["created_at"], TZ)
    no_owner = not r["login"]
    lines = []
    if no_owner:
        lines += [f"An enquiry on the website we made for {r['dealer']} (no owner yet). Tell them!", ""]
    lines += [f"{lead['kind_label']} from {lead['name']} · {at:%d %b %H:%M}"]
    if lead["car_title"]:
        lines.append(f"Car: {lead['car_title']}")
    lines.append("")
    if lead["phone"]:
        lines.append(f"Phone: {format_phone(lead['phone'])}")
        lines.append(f"WhatsApp: {wa_link(lead['phone'])}")
    if lead["email"]:
        lines.append(f"Email: {lead['email']} (reply to this email to answer them)")
    for label, value in lead["detail_rows"]:
        lines.append(f"{label}: {value}")
    if lead["message"]:
        lines += ["", lead["message"]]
    if config["SITE_URL"] and not no_owner:
        lines += ["", f"All enquiries: {config['SITE_URL']}/app/leads"]
    subject = f"{lead['kind_label']}: {lead['name']}" + (f" · {lead['car_title'].split(' · ')[0]}" if lead["car_title"] else "")
    return subject, "\n".join(lines)


def signup_mail(t, config) -> tuple[str, str]:
    at = to_local(t["created_at"], TZ)
    lines = [
        f"{t['name']} signed up on {at:%d %b %Y} at {at:%H:%M} (Johannesburg).",
        "",
        f"Email: {t['email']}",
        f"WhatsApp: {format_phone(t['phone'])} · {wa_link(t['phone'])}",
        f"City: {t['city'] or '-'}",
        f"Trial until: {date.fromisoformat(t['paid_until']):%d %b %Y}",
    ]
    if config["SITE_URL"]:
        lines += ["", f"All dealers: {config['SITE_URL']}/admin"]
    return f"New sign-up: {t['name']}", "\n".join(lines)


def portal_mail(r, config) -> tuple[str, str]:
    name = portals.CHANNELS.get(r["channel"], {}).get("name", r["channel"])
    lines = [f"{r['name']} wants their cars on {name}.", "",
             f"Their account there: {r['account'] or '(none given)'}",
             f"Note: {r['note'] or '-'}",
             f"Email: {r['email'] or '-'} · WhatsApp: {format_phone(r['phone'])} {wa_link(r['phone'])}"]
    if config["SITE_URL"]:
        lines += ["", f"Feed for {name}: {config['SITE_URL']}/feeds/{r['feed_key']}/{portals.CHANNELS[r['channel']]['feed']}",
                  f"Mark it connected: {config['SITE_URL']}/admin#portals"]
    return f"Portal request: {r['name']} → {name}", "\n".join(lines)


def daily_report(db, config, day: date) -> tuple[str, str]:
    try:
        return _report(db, config, day)
    except Exception:
        log.exception("daily report failed")
        return f"{config['APP_NAME']} · {day:%d %b} · the report failed", traceback.format_exc()


def _report(db, config, day: date) -> tuple[str, str]:
    a = ts(datetime.combine(day - timedelta(days=1), REPORT_AT, TZ))
    b = ts(datetime.combine(day, REPORT_AT, TZ))
    real = "AND tenant_id IN (SELECT id FROM tenants WHERE is_demo = 0)"
    everyone = db.execute("SELECT * FROM tenants WHERE is_demo = 0 ORDER BY name COLLATE NOCASE, id").fetchall()
    tenants = [t for t in everyone if not accounts.is_prospect(t)]
    prospects = [t for t in everyone if accounts.is_prospect(t)]
    added = dict(db.execute(f"SELECT tenant_id, COUNT(*) FROM vehicles WHERE created_at >= ? AND created_at < ? {real} "
                            "GROUP BY tenant_id", (a, b)).fetchall())
    sold = {r["tenant_id"]: r for r in db.execute(
        f"SELECT tenant_id, COUNT(*) AS n, SUM(price) AS value FROM vehicles WHERE status = 'sold' AND sold_at >= ? "
        f"AND sold_at < ? {real} GROUP BY tenant_id", (a, b))}
    on_sale = dict(db.execute(f"SELECT tenant_id, COUNT(*) FROM vehicles WHERE status IN ('available', 'reserved') "
                              f"{real} GROUP BY tenant_id").fetchall())
    enquiries = dict(db.execute(f"SELECT tenant_id, COUNT(*) FROM leads WHERE created_at >= ? AND created_at < ? "
                                f"AND source = 'website' {real} GROUP BY tenant_id", (a, b)).fetchall())
    errors = db.execute(
        "SELECT e.*, t.name, t.is_demo FROM errors e LEFT JOIN tenants t ON t.id = e.tenant_id "
        "WHERE e.at >= ? AND e.at < ? ORDER BY e.at", (a, b)).fetchall()
    demos = db.execute("SELECT COUNT(*) FROM tenants WHERE is_demo = 1 AND created_at >= ? AND created_at < ?",
                       (a, b)).fetchone()[0]
    waiting = db.execute("SELECT c.channel, t.name FROM channels c JOIN tenants t ON t.id = c.tenant_id "
                         "WHERE c.status = 'requested' AND t.is_demo = 0 ORDER BY c.requested_at").fetchall()
    signups = [t for t in tenants if a <= t["created_at"] < b]
    active = (set(added) | set(sold) | set(enquiries)) & {t["id"] for t in tenants}

    lines = [f"{config['APP_NAME']} — {day:%A %d %B %Y}", "22:00 yesterday to 22:00 today, Johannesburg time.",
             "", f"NEW SIGN-UPS: {len(signups)}"]
    lines += [f"  {t['name']} · {t['email']} · {format_phone(t['phone'])} · {t['city'] or '-'} · "
              f"at {to_local(t['created_at'], TZ):%H:%M}" for t in signups]

    lines += ["", f"PORTAL CONNECTIONS TO SET UP: {len(waiting)}"]
    lines += [f"  {r['name']} → {portals.CHANNELS.get(r['channel'], {}).get('name', r['channel'])}" for r in waiting]

    lines += ["", f"SERVER ERRORS: {len(errors)}"]
    groups = defaultdict(list)
    for e in errors:
        groups[(e["error"], e["place"])].append(e)
    for (error, place), same in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        last = same[-1]
        lines += ["", f"  {len(same)}× {error}" + (f" — {place}" if place else ""),
                  f"     last at {to_local(last['at'], TZ):%H:%M} · {last['method']} {last['path']} · "
                  + ", ".join(sorted({_who(e) for e in same}))]
        trace = [s for s in last["trace"].splitlines() if s.strip(" ~^")]
        lines += ["     " + s for s in trace[-8:]]

    lines += ["", f"DEALERS: {len(tenants)} · active today: {len(active)}"]
    for t in sorted(tenants, key=lambda t: (t["id"] not in active, -enquiries.get(t["id"], 0))):
        head = (f"  {t['name']} · {_plan(t, day)} · {on_sale.get(t['id'], 0)} for sale · "
                f"last seen {_seen(t, day)}")
        if t["id"] not in active:
            lines.append(head + " · nothing today")
            continue
        parts = [_n(added.get(t["id"], 0), "car") + " added", _n(enquiries.get(t["id"], 0), "enquiry", "enquiries")]
        if t["id"] in sold:
            parts.append(f"{sold[t['id']]['n']} sold ({rand(sold[t['id']]['value'] or 0)})")
        lines += [head, "    " + " · ".join(parts)]

    if prospects:  # buyers may write on a website we made before its dealer signed up
        lines += ["", f"WEBSITE PREVIEWS, no owner yet: {len(prospects)}"]
        lines += [f"  {t['name']} · {_n(enquiries[t['id']], 'enquiry', 'enquiries')}"
                  for t in prospects if t["id"] in enquiries]

    lines += ["", f"DEMOS: {demos} started"]
    subject = (f"{config['APP_NAME']} · {day:%d %b} · {_n(len(signups), 'sign-up')} · "
               f"{_n(len(errors), 'error')} · {_n(sum(enquiries.values()), 'enquiry', 'enquiries')}")
    return subject, "\n".join(lines)


def _who(e) -> str:
    if e["tenant_id"] is None:
        return "no dealer"
    if e["name"] is None:
        return f"deleted #{e['tenant_id']}"
    return "a demo" if e["is_demo"] else e["name"]


def _plan(t, day: date) -> str:
    if t["is_disabled"]:
        return "paused"
    sub = accounts.subscription(t, day)
    plan = "trial" if sub["plan"] == "trial" else "paid"
    if sub["days_left"] < 0:
        return f"{plan} ended {_n(-sub['days_left'], 'day')} ago"
    return f"{plan}, {_n(sub['days_left'], 'day')} left"


def _seen(t, day: date) -> str:
    seen = to_local(t["last_seen_at"], TZ)
    if not seen:
        return "never"
    return f"{seen:%H:%M}" if seen.date() == day else f"{seen:%d %b %H:%M}"


# --- commands -------------------------------------------------------------------

@click.command("notify")
@with_appcontext
def notify_command():
    """Email enquiries, sign-ups and the daily report (runs until stopped)."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    app = current_app._get_current_object()
    if not configured(app.config):
        log.warning("Emails are off: set SMTP_HOST, SMTP_PASSWORD and NOTIFY_EMAIL in .env")
    while True:
        with app.app_context():
            try:
                if configured(app.config):
                    tick(get_db(), app.config)
                else:
                    forget_lost_photos(get_db(), Path(app.config["MEDIA_DIR"]), now_utc())
            except Exception:
                log.exception("notify failed")
        time.sleep(60)


@click.command("report")
@with_appcontext
def report_command():
    """Send today's report now, to check the email settings."""
    config = current_app.config
    if not configured(config) or not config["NOTIFY_EMAIL"]:
        raise click.ClickException("Set SMTP_HOST, SMTP_PASSWORD and NOTIFY_EMAIL in .env")
    send(config, *daily_report(get_db(), config, now_utc().astimezone(TZ).date()))
    click.echo(f"Sent to {config['NOTIFY_EMAIL']}.")
