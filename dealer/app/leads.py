"""Enquiries from the website (and the ones a dealer logs by hand): kinds, statuses, WhatsApp answers."""
import json

from .accounts import chat_link
from .utils import fill_template, format_phone, rand, ts

KINDS = {
    "enquiry": "Enquiry",
    "test_drive": "Test drive",
    "finance": "Finance",
    "sell": "Sell / trade-in",
    "contact": "Message",
}
STATUSES = {"new": "New", "contacted": "Contacted", "won": "Deal done", "lost": "No deal"}
OPEN = ("new", "contacted")
SOURCES = {"website": "Website", "walk-in": "Walk-in", "phone": "Phone call", "whatsapp": "WhatsApp",
           "portal": "Portal", "other": "Other"}
MSG_REPLY = (
    "Hi {name}! Thanks for your interest in the {car} at {business}. "
    "It's still available — when would you like to come and see it?"
)
MSG_REPLY_GENERAL = "Hi {name}! Thanks for contacting {business}. How can we help?"
DETAIL_LABELS = {  # details JSON keys -> labels, in the order they're shown
    "when": "Preferred time",
    "deposit": "Deposit",
    "income": "Monthly income",
    "employment": "Employment",
    "car": "Their car",
    "year": "Year",
    "mileage": "Mileage",
    "asking": "Asking price",
    "condition": "Condition",
    "tradein": "Trading in",
}


def create(db, tenant_id: int, *, kind: str, name: str, phone: str = "", email: str = "", message: str = "",
           vehicle=None, details: dict | None = None, source: str = "website", status: str = "new",
           at: str | None = None) -> int:
    now = at or ts()
    cur = db.execute(
        "INSERT INTO leads (tenant_id, vehicle_id, kind, status, name, phone, email, message, details, car_title, "
        "source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (tenant_id, vehicle["id"] if vehicle else None, kind, status, name, phone, email, message,
         json.dumps({k: v for k, v in (details or {}).items() if v}),
         vehicle["full_title"] + f" · {rand(vehicle['price'])}" if vehicle else "", source, now, now),
    )
    return cur.lastrowid


def as_dict(row) -> dict:
    lead = dict(row)
    try:
        details = json.loads(lead.get("details") or "{}")
    except ValueError:
        details = {}
    lead["details"] = details if isinstance(details, dict) else {}
    lead["detail_rows"] = [(label, lead["details"][key]) for key, label in DETAIL_LABELS.items()
                           if lead["details"].get(key)]
    lead["kind_label"] = KINDS.get(lead["kind"], lead["kind"])
    lead["status_label"] = STATUSES.get(lead["status"], lead["status"])
    lead["phone_display"] = format_phone(lead["phone"])
    return lead


def reply_text(tenant, lead: dict, car_name: str = "") -> str:
    values = {"name": lead["name"].split()[0] if lead["name"] else "there", "business": tenant["name"],
              "car": car_name or lead.get("car_title", "").split(" · ")[0] or "car"}
    if not car_name and not lead.get("car_title"):
        return fill_template(MSG_REPLY_GENERAL, values)
    return fill_template(tenant["msg_reply"] or MSG_REPLY, values)


def reply_link(tenant, lead: dict, car_name: str = "") -> str:
    return chat_link(tenant, lead["phone"], reply_text(tenant, lead, car_name))


def count_new(db, tenant_id: int) -> int:
    return db.execute("SELECT COUNT(*) FROM leads WHERE tenant_id = ? AND status = 'new'", (tenant_id,)).fetchone()[0]
