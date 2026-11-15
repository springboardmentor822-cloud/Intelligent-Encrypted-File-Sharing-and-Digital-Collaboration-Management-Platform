# TrustShare - Mentor Presentation Guide

## 1. One-minute explanation

TrustShare lets users upload files and share them safely. When a file is uploaded, the server
encrypts it with AES-256 **before** saving it, so storage only ever holds unreadable data.
Files are shared through expiring, optionally password-protected links or per-user permissions.
Everything important is logged, suspicious behaviour creates security alerts, and dashboards show usage.

## 2. Architecture in plain words

| Part | Technology | What it does here |
|---|---|---|
| Frontend | React + Tailwind + Axios | Pages the user sees; talks to the API |
| Backend | FastAPI | All business logic and security |
| PostgreSQL | SQLAlchemy | Users, roles, folders, file records, encryption key metadata, share links, permissions |
| MongoDB | Motor | File metadata, audit logs, security alerts, notifications |
| Redis | redis-py | Refresh sessions, token blacklist (logout), rate limiting, failed-login counters |
| Storage | Local disk or AWS S3 | Encrypted file bytes only |

**Why 3 databases?** Relational data needs strict structure (PostgreSQL). Logs are flexible and written constantly (MongoDB).
Short-lived counters and sessions need speed and expiry (Redis).

## 3. The encryption flow (the key thing to explain)

1. User uploads a file over HTTPS.
2. FastAPI validates it (size, extension, MIME type, magic bytes).
3. FastAPI creates a **random 256-bit key for this file only** (the DEK).
4. File is encrypted with **AES-256-GCM** (GCM also detects tampering).
5. The DEK is encrypted with a **Master Key** (envelope encryption) and saved in PostgreSQL.
6. Only the ciphertext goes to storage.
7. On download, the server loads ciphertext, decrypts **in memory**, checks a SHA-256 integrity hash and streams the result.

**Key rotation:** add a new master key version in `.env`, restart, click "Rotate file keys" (Admin page).
Only the small DEKs are re-encrypted, the big files are untouched. Code: `backend/app/core/crypto.py`.

## 4. Milestone mapping

### Milestone 1 - Core infrastructure, auth, upload, dashboard
| Requirement (from your PDF) | Where |
|---|---|
| Architecture + DB schema | `models/postgres.py`, `models/mongo.py`, `docker-compose.yml` |
| Registration, login, bcrypt | `routers/auth.py`, `core/security.py` |
| JWT + refresh tokens + sessions (Redis) | `routers/auth.py`, `core/deps.py` |
| RBAC (Admin / User / Guest) | `core/deps.py` (`require_roles`), Guests cannot upload |
| MFA (TOTP) | `routers/auth.py` (`/auth/mfa/*`), `pages/Settings.jsx` |
| Password recovery | `/auth/forgot-password`, `/auth/reset-password` |
| File validation + chunked intake + local storage | `routers/files.py` (`upload_file`), `core/validation.py`, `core/storage.py` |
| Metadata in MongoDB | `models/mongo.py` -> `file_metadata` collection |
| Login/signup/dashboard/upload modal with progress/folders/search | `frontend/src/pages/*`, `components/FileUploader.jsx` |

### Milestone 2 - Encryption and sharing
| Requirement | Where |
|---|---|
| AES-256-GCM, unique key per file, master key | `core/crypto.py` |
| S3 / local pluggable storage | `core/storage.py` |
| Decrypt on download | `services/file_service.py` |
| Secure links: token, expiry, max downloads, password, view-only | `routers/share.py`, `components/ShareModal.jsx`, `pages/SharePage.jsx` |
| View / Download / Admin permissions per user | `routers/files.py` (`/permissions`) |
| Key rotation | `routers/admin.py` (`/admin/keys/rotate`) |

### Milestone 3 - Monitoring, alerts, analytics
| Requirement | Where |
|---|---|
| Audit logs (IP, user agent, user, time, result) | `services/audit.py` -> MongoDB `audit_logs` |
| Anomaly detection (5 failed logins/downloads/link attempts in 10 min; download bursts) | `services/audit.py` (`_evaluate`) |
| Notifications (in-app + email) and expiry reminders | `services/notifications.py`, `services/reminders.py` |
| Storage charts, activity graph, audit viewer with filters | `pages/Analytics.jsx`, `components/StorageStats.jsx`, `AuditLogTable.jsx` |

