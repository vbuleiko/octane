"""Small helpers: time, rand amounts, phone numbers, slugs and WhatsApp links."""
import math
import re
import unicodedata
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import quote
from zoneinfo import ZoneInfo

TS_FMT = "%Y-%m-%d %H:%M:%S"
DEFAULT_TZ = "Africa/Johannesburg"
TIMEZONES = [
    "Africa/Johannesburg",
    "Africa/Windhoek",
    "Africa/Gaborone",
    "Africa/Lagos",
    "Africa/Nairobi",
    "Europe/London",
    "UTC",
]


# --- time -------------------------------------------------------------------

def now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def ts(dt: datetime | None = None) -> str:
    """UTC timestamp string as stored in the database."""
    return (dt or now_utc()).astimezone(timezone.utc).strftime(TS_FMT)


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.strptime(value, TS_FMT).replace(tzinfo=timezone.utc)


def zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or DEFAULT_TZ)
    except Exception:
        return ZoneInfo(DEFAULT_TZ)


def to_local(value: str | None, tz: ZoneInfo) -> datetime | None:
    dt = parse_ts(value)
    return dt.astimezone(tz) if dt else None


def local_today(tz: ZoneInfo) -> date:
    return now_utc().astimezone(tz).date()


def utc_bounds_month(today: date, tz: ZoneInfo) -> tuple[str, str]:
    """This calendar month in the dealer's time zone -> UTC timestamp strings [start, end)."""
    start = today.replace(day=1)
    end = (start + timedelta(days=32)).replace(day=1)
    return ts(datetime.combine(start, time.min, tzinfo=tz)), ts(datetime.combine(end, time.min, tzinfo=tz))


def days_ago(n: float) -> datetime:
    return now_utc() - timedelta(days=n)


def days_since(value: str | None, now: datetime | None = None) -> int | None:
    dt = parse_ts(value)
    return max(0, ((now or now_utc()) - dt).days) if dt else None


def ago(value: str | None, now: datetime | None = None) -> str:
    """'just now', '25 min ago', '3 h ago', 'yesterday', '12 days ago'."""
    dt = parse_ts(value)
    if not dt:
        return ""
    minutes = int(((now or now_utc()) - dt).total_seconds() // 60)
    if minutes < 1:
        return "just now"
    if minutes < 60:
        return f"{minutes} min ago"
    if minutes < 24 * 60:
        return f"{minutes // 60} h ago"
    days = minutes // (24 * 60)
    return "yesterday" if days == 1 else f"{days} days ago"


# --- numbers and money ----------------------------------------------------------

def is_number(text: str | None) -> bool:
    """Plain digits that fit in an SQLite integer (ids, counts)."""
    return bool(re.fullmatch(r"[0-9]{1,9}", text or ""))


def rand(value) -> str:
    """Whole rand: 189995 -> 'R189,995'."""
    n = int(value or 0)
    return f"{'-' if n < 0 else ''}R{abs(n):,}"


def thousands(value) -> str:
    return f"{int(value or 0):,}"


AMOUNT_RE = re.compile(r"(\d{1,3}(?:[.,']\d{3})+|\d{1,9})(?:[.,]\d{1,2})?")


def parse_amount(value: str | None, limit: int = 99_999_999) -> int | None:
    """'R189 995', '189,995', '189995.00', '189 995,00', '84 000 km' -> whole rand or km.
    None if empty or not a number."""
    text = re.sub(r"(?i)^r|km$", "", re.sub(r"[\s ]", "", value or ""))
    m = AMOUNT_RE.fullmatch(text)
    if not m:
        return None
    number = int(re.sub(r"\D", "", m.group(1)))
    return number if number <= limit else None


def parse_decimal(value: str | None, low: float, high: float) -> float | None:
    text = (value or "").strip().replace(",", ".").rstrip("%").strip()
    if not re.fullmatch(r"\d{1,3}(\.\d{1,3})?", text):
        return None
    number = float(text)
    return number if low <= number <= high else None


def monthly_payment(price: int, deposit: int = 0, rate: float = 12.5, months: int = 72, balloon: int = 0) -> int:
    """Instalment on a vehicle loan, as South African finance calculators show it (rand, rounded up)."""
    principal = max(0, price - deposit)
    if principal == 0 or months <= 0:
        return 0
    r = rate / 1200
    if r == 0:
        return max(0, -(-(principal - balloon) // months))
    pmt = (principal - balloon / (1 + r) ** months) * r / (1 - (1 + r) ** -months)
    return max(0, math.ceil(pmt))


COORDS_RE = re.compile(r"(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)")


def parse_coords(text: str | None) -> tuple[float, float] | None:
    """'-33.9249, 18.4241' or a Google Maps address with '@-33.9249,18.4241,17z' in it -> (lat, lng)."""
    m = COORDS_RE.search(text or "")
    if not m:
        return None
    lat, lng = float(m.group(1)), float(m.group(2))
    return (round(lat, 6), round(lng, 6)) if -90 <= lat <= 90 and -180 <= lng <= 180 else None


# --- phones, slugs, WhatsApp ----------------------------------------------------

def normalize_phone(raw: str | None, country_code: str = "27") -> str:
    """'082 123 4567' -> '27821234567' (international digits, no '+')."""
    raw = (raw or "").strip()
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return ""
    if raw.startswith("+"):
        number = digits
    elif digits.startswith("00"):
        number = digits[2:]
    elif digits.startswith("0"):
        number = country_code + digits[1:]
    elif digits.startswith(country_code) and len(digits) >= len(country_code) + 8:
        number = digits
    else:
        number = country_code + digits
    if number.startswith(country_code + "0"):  # '+27 (0)82 ...'
        number = country_code + number[len(country_code) + 1:]
    return number


def phone_is_valid(digits: str) -> bool:
    if digits.startswith("27"):
        return len(digits) == 11
    return 8 <= len(digits) <= 15


def format_phone(digits: str | None) -> str:
    if not digits:
        return ""
    if digits.startswith("27") and len(digits) == 11:
        return f"+27 {digits[2:4]} {digits[4:7]} {digits[7:]}"
    return "+" + digits


def local_phone(digits: str | None) -> str:
    """'27821234567' -> '082 123 4567', as people in South Africa write it."""
    if digits and digits.startswith("27") and len(digits) == 11:
        return f"0{digits[2:4]} {digits[4:7]} {digits[7:]}"
    return format_phone(digits)


def tel_link(text: str | None) -> str:
    digits = re.sub(r"[^\d+]", "", text or "")
    return f"tel:{digits}" if digits else ""


def clean_text(value: str | None, limit: int) -> str:
    return re.sub(r"[ \t]+", " ", (value or "").replace("\r\n", "\n")).strip()[:limit]


def clean_line(value: str | None, limit: int) -> str:
    return " ".join((value or "").split())[:limit]


def slugify(text: str, limit: int = 60) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return text[:limit].rstrip("-")


def fill_template(template: str, values: dict) -> str:
    """Replace {placeholders}; unknown ones are left untouched."""
    return re.sub(
        r"\{(\w+)\}",
        lambda m: str(values[m.group(1)]) if m.group(1) in values else m.group(0),
        template or "",
    )


def wa_link(phone: str, text: str = "") -> str:
    link = f"https://wa.me/{phone}"
    return f"{link}?text={quote(text)}" if text else link


def clean_plate(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").upper()).strip()[:16]


def plate_key(value: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())
