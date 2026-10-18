"""Cars: titles, web addresses, photos, the website's stock list with filters, finance and descriptions."""
import json
from datetime import timedelta

from . import catalog, photos
from .utils import monthly_payment, now_utc, parse_ts, rand, slugify, thousands, ts

STATUSES = {"draft": "Draft", "available": "For sale", "reserved": "Reserved", "sold": "Sold"}
PUBLIC = ("available", "reserved")
PAGE_SIZE = 24
SORTS = {
    "newest": "Newest arrivals",
    "price-asc": "Lowest price",
    "price-desc": "Highest price",
    "km-asc": "Lowest mileage",
    "year-desc": "Newest year",
}
PRICE_STEPS = [100_000, 150_000, 200_000, 250_000, 300_000, 400_000, 500_000, 750_000, 1_000_000, 2_000_000]
KM_STEPS = [20_000, 50_000, 80_000, 100_000, 150_000, 200_000]


def title(v) -> str:
    return " ".join(str(p) for p in (v["year"], v["make"], v["model"]) if p)


def full_title(v) -> str:
    return " ".join(p for p in (title(v), v["variant"]) if p)


def as_dict(row) -> dict:
    v = dict(row)
    v["features"] = _json_list(v.get("features"))
    v["channels_off"] = _json_list(v.get("channels_off"))
    v["title"] = title(v)
    v["full_title"] = full_title(v)
    return v


def _json_list(value) -> list:
    if isinstance(value, list):
        return value
    try:
        items = json.loads(value or "[]")
    except ValueError:
        return []
    return items if isinstance(items, list) else []


def attach_photos(db, cars: list[dict], first_only: bool = False) -> list[dict]:
    by_id = {c["id"]: c for c in cars}
    for c in cars:
        c["photos"] = []
    if by_id:
        marks = ",".join("?" * len(by_id))
        for p in db.execute(f"SELECT * FROM photos WHERE vehicle_id IN ({marks}) ORDER BY vehicle_id, position, id",
                            tuple(by_id)):
            car = by_id[p["vehicle_id"]]
            if not first_only or not car["photos"]:
                car["photos"].append(dict(p))
    for c in cars:
        c["cover"] = c["photos"][0] if c["photos"] else None
    return cars


def get(db, tenant_id: int, vehicle_id: int) -> dict | None:
    row = db.execute("SELECT * FROM vehicles WHERE tenant_id = ? AND id = ?", (tenant_id, vehicle_id)).fetchone()
    return attach_photos(db, [as_dict(row)])[0] if row else None


def by_slug(db, tenant_id: int, slug: str) -> dict | None:
    row = db.execute("SELECT * FROM vehicles WHERE tenant_id = ? AND slug = ? AND status != 'draft'",
                     (tenant_id, slug)).fetchone()
    return attach_photos(db, [as_dict(row)])[0] if row else None


def public_cars(db, tenant_id: int) -> list[dict]:
    rows = db.execute(
        "SELECT * FROM vehicles WHERE tenant_id = ? AND status IN ('available', 'reserved') "
        "ORDER BY COALESCE(listed_at, created_at) DESC, id DESC",
        (tenant_id,),
    ).fetchall()
    return attach_photos(db, [as_dict(r) for r in rows], first_only=True)


def recently_sold(db, tenant_id: int, limit: int = 4) -> list[dict]:
    rows = db.execute(
        "SELECT * FROM vehicles WHERE tenant_id = ? AND status = 'sold' AND sold_at >= ? ORDER BY sold_at DESC LIMIT ?",
        (tenant_id, ts(now_utc() - timedelta(days=45)), limit),
    ).fetchall()
    return attach_photos(db, [as_dict(r) for r in rows], first_only=True)


def home_cars(cars: list[dict], limit: int = 8) -> list[dict]:
    return sorted(cars, key=lambda c: not c["featured"])[:limit]


def similar(cars: list[dict], car: dict, limit: int = 4) -> list[dict]:
    def score(o):
        return ((o["body"] != car["body"]) * 1_000_000 + (o["make"] != car["make"]) * 300_000
                + abs(o["price"] - car["price"]))
    return sorted((o for o in cars if o["id"] != car["id"]), key=score)[:limit]