### Milestone 4 - Docker and tests
| Requirement | Where |
|---|---|
| Multi-stage Dockerfiles | `backend/Dockerfile`, `frontend/Dockerfile` |
| Compose with healthchecks, volumes, env | `docker-compose.yml` |
| Tests: encryption integrity, auth, validation | `backend/tests/` |

### Admin Dashboard (added)
| Tab | What it shows | Where |
|---|---|---|
| Overview | Users, active sessions, storage used / left / capacity gauge, open alerts, login trend, top storage users | `GET /admin/overview`, `pages/AdminDashboard.jsx` |
| User monitoring | Per-user role, storage vs quota, files, last login time and IP, MFA status, enable/disable, activity history | `GET /admin/users`, `/admin/users/{id}/activity` |
| Security analytics | Successful vs failed logins, failures by action, alerts by type, top failing IPs, recent warnings, resolve alerts | `GET /admin/security`, `/analytics/alerts` |
| Storage | Capacity gauge, consumption by file type, usage per user | `/admin/overview` |
| Encryption keys | Master key version, files per key version, one-click rotation | `/admin/keys/*` |

Active sessions are counted from refresh tokens stored in Redis; last login comes from the MongoDB audit log.

## 5. Suggested live demo (5 minutes)

1. `docker compose up --build`, open `/health` (all three databases `ok`).
2. Sign up as `admin@trustshare.com`, enable MFA (Settings), log out and log in with the code.
3. Upload a file, then show the `.enc` file on disk is unreadable.
4. Create a share link: 1 download, password, 1 hour. Open it in a private window, download once, try again (blocked).
5. Share with a second user as "View" and show they cannot download.
6. Enter a wrong password on the link 5 times, then open Analytics: a **security alert** appears.
7. Admin Dashboard: show users, storage left, the new alert under Security analytics, and rotate keys.

## 6. What is simplified here vs production (be honest about this with your mentor)

| Area | In this project | In production |
|---|---|---|
| Secrets | Plain `.env` file | AWS Secrets Manager / KMS |
| Master key | In an environment variable | Hardware-backed KMS/HSM (AWS KMS) |
| Large files | Whole file encrypted in memory (25 MB limit) | Chunked/streaming encryption |
| Tokens in browser | `localStorage` | httpOnly secure cookies + CSRF protection |
| MFA secret | Stored as plain text in DB | Encrypted at rest |
| DB schema changes | `create_all()` on startup | Alembic migrations |
| HTTPS | Not enabled locally (plain http) | TLS via load balancer / NGINX |
| Email | Printed in backend logs unless SMTP set | SendGrid/SES |
| Virus scanning | Not included | ClamAV or cloud scanning |
| Background jobs | Simple asyncio loop | Celery / RabbitMQ / Kafka |
| Rate limiting | Redis counters per IP | API gateway + WAF |
| Access-token revocation | Blacklist on logout | Same, plus device/session management |

## 7. Not implemented (from the full spec)

- Social OAuth2 login (Google/GitHub). Login uses email+password with JWT bearer tokens.
- File version management.
- Azure Blob storage adapter (the storage interface makes it easy to add).
- Mobile/desktop clients, RabbitMQ/Kafka, Kubernetes, Prometheus/Grafana.
- Frontend uses React (Vite) rather than Next.js; your spec allows either.

## 8. Likely mentor questions

- **Why GCM?** It encrypts and authenticates, so any modification is detected on decrypt (tested in `test_crypto.py`).
- **Why a separate key per file?** One leaked key exposes one file, not everything.
- **Why store only the hash of share tokens?** A database leak would not give attackers working links.
- **What stops brute-forcing a link password?** Rate limits per IP, plus alerts after repeated failures.
- **What happens on logout?** The access token's ID goes on a Redis blacklist until it expires; the refresh session is deleted.


## 5. Version 2 additions (mentor feedback)

