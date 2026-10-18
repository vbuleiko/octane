import csv
import io
import json
import re
from datetime import date, timedelta
from pathlib import Path

from PIL import Image

from app import catalog, disc, notify, portals
from app.utils import monthly_payment, normalize_phone, parse_amount, parse_coords, slugify, ts

from .conftest import Browser, jpeg, signup


# --- helpers ------------------------------------------------------------------

def tenant(db, email="owner@example.com"):
    return db.execute("SELECT * FROM tenants WHERE email = ?", (email,)).fetchone()


CAR = {
    "make": "Toyota", "model": "Corolla Cross", "variant": "1.8 XS CVT", "year": "2022", "mileage": "36 000",
    "price": "R364 995", "colour": "White", "body": "SUV", "fuel": "Petrol", "transmission": "Automatic",
    "feature": ["Bluetooth", "Reverse camera"], "more_features": "Towbar", "description": "One owner.",
    "status": "available",
}


def add_car(owner, db, photos=(), **fields):
    data = {**CAR, **fields}
    if photos:
        data["photo"] = [str(p) for p in photos]
    resp = owner.post("/app/car/new", data)
    assert resp.status_code == 302, resp.data
    return db.execute("SELECT * FROM vehicles ORDER BY id DESC LIMIT 1").fetchone()


def upload(owner, data=None, car=None):
    form = {"photo": (io.BytesIO(data or jpeg()), "car.jpg")}
    if car:
        form["car"] = str(car)
    return owner.post("/app/photos", form, content_type="multipart/form-data",
                      headers={"X-Requested-With": "fetch"})


def feed_rows(client, url) -> list[dict]:
    return list(csv.DictReader(io.StringIO(client.get(url).data.decode())))


def site_path(db, email="owner@example.com"):
    return f"/site/{tenant(db, email)['slug']}"


# --- small helpers ------------------------------------------------------------------

def test_amounts_and_finance():
    assert parse_amount("R189 995") == 189995
    assert parse_amount("189,995.00") == 189995
    assert parse_amount("189995,00") == 189995
    assert parse_amount("84 000 km") == 84000
    assert parse_amount("abc") is None and parse_amount("") is None
    assert parse_amount("999999999999") is None
    assert monthly_payment(250000, 25000, 12.5, 72) == 4458
    assert monthly_payment(250000, 25000, 12.5, 72, 50000) < 4458
    assert monthly_payment(0, 0, 12.5, 72) == 0


def test_phones_coords_slugs():
    assert normalize_phone("082 123 4567") == "27821234567"
    assert normalize_phone("+27 (0)82 123 4567") == "27821234567"
    assert parse_coords("-33.9249, 18.4241") == (-33.9249, 18.4241)
    assert parse_coords("https://www.google.com/maps/place/X/@-33.8917,18.5203,17z") == (-33.8917, 18.5203)
    assert parse_coords("Bellville") is None
    assert slugify("2019 Toyota Hilux 2.8 GD-6 Raider") == "2019-toyota-hilux-2-8-gd-6-raider"


def test_catalog_names():
    assert catalog.nice_make("TOYOTA") == "Toyota"
    assert catalog.nice_make("vw") == "Volkswagen"
    assert catalog.nice_make("Mercedes Benz") == "Mercedes-Benz"
    assert catalog.split_model("Volkswagen", "POLO VIVO 1.4 TRENDLINE") == ("Polo Vivo", "1.4 Trendline")
    assert catalog.split_model("Volkswagen", "POLO 1.0 TSI") == ("Polo", "1.0 TSI")
    assert catalog.split_model("Volkswagen", "T-CROSS 1.0 TSI") == ("T-Cross", "1.0 TSI")
    assert catalog.split_model("Toyota", "TOYOTA HILUX 2.8 GD-6") == ("Hilux", "2.8 GD-6")
    assert catalog.split_model("Kia", "XYZ 1.0") == ("XYZ", "1.0")
    assert catalog.body_from_words("Hatch back / Luikrug") == "Hatchback"
    assert catalog.body_from_words("LDV / Bakkie") == "Bakkie"
    assert catalog.body_from_words("Station wagon / Stasiewa") == "SUV"


