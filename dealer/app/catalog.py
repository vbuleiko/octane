"""Makes and models sold in South Africa, the lists on the car form, and variants learned from dealers.

Makes and models are a starter list (new and common used cars). Variants ("1.4 Trendline",
"2.4 GD-6 Raider double cab") are learned: every car a dealer saves teaches the next dealer's form.
"""
import json
import re

from .utils import ts

MODELS = {
    "Toyota": ["Agya", "Auris", "Avanza", "Aygo", "C-HR", "Camry", "Corolla", "Corolla Cross", "Corolla Quest",
               "Etios", "Etios Cross", "Fortuner", "GR86", "GR Yaris", "Hiace", "Hilux", "Land Cruiser",
               "Land Cruiser 70", "Land Cruiser Prado", "Prius", "Quantum", "RAV4", "Rumion", "Rush", "Starlet",
               "Supra", "Urban Cruiser", "Vitz", "Yaris", "Yaris Cross"],
    "Volkswagen": ["Amarok", "Arteon", "Beetle", "Caddy", "CitiGolf", "Crafter", "Golf", "Jetta", "Kombi",
                   "Passat", "Polo", "Polo Sedan", "Polo Vivo", "Scirocco", "T-Cross", "T-Roc", "Taigo", "Tiguan",
                   "Tiguan Allspace", "Touareg", "Touran", "Transporter", "Up!"],
    "Ford": ["B-Max", "EcoSport", "Everest", "Fiesta", "Figo", "Focus", "Kuga", "Mustang", "Mustang Mach-E",
             "Puma", "Ranger", "Territory", "Tourneo", "Transit", "Transit Custom"],
    "Hyundai": ["Accent", "Atos", "Creta", "Elantra", "Getz", "Grand i10", "H-1", "H100", "i10", "i20", "i30",
                "Ioniq 5", "ix35", "Kona", "Palisade", "Santa Fe", "Sonata", "Staria", "Tucson", "Veloster",
                "Venue"],
    "Kia": ["Carnival", "Cerato", "EV6", "EV9", "K2500", "K2700", "Optima", "Pegas", "Picanto", "Rio", "Seltos",
            "Sonet", "Sorento", "Soul", "Sportage", "Stinger"],
    "Suzuki": ["Alto", "Baleno", "Celerio", "Ciaz", "Dzire", "Eeco", "Ertiga", "Fronx", "Grand Vitara", "Ignis",
               "Jimny", "Kizashi", "S-Presso", "Super Carry", "Swift", "SX4", "Vitara", "Vitara Brezza", "XL6"],
    "Nissan": ["370Z", "Almera", "GT-R", "Juke", "Leaf", "Livina", "Magnite", "Micra", "Navara", "Note", "NP200",
               "NP300 Hardbody", "NV200", "NV350", "Pathfinder", "Patrol", "Qashqai", "Sentra", "Tiida", "X-Trail"],
    "Renault": ["Captur", "Clio", "Duster", "Fluence", "Kadjar", "Kangoo", "Kiger", "Koleos", "Kwid", "Master",
                "Megane", "Sandero", "Scenic", "Trafic", "Triber"],
    "Isuzu": ["D-Max", "KB", "MU-X"],
    "Mahindra": ["Bolero", "KUV100", "Pik Up", "Scorpio", "Scorpio-N", "Thar", "TUV300", "XUV 3XO", "XUV300",
                 "XUV500", "XUV700"],
    "Haval": ["H1", "H2", "H6", "H6 GT", "H9", "Jolion"],
    "GWM": ["Ora 03", "P-Series", "Steed 5", "Steed 5E", "Steed 6", "Tank 300", "Tank 500"],
    "Chery": ["QQ", "Tiggo", "Tiggo 4", "Tiggo 4 Pro", "Tiggo 7", "Tiggo 7 Pro", "Tiggo 8", "Tiggo 8 Pro",
              "Tiggo Cross"],
    "Omoda": ["C5", "C9", "E5"],
    "Jaecoo": ["J7", "J8"],
    "Jetour": ["Dashing", "X70"],
    "BAIC": ["B40", "Beijing X55"],
    "JAC": ["T6", "T8", "T9"],
    "Proton": ["Persona", "Saga", "X50", "X70"],
    "Changan": ["CS35", "Hunter"],
    "BYD": ["Atto 3", "Dolphin", "Seal", "Sealion 6", "Sealion 7"],
    "Datsun": ["Go", "Go+"],
    "BMW": ["1 Series", "2 Series", "2 Series Active Tourer", "2 Series Gran Coupe", "3 Series", "4 Series",
            "5 Series", "6 Series", "7 Series", "8 Series", "i3", "i4", "i7", "iX", "iX1", "iX3", "M2", "M3", "M4",
            "M5", "M8", "X1", "X2", "X3", "X4", "X5", "X6", "X7", "XM", "Z4"],
    "Mercedes-Benz": ["A-Class", "AMG GT", "B-Class", "C-Class", "CLA", "CLS", "E-Class", "EQA", "EQB", "EQE",
                      "EQS", "G-Class", "GLA", "GLB", "GLC", "GLC Coupe", "GLE", "GLE Coupe", "GLS", "ML",
                      "S-Class", "SL", "SLC", "SLK", "Sprinter", "V-Class", "Vito", "X-Class"],
    "Audi": ["A1", "A3", "A4", "A5", "A6", "A7", "A8", "e-tron", "Q2", "Q3", "Q5", "Q7", "Q8", "Q8 e-tron", "R8",
             "RS3", "RS4", "RS5", "RS6", "S3", "TT"],
    "Land Rover": ["Defender", "Discovery", "Discovery Sport", "Freelander", "Freelander 2", "Range Rover",
                   "Range Rover Evoque", "Range Rover Sport", "Range Rover Velar"],
    "Jaguar": ["E-Pace", "F-Pace", "F-Type", "I-Pace", "XE", "XF", "XJ"],
    "Jeep": ["Avenger", "Cherokee", "Compass", "Gladiator", "Grand Cherokee", "Renegade", "Wrangler"],
    "Mazda": ["BT-50", "CX-3", "CX-30", "CX-5", "CX-60", "CX-90", "Mazda2", "Mazda3", "Mazda6", "MX-5"],
    "Honda": ["Accord", "Amaze", "Ballade", "BR-V", "Brio", "City", "Civic", "CR-V", "Fit", "HR-V", "Jazz",
              "WR-V", "ZR-V"],
    "Mitsubishi": ["ASX", "Colt", "Eclipse Cross", "Outlander", "Pajero", "Pajero Sport", "Triton", "Xpander"],
    "Opel": ["Adam", "Astra", "Corsa", "Crossland", "Grandland", "Meriva", "Mokka", "Zafira"],
    "Peugeot": ["108", "2008", "208", "3008", "308", "408", "5008", "Expert", "Landtrek", "Partner", "Rifter"],
    "Citroen": ["Berlingo", "C3", "C3 Aircross", "C4", "C5 Aircross"],
    "Volvo": ["C40", "EX30", "S60", "S90", "V40", "V60", "V90", "XC40", "XC60", "XC90"],
    "Fiat": ["500", "500X", "Doblo", "Fiorino", "Panda", "Punto", "Tipo", "Uno"],
    "Alfa Romeo": ["Giulia", "Giulietta", "MiTo", "Stelvio", "Tonale"],
    "Chevrolet": ["Aveo", "Captiva", "Corvette", "Cruze", "Lumina", "Orlando", "Sonic", "Spark", "Trailblazer",
                  "Utility"],
    "Subaru": ["BRZ", "Crosstrek", "Forester", "Impreza", "Outback", "WRX", "XV"],
    "Lexus": ["ES", "IS", "LBX", "LC", "LS", "LX", "NX", "RC", "RX", "UX"],
    "Porsche": ["718 Boxster", "718 Cayman", "911", "Cayenne", "Macan", "Panamera", "Taycan"],
    "MINI": ["Clubman", "Convertible", "Cooper", "Countryman", "Paceman"],
    "Maserati": ["Ghibli", "Grecale", "Levante", "MC20", "Quattroporte"],
    "Bentley": ["Bentayga", "Continental GT", "Flying Spur"],
    "Ferrari": ["296", "488", "812", "California", "F8", "Portofino", "Purosangue", "Roma", "SF90"],
    "Lamborghini": ["Aventador", "Huracan", "Revuelto", "Urus"],
    "Rolls-Royce": ["Cullinan", "Dawn", "Ghost", "Phantom", "Spectre", "Wraith"],
    "McLaren": ["720S", "750S", "Artura", "GT"],
    "Aston Martin": ["DB11", "DB12", "DBX", "Vantage"],
}
MAKES = list(MODELS)  # most common first: the order of the make list on the form
_MAKE_BY_KEY = {re.sub(r"[^a-z0-9]", "", m.lower()): m for m in MODELS} | {
    "vw": "Volkswagen", "mercedes": "Mercedes-Benz", "mercedesbenz": "Mercedes-Benz", "merc": "Mercedes-Benz",
    "landrover": "Land Rover", "rangerover": "Land Rover", "greatwall": "GWM", "citroën": "Citroen",
    "alfa": "Alfa Romeo", "rollsroyce": "Rolls-Royce", "astonmartin": "Aston Martin", "mini": "MINI",
}

