#!/usr/bin/env python3
"""End-to-end check of the Milestone 1-2 security requirements against a RUNNING stack.

    python backend/scripts/smoke_test.py            # API on http://localhost:8000
    API=https://host/api/v1 python backend/scripts/smoke_test.py

Optionally verifies that the object in storage is ciphertext (needs boto3 and S3_* env vars, e.g. `set -a; . ./.env; set +a`).
"""
import os
import sys
import time
import uuid

import httpx

API = os.environ.get("API", "http://localhost:8000/api/v1")
PDF = b"%PDF-1.7\n% TrustShare smoke test CONFIDENTIAL-MARKER-" + uuid.uuid4().hex.encode() + b"\n%%EOF\n"
PASSWORD = "Smoke-Test-1"
results = []


def check(name, ok, extra=""):
    results.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {name} {extra}")


def main():
    c = httpx.Client(base_url=API, timeout=30)
    tag = uuid.uuid4().hex[:8]
    alice, bob = f"alice-{tag}@example.com", f"bob-{tag}@example.com"

    for email in (alice, bob):
        r = c.post("/auth/register", json={"email": email, "password": PASSWORD, "full_name": email.split("-")[0].title()})
        check(f"register {email}", r.status_code == 201, r.text[:80])
    check("weak password rejected", c.post("/auth/register", json={"email": f"x-{tag}@example.com", "password": "short", "full_name": "X"}).status_code == 400)

    def login(email):
        r = c.post("/auth/login", json={"email": email, "password": PASSWORD})
        return {"Authorization": f"Bearer {r.json()['access_token']}"}, r

    ha, r = login(alice)
    check("login returns JWT", r.status_code == 200 and "access_token" in r.json())
    hb, _ = login(bob)
    check("no token -> 401", c.get("/files").status_code == 401)
    check("normal user cannot open admin API (RBAC)", c.get("/admin/users", headers=ha).status_code == 403)
    check("bad password -> 401", c.post("/auth/login", json={"email": alice, "password": "nope"}).status_code == 401)

    # upload + validation
    r = c.post("/files/upload", headers=ha, files={"file": ("report.pdf", PDF, "application/pdf")})
    check("upload PDF", r.status_code == 201, r.text[:80])
    fid = r.json().get("id")
    check("executable rejected", c.post("/files/upload", headers=ha, files={"file": ("evil.exe", b"MZ", "application/octet-stream")}).status_code == 400)
    check("fake PDF (wrong content) rejected", c.post("/files/upload", headers=ha, files={"file": ("fake.pdf", b"MZ not a pdf", "application/pdf")}).status_code == 400)

    # download round-trip
    r = c.get(f"/files/{fid}/download", headers=ha)
    check("owner download returns original bytes", r.status_code == 200 and r.content == PDF)
    check("other user denied (403)", c.get(f"/files/{fid}/download", headers=hb).status_code == 403)

    # storage holds ciphertext only
    if os.environ.get("S3_BUCKET") and os.environ.get("S3_SECRET_KEY"):
        try:
            import boto3
            s3 = boto3.client("s3", endpoint_url=os.environ.get("S3_ENDPOINT_URL", "").replace("minio", "localhost") or None,
                              aws_access_key_id=os.environ["S3_ACCESS_KEY"], aws_secret_access_key=os.environ["S3_SECRET_KEY"],
                              region_name=os.environ.get("S3_REGION", "us-east-1"))
            objs = s3.list_objects_v2(Bucket=os.environ["S3_BUCKET"], Prefix="").get("Contents", [])
            newest = max(objs, key=lambda o: o["LastModified"])
            raw = s3.get_object(Bucket=os.environ["S3_BUCKET"], Key=newest["Key"])["Body"].read()
            check("object in storage is ciphertext (marker not found)", b"CONFIDENTIAL-MARKER" not in raw and raw.startswith(b"TSv1"))
        except Exception as exc:  # noqa: BLE001
            print(f"[SKIP] storage check: {exc}")
    else:
        print("[SKIP] storage ciphertext check (set S3_* env vars to enable)")

    # direct share
    r = c.post("/shares/users", headers=ha, json={"file_id": fid, "email": bob, "permission": "view"})
    check("share with Bob (view only)", r.status_code == 201, r.text[:80])
    check("Bob can view", c.get(f"/files/{fid}/view", headers=hb).status_code == 200)
    check("Bob cannot download with view-only", c.get(f"/files/{fid}/download", headers=hb).status_code == 403)

    # share links
    r = c.post("/shares/links", headers=ha, json={"file_id": fid, "permission": "download", "expires_in_hours": 1, "max_downloads": 1})
    check("create share link", r.status_code == 201)
    token, link_id = r.json()["token"], r.json()["id"]
    check("public link info", c.get(f"/public/share/{token}").status_code == 200)
    r = c.get(f"/public/share/{token}/download")
    check("anonymous download via link", r.status_code == 200 and r.content == PDF)
    check("download limit enforced (2nd download blocked)", c.get(f"/public/share/{token}/download").status_code == 410)

    r = c.post("/shares/links", headers=ha, json={"file_id": fid, "permission": "view", "expires_in_hours": 24})
    t2, id2 = r.json()["token"], r.json()["id"]
    check("view-only link cannot download", c.get(f"/public/share/{t2}/download").status_code == 403)
    check("revoke link", c.delete(f"/shares/links/{id2}", headers=ha).status_code == 200)
    check("revoked link denied (410)", c.get(f"/public/share/{t2}").status_code == 410)
    check("random token denied (404)", c.get("/public/share/" + "x" * 43).status_code == 404)

    # lockout
    for _ in range(5):
        c.post("/auth/login", json={"email": bob, "password": "wrong-password-1"})
    check("account locks after repeated failures (429)", c.post("/auth/login", json={"email": bob, "password": PASSWORD}).status_code == 429)

    # cleanup
    c.delete(f"/files/{fid}", headers=ha)
    c.delete(f"/files/{fid}/permanent", headers=ha)

    passed, total = sum(results), len(results)
    print(f"\n{passed}/{total} checks passed")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