def test_licence_disc():
    code = ("%MVL1CC09%0154%4024T011%1%40240119RMPX%CA123456%BYJ091C%Hatch back / Luikrug%VOLKSWAGEN%"
            "POLO VIVO 1.4 TRENDLINE%White / Wit%AAVZZZ6RZEU012345%CLP123456%2025-03-31%")
    d = disc.parse(code)
    assert d["reg_no"] == "CA 123-456"
    assert (d["make"], d["model"], d["variant"]) == ("Volkswagen", "Polo Vivo", "1.4 Trendline")
    assert d["colour"] == "White" and d["body"] == "Hatchback"
    assert d["vin"] == "AAVZZZ6RZEU012345"
    assert disc.parse("not a disc") is None


# --- public ----------------------------------------------------------------------------

def test_landing_and_basics(client):
    page = client.get("/")
    assert page.status_code == 200 and b"Try the live demo" in page.data
    assert client.get("/healthz").data == b"ok"
    assert client.get("/privacy").status_code == 200
    assert b"Disallow: /app" in client.get("/robots.txt").data
    resp = client.get("/app/")
    assert resp.status_code == 302 and "/login" in resp.location
    assert client.post("/signup", data={"name": "x"}).status_code == 400  # no CSRF token


def test_signup_and_login(browser, db):
    signup(browser)
    t = tenant(db)
    assert t["phone"] == "27825551234" and t["plan"] == "trial" and t["slug"] == "joe-s-motors"
    assert len(t["feed_key"]) >= 16
    assert date.fromisoformat(t["paid_until"]) >= date.today() + timedelta(days=29)
    browser.post("/logout")
    browser.get("/signup")
    assert b"already has an account" in signup(browser).data
    assert b"Wrong email" in browser.post("/login", {"email": "owner@example.com", "password": "nope"}).data
    resp = browser.post("/login", {"email": "OWNER@example.com", "password": "secret123"})
    assert resp.status_code == 302 and resp.location.endswith("/app/")


# --- stock -----------------------------------------------------------------------------

def test_car_form_needs_the_basics(owner, db):
    resp = owner.post("/app/car/new", {"make": "", "model": "", "year": "19", "price": "", "status": "available"})
    assert resp.status_code == 200
    for text in (b"Choose the make", b"Enter the model", b"Enter the year", b"Enter the price"):
        assert text in resp.data
    resp = owner.post("/app/car/new", {"make": "Toyota", "model": "Hilux", "year": "2019", "status": "draft"})
    assert resp.status_code == 302  # a draft can wait for its price


def test_add_car_shows_on_website(owner, db, client):
    car = add_car(owner, db)
    assert car["price"] == 364995 and car["mileage"] == 36000 and car["stock_no"] == "S001"
    assert json.loads(car["features"]) == ["Bluetooth", "Reverse camera", "Towbar"]
    assert car["slug"] == "2022-toyota-corolla-cross-1-8-xs-cvt" and car["listed_at"]
    stock_page = owner.get("/app/").data
    assert b"2022 Toyota Corolla Cross" in stock_page and b"R364,995" in stock_page
    base = site_path(db)
    home = client.get(base + "/")
    assert home.status_code == 200 and b"2022 Toyota Corolla Cross" in home.data
    page = client.get(f"{base}/cars/{car['slug']}")
    assert page.status_code == 200
    assert b"R364,995" in page.data and b"One owner." in page.data
    assert b'"@type": "Car"' in page.data or b'"@type":"Car"' in page.data
    assert b"Finance available through all the major banks" in page.data  # the dealer's footer text
    assert client.get(f"{base}/cars/nope").status_code == 404
    # the catalogue learned the variant for the next dealer
    assert catalog.variants_for(db, "Toyota", "Corolla Cross")[0]["variant"] == "1.8 XS CVT"
    assert "Corolla Cross" in owner.get("/app/catalog?make=toyota").get_json()["models"]


def test_statuses_on_website(owner, db, client):
    car = add_car(owner, db)
    base = site_path(db)
    owner.post(f"/app/car/{car['id']}/status", {"status": "reserved"})
    assert b"Reserved" in client.get(f"{base}/cars").data
    owner.post(f"/app/car/{car['id']}/status", {"status": "sold"})
    row = db.execute("SELECT * FROM vehicles WHERE id = ?", (car["id"],)).fetchone()
    assert row["status"] == "sold" and row["sold_at"]
    assert b"Corolla Cross" not in client.get(f"{base}/cars").data
    sold = client.get(f"{base}/cars/{car['slug']}")
    assert sold.status_code == 200 and b"This car has been sold" in sold.data
    owner.post(f"/app/car/{car['id']}/status", {"status": "draft"})
    assert client.get(f"{base}/cars/{car['slug']}").status_code == 404


