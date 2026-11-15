"""API tests that do not need databases (auth guard, validation, CORS/headers)."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)  # no "with": startup (DB connection) is skipped


def test_root():
    r = client.get("/")
    assert r.status_code == 200 and "running" in r.json()["message"]
    assert r.headers["x-content-type-options"] == "nosniff"


def test_protected_routes_need_token():
    for path in ("/files", "/folders", "/analytics/storage", "/admin/users", "/auth/me", "/share/links",
                 "/admin/overview", "/admin/security", "/analytics/alerts"):
        assert client.get(path).status_code in (401, 403), path


def test_garbage_token_rejected():
    r = client.get("/files", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401


def test_openapi_lists_all_modules():
    paths = client.get("/openapi.json").json()["paths"]
    for expected in ("/auth/login", "/files/upload", "/share/links/{file_id}", "/analytics/audit", "/admin/keys/rotate",
                     "/admin/overview", "/admin/security", "/admin/users/{user_id}/activity"):
        assert expected in paths, expected