| Mentor request | Where |
|---|---|
| User sidebar (12 items) and separate admin sidebar (Dashboard, User Management, File Management, Sharing Reports, Security Dashboard, Analytics, System Monitoring, Activity Logs, Settings) | `frontend/src/components/Layout.jsx`, `App.jsx` |
| File Analytics dashboard (storage, uploads, downloads, sharing, recent uploads/downloads, summary cards, date filters) | `pages/FileAnalytics.jsx` ← `GET /reports/file-analytics` (`routers/reports.py`) |
| Admin Security Dashboard (login monitoring, unauthorized/blocked attempts, security events, audit monitoring, charts, recent logins, recent events, metrics) | `pages/AdminSecurity.jsx` ← `GET /reports/security-dashboard` |
| Regular users cannot open it — enforced by the backend, not the menu | `require_roles("admin")` in `core/deps.py`; denied attempts are logged as `admin_access`; test: `tests/test_milestone2_features.py` |
| Triggers + notifications for non-admin users entering admin areas, and login-attempt detection (separate Threat Monitor dashboard) | `pages/AdminThreats.jsx` ← `GET /reports/threat-monitor`; triggers in `services/audit.py` (`_admin_triggers`); pop-ups: `components/ThreatToaster.jsx` ← `GET /reports/threat-feed` |
| Unique, impressive dashboards | `pages/DashboardHome.jsx` (user), `components/CommandCenter.jsx` (admin), effects in `components/fx.jsx`; heatmap data `GET /reports/activity-heatmap` |
| Security Dashboard second in the menu + activity analytics graphs inside it | `components/Layout.jsx`, `pages/AdminSecurity.jsx` embeds `components/ActivityAnalytics.jsx` |
| User Security section (10 protections) | `pages/UserSecurity.jsx` ← `GET /reports/my-security` |
| Security events: repeated failures, suspicious IP, unauthorized access, policy violations, file threats | `services/audit.py` (`_evaluate`), `core/validation.py` |

### 3-minute demo script
1. Upload a PDF → point at the red **seal** badge (AES-256 · v1) → show the `.enc` file in `backend/uploads` (unreadable).
2. Share with a 1-hour link, view-only → open in a private window → revoke → refresh: "no longer available".
3. Move the file to **Trash** → the link stops working → **Restore** it.
4. Open **File Analytics** (change the date range) and **Security** (ten layers).
5. As admin open **Security Dashboard** → trigger a wrong-password burst → show the alert and threat level.
6. Admin Panel → System Monitoring → Encryption keys → rotate → files still open.

### Honest limits (say this to the mentor)
* Master key is in an environment variable; production would use AWS KMS (`docs/KEY_MANAGEMENT.md`).
* Location of an IP is shown as "Local network" on localhost; real lookups are optional (`GEOIP_ENABLED`).
* File-threat detection is signature + type checking (and the EICAR test string), not a full antivirus engine.
* Whole files are encrypted in memory (25 MB limit); production would stream large files.


## 6. Milestone 3 demo script (5 minutes)
1. Log in as a user: upload a file, share it with a second user (give them an e-mail you own), download it as that user.
2. Bell: the second user sees "A file was shared with you"; the owner sees "Your shared file was downloaded" with name, who and time. Open **Notifications** (history, mark read).
3. Admin → **Audit Logs**: filter by that user and by that file; export the CSV.
4. Admin → **Security Alerts → Test scenarios**: run "Enter an incorrect password repeatedly", then "Try accessing an expired sharing link". Show the alerts (severity, status), the red pop-up and the bell.
5. **Detection rules**: lower "Repeated failed logins" to 2, save, run the scenario again, show it fire faster.
6. **Reports** (uploads / downloads / sharing / security) and **Storage Analytics** (filter by user and file type).
7. **User Activity**: open a user's timeline. **Notifications (admin)**: send an announcement and show the e-mail log.
Map of requirement to code: `docs/MILESTONE3_CHECKLIST.md`.


## 7. Version 3.1 additions (say these to the mentor)
| Request | Where |
|---|---|
| Admin and user dashboards completely separate; users cannot open admin pages or the Security Dashboard | `Protected admin` (React) + `require_roles("admin")` (every admin API) + browser reports attempts to the server |
| Admin can see every user's activity and decide who gets in | Admin → User Activity (live stream), Access Control (approvals, IP blocks, tripwires) |
| Storage 1 GB with analytics | `STORAGE_LIMIT_MB`, Admin → Storage Analytics (gauge, forecast, per-user), alerts at 80% / 95% |
| Triggers | 13 editable rules + auto-block + tripwire + storage alerts (`services/detection.py`, `services/audit.py`) |
| Unique home page | `pages/Landing.jsx`: cipher rain, live AES-256-GCM lab in the browser, two doors |
| Admin account problem | `ADMIN_EMAIL` / `ADMIN_PASSWORD` bootstrap + `scripts/make_admin.py` |
