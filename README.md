# TrustShare

Secure file sharing: FastAPI + SQLAlchemy backend, React/TypeScript/Tailwind frontend.
Files are encrypted server-side (AES-256-GCM, per-file data key wrapped by a version master key) **before** reaching storage.

## Quick start (Windows PowerShell; macOS/Linux equivalents in comments)
Requires Python 3.11+ and Node 18+.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
```powershell
cd frontend
npm install
npm run dev                            # http://localhost:5174 (proxies /api to :8000)
```
- App: http://localhost:5174  ·  API docs (Swagger): http://localhost:8000/api/docs


## What's added in this build
- **Admin (password-gated admin entry for any account)** — Opening it shows a restricted-area password gate; only people who know the admin-visit password can proceed. On success the server issues a **60-minute scoped grant** (`X-Admin-Visit`) bound to that user id, which the UI stores in `sessionStorage` only. The admin shell shows an amber "Admin visit" pill with an **Exit** button that revokes the session client-side and audits `admin_visit.locked`.
- **Encryption & Key Registry in the Security Dashboard** — a live, per-document view of the envelope-encryption state: algorithm (`AES-256-GCM`), 256-bit data keys, 96-bit nonces, KEK version per file, a **non-reversible DEK fingerprint** (`dek_<sha256 prefix>`), wrapped-DEK size, key status (`ok` / `stale_kek` / `kek_unavailable` / `metadata_missing`), and last access. Summary cards show total files, unique data keys, active KEK version, stale/missing counts, integrity failures, and rotations, plus a KEK-version distribution chart. Each row has a **Verify** action that decrypts the file end-to-end and raises a **critical** alert on any integrity failure.
- **Live threat LED ANIMATION + abnormal-activity triggers** — the Security Dashboard header carries a pulsing red LED with an open-alert count. A 10-second poll of `/api/admin/security/live` detects new alerts and fires a red **LED glow / flash animation** on the alert feed, with a threat ring on critical items. Triggers include: failed login, unknown-email login, brute-force bursts, **successful sign-in from a new IP**, wrong share passcode, failed vault unlock, **abnormal download volume**, **decryption/integrity failure**, and **failed Admin Visit password**. All honour `prefers-reduced-motion`.
- **Redesigned UI/UX** — deep blue → lavender gradient system, gradient photography on the landing/auth/share pages, glass panels, and a consistent component library. Every chart and graph uses a **dark-red** palette.
- **Passcode-protected shares** — when creating a link or direct share you can set an optional 4–64 character passcode (stored as an Argon2id hash, never in clear text). Recipients must exchange it for a short-lived scoped grant (`X-Share-Passcode-Token`, 15 min) before the file can be viewed or downloaded. Wrong passcodes are rate-limited, audited, and raise a security alert.
- **Secure Folder (per user)** — a vault inside the account, like a phone's secure folder. The user creates a vault password, then unlocks it to upload, preview, download, or move files in/out. Vault files are flagged `is_secure`, are excluded from the normal file list, cannot be shared, and are unreachable through ordinary file routes (404). Unlock issues a 15-minute scoped token; the UI can lock again at any time.
- **Admin Dashboard** — platform operations: registered/active users, files uploaded, storage utilization, upload/download activity, file-sharing activity, active/expired/revoked links, failed logins, unauthorized attempts, and the audit log.
- **Security Dashboard (admin-only, separate from the Admin Dashboard)** — visually distinct "Security Operations" view with severity alert cards, alert volume graphs, open-alerts-by-severity donut, an acknowledgement workflow, per-user security posture (risk score/level, failed logins, open alerts), and a filterable security activity log. Failed logins, brute-force bursts, wrong passcodes, and failed vault unlocks raise alerts here — not on the operations dashboard.
- **Per-file encryption keys** — each file gets a random AES-256-GCM data key; only that key is wrapped by the versioned master key (KEK). The master key never encrypts file content directly. Keys live in the backend key manager, separate from stored ciphertext; rotation re-wraps data keys only. The file id is bound as AAD, so ciphertext cannot be swapped between files.

## OAuth (Google / Microsoft)
Set the client ID/secret env vars; redirect URL = `{TS_PUBLIC_BASE_URL}/api/auth/oauth/{google|microsoft}/callback`. Without credentials the buttons show an honest "not configured" message.

## Architecture

| PostgreSQL | PostgreSQL-compatible via SQLAlchemy; SQLite for zero-setup dev | Easier local run; switch with `TS_DATABASE_URL` |
| MongoDB for file metadata | Metadata in the relational DB | One consistent store with joins/permissions; Milestone 2 itself places metadata in PostgreSQL |
| Redis (sessions, rate limits) | Not used. In-process rate limiter; JWT revocation table | No requirement justified a 3rd service; limiter is single-instance only |
| bcrypt | Argon2id | Stronger, explicitly allowed by the brief |

