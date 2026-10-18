"""SQLite storage. One file, one schema, every row belongs to a tenant (a dealer)."""
import sqlite3

from flask import current_app, g

SCHEMA = """
CREATE TABLE IF NOT EXISTS tenants (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    email           TEXT UNIQUE,                     -- login; NULL = a dealer we set up in /admin to show a website
    password_hash   TEXT,
    phone           TEXT NOT NULL DEFAULT '',        -- WhatsApp, international digits: 27821234567
    landline        TEXT NOT NULL DEFAULT '',        -- shown on the website as typed
    public_email    TEXT NOT NULL DEFAULT '',        -- shown on the website; '' = none
    lead_email      TEXT NOT NULL DEFAULT '',        -- new enquiries go here; '' = the login email
    city            TEXT NOT NULL DEFAULT '',
    address         TEXT NOT NULL DEFAULT '',
    province        TEXT NOT NULL DEFAULT '',
    postal_code     TEXT NOT NULL DEFAULT '',
    latitude        REAL,                            -- the Facebook vehicle catalogue needs the dealership's spot
    longitude       REAL,
    maps_url        TEXT NOT NULL DEFAULT '',        -- its place on Google Maps; '' = search by name and address
    country_code    TEXT NOT NULL DEFAULT '27',
    timezone        TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
    hours           TEXT NOT NULL DEFAULT '',        -- JSON, 7 days from Monday: ["08:30", "17:00"] or null; '' = default
    tagline         TEXT NOT NULL DEFAULT '',
    about           TEXT NOT NULL DEFAULT '',
    perks           TEXT NOT NULL DEFAULT '["finance", "tradein"]',  -- JSON list of catalog.PERKS keys
    desc_footer     TEXT NOT NULL DEFAULT '',        -- printed under every car's description
    logo            TEXT NOT NULL DEFAULT '',        -- photos.save_logo key; '' = the name in the look's font
    finance_on      INTEGER NOT NULL DEFAULT 1,
    finance_rate    REAL NOT NULL DEFAULT 12.5,      -- % a year, the calculator's starting point
    finance_months  INTEGER NOT NULL DEFAULT 72,
    finance_deposit INTEGER NOT NULL DEFAULT 10,     -- % of the price
    finance_balloon INTEGER NOT NULL DEFAULT 0,      -- % of the price
    msg_reply       TEXT NOT NULL DEFAULT '',        -- WhatsApp answer to an enquiry; '' = leads.MSG_REPLY
    stock_seq       INTEGER NOT NULL DEFAULT 0,      -- last automatic stock number
    feed_key        TEXT NOT NULL DEFAULT '',        -- secret part of the stock feed addresses for portals
    theme           TEXT NOT NULL DEFAULT '',        -- '' = the site default
    session_key     TEXT NOT NULL DEFAULT '',        -- in every login cookie; a new one logs out all devices
    slug            TEXT NOT NULL DEFAULT '',        -- website address: /site/<slug>
    domain          TEXT NOT NULL DEFAULT '',        -- its own address, e.g. www.joesmotors.co.za; '' = none
    plan            TEXT NOT NULL DEFAULT 'trial',   -- trial | paid
    paid_until      TEXT NOT NULL,                   -- YYYY-MM-DD, inclusive
    is_demo         INTEGER NOT NULL DEFAULT 0,
    is_disabled     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    last_seen_at    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_by_slug ON tenants (slug) WHERE slug != '';
CREATE UNIQUE INDEX IF NOT EXISTS tenants_by_domain ON tenants (domain) WHERE domain != '';
CREATE INDEX IF NOT EXISTS tenants_by_feed_key ON tenants (feed_key);

CREATE TABLE IF NOT EXISTS vehicles (
    id              INTEGER PRIMARY KEY,
    tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stock_no        TEXT NOT NULL DEFAULT '',
    slug            TEXT NOT NULL,                   -- the car's web address, unique per dealer
    status          TEXT NOT NULL DEFAULT 'available'
                    CHECK (status IN ('draft', 'available', 'reserved', 'sold')),
    make            TEXT NOT NULL,
    model           TEXT NOT NULL DEFAULT '',
    variant         TEXT NOT NULL DEFAULT '',
    year            INTEGER NOT NULL,
    price           INTEGER NOT NULL DEFAULT 0,      -- whole rand
    was_price       INTEGER NOT NULL DEFAULT 0,      -- shown crossed out; 0 = none
    mileage         INTEGER NOT NULL DEFAULT 0,      -- km
    body            TEXT NOT NULL DEFAULT '',
    fuel            TEXT NOT NULL DEFAULT '',
    transmission    TEXT NOT NULL DEFAULT '',
    drive           TEXT NOT NULL DEFAULT '',
    engine          TEXT NOT NULL DEFAULT '',        -- as people write it: 1.4, 2.4 GD-6, 2.0T
    colour          TEXT NOT NULL DEFAULT '',
    doors           INTEGER NOT NULL DEFAULT 0,
    seats           INTEGER NOT NULL DEFAULT 0,
    condition       TEXT NOT NULL DEFAULT 'used' CHECK (condition IN ('used', 'demo', 'new')),
    service_history TEXT NOT NULL DEFAULT '',        -- full | partial | none | ''
    features        TEXT NOT NULL DEFAULT '[]',      -- JSON list
    description     TEXT NOT NULL DEFAULT '',
    featured        INTEGER NOT NULL DEFAULT 0,      -- first on the website's home page
    reg_no          TEXT NOT NULL DEFAULT '',        -- private
    vin             TEXT NOT NULL DEFAULT '',        -- private on the website; some portals ask for it
    engine_no       TEXT NOT NULL DEFAULT '',        -- private
    cost            INTEGER NOT NULL DEFAULT 0,      -- private: what the dealer paid
    recon           INTEGER NOT NULL DEFAULT 0,      -- private: spent on getting it ready
    channels_off    TEXT NOT NULL DEFAULT '[]',      -- JSON list of portals this car isn't advertised on
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    listed_at       TEXT,                            -- first time it went on sale
    sold_at         TEXT,
    UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS vehicles_by_tenant_status ON vehicles (tenant_id, status);

CREATE TABLE IF NOT EXISTS photos (
    id          INTEGER PRIMARY KEY,
    tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id  INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,  -- NULL: uploaded on a form not saved yet
    lead_id     INTEGER REFERENCES leads(id) ON DELETE CASCADE,     -- photos of a car someone wants to sell
    key         TEXT NOT NULL,                       -- files: <key>.jpg and <key>-<width>.webp
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    color       TEXT NOT NULL DEFAULT '#202020',     -- average colour, shown while the photo loads
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS photos_by_vehicle ON photos (vehicle_id, position);
CREATE INDEX IF NOT EXISTS photos_by_lead ON photos (lead_id);
CREATE INDEX IF NOT EXISTS photos_by_tenant ON photos (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS leads (
    id          INTEGER PRIMARY KEY,
    tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id  INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('enquiry', 'test_drive', 'finance', 'sell', 'contact')),
    status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'won', 'lost')),
    name        TEXT NOT NULL,
    phone       TEXT NOT NULL DEFAULT '',
    email       TEXT NOT NULL DEFAULT '',
    message     TEXT NOT NULL DEFAULT '',
    details     TEXT NOT NULL DEFAULT '{}',          -- JSON: finance answers, the car they want to sell, a time
    car_title   TEXT NOT NULL DEFAULT '',            -- the car at the time, in case it's deleted later
    notes       TEXT NOT NULL DEFAULT '',
    source      TEXT NOT NULL DEFAULT 'website',     -- website | walk-in | phone | ...
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    emailed_at  TEXT                                 -- when the dealer got it by email
);
CREATE INDEX IF NOT EXISTS leads_by_tenant ON leads (tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS leads_by_vehicle ON leads (vehicle_id);
CREATE INDEX IF NOT EXISTS leads_to_email ON leads (emailed_at);

-- what dealers typed for make, model and variant: suggestions for everyone's next car
CREATE TABLE IF NOT EXISTS variants (
    key          TEXT PRIMARY KEY,                   -- lower-case 'make|model|variant'
    make         TEXT NOT NULL,
    model        TEXT NOT NULL,
    variant      TEXT NOT NULL,
    body         TEXT NOT NULL DEFAULT '',
    fuel         TEXT NOT NULL DEFAULT '',
    transmission TEXT NOT NULL DEFAULT '',
    drive        TEXT NOT NULL DEFAULT '',
    engine       TEXT NOT NULL DEFAULT '',
    doors        INTEGER NOT NULL DEFAULT 0,
    seats        INTEGER NOT NULL DEFAULT 0,
    year_from    INTEGER,
    year_to      INTEGER,
    uses         INTEGER NOT NULL DEFAULT 1,
    updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS variants_by_model ON variants (make, model);

-- portals a dealer advertises on
CREATE TABLE IF NOT EXISTS channels (
    tenant_id     INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel       TEXT NOT NULL,                     -- portals.CHANNELS key
    status        TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'connected', 'paused')),
    account       TEXT NOT NULL DEFAULT '',          -- the dealer's id or account on that portal
    note          TEXT NOT NULL DEFAULT '',          -- from the dealer when asking to connect
    requested_at  TEXT,
    connected_at  TEXT,
    fetched_at    TEXT,                              -- the portal last read the stock feed
    fetches       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, channel)
);

CREATE TABLE IF NOT EXISTS rate_hits (
    key TEXT NOT NULL,
    at  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_hits_by_key ON rate_hits (key, at);

-- server errors, for the daily report email
CREATE TABLE IF NOT EXISTS errors (
    id        INTEGER PRIMARY KEY,
    at        TEXT NOT NULL,
    tenant_id INTEGER,
    method    TEXT NOT NULL,
    path      TEXT NOT NULL,
    error     TEXT NOT NULL,                       -- last line: "ValueError: ..."
    place     TEXT NOT NULL,                       -- "owner.py:250 in save_car"
    trace     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS errors_by_at ON errors (at);

-- emails already sent: 'signup:<id>:<created_at>', 'report:<YYYY-MM-DD>', 'portal:<tenant>:<channel>:<at>'
CREATE TABLE IF NOT EXISTS mails_sent (
    key     TEXT PRIMARY KEY,
    sent_at TEXT NOT NULL
);
"""

# columns added after the first release: CREATE TABLE has them, older databases get an ALTER
ADDED_COLUMNS: list[tuple[str, str, str]] = []
# indexes on added columns: created after the ALTERs
LATE_SCHEMA = ""


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect(current_app.config["DATABASE"])
    return g.db


def close_db(_exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db(path: str):
    conn = connect(path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(SCHEMA)
    conn.execute("BEGIN IMMEDIATE")  # the web app and the notifier start together: one migrates at a time
    for table, column, decl in ADDED_COLUMNS:
        if column not in {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")
    if LATE_SCHEMA:
        conn.executescript(LATE_SCHEMA)
    conn.commit()
    conn.close()


def init_app(app):
    init_db(app.config["DATABASE"])
    app.teardown_appcontext(close_db)
