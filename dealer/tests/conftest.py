import io
import re

import pytest
from PIL import Image

from app import create_app
from app.db import connect


@pytest.fixture
def app(tmp_path):
    return create_app({
        "TESTING": True,
        "SECRET_KEY": "test",
        "DATABASE": str(tmp_path / "test.db"),
        "MEDIA_DIR": str(tmp_path / "media"),
        "ADMIN_PASSWORD": "admin-pass",
        "SUPPORT_WHATSAPP": "27820000000",
        "RATELIMIT_ENABLED": False,
    })


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def db(app):
    conn = connect(app.config["DATABASE"])
    yield conn
    conn.close()


class Browser:
    """Test client that keeps the CSRF token like a real browser form would."""

    def __init__(self, client):
        self.client = client
        self.token = None

    def get(self, url, **kw):
        resp = self.client.get(url, **kw)
        m = re.search(rb'name="csrf" content="([^"]+)"', resp.data)
        if m:
            self.token = m.group(1).decode()
        return resp

    def post(self, url, data=None, **kw):
        if self.token is None:
            self.get("/")
        data = dict(data or {})
        data.setdefault("csrf", self.token)
        return self.client.post(url, data=data, **kw)


@pytest.fixture
def browser(client):
    return Browser(client)


def signup(browser, email="owner@example.com", name="Joe's Motors"):
    return browser.post("/signup", {
        "name": name, "email": email, "password": "secret123", "phone": "082 555 1234", "city": "Bellville",
    })


@pytest.fixture
def owner(browser):
    resp = signup(browser)
    assert resp.status_code == 302
    browser.get("/app/")
    return browser


def jpeg(width=1200, height=900, color=(200, 40, 40)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, "JPEG", quality=80)
    return buf.getvalue()