# --- filters on the website -------------------------------------------------------

def parse_filters(args) -> dict:
    def num(name):
        value = args.get(name, "")
        return int(value) if value.isdigit() and len(value) < 10 else None
    sort = args.get("sort", "")
    page = num("page") or 1
    return {
        "q": " ".join(args.get("q", "").split())[:60],
        "make": args.get("make", "")[:40],
        "model": args.get("model", "")[:40],
        "body": args.get("body", "")[:30],
        "fuel": args.get("fuel", "")[:30],
        "transmission": args.get("transmission", "")[:20],
        "price": num("price"),
        "year": num("year"),
        "km": num("km"),
        "sort": sort if sort in SORTS else "newest",
        "page": page,
    }


def _matches(c: dict, f: dict, skip: str = "") -> bool:
    if f["q"] and skip != "q":
        hay = f"{c['year']} {c['make']} {c['model']} {c['variant']} {c['colour']} {c['body']} {c['stock_no']}".lower()
        if not all(word in hay for word in f["q"].lower().split()):
            return False
    for field in ("make", "model", "body", "fuel", "transmission"):
        if f[field] and skip != field and c[field].lower() != f[field].lower():
            return False
    if f["price"] and c["price"] > f["price"]:
        return False
    if f["year"] and c["year"] < f["year"]:
        return False
    if f["km"] and c["mileage"] > f["km"]:
        return False
    return True


def _counts(cars: list[dict], field: str) -> list[tuple[str, int]]:
    counts: dict[str, int] = {}
    for c in cars:
        if c[field]:
            counts[c[field]] = counts.get(c[field], 0) + 1
    return sorted(counts.items())


SORTERS = {
    "newest": lambda c: (c.get("listed_at") or c["created_at"], c["id"]),
    "price-asc": lambda c: c["price"],
    "price-desc": lambda c: c["price"],
    "km-asc": lambda c: c["mileage"],
    "year-desc": lambda c: (c["year"], c.get("listed_at") or c["created_at"]),
}