def test_photos(owner, db, app, client):
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"
    exif[0x8825] = {1: "S", 2: (33.0, 55.0, 0.0)}  # where the photo was taken
    buf = io.BytesIO()
    Image.new("RGB", (3000, 2000), (20, 90, 160)).save(buf, "JPEG", exif=exif)
    first = upload(owner, buf.getvalue()).get_json()
    second = upload(owner, jpeg(800, 600)).get_json()
    assert first["ok"] and second["ok"]
    assert upload(owner, b"not a photo").status_code == 400
    car = add_car(owner, db, photos=[second["id"], first["id"]])
    rows = db.execute("SELECT * FROM photos WHERE vehicle_id = ? ORDER BY position", (car["id"],)).fetchall()
    assert [r["id"] for r in rows] == [second["id"], first["id"]]
    big = db.execute("SELECT * FROM photos WHERE id = ?", (first["id"],)).fetchone()
    assert (big["width"], big["height"]) == (1600, 1067)
    media = Path(app.config["MEDIA_DIR"])
    files = sorted(p.name for p in (media / str(tenant(db)["id"])).iterdir())
    assert len([f for f in files if f.endswith(".jpg")]) == 2
    assert {f.rsplit("-", 1)[1] for f in files if f.startswith(big["key"].split("/")[1] + "-")} == {
        "400.webp", "800.webp", "1200.webp", "1600.webp"}
    assert not Image.open(media / f"{big['key']}.jpg").getexif()  # no GPS left
    page = client.get(f"{site_path(db)}/cars/{car['slug']}").data
    assert b"srcset" in page and b"-1600.webp 1600w" in page and b'fetchpriority="high"' in page
    served = client.get(f"/media/{big['key']}-800.webp")
    assert served.status_code == 200 and "immutable" in served.headers["Cache-Control"]
    assert client.get("/media/../test.db").status_code == 404
    # delete one
    assert owner.post(f"/app/photo/{first['id']}/delete", headers={"X-Requested-With": "fetch"}).status_code == 200
    assert not (media / f"{big['key']}.jpg").exists()
    zipped = owner.get(f"/app/car/{car['id']}/photos.zip")
    assert zipped.status_code == 200 and zipped.mimetype == "application/zip"


def test_website_filters(owner, db, client):
    add_car(owner, db, make="Volkswagen", model="Polo Vivo", variant="1.4 Trendline", year="2018", price="159995",
            mileage="98000", body="Hatchback", transmission="Manual")
    add_car(owner, db, make="Ford", model="Ranger", variant="2.2 XLS double cab", year="2020", price="389995",
            mileage="120000", body="Bakkie", fuel="Diesel", transmission="Manual")
    add_car(owner, db)
    base = site_path(db)
    page = client.get(f"{base}/cars?body=Bakkie").data
    assert b"Ranger" in page and b"Polo Vivo" not in page
    page = client.get(f"{base}/cars?price=200000").data
    assert b"Polo Vivo" in page and b"Ranger" not in page
    page = client.get(f"{base}/cars?q=double+cab").data
    assert b"Ranger" in page and b"Corolla" not in page
    page = client.get(f"{base}/cars?sort=price-asc").data.decode()
    assert page.index("Polo Vivo") < page.index("Corolla Cross") < page.index("Ranger")
    assert client.get(f"{base}/cars?page=99&year=abc").status_code == 200


