"""New dealers, the no-signup demo dealer, and cleaning up old demos."""
import json
import random
import secrets
import shutil
from datetime import timedelta
from pathlib import Path

from . import catalog, leads, samples, stock
from .utils import DEFAULT_TZ, local_today, now_utc, slugify, ts, zone

DESC_FOOTER = "Finance available through all the major banks. Trade-ins welcome."
DEMO_HOURS = 24


def unique_slug(db, name: str) -> str:
    base = slugify(name, 40) or "dealer"
    if len(base) < 3:
        base = f"{base}-cars"
    slug, n = base, 2
    while db.execute("SELECT 1 FROM tenants WHERE slug = ?", (slug,)).fetchone():
        slug, n = f"{base}-{n}", n + 1
    return slug


def create_tenant(db, *, name, email=None, password_hash=None, phone="", city="", address="", trial_days=30,
                  is_demo=False, theme="", slug="") -> int:
    today = local_today(zone(DEFAULT_TZ))
    cur = db.execute(
        "INSERT INTO tenants (name, email, password_hash, phone, city, address, desc_footer, paid_until, is_demo, "
        "theme, session_key, feed_key, slug, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            name, email, password_hash, phone, city, address, DESC_FOOTER,
            (today + timedelta(days=trial_days)).isoformat(),
            1 if is_demo else 0,
            theme,
            secrets.token_urlsafe(16),
            secrets.token_urlsafe(18),
            slug or unique_slug(db, name),
            ts(),
        ),
    )
    return cur.lastrowid


