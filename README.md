

<img width="630" height="600" alt="image" src="https://github.com/user-attachments/assets/5eb67b8a-aaaf-4df3-b4cc-d6474a648a91" />

**An encrypted file-sharing and collaboration platform.**
Every file is locked with its own key before it reaches storage, every share can expire, and every action leaves a trail.


[**Live demo**](https://trustshare-lime.vercel.app/) · [**Admin gate**](https://trustshare-lime.vercel.app/admin/login) · [**Demo video**](https://drive.google.com/file/d/1KQrzR44yzvOOUSZ2tWTn1Qff6twrgKwD/view?usp=sharing)

</div>

---

## Why TrustShare

**A secure file sharing platform**:
Strong File security provided as files are encrypted with AES-256-GCM per-file data key wrapped by a versioned master key before reaching storage.

- **Files are encrypted before storage.** Whatever sits on disk or in a bucket is unreadable ciphertext.
- **Sharing is deliberate.** Links expire, can be revoked, can require a passcode, and can be limited to viewing only.
- **Everything is observable.** Logins, downloads, shares and failures are recorded, and suspicious patterns raise alerts for admins.

### Protecting files

| Feature | What it does |
|---|---|
| **Per-file encryption** | Each upload gets its own AES-256-GCM data key and a unique 96-bit nonce. |
| **Envelope encryption** | A versioned master key (KEK) wraps each data key. Keys are stored apart from ciphertext and are never sent to the browser or written to logs. |
| **Tamper detection** | The GCM authentication tag is verified on every decrypt. The file ID is bound in as Additional Authenticated Data, so ciphertext cannot be swapped between files. |
| **Key rotation** | Rotating the master key re-wraps the data keys without re-encrypting any file. Older files stay readable. |
| **Upload checks** | File type and size limits, content-versus-extension validation, and per-user storage quotas. |

### Sharing

| Feature | What it does |
|---|---|
| **Link or direct shares** | Share through an unguessable link, or directly with another TrustShare user. |
| **Permissions** | Choose *view only* or *download* for each share. |
| **Expiry and revocation** | Every share has an expiry time, and owners can revoke it at any moment. |
| **Download limits** | Optionally cap how many times a share can be used. |
| **Passcode protection** | Optional 4–64 character passcode, stored as an Argon2id hash. Wrong attempts are rate-limited, recorded and flagged. |
| **Hashed tokens** | Only a SHA-256 hash of each link token is stored. The raw token is never saved. |

### Everyday workspace

- Dashboard with **My Files, Recent, Favorites, Shared with Me, Shared by Me, Trash, Storage** and **Activity**
- Folders, search and filtering, file preview, restore from Trash
- **Secure Folder:** a private vault with its own password, where you can upload, preview, download and move files in and out
- Profile settings: password change, sign-in activity, account controls
- Sign in with email and password, or with **Google** or **Microsoft**. Email verification and password reset are included.

### Admin and monitoring

- **Admin Gate:** a password-protected entry to the admin panel. A correct password issues a scoped, 60-minute grant tied to that user, kept in `sessionStorage` only.
- **Activity monitoring** of logins, failures, uploads, downloads, shares, link events and unauthorized attempts, with user, file, status, IP and timestamp
- **Audit logs** with filters by user, file, activity type, status and date range, restricted to admins
- **Notifications:** in-app bell with unread count and mark-as-read, for new shares, downloads of your shared files, and link-expiry reminders. Optional email delivery over SMTP.
- **Reports and analytics:** upload, download, sharing, user-activity and security reports, plus storage usage, per-user usage and most-downloaded files, shown as charts
- **Suspicious activity detection:** rule-based alerts with severity levels 
- **Encryption and Key Registry:** a live view of key state per file (algorithm, key size, KEK version, key fingerprint, wrapped-key size, status, last access) with a one-click integrity **Verify**
- **Live threat LED:** a pulsing indicator in the Security Dashboard header showing open alerts


## How the encryption works


 Upload                                                Download
 ──────                                                ────────
 file ──► validate ──► generate DEK (256-bit)          check identity + permission
                              │                                    │
                  encrypt file with DEK                  load ciphertext + wrapped DEK
              (AES-256-GCM, fresh nonce,                           │
               file ID as AAD)                          unwrap DEK with versioned KEK
                              │                                    │
                  wrap DEK with versioned KEK            decrypt in memory + verify tag
                              │                                    │
        ciphertext ──► storage (local / S3)                send original file over HTTPS
        wrapped DEK + metadata ──► database


**Why envelope encryption?** If the master key is rotated, only the small wrapped keys are re-wrapped, not
every file. If one data key were ever exposed, only that single file is affected.


## Tech stack

![TrustShare tech stack]

| Layer | Technology 
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, React Router, Axios, Recharts, Lucide icons |
| Backend | Python 3.11+, FastAPI, Uvicorn, Pydantic |
| Auth | JWT, Argon2id password hashing, Google and Microsoft OAuth2, role-based access control |
| Encryption | `cryptography` library (AES-256-GCM) with envelope encryption |
| Database | SQLAlchemy 2, SQLite for development and PostgreSQL for production |
| Document store | MongoDB, optional best-effort mirror of activity, audit, notification and security events |
| File storage | Local disk for development, AWS S3 (via `boto3`) for production |
| Email | SMTP, optional |
| Deployment | Vercel (frontend), Render (backend), Docker |
| Testing | pytest, end-to-end smoke script |

---

## Project structure

```
trustshare/
├── backend/
│   ├── app/
│   │   ├── main.py                  # app setup, CORS, security headers, routers
│   │   ├── config.py                # settings (TS_* environment variables)
│   │   ├── models.py                # database models
│   │   ├── routers/                 # auth, files, shares, secure folder, admin, admin visit, audit logs
│   │   ├── services/                # encryption, storage, security, audit, rate limiting, MongoDB mirror
│   │   ├── activity_monitoring/     # who did what, and when
│   │   ├── notifications/           # in-app and email notifications
│   │   ├── reports/                 # file activity and security reports
│   │   ├── analytics/               # storage and usage statistics
│   │   └── security_monitoring/     # detection rules and alert generation
│   ├── tests/
│   ├── scripts/smoke_e2e.py
│   └── .env.example
├── frontend/
│   └── src/
│       ├── pages/                   # landing, auth, dashboard, secure folder, public share
│       │   └── admin/               # admin panel and monitoring pages
│       ├── api.ts  auth.tsx  ui.tsx
│       └── Shell.tsx
├── docker-compose.yml
└── README.md
```

---

## Getting started

**You need:** Python 3.11+ and Node.js 18+. No external services are required for local development, because it uses SQLite and local file storage.

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env

# create your first admin account
$env:TS_ADMIN_PASSWORD = "choose-a-strong-password"
python -m app.cli create-admin admin@example.com "Site Admin"

uvicorn app.main:app --reload --port 8000
```

<details>
<summary>macOS / Linux</summary>

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
TS_ADMIN_PASSWORD="choose-a-strong-password" python -m app.cli create-admin admin@example.com "Site Admin"
uvicorn app.main:app --reload --port 8000
```
</details>

Interactive API docs are served at `http://localhost:8000/api/docs`.

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open the address Vite prints. Requests to `/api` are proxied to the backend on port 8000.

If Vite complains about a missing import, run `npm run doctor`. It lists any file that does not resolve.

### 3. Try it

1. Sign up, then upload a file from **My Files**.
2. Open **Share**, pick a recipient, set a permission, expiry and optional passcode.
3. Sign in as the recipient and open **Shared with Me** to download it.
4. Open the **Admin Visit** page, enter the admin gate password, and explore **Security**, **Audit Logs**, **Reports** and **Storage Analytics**.

### Run with Docker (PostgreSQL)

```bash
export DB_PASSWORD=choose-a-strong-password
docker compose up --build
```

> The compose file has not been verified in every environment, so review it before relying on it.

---

## Configuration

All settings live in `backend/.env` (copy from `.env.example`). Never commit this file.

| Variable | Purpose |
|---|---|
| `TS_ENV` | `development` or `production` |
| `TS_DATABASE_URL` | SQLite by default; use a PostgreSQL URL in production |
| `TS_JWT_SECRET` | Token signing secret (**required in production**) |
| `TS_MASTER_KEYS` | Master keys as `version:base64(32 bytes)`, comma separated (**required in production**) |
| `TS_ACTIVE_KEY_VERSION` | Which master key wraps new data keys |
| `TS_STORAGE_BACKEND` | `local` or `s3` |
| `TS_S3_BUCKET`, `TS_S3_REGION`, `TS_S3_PREFIX` | S3 settings. AWS credentials come from the standard AWS environment or role. |
| `TS_CORS_ORIGINS`, `TS_FRONTEND_URL`, `TS_PUBLIC_BASE_URL` | Origins and public URLs |
| `TS_GOOGLE_*`, `TS_MICROSOFT_*` | OAuth client IDs and secrets |
| `TS_ADMIN_VISIT_PASSWORD` | Admin gate password. **Change the default before deploying.** |
| `TS_ADMIN_VISIT_MINUTES` | Lifetime of an admin visit (default 60) |
| `TS_MAX_UPLOAD_MB`, `TS_USER_QUOTA_MB` | Upload size and per-user quota |
| `TS_MONGO_URL` | Optional, enables the MongoDB mirror |
| `TS_HTTPS_ENFORCED`, `TS_TRUST_PROXY` | Enable only behind a TLS-terminating, trusted proxy |

Generate production secrets:

```bash
# JWT secret
python -c "import secrets; print(secrets.token_urlsafe(64))"

# master key (KEK), version 1
python -c "import os,base64; print('1:'+base64.b64encode(os.urandom(32)).decode())"
```

---

## API at a glance

Full, interactive documentation is available at `/api/docs`. The main areas:

| Area | Examples |
|---|---|
| **Auth** `/api/auth` | `POST /register`, `POST /login`, `POST /logout`, `POST /forgot-password`, `GET /oauth/{provider}/login` |
| **Files** `/api` | `POST /files/upload`, `GET /files`, `GET /files/{id}/download`, `GET /files/{id}/preview`, `POST /folders` |
| **Shares** `/api` | `POST /shares`, `GET /shares/mine`, `GET /shares/with-me`, `POST /shares/{id}/revoke`, `POST /shares/{id}/verify` |
| **Public links** `/api/public/shares` | Token-based access, rate limited |
| **Secure Folder** `/api/secure-folder` | `POST /setup`, `POST /unlock`, `POST /lock`, `POST /upload` |
| **Activity** `/api/activity` | User and file activity records |
| **Audit** `/api/audit-logs` | `GET /`, `GET /user/{id}`, `GET /file/{id}`, `GET /filter` (admin only) |
| **Notifications** `/api/notifications` | `GET /`, `GET /unread-count`, `POST /{id}/read`, `POST /read-all` |
| **Reports** `/api/reports` | `GET /uploads`, `GET /downloads`, `GET /sharing`, `GET /security` |
| **Analytics** `/api/analytics` | `GET /storage`, `GET /users/storage`, `GET /files`, `GET /downloads`, `GET /sharing` |
| **Security monitoring** `/api/security-monitoring` | `GET /rules`, `GET /events`, `GET /summary` |
| **Admin** `/api/admin` | Users, files, system status, encryption registry and verification, key rotation |

---

## Security model

**Access control.** Permissions are enforced on the server for every protected request, not only in the interface. A file ID alone never grants access. Owners, valid share recipients and everyone else are treated differently, and expired or revoked shares are always denied.

**Passwords and tokens.** Passwords are hashed with Argon2id. Sessions use signed JWTs that can be revoked on logout. Share link tokens are random and stored only as hashes.

**Detection rules.** Activity is checked against rolling-window rules, and a rule that fires creates a deduplicated alert with a severity level that notifies admins:

| Signal | Example behavior |
|---|---|
| Repeated failed logins and brute-force bursts | Many failures in a short window |
| Unauthorized file access | Repeated attempts on files the user cannot open |
| Excessive downloads | More than 20 downloads in 5 minutes |
| Expired or revoked link use | Repeated attempts on dead links |
| Other triggers | Unknown-email login, sign-in from a new IP, wrong share passcode, failed vault unlock, decryption or integrity failure, failed admin gate password |

Thresholds are configurable in the backend settings.

**Hardening.** Responses carry `nosniff`, `X-Frame-Options: DENY` and `no-referrer` headers, and HSTS can be enabled when running behind HTTPS. Sensitive routes are rate limited, and admin actions are audited.

---

## Testing

```powershell
cd backend
pytest -q                                           # unit and integration tests
python scripts/smoke_e2e.py http://localhost:8000   # end-to-end checks against a running server

cd ..\frontend
npm run doctor      # verifies every local import resolves
npm run build       # type-check and production bundle
```

---

## Milestones

TrustShare was built in three stages.

<details>
<summary><b>Milestone 1: Foundation</b></summary>

- Planned the architecture, data model and wireframes
- Set up the FastAPI backend and React frontend with Tailwind CSS and Axios
- Built registration, login, hashed passwords and JWT sessions
- Added role-based access control with Google and Microsoft sign-in
- Built the upload pipeline with type and size validation and metadata recording
- Built the dashboard: sidebar, search, storage indicator, upload modal with progress, file list and folders
</details>

<details>
<summary><b>Milestone 2: Encryption and secure sharing</b></summary>

- AES-256-GCM file encryption with a unique key and nonce per file
- Envelope encryption with a versioned master key, key rotation, and AAD binding
- Private object storage (local for development, S3 for production)
- Authenticated, permission-checked downloads with in-memory decryption and integrity verification
- Secure share links with hashed tokens, view or download permissions, expiry, revocation and download limits
- Optional passcode protection on shares
</details>

<details>
<summary><b>Milestone 3: Monitoring, notifications and analytics</b></summary>

- Activity monitoring across logins, uploads, downloads, shares and link events
- Audit logging with admin-only retrieval APIs and filters
- In-app notifications, security alerts for admins, link-expiry reminders and optional email
- File activity and security reports with filters
- Storage analytics with per-user usage and charts
- Rule-based suspicious activity detection with severity levels
- A unified Admin Dashboard bringing it all together, plus the Security Dashboard with the Encryption and Key Registry and live threat LED
</details>

---

## Known limitations

- The free hosting tier for the backend can sleep when idle, so the first request after a quiet period may be slow.
- Rate limiting is in-process, which suits a single instance. A shared store such as Redis would be needed for multiple instances.
- Email delivery is optional and does nothing until SMTP settings are provided.
- The MongoDB mirror is best-effort. The relational database is the source of truth.

---

## License

Released under the [MIT License](LICENSE).
