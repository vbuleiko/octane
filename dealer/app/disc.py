"""South African licence disc barcode (PDF417) -> the car form: make, model, colour, body, VIN, registration.

The barcode is plain text between '%' signs, e.g.
'%MVL1CC09%0154%4024T011%1%40240119RMPX%CA123456%BYJ091C%Hatch back / Luikrug%TOYOTA%COROLLA%White / Wit%
AHTKB3JE300123456%2ZR1234567%2025-03-31%' — licence number (the plate), vehicle register number, description,
make, model, colour, VIN, engine number, expiry. Format from public descriptions: check it on a real disc.
"""
import re

from . import catalog
from .utils import clean_plate, plate_key

PROVINCES = ("GP", "MP", "NW", "ZN", "EC", "NC", "FS", "L")
VIN_RE = re.compile(r"[A-HJ-NPR-Z0-9]{17}")


def parse(raw: str | None) -> dict | None:
    fields = [f.strip() for f in (raw or "").split("%")]
    at = _description_at(fields)
    if at is None:
        return None
    plate = clean_plate(fields[at - 2])
    if len(plate_key(plate)) < 2:
        return None
    at_or_blank = lambda i: fields[i] if i < len(fields) else ""  # noqa: E731
    make = catalog.nice_make(at_or_blank(at + 1))
    model, variant = catalog.split_model(make, at_or_blank(at + 2))
    vin = plate_key(at_or_blank(at + 4))
    return {
        "reg_no": pretty_plate(plate),
        "make": make,
        "model": model,
        "variant": variant,
        "colour": _english(at_or_blank(at + 3)).capitalize(),
        "body": catalog.body_from_words(fields[at]),
        "vin": vin if VIN_RE.fullmatch(vin) else "",
        "engine_no": plate_key(at_or_blank(at + 5))[:20],
        "description": fields[at],
    }


def _description_at(fields: list[str]) -> int | None:
    """Description and colour are in English and Afrikaans ('Hatch back / Luikrug', 'White / Wit')."""
    for i in range(3, len(fields) - 3):
        if " / " in fields[i] and " / " in fields[i + 3]:
            return i
    if len(fields) > 11 and fields[1].upper().startswith("MVL"):
        return 8
    return None


def _english(text: str) -> str:
    return text.split(" / ")[0].strip()


def pretty_plate(plate: str) -> str:
    """'CX99XXGP' -> 'CX 99 XX GP', 'CA123456' -> 'CA 123-456'. A plate with its own spacing stays."""
    key = plate_key(plate)
    if key != plate:
        return plate
    province = next((p for p in PROVINCES if key.endswith(p) and len(key) > len(p) + 2), "")
    runs = re.findall(r"[A-Z]+|[0-9]+", key[:len(key) - len(province)]) + ([province] if province else [])
    return " ".join(f"{r[:3]}-{r[3:]}" if r.isdigit() and len(r) == 6 else r for r in runs)
