"""Dealer accounts: who can log in, the subscription, sessions and demo-safe WhatsApp links."""
import secrets
from datetime import date

from .utils import wa_link


def is_prospect(tenant) -> bool:
    """A dealer we set up in /admin to show its owner a website: nobody can log in to it yet."""
    return not tenant["is_demo"] and not tenant["email"]


def subscription(tenant, today: date) -> dict:
    if tenant["is_demo"]:
        return {"active": True, "demo": True, "days_left": None, "plan": "demo", "until": None}
    until = date.fromisoformat(tenant["paid_until"])
    days_left = (until - today).days
    return {
        "active": days_left >= 0,
        "demo": False,
        "days_left": days_left,
        "plan": tenant["plan"],
        "until": until,
    }


GRACE_DAYS = 7  # after the subscription ends, the website and the portal feeds stay up this long


def site_live(tenant, today: date) -> bool:
    """The website shows cars and the portals get them, until a week after the subscription ended."""
    if tenant["is_demo"]:
        return True
    return (date.fromisoformat(tenant["paid_until"]) - today).days >= -GRACE_DAYS


def session_key(db, tenant_id: int, rotate: bool = False) -> str:
    """Random key stored in every login cookie of this dealer; rotating it logs out all devices."""
    key = db.execute("SELECT session_key FROM tenants WHERE id = ?", (tenant_id,)).fetchone()[0]
    if rotate or not key:
        key = secrets.token_urlsafe(16)
        db.execute("UPDATE tenants SET session_key = ? WHERE id = ?", (key, tenant_id))
        db.commit()
    return key


def chat_link(tenant, phone: str, text: str = "") -> str:
    """wa.me link; demo phone numbers are random but real-looking, so demos never link out."""
    if not phone:
        return ""
    return "#" if tenant["is_demo"] else wa_link(phone, text)