BODIES = ["Hatchback", "Sedan", "SUV", "Crossover", "Bakkie", "MPV", "Coupe", "Convertible", "Station wagon",
          "Panel van", "Minibus"]
FUELS = ["Petrol", "Diesel", "Hybrid", "Plug-in hybrid", "Electric"]
TRANSMISSIONS = ["Manual", "Automatic"]
DRIVES = ["FWD", "RWD", "AWD", "4x2", "4x4"]
COLOURS = ["White", "Silver", "Grey", "Black", "Blue", "Red", "Brown", "Beige", "Green", "Orange", "Yellow",
           "Gold", "Bronze", "Maroon", "Purple"]
CONDITIONS = {"used": "Used", "demo": "Demo", "new": "New"}
SERVICE_HISTORY = {"full": "Full service history", "partial": "Partial service history", "none": "No service history"}
FEATURES = [
    "Air conditioning", "Climate control", "Bluetooth", "Apple CarPlay / Android Auto", "Touchscreen",
    "Navigation", "Reverse camera", "360° camera", "Park distance control", "Cruise control",
    "Adaptive cruise control", "Electric windows", "Electric mirrors", "Central locking", "Keyless entry",
    "Push-button start", "Multifunction steering wheel", "Leather seats", "Heated seats", "Electric seats",
    "Sunroof", "Panoramic roof", "Alloy wheels", "LED headlights", "Fog lights", "Rain-sensing wipers",
    "Lane assist", "Blind spot monitor", "ABS", "Airbags", "Isofix", "Third-row seats", "Roof rails", "Tow bar",
    "Canopy", "Tonneau cover", "Nudge bar", "Side steps", "Diff lock", "Service plan", "Maintenance plan",
    "Warranty", "Spare key",
]
PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West",
             "Northern Cape", "Western Cape"]
