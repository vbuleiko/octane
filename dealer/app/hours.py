"""Opening hours: seven days from Monday, each ('08:30', '17:00') or None when closed."""
import json

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
DEFAULT_HOURS = [("08:30", "17:00")] * 5 + [("08:30", "13:00"), None]
TIMES = [f"{h:02d}:{m:02d}" for h in range(24) for m in (0, 30)]


def week(tenant) -> list:
    try:
        days = json.loads(tenant["hours"]) if tenant["hours"] else None
    except ValueError:
        days = None
    if not isinstance(days, list) or len(days) != 7:
        return list(DEFAULT_HOURS)
    return [
        (day[0], day[1]) if isinstance(day, list) and len(day) == 2 and day[0] in TIMES and day[1] in TIMES
        and day[0] < day[1] else None
        for day in days
    ]


def text(span) -> str:
    return f"{span[0]}–{span[1]}" if span else "Closed"


def rows(tenant) -> list[tuple[str, str]]:
    """Days with the same hours side by side: [('Mon–Fri', '08:30–17:00'), ('Sat', '08:30–13:00'), ...]."""
    out = []
    days = week(tenant)
    i = 0
    while i < 7:
        j = i
        while j + 1 < 7 and days[j + 1] == days[i]:
            j += 1
        name = WEEKDAYS[i][:3] if i == j else f"{WEEKDAYS[i][:3]}–{WEEKDAYS[j][:3]}"
        out.append((name, text(days[i])))
        i = j + 1
    return out


def status(tenant, now_local) -> tuple[bool, str]:
    """(open now?, 'Open now · until 17:00' / 'Closed now · opens tomorrow 08:30')."""
    days = week(tenant)
    now, today = now_local.strftime("%H:%M"), now_local.weekday()
    span = days[today]
    if span and span[0] <= now < span[1]:
        return True, f"Open now · until {span[1]}"
    if span and now < span[0]:
        return False, f"Closed now · opens at {span[0]}"
    for ahead in range(1, 8):
        span = days[(today + ahead) % 7]
        if span:
            day = "tomorrow" if ahead == 1 else WEEKDAYS[(today + ahead) % 7]
            return False, f"Closed now · opens {day} {span[0]}"
    return False, "Closed now"


def schema_org(tenant) -> list[str]:
    """'Mo-Fr 08:30-17:00' lines for schema.org openingHours."""
    short = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
    return [f"{short[i]} {span[0]}-{span[1]}" for i, span in enumerate(week(tenant)) if span]
