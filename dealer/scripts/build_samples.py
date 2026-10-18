"""Example cars for demos and websites we make for dealers: photos from Wikimedia Commons -> static/samples.

    python scripts/build_samples.py <folder with manifest.json and the downloaded photos>

The manifest lists each car's photos with author and licence (CC0, CC BY, CC BY-SA). This script makes the
same sizes the app makes from an upload (WebP 400/800/1200 and a JPEG), and writes static/samples/samples.json
with the cars: SA variants, prices and mileage that fit the year, and the photo credits.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "static" / "samples"
MAX_SIDE = 1200
WIDTHS = (400, 800, 1200)

# make + model -> what a South African dealer would list: (variant, body, fuel, transmission, drive, engine,
# doors, seats, price for the year, that year, km a year, features)
CARS = {
    ("Toyota", "Hilux"): ("2.8 GD-6 Raider 4x4 double cab auto", "Bakkie", "Diesel", "Automatic", "4x4", "2.8 GD-6",
                          4, 5, 499_900, 2019, 17_000,
                          ["Air conditioning", "Bluetooth", "Reverse camera", "Cruise control", "Diff lock", "Tow bar",
                           "Tonneau cover", "Alloy wheels", "Service plan"]),
    ("Ford", "Ranger"): ("2.0 BiTurbo Wildtrak 4x4 double cab", "Bakkie", "Diesel", "Automatic", "4x4", "2.0 BiTurbo",
                         4, 5, 529_900, 2020, 19_000,
                         ["Climate control", "Apple CarPlay / Android Auto", "Navigation", "Reverse camera",
                          "Park distance control", "Leather seats", "Roof rails", "Tow bar", "Side steps"]),
    ("Toyota", "Fortuner"): ("2.8 GD-6 auto", "SUV", "Diesel", "Automatic", "4x2", "2.8 GD-6", 5, 7, 449_900, 2018,
                             18_000, ["Climate control", "Leather seats", "Reverse camera", "Cruise control",
                                      "Third-row seats", "Tow bar", "Alloy wheels"]),
    ("Toyota", "Corolla Cross"): ("1.8 XS CVT", "SUV", "Petrol", "Automatic", "FWD", "1.8", 5, 5, 364_900, 2022,
                                  14_000, ["Apple CarPlay / Android Auto", "Touchscreen", "Reverse camera",
                                           "Cruise control", "Keyless entry", "Push-button start", "Service plan"]),
    ("Volkswagen", "Polo"): ("1.0 TSI Comfortline", "Hatchback", "Petrol", "Manual", "FWD", "1.0 TSI", 5, 5, 229_900,
                             2019, 15_000, ["Air conditioning", "Bluetooth", "Touchscreen", "Park distance control",
                                            "Cruise control", "Electric windows", "Isofix"]),
    ("Volkswagen", "Golf"): ("GTI 2.0 TSI DSG", "Hatchback", "Petrol", "Automatic", "FWD", "2.0 TSI", 5, 5, 339_900,
                             2017, 16_000, ["Climate control", "Navigation", "Apple CarPlay / Android Auto",
                                            "Park distance control", "LED headlights", "Alloy wheels", "Spare key"]),
    ("Suzuki", "Swift"): ("1.2 GL", "Hatchback", "Petrol", "Manual", "FWD", "1.2", 5, 5, 169_900, 2021, 13_000,
                          ["Air conditioning", "Bluetooth", "Electric windows", "Central locking", "Airbags", "ABS"]),
    ("Hyundai", "Grand i10"): ("1.25 Fluid", "Hatchback", "Petrol", "Manual", "FWD", "1.25", 5, 5, 144_900, 2020,
                               12_000, ["Air conditioning", "Bluetooth", "Electric windows", "Central locking"]),
    ("Hyundai", "i10"): ("1.25 Fluid", "Hatchback", "Petrol", "Manual", "FWD", "1.25", 5, 5, 144_900, 2020, 12_000,
                         ["Air conditioning", "Bluetooth", "Electric windows", "Central locking"]),
    ("Kia", "Picanto"): ("1.2 Style", "Hatchback", "Petrol", "Manual", "FWD", "1.2", 5, 5, 144_900, 2019, 11_000,
                         ["Air conditioning", "Bluetooth", "Touchscreen", "Reverse camera", "Alloy wheels"]),
    ("BMW", "3 Series"): ("320i M Sport auto", "Sedan", "Petrol", "Automatic", "RWD", "2.0", 4, 5, 319_900, 2018,
                          16_000, ["Climate control", "Navigation", "Leather seats", "Electric seats",
                                   "Park distance control", "LED headlights", "Cruise control", "Maintenance plan"]),
    ("Mercedes-Benz", "C-Class"): ("C200 AMG Line auto", "Sedan", "Petrol", "Automatic", "RWD", "2.0", 4, 5, 329_900,
                                   2017, 17_000, ["Climate control", "Navigation", "Leather seats", "Reverse camera",
                                                  "Park distance control", "LED headlights", "Keyless entry"]),
    ("Haval", "Jolion"): ("1.5T Luxury DCT", "SUV", "Petrol", "Automatic", "FWD", "1.5T", 5, 5, 314_900, 2022, 12_000,
                          ["Apple CarPlay / Android Auto", "360° camera", "Adaptive cruise control", "Lane assist",
                           "Keyless entry", "Panoramic roof", "Warranty"]),
    ("Kia", "Sportage"): ("2.0 Ignite Plus auto", "SUV", "Petrol", "Automatic", "FWD", "2.0", 5, 5, 329_900, 2019,
                          15_000, ["Climate control", "Apple CarPlay / Android Auto", "Reverse camera",
                                   "Cruise control", "Leather seats", "Alloy wheels"]),
    ("Isuzu", "D-Max"): ("250 HO Hi-Ride double cab", "Bakkie", "Diesel", "Manual", "4x2", "2.5", 4, 5, 329_900, 2019,
                         20_000, ["Air conditioning", "Bluetooth", "Reverse camera", "Tow bar", "Canopy",
                                  "Alloy wheels"]),
    ("Toyota", "Corolla"): ("1.8 XS CVT", "Sedan", "Petrol", "Automatic", "FWD", "1.8", 4, 5, 289_900, 2020, 14_000,
                            ["Apple CarPlay / Android Auto", "Reverse camera", "Cruise control", "Lane assist",
                             "LED headlights", "Service plan"]),
    ("Renault", "Kwid"): ("1.0 Climber", "Hatchback", "Petrol", "Manual", "FWD", "1.0", 5, 5, 119_900, 2021, 11_000,
                          ["Air conditioning", "Touchscreen", "Bluetooth", "Electric windows"]),
    ("Renault", "Clio"): ("0.9 Turbo Expression", "Hatchback", "Petrol", "Manual", "FWD", "0.9 Turbo", 5, 5, 159_900,
                          2018, 15_000, ["Air conditioning", "Bluetooth", "Touchscreen", "Cruise control"]),
}


def nice_price(value: float) -> int:
    """189 437 -> 189 900: dealers end their prices in 900."""
    return max(9_900, int(value // 1000) * 1000 + 900)


def four_by_three(img: Image.Image) -> Image.Image:
    """Wide Commons shots (2:1) into the 4:3 of a phone photo: the whole car, on a blurred copy of itself."""
    w, h = img.size
    if w / h <= 4 / 3 + 0.02:
        return img
    canvas = ImageOps.fit(img, (w, round(w * 3 / 4)), Image.Resampling.LANCZOS)
    canvas = canvas.filter(ImageFilter.GaussianBlur(w / 40)).point(lambda v: int(v * 0.8))
    canvas.paste(img, (0, (canvas.height - h) // 2))
    return canvas


def photo_sizes(src: Path, name: str) -> dict:
    img = four_by_three(ImageOps.exif_transpose(Image.open(src)).convert("RGB"))
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    preview = img.copy()
    preview.thumbnail((800, 800), Image.Resampling.LANCZOS)  # link previews and the demo's zip: small is fine
    preview.save(OUT / f"{name}.jpg", "JPEG", quality=76, optimize=True, progressive=True)
    sizes = [w for w in WIDTHS if w < img.width] + [img.width]
    for w in sizes:
        small = img if w == img.width else img.resize((w, round(img.height * w / img.width)), Image.Resampling.LANCZOS)
        small.save(OUT / f"{name}-{w}.webp", "WEBP", quality=72, method=6)
    r, g, b = img.resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    return {"name": name, "width": img.width, "height": img.height, "color": f"#{r:02x}{g:02x}{b:02x}"}


def main(folder: Path):
    manifest = json.loads((folder / "manifest.json").read_text())
    for old in OUT.glob("*.*"):
        if old.suffix in (".jpg", ".webp", ".json"):
            old.unlink()
    cars = []
    for i, entry in enumerate(manifest, start=1):
        key = (entry["make"], {"Golf GTI": "Golf"}.get(entry["model"], entry["model"]))
        if key not in CARS or not entry.get("files"):
            print("skipped:", entry.get("car"))
            continue
        variant, body, fuel, gearbox, drive, engine, doors, seats, price, year0, km_year, features = CARS[key]
        year = int(entry.get("year_guess") or year0)
        model = key[1]
        if key == ("Hyundai", "i10"):  # the i10 in the photo looks like the Grand i10 South Africa got
            model = "Grand i10"
        if key == ("Toyota", "Corolla Cross"):  # on sale in South Africa from late 2021, the photo's is a hybrid
            year, variant, fuel, price, year0 = max(year, 2022), "1.8 XR Hybrid CVT", "Hybrid", 429_900, 2022
        if key == ("Toyota", "Corolla") and entry.get("body") == "Hatchback":
            variant, body, engine, doors = "1.2T XR CVT", "Hatchback", "1.2T", 5
        if key == ("Isuzu", "D-Max") and year >= 2021:  # the photo's is the 1.9
            variant, engine, price, year0 = "1.9 Ddi LS double cab", "1.9 Ddi", 529_900, 2024
        if key == ("Isuzu", "D-Max") and year < 2019:
            model, variant = "KB", "250 D-Teq LE double cab"
        if key == ("Ford", "Ranger") and year < 2019:
            variant = "3.2 TDCi XLT 4x4 double cab auto"
        if key == ("Renault", "Kwid") and year < 2019:
            variant = "1.0 Dynamique"
        age = max(1, 2026 - year)
        slug = f"{year}-{entry['make']}-{model}-{variant}".lower()
        slug = "".join(c if c.isalnum() else "-" for c in slug)
        slug = "-".join(p for p in slug.split("-") if p)
        photos = []
        for k, f in enumerate(entry["files"], start=1):
            sized = photo_sizes(folder / f["file"], f"{i:02d}-{slug[:40].rstrip('-')}-{k}")
            sized.update(author=f["author"], license=f["license"], license_url=f["license_url"],
                         source_url=f["source_url"])
            photos.append(sized)
        cars.append({
            "slug": slug, "make": entry["make"], "model": model, "variant": variant, "year": year,
            "price": nice_price(price * 0.9 ** (year0 - year)),
            "mileage": int(round(km_year * age * (0.85 + (i % 5) * 0.07), -3)),
            "body": body, "fuel": fuel, "transmission": gearbox, "drive": drive, "engine": engine,
            "colour": entry.get("colour") or "", "doors": doors, "seats": seats,
            "service_history": "full" if i % 3 else "partial", "features": features, "photos": photos,
        })
        print(f"{cars[-1]['year']} {entry['make']} {model} {variant}: {len(photos)} photos")
    (OUT / "samples.json").write_text(json.dumps({"cars": cars}, ensure_ascii=False, indent=1))
    total = sum(p.stat().st_size for p in OUT.iterdir())
    print(f"{len(cars)} cars, {total / 1e6:.1f} MB in {OUT}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