def add_car(db, tenant_id: int, car: dict, photo_rows=(), status="available", listed_days_ago=0, sold_days_ago=None,
            featured=False) -> int:
    """A car with its photos (sample keys), as the demo dealer has them."""
    now = now_utc()
    listed = ts(now - timedelta(days=listed_days_ago, hours=random.randint(1, 9)))
    data = {k: car.get(k, "") for k in ("make", "model", "variant", "body", "fuel", "transmission", "drive",
                                        "engine", "colour", "service_history")}
    data.update(year=car["year"], price=car["price"], mileage=car["mileage"])
    cur = db.execute(
        "INSERT INTO vehicles (tenant_id, stock_no, slug, status, make, model, variant, year, price, was_price, "
        "mileage, body, fuel, transmission, drive, engine, colour, doors, seats, service_history, features, "
        "description, featured, reg_no, vin, cost, recon, created_at, updated_at, listed_at, sold_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (tenant_id, stock.next_stock_no(db, tenant_id), stock.unique_slug(db, tenant_id, data), status,
         data["make"], data["model"], data["variant"], data["year"], data["price"], car.get("was_price", 0),
         data["mileage"], data["body"], data["fuel"], data["transmission"], data["drive"], data["engine"],
         data["colour"], car.get("doors", 0), car.get("seats", 0), data["service_history"],
         catalog.features_json(car.get("features", [])), car.get("description") or stock.describe(
             {**data, "features": car.get("features", [])}), int(featured), car.get("reg_no", ""), car.get("vin", ""),
         car.get("cost", 0), car.get("recon", 0), listed, listed, listed,
         ts(now - timedelta(days=sold_days_ago)) if sold_days_ago is not None else None),
    )
    vehicle_id = cur.lastrowid
    for i, p in enumerate(photo_rows):
        db.execute("INSERT INTO photos (tenant_id, vehicle_id, key, width, height, color, position, created_at) "
                   "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   (tenant_id, vehicle_id, p["key"], p["width"], p["height"], p["color"], i, listed))
    return vehicle_id


# --- demo -------------------------------------------------------------------------

DEMO_LEADS = [  # kind, name, status, minutes ago, message, details
    ("enquiry", "Thandi Mokoena", "new", 14, "Is this still available? Can I see it on Saturday morning?", {}),
    ("test_drive", "Pieter van Wyk", "new", 95, "", {"when": "Saturday 10:00"}),
    ("finance", "Ayesha Khan", "new", 260, "Looking for something with low monthly payments.",
     {"deposit": "R20,000", "employment": "Employed full-time", "income": "R28,000"}),
    ("sell", "Johan Botha", "contacted", 60 * 26, "Would like to trade in for a bakkie.",
     {"car": "2016 VW Polo Vivo 1.4 Trendline", "mileage": "128,000 km", "asking": "R95,000"}),
    ("enquiry", "Lungile Ndlovu", "contacted", 60 * 30, "What's the best cash price?", {}),
    ("enquiry", "Jason Pillay", "won", 60 * 24 * 4, "", {}),
    ("contact", "Naledi Sithole", "lost", 60 * 24 * 6, "Do you buy cars with finance still owing?", {}),
    ("test_drive", "Precious Dube", "won", 60 * 24 * 9, "", {"when": "Weekday after 17:00"}),
]


def demo_slug(db) -> str:
    while True:
        slug = f"sunrise-motors-{secrets.token_hex(3)}"
        if not db.execute("SELECT 1 FROM tenants WHERE slug = ?", (slug,)).fetchone():
            return slug


def create_demo(db, theme="") -> int:
    """A sandbox dealer: sample cars for sale, a few sold, enquiries in every state, Facebook connected."""
    tenant_id = create_tenant(db, name="Sunrise Motors", is_demo=True, theme=theme, slug=demo_slug(db))
    db.execute(
        "UPDATE tenants SET city = ?, address = ?, phone = ?, landline = ?, tagline = ?, about = ?, perks = ? "
        "WHERE id = ?",
        ("Pretoria", "112 Lynnwood Road, Brooklyn, Pretoria", "27820000000", "012 345 6789",
         "Quality used cars, honest prices.",
         "A family-run dealership since 2009. Every car is checked in our own workshop before it goes on sale.",
         json.dumps(["finance", "tradein", "warranty", "inspected"]), tenant_id),
    )
    rng = random.Random(tenant_id)
    cars = samples.cars()
    ids = []
    for i, car in enumerate(cars):
        status, sold = "available", None
        if i in (3, 9):
            status = "reserved"
        if i in (5, 12):
            status, sold = "sold", rng.randint(2, 20)
        cost = round(car["price"] * rng.uniform(0.78, 0.86), -3)
        ids.append(add_car(db, tenant_id, {**car, "cost": cost, "recon": rng.choice([0, 3500, 6800, 12500])},
                           samples.photo_rows(car), status=status, listed_days_ago=rng.randint(1, 70),
                           sold_days_ago=sold, featured=i in (0, 1, 2)))
    now = now_utc()
    for i, (kind, name, status, minutes, message, details) in enumerate(DEMO_LEADS):
        vehicle = None
        if kind in ("enquiry", "test_drive", "finance") and ids:
            vehicle = stock.get(db, tenant_id, ids[i % len(ids)])
        phone = f"27{rng.choice(['60', '71', '72', '73', '79', '82', '83'])}{rng.randint(1000000, 9999999)}"
        lead_id = leads.create(db, tenant_id, kind=kind, name=name, phone=phone, message=message, vehicle=vehicle,
                               details=details, status=status, at=ts(now - timedelta(minutes=minutes)))
        db.execute("UPDATE leads SET emailed_at = created_at WHERE id = ?", (lead_id,))
    db.execute("INSERT INTO channels (tenant_id, channel, status, requested_at, connected_at, fetched_at, fetches) "
               "VALUES (?, 'facebook', 'connected', ?, ?, ?, 41)",
               (tenant_id, ts(now - timedelta(days=12)), ts(now - timedelta(days=11)), ts(now - timedelta(hours=3))))
    return tenant_id


def demo_cutoff(max_age_hours=DEMO_HOURS) -> str:
    """Demos created before this moment are gone."""
    return ts(now_utc() - timedelta(hours=max_age_hours))


def cleanup_demos(db, media_dir: Path, max_age_hours=DEMO_HOURS, keep_at_most=300):
    old = [r[0] for r in db.execute(
        "SELECT id FROM tenants WHERE is_demo = 1 AND (created_at < ? OR id NOT IN "
        "(SELECT id FROM tenants WHERE is_demo = 1 ORDER BY id DESC LIMIT ?))",
        (demo_cutoff(max_age_hours), keep_at_most))]
    for tenant_id in old:
        db.execute("DELETE FROM tenants WHERE id = ?", (tenant_id,))
        shutil.rmtree(media_dir / str(tenant_id), ignore_errors=True)  # photos uploaded while trying the demo