PERKS = {  # "why buy from us" on the website: key -> (title, line)
    "finance": ("Finance arranged", "We apply at all the major banks for you."),
    "tradein": ("Trade-ins welcome", "Bring your car — we'll make you an offer."),
    "warranty": ("Warranty available", "Extended mechanical warranties on most cars."),
    "inspected": ("Checked before sale", "Every car is inspected and road-ready."),
    "delivery": ("Nationwide delivery", "We deliver anywhere in South Africa."),
    "workshop": ("Own workshop", "We service what we sell."),
}


def nice_make(text: str) -> str:
    """'TOYOTA', 'toyota', 'VW' -> 'Toyota', 'Volkswagen'. Unknown makes keep their words, capitalised."""
    key = re.sub(r"[^a-z0-9ë]", "", (text or "").lower())
    if key in _MAKE_BY_KEY:
        return _MAKE_BY_KEY[key]
    return nice_words(text)


def nice_words(text: str) -> str:
    """'POLO VIVO 1.4 TRENDLINE' -> 'Polo Vivo 1.4 Trendline'; short codes such as GTI, TSI or X5 stay."""
    def nice(w: str) -> str:
        return w.capitalize() if w.isalpha() and len(w) > 3 and (w.isupper() or w.islower()) else w
    return " ".join(nice(w) for w in (text or "").split())