def test_one_dealer_cannot_touch_another(app, db):
    a, b = Browser(app.test_client()), Browser(app.test_client())
    signup(a)
    signup(b, email="other@example.com", name="Other Cars")
    car = add_car(a, db)
    photo = upload(a).get_json()
    assert b.get(f"/app/car/{car['id']}").status_code == 404
    assert b.post(f"/app/car/{car['id']}/status", {"status": "sold"}).status_code == 404
    assert b.post(f"/app/car/{car['id']}/delete").status_code == 404
    assert b.post(f"/app/photo/{photo['id']}/delete").status_code == 404
    assert upload(b, car=car["id"]).status_code == 404
    # someone else's photo id can't be attached to your car
    mine = add_car(b, db, photos=[photo["id"]], model="Hilux")
    assert db.execute("SELECT vehicle_id FROM photos WHERE id = ?", (photo["id"],)).fetchone()[0] is None
    assert db.execute("SELECT COUNT(*) FROM photos WHERE vehicle_id = ?", (mine["id"],)).fetchone()[0] == 0
    lead = a.client.post(f"{site_path(db)}/enquire", data={"csrf": a.token, "kind": "contact", "name": "X",
                                                            "phone": "0821234567"})
    assert lead.status_code == 302
    lead_id = db.execute("SELECT id FROM leads").fetchone()[0]
    assert b.get(f"/app/lead/{lead_id}").status_code == 404


# --- enquiries -------------------------------------------------------------------------

def test_enquiries_reach_the_dealer(owner, db, client):
    car = add_car(owner, db)
    base = site_path(db)
    page = Browser(client)
    page.get(f"{base}/cars/{car['slug']}")
    resp = page.post(f"{base}/enquire", {"kind": "test_drive", "car": car["id"], "name": "Thandi",
                                         "phone": "071 234 5678", "when": "Saturday 10:00", "message": "Still there?"})
    assert resp.status_code == 302 and "/thanks" in resp.location
    lead = db.execute("SELECT * FROM leads").fetchone()
    assert lead["kind"] == "test_drive" and lead["phone"] == "27712345678" and lead["vehicle_id"] == car["id"]
    assert json.loads(lead["details"]) == {"when": "Saturday 10:00"}
    assert "2022 Toyota Corolla Cross 1.8 XS CVT" in lead["car_title"]
    # a robot fills the hidden field: no lead
    page.post(f"{base}/enquire", {"kind": "contact", "name": "Bot", "phone": "0711111111", "website": "x"})
    assert db.execute("SELECT COUNT(*) FROM leads").fetchone()[0] == 1
    # a missing phone goes back with a message
    resp = page.post(f"{base}/enquire", {"kind": "contact", "name": "Sam", "phone": "", "back": f"{base}/contact"})
    assert resp.status_code == 302 and resp.location.endswith("/contact")
    inbox = owner.get("/app/leads").data
    assert b"Thandi" in inbox and b"Test drive" in inbox and b"wa.me/27712345678" in inbox
    assert owner.client.get("/app/").status_code == 200
    resp = owner.post(f"/app/lead/{lead['id']}/contacted", headers={"X-Requested-With": "fetch"})
    assert resp.status_code == 200
    owner.post(f"/app/lead/{lead['id']}", {"status": "won", "notes": "Bought it"})
    lead = db.execute("SELECT * FROM leads").fetchone()
    assert lead["status"] == "won" and lead["notes"] == "Bought it"


def test_sell_form_with_photos(owner, db, client):
    base = site_path(db)
    page = Browser(client)
    page.get(f"{base}/sell")
    resp = page.post(f"{base}/enquire", {
        "kind": "sell", "their_car": "2016 VW Polo Vivo", "mileage": "128 000", "asking": "95 000", "name": "Johan",
        "phone": "0823334444", "photos": [(io.BytesIO(jpeg()), "a.jpg"), (io.BytesIO(jpeg(color=(0, 0, 0))), "b.jpg")],
    }, content_type="multipart/form-data")
    assert resp.status_code == 302
    lead = db.execute("SELECT * FROM leads").fetchone()
    assert json.loads(lead["details"])["asking"] == "R95,000"
    assert db.execute("SELECT COUNT(*) FROM photos WHERE lead_id = ?", (lead["id"],)).fetchone()[0] == 2
    assert b"Their car" in owner.get(f"/app/lead/{lead['id']}").data


def test_manual_lead(owner, db):
    car = add_car(owner, db)
    resp = owner.post("/app/lead/new", {"name": "Walk-in Sipho", "phone": "0821112222", "car": car["id"],
                                        "kind": "test_drive", "source": "walk-in"})
    assert resp.status_code == 302
    lead = db.execute("SELECT * FROM leads").fetchone()
    assert lead["source"] == "walk-in" and lead["status"] == "contacted" and lead["emailed_at"]