def search(cars: list[dict], f: dict) -> dict:
    found = [c for c in cars if _matches(c, f)]
    found.sort(key=SORTERS[f["sort"]], reverse=f["sort"] in ("newest", "price-desc", "year-desc"))
    pages = max(1, -(-len(found) // PAGE_SIZE))
    page = min(max(1, f["page"]), pages)
    return {
        "cars": found[(page - 1) * PAGE_SIZE: page * PAGE_SIZE],
        "count": len(found),
        "page": page,
        "pages": pages,
        "facets": {field: _counts([c for c in cars if _matches(c, f, field)], field)
                   for field in ("make", "model", "body", "fuel", "transmission")},
        "years": sorted({c["year"] for c in cars}, reverse=True),
    }


# --- saving -----------------------------------------------------------------------

def unique_slug(db, tenant_id: int, car: dict, vehicle_id: int = 0) -> str:
    base = slugify(f"{car['year']} {car['make']} {car['model']} {car.get('variant', '')}", 70) or "car"
    slug, n = base, 2
    while db.execute("SELECT 1 FROM vehicles WHERE tenant_id = ? AND slug = ? AND id != ?",
                     (tenant_id, slug, vehicle_id)).fetchone():
        slug, n = f"{base}-{n}", n + 1
    return slug


def next_stock_no(db, tenant_id: int) -> str:
    db.execute("UPDATE tenants SET stock_seq = stock_seq + 1 WHERE id = ?", (tenant_id,))
    n = db.execute("SELECT stock_seq FROM tenants WHERE id = ?", (tenant_id,)).fetchone()[0]
    return f"S{n:03d}"


def days_in_stock(car: dict) -> int | None:
    start = parse_ts(car.get("listed_at"))
    if not start:
        return None
    end = parse_ts(car.get("sold_at")) if car["status"] == "sold" else None
    return max(0, ((end or now_utc()) - start).days)


# --- what the website says ---------------------------------------------------------

def finance(tenant, price: int) -> dict | None:
    if not tenant["finance_on"] or price <= 0:
        return None
    deposit = round(price * tenant["finance_deposit"] / 100)
    balloon = round(price * tenant["finance_balloon"] / 100)
    return {
        "monthly": monthly_payment(price, deposit, tenant["finance_rate"], tenant["finance_months"], balloon),
        "deposit": deposit,
        "deposit_pct": tenant["finance_deposit"],
        "balloon": balloon,
        "balloon_pct": tenant["finance_balloon"],
        "rate": tenant["finance_rate"],
        "months": tenant["finance_months"],
    }


def specs(car: dict) -> list[tuple[str, str]]:
    """The facts table on the car's page, in the order people look for them."""
    rows = [
        ("Year", str(car["year"])),
        ("Mileage", f"{thousands(car['mileage'])} km"),
        ("Transmission", car["transmission"]),
        ("Fuel", car["fuel"]),
        ("Body", car["body"]),
        ("Engine", f"{car['engine']}" + (" L" if car["engine"] and car["engine"].replace(".", "").isdigit() else "")),
        ("Drive", car["drive"]),
        ("Colour", car["colour"]),
        ("Doors", str(car["doors"]) if car["doors"] else ""),
        ("Seats", str(car["seats"]) if car["seats"] else ""),
        ("Condition", catalog.CONDITIONS.get(car["condition"], "") if car["condition"] != "used" else "Used"),
        ("Service history", {"full": "Full", "partial": "Partial", "none": "None"}.get(car["service_history"], "")),
        ("Stock no.", car["stock_no"]),
    ]
    return [(k, v) for k, v in rows if v]


def describe(car: dict) -> str:
    """'Write it for me': a short description from the car's facts."""
    lines = [full_title(car)]
    facts = [f"{thousands(car['mileage'])} km" if car.get("mileage") else "",
             car.get("transmission", "").lower(), car.get("fuel", "").lower(),
             f"{car['engine']}" + (" litre" if (car.get("engine") or "").replace(".", "").isdigit() else "")
             if car.get("engine") else ""]
    facts = [f for f in facts if f]
    if facts:
        lines.append(", ".join(facts).capitalize() + ".")
    history = catalog.SERVICE_HISTORY.get(car.get("service_history", ""))
    if history and car.get("service_history") != "none":
        lines.append(history + ".")
    if car.get("features"):
        lines.append("")
        lines.append("Features: " + ", ".join(car["features"][:14]) + ".")
    lines.append("")
    lines.append("Well looked after and ready for its next owner. Book a viewing and a test drive today.")
    return "\n".join(lines)


def full_description(car: dict, tenant) -> str:
    text = (car.get("description") or "").strip()
    footer = (tenant["desc_footer"] or "").strip()
    return "\n\n".join(p for p in (text, footer) if p)


def json_ld(car: dict, tenant, page_url: str, seller_url: str) -> dict:
    availability = {"available": "InStock", "reserved": "LimitedAvailability"}.get(car["status"], "SoldOut")
    data = {
        "@context": "https://schema.org",
        "@type": "Car",
        "name": car["full_title"],
        "brand": {"@type": "Brand", "name": car["make"]},
        "model": car["model"],
        "vehicleModelDate": str(car["year"]),
        "mileageFromOdometer": {"@type": "QuantitativeValue", "value": car["mileage"], "unitCode": "KMT"},
        "itemCondition": "https://schema.org/" + {"new": "NewCondition"}.get(car["condition"], "UsedCondition"),
        "url": page_url,
        "image": [photos.jpeg(p) for p in car["photos"][:10]],
        "offers": {
            "@type": "Offer",
            "price": car["price"],
            "priceCurrency": "ZAR",
            "availability": f"https://schema.org/{availability}",
            "url": page_url,
            "seller": {"@type": "AutoDealer", "name": tenant["name"], "url": seller_url},
        },
    }
    for key, field in (("color", "colour"), ("bodyType", "body"), ("fuelType", "fuel"),
                       ("vehicleTransmission", "transmission"), ("driveWheelConfiguration", "drive")):
        if car[field]:
            data[key] = car[field]
    if car["variant"]:
        data["vehicleConfiguration"] = car["variant"]
    return data


def price_text(car: dict) -> str:
    return rand(car["price"]) if car["price"] else "Price on request"
