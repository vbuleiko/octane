"""Auto-posting: the car portals read a dealer's stock from a feed we keep up to date.

A dealer adds a car once; its website, Facebook/Instagram and the portals it's connected to get it from the
feeds below. Sold, reserved, draft and "not on this portal" cars drop out, so they come off at the next read.
Each portal has its own feed address, so we know when it last read it.

Facebook is self-serve: the dealer pastes the feed address into a Vehicles catalogue in Meta Commerce Manager.
The portals (AutoTrader, Cars.co.za, Gumtree, AutoMart, SearchMyRide) only take automatic stock from feed
providers they have approved, and publish no spec: the dealer asks here, we (the operator) arrange it with the
portal in /admin and give it the dealer's feed address — the general XML until it asks for its own format.
"""
import csv
import io
import json
import re
from xml.sax.saxutils import escape

from flask import Blueprint, Response, abort, g, url_for

from . import accounts, photos, site, stock
from .db import get_db
from .utils import format_phone, local_phone, local_today, ts, zone

bp = Blueprint("portals", __name__)

CHANNELS = {
    "facebook": {
        "name": "Facebook & Instagram",
        "self_serve": True,
        "feed": "facebook.csv",
        "blurb": "Your cars in a Facebook vehicle catalogue: ads that show the right car to people shopping for one, "
                 "on Facebook and Instagram. The catalogue is free; you pay Facebook for the ads you run.",
        "steps": [
            "Open <b>business.facebook.com/commerce</b> and create a catalogue of type <b>Vehicles</b> for your "
            "dealership's Facebook page.",
            "In the catalogue: <b>Data sources → Add items → Data feed → Scheduled feed</b>.",
            "Paste your feed address (below), repeat <b>Hourly</b> or <b>Daily</b>, currency <b>ZAR</b>.",
            "Create an <b>Automotive inventory</b> ad from the catalogue. New cars join it at the next update, "
            "sold ones leave by themselves.",
        ],
        "account_label": "",
        "after_connect": "Facebook is on. Paste the feed address into your catalogue (steps below).",
    },
    "autotrader": {
        "name": "AutoTrader",
        "self_serve": False,
        "feed": "autotrader.xml",
        "blurb": "South Africa's biggest car marketplace, with paid dealer packages. AutoTrader takes automatic "
                 "stock only from providers it approved: ask, and we'll arrange it. Until then, “Copy ad” on a "
                 "car puts it on AutoTrader Connect in a minute.",
        "account_label": "Your AutoTrader dealer account (email or dealer number), if you have one",
        "after_connect": "Thanks! We'll arrange it with AutoTrader and let you know on WhatsApp.",
    },
    "carsza": {
        "name": "Cars.co.za",
        "self_serve": False,
        "feed": "carsza.xml",
        "blurb": "Big marketplace with a dealer portal. With a Cars.co.za dealer account, their team switches on "
                 "your stock feed from us.",
        "account_label": "Your Cars.co.za dealer account (email or dealer name), if you have one",
        "after_connect": "Thanks! We'll arrange it with Cars.co.za and let you know on WhatsApp.",
    },
    "gumtree": {
        "name": "Gumtree",
        "self_serve": False,
        "feed": "gumtree.xml",
        "blurb": "Classifieds with lots of car buyers. Needs Gumtree for Business (from R599 a month per branch, "
                 "paid to Gumtree).",
        "account_label": "Your Gumtree for Business account email, if you have one",
        "after_connect": "Thanks! We'll arrange it with Gumtree and let you know on WhatsApp.",
    },
    "automart": {
        "name": "AutoMart",
        "self_serve": False,
        "feed": "automart.xml",
        "blurb": "Dealer marketplace from the Junk Mail group. Needs an AutoMart dealer account.",
        "account_label": "Your AutoMart dealer account, if you have one",
        "after_connect": "Thanks! We'll arrange it with AutoMart and let you know on WhatsApp.",
    },
    "searchmyride": {
        "name": "SearchMyRide",
        "self_serve": False,
        "feed": "searchmyride.xml",
        "blurb": "Newer marketplace that takes dealer stock feeds: a free trial, then pay per lead.",
        "account_label": "Your SearchMyRide account, if you have one",
        "after_connect": "Thanks! We'll arrange it with SearchMyRide and let you know on WhatsApp.",
    },
}
STATUS_LABELS = {"connected": "On", "requested": "Connecting", "paused": "Paused", "": "Off"}