def test_finance_page(owner, db, client):
    car = add_car(owner, db)
    base = site_path(db)
    page = client.get(f"{base}/finance?car={car['id']}").data
    assert b"2022 Toyota Corolla Cross" in page
    page = client.get(f"{base}/finance?price=250000&deposit=25000&months=72&rate=12.5&balloon=0").data
    assert b"R4,458" in page
    owner.post("/app/settings/finance", {"rate": "11", "months": "60", "deposit": "0", "balloon": "0"})
    assert client.get(f"{base}/finance").status_code == 404  # switched off: the box wasn't ticked


# --- portals ---------------------------------------------------------------------------

def test_facebook_feed(owner, db, client):
    photo = upload(owner).get_json()
    car = add_car(owner, db, photos=[photo["id"]])
    add_car(owner, db, model="Hilux", status="draft")
    t = tenant(db)
    feed = f"/feeds/{t['feed_key']}/facebook.csv"
    assert feed_rows(client, feed) == []  # off: only the header
    owner.post("/app/portals/facebook", {"action": "connect"})
    owner.post("/app/settings/business", {
        "name": t["name"], "phone": "0825551234", "city": "Bellville", "province": "Western Cape",
        "coords": "-33.9, 18.63", "timezone": "Africa/Johannesburg", "country_code": "27",
    })
    rows = feed_rows(client, feed)
    assert len(rows) == 1
    row = rows[0]
    assert row["vehicle_id"] == str(car["id"]) and row["price"] == "364995 ZAR" and row["mileage.unit"] == "KM"
    assert row["body_style"] == "SUV" and row["state_of_vehicle"] == "Used" and row["fuel_type"] == "GASOLINE"
    assert row["image[0].url"].endswith(".jpg") and row["address.region"] == "Western Cape"
    assert row["latitude"] == "-33.9" and row["address.country"] == "ZA"
    assert db.execute("SELECT fetches FROM channels").fetchone()[0] == 1  # the read before it was on doesn't count
    # the car opts out of Facebook
    owner.post(f"/app/car/{car['id']}", {**CAR, "photo": [str(photo["id"])], "advertise_shown": "1"})
    assert feed_rows(client, feed) == []
    owner.post(f"/app/car/{car['id']}", {**CAR, "photo": [str(photo["id"])], "advertise_shown": "1",
                                         "advertise": "facebook"})
    assert len(feed_rows(client, feed)) == 1
    owner.post("/app/portals/facebook", {"action": "pause"})
    assert feed_rows(client, feed) == []
    assert client.get(f"/feeds/{'x' * 24}/facebook.csv").status_code == 404


def test_portal_request_goes_to_admin(owner, db, client, app):
    photo = upload(owner).get_json()
    add_car(owner, db, photos=[photo["id"]])
    owner.post("/app/portals/autotrader", {"action": "connect", "account": "dealer 123", "note": "20 cars"})
    row = db.execute("SELECT * FROM channels").fetchone()
    assert row["status"] == "requested" and row["account"] == "dealer 123"
    t = tenant(db)
    xml = client.get(f"/feeds/{t['feed_key']}/autotrader.xml").data
    assert b"<make>Toyota</make>" in xml and b'<price currency="ZAR">364995</price>' in xml
    admin = Browser(app.test_client())
    admin.get("/admin/login")
    admin.post("/admin/login", {"password": "admin-pass"})
    page = admin.get("/admin/").data
    assert b"Portal connections to set up" in page and b"AutoTrader" in page
    admin.post(f"/admin/tenant/{t['id']}/portal/autotrader", {"action": "connected", "account": "AT-77"})
    row = db.execute("SELECT * FROM channels").fetchone()
    assert row["status"] == "connected" and row["account"] == "AT-77" and row["connected_at"]
    assert b"AutoTrader" in owner.get("/app/portals").data
    for fmt in ("xml", "json", "csv"):
        assert client.get(f"/feeds/{t['feed_key']}/stock.{fmt}").status_code == 200
    assert json.loads(client.get(f"/feeds/{t['feed_key']}/stock.json").data)["count"] == 1


def test_meta_text():
    assert portals.meta_text("FULL SERVICE HISTORY\nSee https://x.co for more") == "Full service history\nSee  for more"


