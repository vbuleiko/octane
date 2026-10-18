"""Example cars with freely licensed photos (Wikimedia Commons, credited on their pages).

They are the demo dealer's stock, and the stock on a website we made for a dealer that hasn't signed up
yet — until it adds its own cars. Built by scripts/build_samples.py into static/samples/.
"""
import json
from functools import lru_cache
from pathlib import Path

from .stock import describe, full_title, title

FILE = Path(__file__).parent / "static" / "samples" / "samples.json"


@lru_cache
def _data() -> dict:
    try:
        return json.loads(FILE.read_text())
    except FileNotFoundError:
        return {"cars": []}


def cars() -> list[dict]:
    return [dict(c) for c in _data()["cars"]]


def photo_rows(car: dict) -> list[dict]:
    return [{"key": f"samples/{p['name']}", "width": p["width"], "height": p["height"], "color": p["color"],
             "credit": p} for p in car["photos"]]


def as_stock(created_at: str) -> list[dict]:
    """The example cars shaped like the website's stock (negative ids: they aren't in the database)."""
    out = []
    for i, c in enumerate(cars(), start=1):
        car = {
            "id": -i, "tenant_id": 0, "stock_no": f"EX{i:02d}", "slug": c["slug"], "status": "available",
            "make": c["make"], "model": c["model"], "variant": c.get("variant", ""), "year": c["year"],
            "price": c["price"], "was_price": c.get("was_price", 0), "mileage": c["mileage"],
            "body": c.get("body", ""), "fuel": c.get("fuel", ""), "transmission": c.get("transmission", ""),
            "drive": c.get("drive", ""), "engine": c.get("engine", ""), "colour": c.get("colour", ""),
            "doors": c.get("doors", 0), "seats": c.get("seats", 0), "condition": "used",
            "service_history": c.get("service_history", ""), "features": c.get("features", []),
            "description": c.get("description", ""), "featured": i <= 3, "channels_off": [],
            "created_at": created_at, "listed_at": created_at, "sold_at": None, "sample": True,
        }
        car["title"], car["full_title"] = title(car), full_title(car)
        car["description"] = car["description"] or describe(car)
        car["photos"] = photo_rows(c)
        car["cover"] = car["photos"][0] if car["photos"] else None
        out.append(car)
    return out