def dealer_channels(db, tenant) -> list[dict]:
    rows = {r["channel"]: dict(r) for r in db.execute("SELECT * FROM channels WHERE tenant_id = ?", (tenant["id"],))}
    out = []
    for key, info in CHANNELS.items():
        row = rows.get(key, {})
        status = row.get("status", "")
        out.append({**info, "key": key, "status": status, "status_label": STATUS_LABELS[status],
                    "account": row.get("account", ""), "fetched_at": row.get("fetched_at"),
                    "fetches": row.get("fetches", 0), "requested_at": row.get("requested_at"),
                    "feed_url": feed_url(tenant, key)})
    return out


def feed_url(tenant, channel: str) -> str:
    return url_for("portals.feed", key=tenant["feed_key"], name=CHANNELS[channel]["feed"], _external=True)


def feed_urls(tenant) -> dict:
    return {fmt: url_for("portals.feed", key=tenant["feed_key"], name=f"stock.{fmt}", _external=True)
            for fmt in ("xml", "json", "csv")}


# --- what goes into a feed -------------------------------------------------------------------

def cars_for(db, tenant, channel: str | None) -> list[dict]:
    """Cars a portal should show: for sale, priced, with photos, not switched off for it, while it's on."""
    if tenant["is_disabled"] or not accounts.site_live(tenant, local_today(zone(tenant["timezone"]))):
        return []
    if channel:
        row = db.execute("SELECT status FROM channels WHERE tenant_id = ? AND channel = ?",
                         (tenant["id"], channel)).fetchone()
        if row is None or row["status"] == "paused":
            return []
    rows = db.execute("SELECT * FROM vehicles WHERE tenant_id = ? AND status = 'available' "
                      "ORDER BY COALESCE(listed_at, created_at) DESC", (tenant["id"],)).fetchall()
    cars = stock.attach_photos(db, [stock.as_dict(r) for r in rows])
    return [c for c in cars if c["photos"] and c["price"] and channel not in c["channels_off"]]


def _car_record(tenant, car: dict) -> dict:
    return {
        "id": car["id"], "stock_no": car["stock_no"], "status": car["status"],
        "url": site.public_url(tenant, "car", car=car["slug"]),
        "make": car["make"], "model": car["model"], "variant": car["variant"], "year": car["year"],
        "price": car["price"], "was_price": car["was_price"] or None, "mileage": car["mileage"],
        "body": car["body"], "fuel": car["fuel"], "transmission": car["transmission"], "drive": car["drive"],
        "engine": car["engine"], "colour": car["colour"], "doors": car["doors"] or None,
        "seats": car["seats"] or None, "condition": car["condition"], "service_history": car["service_history"],
        "vin": car["vin"], "description": stock.full_description(car, tenant), "features": car["features"],
        "images": [photos.jpeg(p) for p in car["photos"][:20]],
        "listed": car["listed_at"], "updated": car["updated_at"],
    }


def _dealer_record(tenant) -> dict:
    return {
        "name": tenant["name"], "phone": tenant["landline"] or local_phone(tenant["phone"]),
        "whatsapp": tenant["phone"], "email": tenant["public_email"] or "", "address": tenant["address"],
        "city": tenant["city"], "province": tenant["province"], "postal_code": tenant["postal_code"],
        "latitude": tenant["latitude"], "longitude": tenant["longitude"], "website": site.home_url(tenant),
    }


# --- formats ------------------------------------------------------------------------------

def as_json(tenant, cars) -> Response:
    body = {"dealer": _dealer_record(tenant), "updated": ts(), "count": len(cars),
            "vehicles": [_car_record(tenant, c) for c in cars]}
    return Response(json.dumps(body, ensure_ascii=False, indent=1), mimetype="application/json")