# --- own domain ------------------------------------------------------------------------

def test_dealer_on_its_own_domain(owner, db, app):
    car = add_car(owner, db)
    t = tenant(db)
    with app.app_context():
        pass
    db.execute("UPDATE tenants SET domain = 'www.joesmotors.co.za' WHERE id = ?", (t["id"],))
    db.commit()
    c = app.test_client()
    home = c.get("/", base_url="https://www.joesmotors.co.za")
    assert home.status_code == 200 and b"Joe&#39;s Motors" in home.data and b"Try the live demo" not in home.data
    page = c.get(f"/cars/{car['slug']}", base_url="https://www.joesmotors.co.za")
    assert page.status_code == 200 and b'rel="canonical" href="https://www.joesmotors.co.za/cars/' in page.data
    assert c.get(f"/site/{t['slug']}/", base_url="https://www.joesmotors.co.za").status_code == 404
    assert c.get("/signup", base_url="https://www.joesmotors.co.za").status_code == 404
    assert c.get("/admin/", base_url="https://www.joesmotors.co.za").status_code == 404
    assert b"Sitemap: https://www.joesmotors.co.za/sitemap.xml" in c.get("/robots.txt", base_url="https://www.joesmotors.co.za").data
    sitemap = c.get("/sitemap.xml", base_url="https://www.joesmotors.co.za").data
    assert f"https://www.joesmotors.co.za/cars/{car['slug']}".encode() in sitemap
    assert c.get("/cars").status_code == 404  # only on a dealer's own address
    assert c.get("/tls-check?domain=www.joesmotors.co.za").status_code == 200
    assert c.get("/tls-check?domain=evil.example").status_code == 404
    # the feed points at the dealer's own domain
    owner.post("/app/portals/facebook", {"action": "connect"})


# --- subscription --------------------------------------------------------------------

def test_ended_subscription(owner, db, client):
    add_car(owner, db)
    t = tenant(db)
    base = site_path(db)
    db.execute("UPDATE tenants SET paid_until = ? WHERE id = ?", ((date.today() - timedelta(days=3)).isoformat(), t["id"]))
    db.commit()
    assert owner.get("/app/car/new").status_code == 302  # no new cars
    assert client.get(base + "/").status_code == 200  # the website keeps going for a week
    db.execute("UPDATE tenants SET paid_until = ? WHERE id = ?", ((date.today() - timedelta(days=9)).isoformat(), t["id"]))
    db.commit()
    closed = client.get(base + "/cars")
    assert closed.status_code == 503 and b"Contact us" in closed.data
    assert feed_rows(client, f"/feeds/{t['feed_key']}/stock.csv") == []


# --- admin: websites for dealers that haven't signed up --------------------------------------

def admin_browser(app):
    admin = Browser(app.test_client())
    admin.get("/admin/login")
    admin.post("/admin/login", {"password": "admin-pass"})
    return admin


def test_prospect_website_and_hand_over(app, db):
    admin = admin_browser(app)
    resp = admin.post("/admin/prospects", {"lines": "Joe's Motors | 12 Voortrekker Rd | Bellville | 082 123 4567\n"
                                                    "Bad line | | | 123"})
    assert resp.status_code == 302
    t = db.execute("SELECT * FROM tenants WHERE name = 'Joe''s Motors'").fetchone()
    assert t["email"] is None and t["phone"] == "27821234567"
    visitor = app.test_client()
    page = visitor.get(f"/site/{t['slug']}/")
    assert page.status_code == 200 and b"I like this look" in page.data and b'name="robots" content="noindex"' in page.data
    pick = visitor.get(f"/site/{t['slug']}/pick")
    assert pick.status_code == 302 and pick.location.startswith("https://wa.me/27820000000")
    resp = admin.post(f"/admin/tenant/{t['id']}/owner", {"email": "joe@example.com", "theme": "noir"})
    password = re.search(rb"password: ([^ ]+) ", admin.get("/admin/").data)
    assert resp.status_code == 302 and password
    owner = Browser(app.test_client())
    owner.get("/login")
    assert owner.post("/login", {"email": "joe@example.com", "password": password.group(1).decode()}).status_code == 302
    assert b"I like this look" not in visitor.get(f"/site/{t['slug']}/").data


