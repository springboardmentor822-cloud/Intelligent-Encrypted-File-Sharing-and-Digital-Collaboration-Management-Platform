import os, tempfile, pathlib
_tmp = tempfile.mkdtemp()
os.environ.update({"TS_ENV": "test", "TS_DATABASE_URL": f"sqlite:///{_tmp}/t.db", "TS_DATA_DIR": _tmp,
                   "TS_LOCAL_STORAGE_DIR": f"{_tmp}/objects", "TS_JWT_SECRET": "test-secret-" + "x" * 40,
                   "TS_RATE_LIMIT_ENABLED": "false", "TS_MAX_UPLOAD_MB": "1", "TS_DEV_EXPOSE_TOKENS": "true",
                   # Keep tests hermetic: never inherit real OAuth credentials from .env.
                   "TS_GOOGLE_CLIENT_ID": "", "TS_GOOGLE_CLIENT_SECRET": "",
                   "TS_MICROSOFT_CLIENT_ID": "", "TS_MICROSOFT_CLIENT_SECRET": ""})
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.db import Base, SessionLocal, engine
from app.models import User
from app.services.security import hash_password
from app.config import get_settings

PDF = b"%PDF-1.4\n" + b"hello secret contents " * 50


@pytest.fixture(autouse=True)
def fresh():
    Base.metadata.drop_all(engine); Base.metadata.create_all(engine)
    from app.services import ratelimit; ratelimit.reset()
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def make_user(client, email, role="user", password="Passw0rd!x"):
    if role == "admin":
        with SessionLocal() as db:
            db.add(User(email=email, full_name=email.split("@")[0], role="admin", password_hash=hash_password(password),
                        quota_bytes=10**9)); db.commit()
    else:
        r = client.post("/api/auth/register", json={"email": email, "password": password, "full_name": email.split("@")[0]})
        assert r.status_code == 201, r.text
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def upload(client, h, name="report.pdf", data=PDF):
    r = client.post("/api/files/upload", headers=h, files={"file": (name, data)})
    return r


@pytest.fixture
def alice(client): return make_user(client, "alice@example.com")
@pytest.fixture
def bob(client): return make_user(client, "bob@example.com")
@pytest.fixture
def admin(client): return make_user(client, "root@example.com", "admin")
