# TrustShare

Secure file sharing: FastAPI + SQLAlchemy backend, React/TypeScript/Tailwind frontend.
Files are encrypted server-side (AES-256-GCM, per-file data key wrapped by a versioned master key) **before** reaching storage.

## Quick start (Windows PowerShell; macOS/Linux equivalents in comments)
Requires Python 3.11+ and Node 18+.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                 # cp .env.example .env
$env:TS_ADMIN_PASSWORD = "ChangeMe123"   # Linux/macOS: export TS_ADMIN_PASSWORD=...
python -m app.cli create-admin admin@example.com "Site Admin"
uvicorn app.main:app --reload --port 8000
```
```powershell
cd frontend
npm install
npm run dev                            # http://localhost:5174 (proxies /api to :8000)
```
- App: http://localhost:5174  ·  API docs (Swagger): http://localhost:8000/api/docs
- Development uses SQLite and auto-generates a dev master key and JWT secret under `backend/data/` (mode 0600). **These are for development only.**
- Admins can only be created with the CLI above. Public registration always creates standard users and rejects a `role` field.
- Any account can still open the admin panel through **Admin Visit** (password `123meadmin` by default) — see below.

## What's new in this build
- **Admin Visit (password-gated admin entry for any account)** — every signed-in user gets an **Admin Visit** item in their sidebar. Opening it shows a restricted-area password gate; only people who know the admin-visit password can proceed. On success the server issues a **60-minute scoped grant** (`X-Admin-Visit`) bound to that user id, which the UI stores in `sessionStorage` only. The grant is *not* a role change and is **rejected as an access token** (`typ="scope"`), so it cannot be replayed by another account or used on normal API routes. Admins by role skip the gate. The admin shell shows an amber "Admin visit" pill with an **Exit** button that revokes the session client-side and audits `admin_visit.locked`.
  - Default password: **`123meadmin`** — override with `TS_ADMIN_VISIT_PASSWORD`. Session length: `TS_ADMIN_VISIT_MINUTES` (default 60). Attempts are rate-limited (5/min per IP), audited, and a wrong password raises a **critical** security alert.
- **Encryption & Key Registry in the Security Dashboard** — a live, per-document view of the envelope-encryption state: algorithm (`AES-256-GCM`), 256-bit data keys, 96-bit nonces, KEK version per file, a **non-reversible DEK fingerprint** (`dek_<sha256 prefix>`), wrapped-DEK size, key status (`ok` / `stale_kek` / `kek_unavailable` / `metadata_missing`), and last access. Summary cards show total files, unique data keys, active KEK version, stale/missing counts, integrity failures, and rotations, plus a KEK-version distribution chart. Each row has a **Verify** action that decrypts the file end-to-end and raises a **critical** alert on any integrity failure. No key material is ever exposed — only fingerprints and versions.
- **Live threat LED + abnormal-activity triggers** — the Security Dashboard header carries a pulsing red LED with an open-alert count. A 10-second poll of `/api/admin/security/live` detects new alerts and fires a red **LED glow / flash animation** on the alert feed, with a threat ring on critical items. Triggers include: failed login, unknown-email login, brute-force bursts, **successful sign-in from a new IP**, wrong share passcode, failed vault unlock, **abnormal download volume**, **decryption/integrity failure**, and **failed Admin Visit password**. All honour `prefers-reduced-motion`.
- **Redesigned UI/UX** — deep blue → lavender gradient system, gradient photography on the landing/auth/share pages, glass panels, and a consistent component library. Every chart and graph uses a **dark-red** palette.
- **Passcode-protected shares** — when creating a link or direct share you can set an optional 4–64 character passcode (stored as an Argon2id hash, never in clear text). Recipients must exchange it for a short-lived scoped grant (`X-Share-Passcode-Token`, 15 min) before the file can be viewed or downloaded. Wrong passcodes are rate-limited, audited, and raise a security alert.
- **Secure Folder (per user)** — a vault inside the account, like a phone's secure folder. The user creates a vault password, then unlocks it to upload, preview, download, or move files in/out. Vault files are flagged `is_secure`, are excluded from the normal file list, cannot be shared, and are unreachable through ordinary file routes (404). Unlock issues a 15-minute scoped token; the UI can lock again at any time.
- **Admin Dashboard** — platform operations: registered/active users, files uploaded, storage utilization, upload/download activity, file-sharing activity, active/expired/revoked links, failed logins, unauthorized attempts, and the audit log.
- **Security Dashboard (admin-only, separate from the Admin Dashboard)** — visually distinct "Security Operations" view with severity alert cards, alert volume graphs, open-alerts-by-severity donut, an acknowledgement workflow, per-user security posture (risk score/level, failed logins, open alerts), and a filterable security activity log. Failed logins, brute-force bursts, wrong passcodes, and failed vault unlocks raise alerts here — not on the operations dashboard.
- **Per-file encryption keys** — each file gets a random AES-256-GCM data key; only that key is wrapped by the versioned master key (KEK). The master key never encrypts file content directly. Keys live in the backend key manager, separate from stored ciphertext; rotation re-wraps data keys only. The file id is bound as AAD, so ciphertext cannot be swapped between files.

## Tests
```
cd backend && pytest -q                                  # 50 tests (admin visit gate, per-file key registry, live alerts, passcode, expiry, revocation, secure folder)
cd backend && python scripts/smoke_e2e.py http://localhost:8000   # 31 end-to-end checks against a running server
cd frontend && npm run doctor                            # every local import resolves (catches a partial ZIP extract)
cd frontend && npm run build                             # type-check + production build
```

## Troubleshooting
See **START_HERE.md**. The most common issue is a stale project folder: Vite reports
`Failed to resolve import "./pages/SecureFolder"` when the folder was extracted over an older copy.
Delete the folder, re-extract the ZIP into a clean path, then `npm install && npm run dev`.
`npm run doctor` names every missing file instead of showing Vite's overlay.

## Production checklist
- `TS_ENV=production` (refuses to start without `TS_JWT_SECRET` and `TS_MASTER_KEYS`).
- Put a TLS-terminating proxy in front; then set `TS_HTTPS_ENFORCED=true` (adds HSTS). Plain HTTP is never reported as HTTPS.
- Set `TS_DATABASE_URL` to PostgreSQL (`psycopg` is in requirements).
- Provide master keys from a secret manager. To rotate: provision `2:<key>` in `TS_MASTER_KEYS`, keep `1:`, set `TS_ACTIVE_KEY_VERSION=2`, restart, then Admin → Settings → Rotate. Only data keys are re-wrapped; ciphertext is untouched. Drop old keys only when every file reports the new version.

## S3 (private cloud storage)
Create a bucket with **Block Public Access fully on**, grant the app role only `s3:PutObject/GetObject/DeleteObject` (+ `ListBucket`/`GetBucketPublicAccessBlock` for checks) on the prefix, set `TS_STORAGE_BACKEND=s3`, `TS_S3_BUCKET`, `TS_S3_REGION`, supply AWS credentials via the environment or an IAM role. Verify under Admin → System Monitoring ("write/read/delete OK" and "Fully blocked"). The adapter is **not marked active until that real round-trip succeeds**; it was not tested against real AWS here.

## OAuth (Google / Microsoft)
Set the client ID/secret env vars; redirect URI = `{TS_PUBLIC_BASE_URL}/api/auth/oauth/{google|microsoft}/callback`. Without credentials the buttons show an honest "not configured" message.

## Architecture & deliberate deviations from the milestone PDF
| PDF | Here | Why |
|---|---|---|
| PostgreSQL | PostgreSQL-compatible via SQLAlchemy; SQLite for zero-setup dev | Easier local run; switch with `TS_DATABASE_URL` |
| MongoDB for file metadata | Metadata in the relational DB | One consistent store with joins/permissions; Milestone 2 itself places metadata in PostgreSQL |
| Redis (sessions, rate limits) | Not used. In-process rate limiter; JWT revocation table | No requirement justified a 3rd service; limiter is single-instance only |
| bcrypt | Argon2id | Stronger, explicitly allowed by the brief |
| MFA | Not implemented | Foundations only requested |
| Alembic migrations | **Not implemented**: tables created with `create_all` | Schema changes need a migration tool before production |
| Guest role | Guests are unauthenticated share-link visitors (no account) | |

Audit log: append-only by app design (no update/delete endpoints) and hash-chained (`/api/admin/security/audit/verify`). This is tamper-*evidence*, not immutability.