def _x(tag: str, value) -> str:
    if value is None or value == "":
        return f"<{tag}/>"
    return f"<{tag}>{escape(str(value))}</{tag}>"


def as_xml(tenant, cars) -> Response:
    d = _dealer_record(tenant)
    out = ['<?xml version="1.0" encoding="UTF-8"?>', f'<stock updated="{ts()}" count="{len(cars)}">',
           "<dealer>" + "".join(_x(k, v) for k, v in d.items()) + "</dealer>"]
    for c in cars:
        r = _car_record(tenant, c)
        parts = [_x(k, r[k]) for k in ("id", "stock_no", "status", "url", "make", "model", "variant", "year")]
        parts.append(f'<price currency="ZAR">{r["price"]}</price>')
        parts.append(_x("was_price", r["was_price"]))
        parts.append(f'<mileage unit="km">{r["mileage"]}</mileage>')
        parts += [_x(k, r[k]) for k in ("body", "fuel", "transmission", "drive", "engine", "colour", "doors", "seats",
                                         "condition", "service_history", "vin", "description", "listed", "updated")]
        parts.append("<features>" + "".join(_x("feature", x) for x in r["features"]) + "</features>")
        parts.append("<images>" + "".join(_x("image", x) for x in r["images"]) + "</images>")
        out.append("<vehicle>" + "".join(parts) + "</vehicle>")
    out.append("</stock>")
    return Response("\n".join(out), mimetype="application/xml")


CSV_COLUMNS = ["id", "stock_no", "url", "make", "model", "variant", "year", "price", "was_price", "mileage", "body",
               "fuel", "transmission", "drive", "engine", "colour", "doors", "seats", "condition", "service_history",
               "vin", "description", "features", "images"]


def as_csv(tenant, cars) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_COLUMNS)
    for c in cars:
        r = _car_record(tenant, c)
        r["features"] = "|".join(r["features"])
        r["images"] = "|".join(r["images"])
        w.writerow(["" if r[k] is None else r[k] for k in CSV_COLUMNS])
    return Response(buf.getvalue(), mimetype="text/csv")


# Meta vehicle catalogue (developers.facebook.com/docs/marketing-api/auto-ads/reference): enums are
# case-insensitive; a dealership needs city, region, country, latitude and longitude.
META_BODY = {"Hatchback": "HATCHBACK", "Sedan": "SEDAN", "SUV": "SUV", "Crossover": "CROSSOVER", "Bakkie": "TRUCK",
             "MPV": "MINIVAN", "Coupe": "COUPE", "Convertible": "CONVERTIBLE", "Station wagon": "WAGON",
             "Panel van": "VAN", "Minibus": "VAN"}
META_FUEL = {"Petrol": "GASOLINE", "Diesel": "DIESEL", "Hybrid": "HYBRID", "Plug-in hybrid": "HYBRID",
             "Electric": "ELECTRIC"}
META_DRIVE = {"FWD": "FWD", "RWD": "RWD", "AWD": "AWD", "4x4": "4X4", "4x2": "4X2"}
META_IMAGES = 20
META_COLUMNS = (["vehicle_id", "title", "description", "url", "make", "model", "year", "trim", "mileage.value",
                 "mileage.unit", "price", "state_of_vehicle", "body_style", "exterior_color", "transmission",
                 "fuel_type", "drivetrain", "vin", "availability", "date_first_on_lot", "stock_number", "dealer_name",
                 "dealer_phone", "address.city", "address.region", "address.country", "address.postal_code",
                 "latitude", "longitude"] + [f"image[{i}].url" for i in range(META_IMAGES)])
CAPS_LINE = re.compile(r"^[^a-z]*[A-Z]{3}[^a-z]*$")


def meta_text(text: str) -> str:
    """Meta turns down descriptions with links or shouting: drop links, soften all-caps lines."""
    lines = []
    for line in re.sub(r"https?://\S+|www\.\S+", "", text).splitlines():
        lines.append(line.capitalize() if CAPS_LINE.match(line) else line)
    return "\n".join(lines).strip()[:5000]


