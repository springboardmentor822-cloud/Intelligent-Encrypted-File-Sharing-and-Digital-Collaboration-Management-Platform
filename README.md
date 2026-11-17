# TrustShare · Milestone 3

Monitoring, notifications, audit history, reports, storage analytics, and suspicious activity detection for the TrustShare application.

> This checkout was empty when Milestone 3 was started. This project provides the Milestone 3 dashboard and API as an integration-ready demo; it does not replace the Milestone 1–2 upload, encryption, or sharing workflows.

## Run

### Dashboard

```powershell
cd frontend
npm install
npm run dev
```

### API

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API creates a local SQLite demo database at `backend/trustshare.db` and seeds illustrative activity, notification, file, and security records on first run. SQLite is used as a self-contained stand-in because this checkout contains no existing PostgreSQL or MongoDB configuration. Set `TRUSTSHARE_ADMIN_TOKEN` and send `X-Admin-Token` to protect administrator endpoints. The browser dashboard uses realistic local demo data and remains usable if the API is offline.

Optional email delivery uses `SMTP_HOST`, `SMTP_PORT` (default `587`), `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`. Map a notification user ID to an address with `TRUSTSHARE_EMAIL_<USER_ID>` (uppercase, hyphens replaced by underscores), for example `TRUSTSHARE_EMAIL_U_OLIVIA=olivia@example.com`.

## API overview

- `POST /activities` records activity and audit entries and evaluates suspicious-activity rules. For a `share` event, pass `recipient_user_id` so the recipient gets a notification.
- `GET /activities`, `GET /audit-logs`, `GET /security/events`, and `GET /reports/activity` are administrator endpoints.
- `GET /notifications` and `PATCH /notifications/{id}/read` are user notification endpoints.
- `GET /analytics/storage`, `/analytics/users/storage`, `/analytics/files`, `/analytics/downloads`, `/analytics/sharing` provide storage and activity analytics.
- `GET /health` and `/docs` are public.

The activity endpoint is the integration seam for existing authentication, file-management, and secure-sharing APIs. Call it after those operations with a trusted user identity; do not accept a caller-supplied identity as proof of authentication in production. The React dashboard is currently a self-contained visual demo; connect its data hooks to these endpoints when merging it into the Milestone 1–2 frontend.

## Detection defaults

More than 5 failed logins within 10 minutes; more than 20 downloads within 5 minutes; repeated unauthorized access; and repeated attempts to use expired or revoked links. Tune thresholds in `backend/app/security_monitoring/detection.py`.