def _squash(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", text.upper())  # 'T-CROSS' = 'T CROSS' = 'TCROSS'


def split_model(make: str, text: str) -> tuple[str, str]:
    """'POLO VIVO 1.4 TRENDLINE' for Volkswagen -> ('Polo Vivo', '1.4 Trendline'): the longest known model
    the text starts with, and the rest as the variant."""
    words = (text or "").split()
    for n in (2, 1):  # 'MERCEDES BENZ C200', 'TOYOTA COROLLA'
        if len(words) > n and _squash(" ".join(words[:n])) == _squash(make or "-"):
            words = words[n:]
            break
    for name in sorted(MODELS.get(make, []), key=len, reverse=True):
        for n in range(len(words), 0, -1):
            if _squash(" ".join(words[:n])) == _squash(name):
                return name, nice_words(" ".join(words[n:]))
    if not words:
        return "", ""
    return nice_words(words[0]), nice_words(" ".join(words[1:]))


def models_for(db, make: str) -> list[str]:
    known = MODELS.get(make, [])
    learned = [r["model"] for r in db.execute(
        "SELECT model, SUM(uses) AS n FROM variants WHERE make = ? AND model != '' GROUP BY model ORDER BY n DESC",
        (make,))]
    seen = {m.lower() for m in known}
    return known + sorted({m for m in learned if m.lower() not in seen})


SPEC_FIELDS = ("body", "fuel", "transmission", "drive", "engine", "doors", "seats")


def variants_for(db, make: str, model: str, limit: int = 60) -> list[dict]:
    rows = db.execute(
        "SELECT * FROM variants WHERE make = ? AND model = ? AND variant != '' ORDER BY uses DESC, variant LIMIT ?",
        (make, model, limit),
    ).fetchall()
    return [{"variant": r["variant"], "year_from": r["year_from"], "year_to": r["year_to"],
             **{k: r[k] for k in SPEC_FIELDS}} for r in rows]


def _key(make: str, model: str, variant: str) -> str:
    return "|".join(" ".join(s.lower().split()) for s in (make, model, variant))


def learn(db, car: dict):
    """Remember a saved car's make, model, variant and specs for everyone's next car form."""
    make, model, variant = car["make"], car.get("model") or "", car.get("variant") or ""
    if not make or not model:
        return
    key = _key(make, model, variant)
    row = db.execute("SELECT * FROM variants WHERE key = ?", (key,)).fetchone()
    specs = {k: car.get(k) or (0 if k in ("doors", "seats") else "") for k in SPEC_FIELDS}
    year = car.get("year")
    if row is None:
        db.execute(
            "INSERT INTO variants (key, make, model, variant, body, fuel, transmission, drive, engine, doors, seats, "
            "year_from, year_to, uses, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
            (key, make, model, variant, *specs.values(), year, year, ts()),
        )
        return
    merged = {k: specs[k] or row[k] for k in SPEC_FIELDS}  # the latest answer wins, an empty one doesn't erase
    db.execute(
        "UPDATE variants SET body = ?, fuel = ?, transmission = ?, drive = ?, engine = ?, doors = ?, seats = ?, "
        "year_from = MIN(COALESCE(year_from, ?), ?), year_to = MAX(COALESCE(year_to, ?), ?), uses = uses + 1, "
        "updated_at = ? WHERE key = ?",
        (*merged.values(), year, year, year, year, ts(), key),
    )


def body_from_words(text: str) -> str:
    """A licence disc's description ('Hatch back / Luikrug', 'LDV / Bakkie') -> one of BODIES, or ''."""
    t = (text or "").lower()
    for words, body in (
        (("bakkie", "ldv", "light delivery", "pick-up", "pickup", "double cab", "single cab"), "Bakkie"),
        (("minibus", "midibus", "bus"), "Minibus"),
        (("panel van", "van"), "Panel van"),
        (("hatch", "luikrug"), "Hatchback"),
        (("sedan", "saloon"), "Sedan"),
        (("coupe", "coupé"), "Coupe"),
        (("cabriolet", "convertible"), "Convertible"),
        (("multi purpose", "multi-purpose", "mpv"), "MPV"),
        (("station wagon", "stasiewa", "sport utility", "suv", "4x4"), "SUV"),
    ):
        if any(w in t for w in words):
            return body
    return ""


def features_json(items) -> str:
    seen, out = set(), []
    for item in items:
        item = " ".join(str(item).split())[:40]
        if item and item.lower() not in seen:
            seen.add(item.lower())
            out.append(item)
    return json.dumps(out[:60])