def test_admin_controls(owner, db, app):
    t = tenant(db)
    admin = admin_browser(app)
    admin.post(f"/admin/tenant/{t['id']}/extend", {"months": "12"})
    assert db.execute("SELECT plan FROM tenants WHERE id = ?", (t["id"],)).fetchone()[0] == "paid"
    admin.post(f"/admin/tenant/{t['id']}/domain", {"domain": "https://www.joesmotors.co.za/"})
    assert db.execute("SELECT domain FROM tenants WHERE id = ?", (t["id"],)).fetchone()[0] == "www.joesmotors.co.za"
    admin.post(f"/admin/tenant/{t['id']}/toggle")
    assert app.test_client().get(f"/site/{t['slug']}/").status_code == 404
    assert app.test_client().get("/admin/").status_code == 302


# --- demo --------------------------------------------------------------------------------

def test_demo(client, db):
    b = Browser(client)
    resp = b.post("/demo")
    assert resp.status_code == 302 and resp.location.endswith("/app/")
    demo = db.execute("SELECT * FROM tenants WHERE is_demo = 1").fetchone()
    assert demo is not None
    assert b.get("/app/").status_code == 200
    leads_page = b.get("/app/leads").data
    assert b"Thandi Mokoena" in leads_page and b"wa.me" not in leads_page  # demos never open WhatsApp
    site = b.post("/demo", {"next": "site"})
    assert site.status_code == 302 and "/site/sunrise-motors-" in site.location
    assert client.get(site.location).status_code == 200


# --- emails ------------------------------------------------------------------------------

def test_emails(owner, db, app, monkeypatch):
    sent = []
    monkeypatch.setattr(notify, "send", lambda config, subject, body, to=None, reply_to="": sent.append((subject, body, to)))
    config = {**app.config, "NOTIFY_EMAIL": "me@example.com", "SITE_URL": "https://dealereasy.co.za"}
    car = add_car(owner, db)
    page = Browser(app.test_client())
    base = site_path(db)
    page.get(base + "/")
    page.post(f"{base}/enquire", {"kind": "enquiry", "car": car["id"], "name": "Ayesha", "phone": "0731234567",
                                  "email": "ayesha@example.com"})
    owner.post("/app/portals/carsza", {"action": "connect"})
    notify.tick(db, config)
    subjects = [s for s, _, _ in sent]
    assert any(s.startswith("Enquiry: Ayesha") for s in subjects)
    assert any(s.startswith("New sign-up") for s in subjects)
    assert any(s.startswith("Portal request") for s in subjects)
    lead_mail = next(m for m in sent if m[0].startswith("Enquiry"))
    assert lead_mail[2] == "owner@example.com" and "wa.me/27731234567" in lead_mail[1]
    sent.clear()
    notify.tick(db, config)
    assert not [s for s, _, _ in sent if s.startswith(("Enquiry", "New sign-up", "Portal"))]  # not twice
    subject, body = notify.daily_report(db, config, date.today())
    assert "DEALERS: 1" in body and "PORTAL CONNECTIONS TO SET UP: 1" in body


def test_lost_photos_are_cleaned_up(owner, db, app):
    photo = upload(owner).get_json()
    db.execute("UPDATE photos SET created_at = '2020-01-01 00:00:00' WHERE id = ?", (photo["id"],))
    db.commit()
    notify.forget_lost_photos(db, Path(app.config["MEDIA_DIR"]), __import__("app.utils", fromlist=["now_utc"]).now_utc())
    assert db.execute("SELECT COUNT(*) FROM photos").fetchone()[0] == 0


# --- settings ---------------------------------------------------------------------------