def missing_for_facebook(tenant) -> list[str]:
    """Dealership details the Facebook catalogue requires that the dealer hasn't filled in."""
    need = {"city": "city", "province": "province", "latitude": "map coordinates"}
    return [label for field, label in need.items() if tenant[field] in (None, "")]


def as_meta_csv(tenant, cars) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(META_COLUMNS)
    for c in cars:
        images = [photos.jpeg(p) for p in c["photos"][:META_IMAGES]]
        w.writerow([
            c["id"], c["full_title"][:500], meta_text(stock.full_description(c, tenant)) or c["full_title"],
            site.public_url(tenant, "car", car=c["slug"]), c["make"], c["model"], c["year"], c["variant"][:50],
            c["mileage"], "KM", f"{c['price']} ZAR", "New" if c["condition"] == "new" else "Used",
            META_BODY.get(c["body"], "OTHER"), c["colour"] or "Other", c["transmission"],
            META_FUEL.get(c["fuel"], "OTHER" if c["fuel"] else ""), META_DRIVE.get(c["drive"], ""), c["vin"],
            "available", (c["listed_at"] or c["created_at"])[:10], c["stock_no"], tenant["name"][:100],
            format_phone(tenant["phone"]), tenant["city"], tenant["province"], "ZA", tenant["postal_code"],
            "" if tenant["latitude"] is None else tenant["latitude"],
            "" if tenant["longitude"] is None else tenant["longitude"],
        ] + images + [""] * (META_IMAGES - len(images)))
    return Response(buf.getvalue(), mimetype="text/csv")


FORMATS = {  # feed file name -> (channel it counts for, writer)
    "facebook.csv": ("facebook", as_meta_csv),
    "autotrader.xml": ("autotrader", as_xml),
    "carsza.xml": ("carsza", as_xml),
    "gumtree.xml": ("gumtree", as_xml),
    "automart.xml": ("automart", as_xml),
    "searchmyride.xml": ("searchmyride", as_xml),
    "stock.xml": (None, as_xml),
    "stock.json": (None, as_json),
    "stock.csv": (None, as_csv),
}


@bp.get("/feeds/<key>/<name>")
def feed(key, name):
    if name not in FORMATS or len(key) < 16:
        abort(404)
    db = get_db()
    tenant = db.execute("SELECT * FROM tenants WHERE feed_key = ?", (key,)).fetchone()
    if tenant is None or g.host:
        abort(404)
    channel, writer = FORMATS[name]
    cars = cars_for(db, tenant, channel)
    if channel:
        with db:
            db.execute("UPDATE channels SET fetched_at = ?, fetches = fetches + 1 WHERE tenant_id = ? AND channel = ?",
                       (ts(), tenant["id"], channel))
    resp = writer(tenant, cars)
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["X-Robots-Tag"] = "noindex"
    return resp


# --- by hand: a ready-made ad for portals that don't take feeds yet --------------------------

def ad_text(tenant, car: dict) -> str:
    """Title, price, facts, features and description — pasted into AutoTrader Connect, Marketplace or a status."""
    lines = [car["full_title"], stock.price_text(car), ""]
    facts = [f"{car['mileage']:,} km", car["transmission"], car["fuel"], car["body"], car["colour"],
             f"Engine {car['engine']}" if car["engine"] else "", car["drive"]]
    lines.append(" · ".join(f for f in facts if f))
    if car["features"]:
        lines += ["", "Features: " + ", ".join(car["features"]) + "."]
    description = stock.full_description(car, tenant)
    if description:
        lines += ["", description]
    lines += ["", f"{tenant['name']}" + (f", {site.place(tenant)}" if site.place(tenant) else ""),
              f"WhatsApp {local_phone(tenant['phone'])}" if tenant["phone"] else "",
              site.public_url(tenant, "car", car=car["slug"])]
    return "\n".join(lines).strip()
