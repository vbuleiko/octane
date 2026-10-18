"""How many people look at a dealer's website and each car, and tap WhatsApp or Call: counted per day."""
import re
from datetime import timedelta

from flask import request

from .utils import local_today, zone

BOTS = re.compile(r"bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|monitor|curl|python", re.I)
KINDS = ("views", "whatsapp", "calls")


def counts_visitor() -> bool:
    """Robots, link previews (WhatsApp, Facebook) and prefetching don't count."""
    agent = request.headers.get("User-Agent", "")
    return bool(agent) and not BOTS.search(agent) and request.headers.get("Purpose") != "prefetch" \
        and request.headers.get("Sec-Purpose", "").find("prefetch") < 0


def add(db, tenant, vehicle_id: int = 0, kind: str = "views"):
    if kind not in KINDS:
        return
    day = local_today(zone(tenant["timezone"])).isoformat()
    with db:
        db.execute(
            f"INSERT INTO site_stats (tenant_id, vehicle_id, day, {kind}) VALUES (?, ?, ?, 1) "
            f"ON CONFLICT (tenant_id, vehicle_id, day) DO UPDATE SET {kind} = {kind} + 1",
            (tenant["id"], max(0, vehicle_id), day),
        )


def per_car(db, tenant_id: int, today, days: int = 30) -> dict[int, dict]:
    since = (today - timedelta(days=days - 1)).isoformat()
    return {r["vehicle_id"]: dict(r) for r in db.execute(
        "SELECT vehicle_id, SUM(views) AS views, SUM(whatsapp) AS whatsapp, SUM(calls) AS calls FROM site_stats "
        "WHERE tenant_id = ? AND day >= ? AND vehicle_id > 0 GROUP BY vehicle_id", (tenant_id, since))}


def totals(db, tenant_id: int, today, days: int = 7) -> dict:
    since = (today - timedelta(days=days - 1)).isoformat()
    row = db.execute("SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(whatsapp), 0) AS whatsapp, "
                     "COALESCE(SUM(calls), 0) AS calls FROM site_stats WHERE tenant_id = ? AND day >= ?",
                     (tenant_id, since)).fetchone()
    return dict(row)