def test_settings(owner, db, client):
    t = tenant(db)
    resp = owner.post("/app/settings/business", {
        "name": "Joe's Motors", "phone": "0825551234", "landline": "021 123 4567", "address": "12 Voortrekker Rd",
        "city": "Bellville", "province": "Western Cape", "coords": "nope", "timezone": "Africa/Johannesburg",
        "country_code": "27", "open_0": "1", "from_0": "08:00", "to_0": "17:00",
    })
    assert b"coordinates" in resp.data  # wrong coordinates
    owner.post("/app/settings/site", {
        "tagline": "Honest cars", "perk": ["finance", "warranty"], "desc_footer": "Warranty included.",
        "logo": (io.BytesIO(_png()), "logo.png"),
    }, content_type="multipart/form-data")
    t = tenant(db)
    assert t["tagline"] == "Honest cars" and t["logo"].startswith(f"{t['id']}/logo-")
    home = client.get(site_path(db) + "/").data
    assert b"Honest cars" in home and b"Warranty available" in home and b"dealer-logo" in home
    owner.post("/app/settings/theme", {"theme": "volt"})
    assert tenant(db)["theme"] == "volt"
    assert b"themes/volt.css" in client.get(site_path(db) + "/").data


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGBA", (400, 120), (255, 0, 0, 0)).save(buf, "PNG")
    img = Image.new("RGBA", (400, 120), (0, 0, 0, 0))
    img.paste((255, 90, 31, 255), (20, 20, 380, 100))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


# --- every page renders -------------------------------------------------------------------

def test_all_pages_render(owner, db, app, client):
    photo = upload(owner).get_json()
    car = add_car(owner, db, photos=[photo["id"]])
    base = site_path(db)
    page = Browser(client)
    page.get(base + "/")
    page.post(f"{base}/enquire", {"kind": "finance", "car": car["id"], "name": "Ayesha", "phone": "0731234567",
                                  "employment": "Self-employed", "income": "40 000", "deposit": "20000"})
    lead = db.execute("SELECT id FROM leads").fetchone()[0]
    for url in ["/app/", "/app/?show=draft", "/app/?show=sold&q=toyota", "/app/car/new", f"/app/car/{car['id']}",
                "/app/leads", "/app/leads?show=won", f"/app/lead/{lead}", "/app/lead/new", "/app/portals",
                "/app/website", "/app/settings", "/app/settings/business", "/app/settings/site",
                "/app/settings/finance", "/app/settings/theme", "/app/settings/account"]:
        assert owner.get(url).status_code == 200, url
    for url in ["/", "/cars", "/cars?make=Toyota&model=Corolla+Cross&sort=km-asc", f"/cars/{car['slug']}",
                "/finance", "/sell", "/contact", "/privacy", "/thanks?k=sell", "/sitemap.xml"]:
        assert client.get(base + url).status_code == 200, url
    assert b"Self-employed" in owner.get(f"/app/lead/{lead}").data
    assert b"Put it on another portal by hand" in owner.get(f"/app/car/{car['id']}").data
    assert owner.get("/app/disc?code=junk").get_json() == {"found": False}
    text = owner.post("/app/describe", {"make": "Toyota", "model": "Hilux", "year": "2019", "mileage": "98 000",
                                        "transmission": "Automatic", "feature": ["Tow bar"]}).get_json()["text"]
    assert text.startswith("2019 Toyota Hilux") and "98,000 km" in text and "Tow bar" in text
    admin = admin_browser(app)
    assert admin.get("/admin/").status_code == 200
    assert client.get("/no-such-page").status_code == 404


def test_views_and_taps(owner, db, app):
    car = add_car(owner, db)
    base = site_path(db)
    visitor = app.test_client()
    phone = {"User-Agent": "Mozilla/5.0 (Linux; Android 14) Mobile"}
    visitor.get(f"{base}/cars/{car['slug']}", headers=phone)
    visitor.get(f"{base}/cars/{car['slug']}", headers={"User-Agent": "WhatsApp/2.24"})  # a link preview
    visitor.get(f"{base}/cars/{car['slug']}", headers={"User-Agent": "Googlebot/2.1"})
    owner.get(f"{base}/cars/{car['slug']}", headers=phone)  # the dealer looking at their own car
    assert visitor.post(f"{base}/tap", data={"kind": "whatsapp", "car": car["id"]}, headers=phone).status_code == 204
    visitor.post(f"{base}/tap", data={"kind": "nonsense"}, headers=phone)
    row = db.execute("SELECT * FROM site_stats WHERE vehicle_id = ?", (car["id"],)).fetchone()
    assert (row["views"], row["whatsapp"], row["calls"]) == (1, 1, 0)
    assert b"1 view, 1 WhatsApp" in owner.get("/app/").data
    assert b"Last 30 days on your website" in owner.get(f"/app/car/{car['id']}").data
