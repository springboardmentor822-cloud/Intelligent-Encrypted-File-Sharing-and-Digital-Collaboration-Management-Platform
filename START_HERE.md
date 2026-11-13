# START HERE

## If you saw `Failed to resolve import "./pages/SecureFolder"`

That error means the folder you ran Vite in is **not the folder from this ZIP** — it is an older
copy that is missing files (the ZIP itself is complete and builds cleanly). Vite only reports the
first missing file, so there may be more.

**Fix (30 seconds):**

1. Delete the old project folder completely (e.g. `trustsharcedmin`). Do not extract on top of it.
2. Extract this ZIP into a **clean** folder. Avoid OneDrive-synced paths with spaces if you can —
   `C:\dev\trustshare` is ideal.
3. Re-install and run.

The frontend now refuses to start with a clear message if any file is missing:

```
npm run doctor     # -> "[trustshare] All local imports resolve."
```

## Windows — full run

```powershell
# 1. Backend
cd C:\dev\trustshare\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
$env:TS_ADMIN_PASSWORD = "ChangeMe123"
python -m app.cli create-admin admin@example.com "Site Admin"
uvicorn app.main:app --reload --port 8000
```

```powershell
# 2. Frontend (new terminal)
cd C:\dev\trustshare\frontend
npm install
npm run dev
```

Open <http://localhost:5174>.

## Try the features

| What | How |
|---|---|
| **Admin Visit** | Log in as *any* user -> sidebar **Admin Visit** -> password `123meadmin` -> **Open admin panel**. Amber pill in the header lets you exit. |
| **Security Dashboard** | In the admin panel, open **Security**. The red LED pulses when a new alert arrives. |
| **Encryption registry** | Security -> *Encryption & Key Registry*: per-file DEK fingerprint, KEK version, nonce, **Verify** button. |
| **Share -> download** | Upload a file -> Share -> pick a user + passcode -> log in as that user -> **Shared with Me** -> enter passcode -> download. |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Failed to resolve import "./pages/..."` | stale/partial folder | delete folder, re-extract ZIP, `npm run doctor` |
| `Cannot reach the server` in the UI | backend not running / wrong port | start uvicorn on `:8000`; Vite proxies `/api` there |
| `Administrator privileges required` | Admin Visit grant expired (60 min) | reopen **Admin Visit** and re-enter the password |
| `Incorrect admin password` | wrong password | default is `123meadmin`; override with `TS_ADMIN_VISIT_PASSWORD` |
| Passcode prompt never appears | old frontend build | this build exposes `X-Share-Passcode` via CORS; re-extract and rebuild |
| `TS_JWT_SECRET` required on start | `TS_ENV=production` | set `TS_JWT_SECRET` and `TS_MASTER_KEYS`, or use `TS_ENV=development` |

## Verify everything yourself

```powershell
cd backend
pytest -q                                            # 50 unit/integration tests
python scripts/smoke_e2e.py http://localhost:8000    # 31 end-to-end checks
cd ..\frontend
npm run doctor && npm run build                      # import check + type-check + bundle
```
