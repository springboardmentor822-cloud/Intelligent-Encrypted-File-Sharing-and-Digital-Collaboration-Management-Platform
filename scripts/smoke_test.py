#!/usr/bin/env python3
"""End-to-end smoke and security test for a RUNNING TrustShare (needs only Python 3, no packages).

    py scripts/smoke_test.py                       # uses http://localhost:8000/api/v1
    py scripts/smoke_test.py http://host/api/v1    # test another deployment

It registers two throw-away users, then walks the whole workflow: upload, encrypted download, sharing,
share links (view-only, revoke), RBAC and blocked file types. Each run creates 2 users; registration is
limited to 10 per hour per IP, so don't run it more than a few times an hour.
"""
import json
import sys
import uuid
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/api/v1").rstrip("/")
ROOT = BASE.split("/api/v1")[0]
results = []


def call(method, path, body=None, token=None, raw=None, headers=None, absolute=False):
    url = (ROOT + path) if absolute else (BASE + path)
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {"Content-Type": "application/json"} if body is not None else {}
    h.update(headers or {})
    if token:
        h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except urllib.error.URLError as e:
        print(f"\nCannot reach {url}: {e.reason}\nIs the app running? (docker compose ps)")
        sys.exit(2)


def js(b):
    try:
        return json.loads(b)
    except ValueError:
        return {}


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + (f"   [{detail}]" if not ok and detail else ""))


def multipart(filename, content, field="file"):
    boundary = "----ts" + uuid.uuid4().hex
    head = (f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
            "Content-Type: application/octet-stream\r\n\r\n").encode()
    body = head + content + f"\r\n--{boundary}--\r\n".encode()
    return body, {"Content-Type": f"multipart/form-data; boundary={boundary}"}


PASSWORD = "Smoke-Test-1"
tag = uuid.uuid4().hex[:8]
EMAIL_A, EMAIL_B = f"smoke-a-{tag}@trustshare-test.com", f"smoke-b-{tag}@trustshare-test.com"
CONTENT = b"TrustShare smoke test file. " + tag.encode() + b"\n"

print(f"Testing {BASE}\n")
s, _ = call("GET", "/health", absolute=True)
check("API is healthy", s == 200, s)

for em, name in ((EMAIL_A, "Smoke A"), (EMAIL_B, "Smoke B")):
    s, b = call("POST", "/auth/register", {"email": em, "password": PASSWORD, "full_name": name})
    check(f"register {name}", s == 201, f"{s} {b[:120]!r}")

s, b = call("POST", "/auth/login", {"email": EMAIL_A, "password": PASSWORD})
tok_a = js(b).get("access_token")
check("login A returns a JWT", s == 200 and tok_a, s)
s, b = call("POST", "/auth/login", {"email": EMAIL_B, "password": PASSWORD})
tok_b = js(b).get("access_token")
check("login B returns a JWT", s == 200 and tok_b, s)
if not (tok_a and tok_b):
    print("\nCannot continue without logins."); sys.exit(1)

s, _ = call("POST", "/auth/login", {"email": EMAIL_A, "password": "wrong-password-1"})
check("wrong password is rejected (401)", s == 401, s)
s, _ = call("GET", "/files")
check("no token: protected route returns 401", s == 401, s)

body, h = multipart("smoke.txt", CONTENT)
s, b = call("POST", "/files/upload", raw=body, headers=h, token=tok_a)
fid = js(b).get("id")
check("A uploads a file (encrypted and stored)", s == 201 and fid, f"{s} {b[:200]!r}")
if not fid:
    print("\nUpload failed, cannot continue."); sys.exit(1)

s, b = call("GET", f"/files/{fid}/download", token=tok_a)
check("A downloads and gets the identical bytes back (decrypt + integrity)", s == 200 and b == CONTENT, s)
s, _ = call("GET", f"/files/{fid}/download", token=tok_b)
check("B cannot download A's file (403)", s == 403, s)

s, b = call("POST", "/shares/users", {"file_id": fid, "email": EMAIL_B, "permission": "download"}, token=tok_a)
check("A shares the file with B", s == 201, f"{s} {b[:120]!r}")
s, b = call("GET", f"/files/{fid}/download", token=tok_b)
check("B can now download the shared file", s == 200 and b == CONTENT, s)

s, b = call("POST", "/shares/links", {"file_id": fid, "permission": "view", "expires_in_hours": 1}, token=tok_a)
link = js(b)
token, link_id = link.get("token"), link.get("id")
check("A creates a view-only share link", s == 201 and token, s)
if token:
    s, _ = call("GET", f"/public/share/{token}")
    check("share link opens without login", s == 200, s)
    s, _ = call("GET", f"/public/share/{token}/download")
    check("view-only link refuses download (403)", s == 403, s)
    s, b = call("GET", f"/public/share/{token}/view")
    check("view-only link can view the decrypted file", s == 200 and b == CONTENT, s)
    s, _ = call("DELETE", f"/shares/links/{link_id}", token=tok_a)
    check("A revokes the link", s == 200, s)
    s, _ = call("GET", f"/public/share/{token}")
    check("revoked link no longer works (410)", s == 410, s)
s, _ = call("GET", "/public/share/this-token-does-not-exist")
check("unknown link token returns 404", s == 404, s)

for path in ("/admin/overview", "/audit-logs", "/reports/uploads", "/security-monitoring/summary", "/admin/analytics/overview"):
    s, _ = call("GET", path, token=tok_b)
    check(f"normal user is blocked from {path} (403)", s == 403, s)

body, h = multipart("evil.exe", b"MZ\x90\x00 pretend executable")
s, _ = call("POST", "/files/upload", raw=body, headers=h, token=tok_a)
check("executable upload is blocked (400)", s == 400, s)
body, h = multipart("fake.pdf", b"this is not really a pdf")
s, _ = call("POST", "/files/upload", raw=body, headers=h, token=tok_a)
check("file whose content does not match its extension is blocked (400)", s == 400, s)

call("DELETE", f"/files/{fid}", token=tok_a)
s, _ = call("DELETE", f"/files/{fid}/permanent", token=tok_a)
check("A deletes the file permanently", s == 200, s)

passed = sum(results)
print(f"\n{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
