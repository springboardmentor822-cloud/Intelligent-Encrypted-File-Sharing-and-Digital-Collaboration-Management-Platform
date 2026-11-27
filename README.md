# TrustShare — Milestone 3

TrustShare Milestone 3 is a demo dashboard and API for monitoring file activity, keeping an audit trail, notifying users, reporting storage usage, and flagging suspicious behavior.

> **Scope:** This repository contains the Milestone 3 monitoring experience. It does not implement the earlier milestones' file upload, encryption, authentication, or secure-sharing workflows. The dashboard currently uses local demo data; it is not wired to the API. The API is an integration-ready demo that can accept events from those workflows.

## Project overview

TrustShare gives a workspace administrator an operations view of file activity and security events. Its FastAPI service records activity and audit events in SQLite, generates notifications, evaluates configurable detection rules, and exposes reporting and analytics endpoints. A separate React dashboard presents a self-contained visual demo.

## Features

- Workspace dashboard with activity, storage, downloads, sharing, and security views.
- Activity and audit event recording, with filtering and per-user or per-file audit lookup.
- In-app notifications and optional SMTP email delivery.
- Suspicious activity detection for repeated failed logins, excessive downloads, unauthorized access, and expired or revoked link attempts.
- Security event review and resolution.
- Activity and security reports, plus file, storage, download, and sharing analytics.
- Interactive API documentation at `/docs`.
- SQLite database created and seeded with illustrative demo records on first startup.

## Technologies

- **Frontend:** React 18, Vite, Recharts, Lucide React
- **Backend:** Python, FastAPI, Uvicorn, Pydantic
- **Database:** SQLite (Python standard library)

## Prerequisites

Monitoring, notifications, audit history, reports, storage analytics, and suspicious activity detection for the TrustShare application.
- Python 3.10 or newer
- Node.js 18 or newer and npm

> This checkout was empty when Milestone 3 was started. This project provides the Milestone 3 dashboard and API as an integration-ready demo; it does not replace the Milestone 1–2 upload, encryption, or sharing workflows.
## Installation

## Run
Clone the repository and enter its directory:

### Dashboard
```bash
git clone <repository-url>
cd TrustShare_Milestone3
```

### Virtual environment setup and backend dependencies

On Windows PowerShell:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

On macOS or Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Backend requirements are `fastapi` and `uvicorn[standard]`, with version ranges in [`backend/requirements.txt`](backend/requirements.txt).

### Frontend dependencies

In a second terminal, from the repository root:

```bash
cd frontend
npm install
npm run dev
```

### API
Frontend packages and scripts are listed in [`frontend/package.json`](frontend/package.json); the lockfile is included for repeatable installs.

## Database setup

No separate database server or migration command is needed. On API startup, the service creates a SQLite database at `backend/trustshare.db` by default, creates its tables, and seeds illustrative activities, notifications, files, and a security event when the activities table is empty.

Set `TRUSTSHARE_DB` to use a different SQLite file path. The database is local demo data and is excluded from Git.

## Environment variables

Set these in the backend process environment before starting the API. They are optional unless stated otherwise.

| Variable | Purpose | Default |
| --- | --- | --- |
| `TRUSTSHARE_DB` | SQLite database file path | `backend/trustshare.db` |
| `TRUSTSHARE_ADMIN_TOKEN` | If set, required as `X-Admin-Token` on administrator endpoints | Unset (admin endpoints are not protected) |
| `TRUSTSHARE_ORIGINS` | Comma-separated CORS origins | `http://localhost:5173` |
| `SMTP_HOST` | SMTP server; enables email delivery when configured | Unset (email disabled) |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username; enables STARTTLS login when set | Unset |
| `SMTP_PASSWORD` | SMTP password used with `SMTP_USER` | Unset |
| `SMTP_FROM` | Sender address | `trustshare@localhost` |
| `TRUSTSHARE_EMAIL_<USER_ID>` | Email address for a notification recipient | Unset |

For the email variable, uppercase the user ID and replace hyphens with underscores. For example, user `u-olivia` maps to `TRUSTSHARE_EMAIL_U_OLIVIA=olivia@example.com`.

Example PowerShell configuration for a local run:

```powershell
$env:TRUSTSHARE_ADMIN_TOKEN = "replace-with-a-local-demo-token"
$env:TRUSTSHARE_ORIGINS = "http://localhost:5173"
```

The token only protects endpoints marked as administrator endpoints. This demo does not provide user authentication or authorization for activity creation and notification routes; do not expose it as a production service without integrating trusted identity and access control.

## How to run the project

Start the API in one terminal (activate the backend virtual environment first):

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API creates a local SQLite demo database at `backend/trustshare.db` and seeds illustrative activity, notification, file, and security records on first run. SQLite is used as a self-contained stand-in because this checkout contains no existing PostgreSQL or MongoDB configuration. Set `TRUSTSHARE_ADMIN_TOKEN` and send `X-Admin-Token` to protect administrator endpoints. The browser dashboard uses realistic local demo data and remains usable if the API is offline.
The API is available at `http://127.0.0.1:8000`. Check `http://127.0.0.1:8000/health` or browse the interactive docs at `http://127.0.0.1:8000/docs`.

Optional email delivery uses `SMTP_HOST`, `SMTP_PORT` (default `587`), `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`. Map a notification user ID to an address with `TRUSTSHARE_EMAIL_<USER_ID>` (uppercase, hyphens replaced by underscores), for example `TRUSTSHARE_EMAIL_U_OLIVIA=olivia@example.com`.
Start the dashboard in a second terminal:

## API overview
```bash
cd frontend
npm run dev
```

Vite prints the local dashboard URL, usually `http://localhost:5173`. The dashboard is presently a standalone visual demo and does not call the backend API.

- `POST /activities` records activity and audit entries and evaluates suspicious-activity rules. For a `share` event, pass `recipient_user_id` so the recipient gets a notification.
- `GET /activities`, `GET /audit-logs`, `GET /security/events`, and `GET /reports/activity` are administrator endpoints.
- `GET /notifications` and `PATCH /notifications/{id}/read` are user notification endpoints.
- `GET /analytics/storage`, `/analytics/users/storage`, `/analytics/files`, `/analytics/downloads`, `/analytics/sharing` provide storage and activity analytics.
- `GET /health` and `/docs` are public.
To create a production frontend build:

```bash
cd frontend
npm run build
```

## API endpoints

Administrator endpoints require `X-Admin-Token` when `TRUSTSHARE_ADMIN_TOKEN` is set. If the variable is unset, the current implementation allows those requests without a token.

The activity endpoint is the integration seam for existing authentication, file-management, and secure-sharing APIs. Call it after those operations with a trusted user identity; do not accept a caller-supplied identity as proof of authentication in production. The React dashboard is currently a self-contained visual demo; connect its data hooks to these endpoints when merging it into the Milestone 1–2 frontend.
| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Health status |
| `POST` | `/activities` | Event ingestion | Record activity, append audit entry, trigger detection and relevant notifications |
| `GET` | `/activities` | Admin | List events; supports `user_id`, `activity_type`, `status`, `start`, `end`, `limit` filters |
| `GET` | `/audit-logs` | Admin | Search audit entries; supports `user_id`, `file_id`, `activity_type`, `status`, `start`, `end`, `limit` |
| `GET` | `/audit-logs/user/{user_id}` | Admin | Audit history for a user |
| `GET` | `/audit-logs/file/{file_id}` | Admin | Audit history for a file |
| `GET` | `/notifications` | Demo user scope | List notifications; supports `user_id` and `unread_only` |
| `PATCH` | `/notifications/{notification_id}/read` | Demo user scope | Mark a user's notification as read; accepts `user_id` |
| `GET` | `/security/events` | Admin | List events; supports `severity`, `event_type`, `status`, `user_id` |
| `PATCH` | `/security/events/{event_id}/resolve` | Admin | Resolve a security event |
| `GET` | `/reports/activity` | Admin | Activity totals and events; supports `user_id`, `activity_type`, `start`, `end` |
| `GET` | `/reports/security` | Admin | Security event totals by severity; supports `start`, `end` |
| `GET` | `/analytics/storage` | Admin | Overall storage usage |
| `GET` | `/analytics/users/storage` | Admin | Storage grouped by file owner |
| `GET` | `/analytics/files` | Admin | File counts, popular files, uploads by date |
| `GET` | `/analytics/downloads` | Admin | Download totals and popular files |
| `GET` | `/analytics/sharing` | Admin | Shared file and link event counts |

## Detection defaults
Date filters accept timestamp strings comparable to the stored ISO 8601 timestamps. `limit` on activity and audit listings ranges from 1 to 500.

More than 5 failed logins within 10 minutes; more than 20 downloads within 5 minutes; repeated unauthorized access; and repeated attempts to use expired or revoked links. Tune thresholds in `backend/app/security_monitoring/detection.py`.
## Sample API requests

Check service health:

```bash
curl http://127.0.0.1:8000/health
```

Record a file share (PowerShell users can use `curl.exe`):

```bash
curl -X POST http://127.0.0.1:8000/activities \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u-olivia","username":"Olivia Rhye","activity_type":"share","file_id":"f-001","file_name":"Q4-financial-report.pdf","recipient_user_id":"u-phoenix","description":"Shared Q4 financial report","status":"success","ip_address":"192.0.2.10"}'
```

List recent activity as an administrator (include the token header if configured):

```bash
curl "http://127.0.0.1:8000/activities?activity_type=share&limit=20" \
  -H "X-Admin-Token: replace-with-a-local-demo-token"
```

Read unread notifications for a demo user:

```bash
curl "http://127.0.0.1:8000/notifications?user_id=u-olivia&unread_only=true"
```

Inspect storage analytics:

```bash
curl http://127.0.0.1:8000/analytics/storage \
  -H "X-Admin-Token: replace-with-a-local-demo-token"
```

## Detection rules

Rules are configured in [`backend/app/security_monitoring/detection.py`](backend/app/security_monitoring/detection.py). Current thresholds are at least 5 failed logins within 10 minutes, 20 downloads within 5 minutes, 3 unauthorized access events within 10 minutes, 3 expired-link attempts within 30 minutes, and 3 revoked-link attempts within 30 minutes. Counts are evaluated by user ID or IP address.

## Future improvements

- Connect the dashboard to the API and replace hard-coded UI metrics with live data.
- Add authentication, role-based authorization, and per-user ownership checks.
- Use a production database, schema migrations, and configurable deployment settings.
- Add automated tests for API routes, detection rules, and database behavior.
- Add pagination and export formats for reports and audit records.
- Improve notification delivery with retry handling and delivery status tracking.
- Add deployment documentation, container support, and CI checks.

## License

See [LICENSE](LICENSE).
