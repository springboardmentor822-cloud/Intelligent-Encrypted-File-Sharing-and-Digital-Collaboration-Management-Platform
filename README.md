# TrustShare - Secure Encrypted File Sharing Platform

FastAPI + React + PostgreSQL + MongoDB + Redis. Files are encrypted with **AES-256-GCM** before they are stored.

## Option A: run everything with Docker (easiest)

1. Install Docker Desktop and start it.
2. Open a terminal in this folder (`trustshare/`) and run:

```bash
docker compose up --build
```

3. Wait 1-2 minutes the first time. Then open:
   - App: http://localhost:3000
   - API docs (Swagger): http://localhost:8000/docs
   - Health check: http://localhost:8000/health

A `.env` file with random secrets is already included. **Never upload `.env` to GitHub** (it is in `.gitignore`).

Stop with `Ctrl+C`, then `docker compose down`. Add `-v` to also delete all data.

## Option B: development mode (backend and frontend outside Docker)

```bash
# 1. databases only
docker compose up -d postgres mongo redis

# 2. backend (new terminal)
cd backend
python -m venv venv
venv\Scripts\activate            # Windows PowerShell   (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt
uvicorn app.main:app --reload

# 3. frontend (another terminal)
cd frontend
npm install
npm run dev                      # http://localhost:5173
```

## Version 3.1: access control, 1 GB storage, new home page
* **How to become the administrator** (this is why you only saw "Standard User"): put your e-mail in `.env` as `ADMIN_EMAIL=you@example.com` (optionally `ADMIN_PASSWORD=...` to create it), then `docker compose up -d --build`. At every start that account gets the admin role. Or, any time:
  ```powershell
  docker compose exec backend python scripts/make_admin.py you@example.com
  ```
  Then log out and in again: the navy **Admin panel** opens.
* **Access Control** (Admin panel): approve or decline new accounts, block IP addresses (by hand or automatically by a detection rule), and **tripwire files** (decoys that alert when touched).
* **Storage is 1 GB** for the platform and for each user (`STORAGE_LIMIT_MB=1024`). Storage Analytics shows the gauge, warning levels (80% / 95%), per-user use and a days-until-full forecast. Alerts are raised when it fills up.
* **Separate worlds:** users get *My Security* (their own data only). The *Security Dashboard*, Threat Monitor and every admin page answer 403 to non-admins (enforced on the server).
* New **home page** with a live encryption lab, and an **Admin Mode** bar in the admin panel.

## Security Dashboard (both panels)
* **User panel:** *Security Dashboard* is now the **2nd menu item**, right after Dashboard. It shows your logins (success / failed), actions denied to you, attempts by others on your files, security events about your account, login and access charts, recent logins, the **Activity Analytics** graphs (storage donut, uploads, downloads, sharing, recent tables) and the ten protection layers.
* **Admin panel:** *Security Dashboard* is also the **2nd menu item**; it covers the whole platform and includes the same Activity Analytics graphs, plus the Threat Monitor tab.
* The Admin panel only appears for an administrator. You are in the user panel if the top-right says "Standard User".

## Version 3 (Milestone 3) - start here

**If the UI looks unchanged after an update, read `docs/WHY_THE_UI_DID_NOT_CHANGE.md`.** Short version: unzip into a NEW folder, copy your `.env` into it, then in the VS Code terminal:
```powershell
powershell -ExecutionPolicy Bypass -File .\update.ps1
```
The bottom of the sidebar must read `TRUSTSHARE v3.0.0 · AURORA`.

What v3 adds (full list with file names: `docs/MILESTONE3_CHECKLIST.md`):
* **New look**: four colour themes (Aurora violet/coral is the default, plus Ocean, Emerald, Sunset) from the palette button in the header; dark glowing sidebars, animated dashboards.
* **Admin panel menu**: Dashboard, **Security Dashboard**, Monitor (User Activity, Audit Logs, Security Alerts, Activity Feed), Insights (Reports, Storage Analytics, File Analytics, Sharing Reports), Manage (User Management, File Management, Notifications, System Monitoring), Settings.
* **Audit Logs** with the milestone API names, filters and CSV export; **Reports** (uploads, downloads, sharing, security); **Storage Analytics** with filters.
* **Detection rules you can edit** (threshold, time window, severity Low/Medium/High) and **test scenarios** that prove each rule works.
* **Notifications**: types, history page, unread count, per-user e-mail switch, admin announcements, e-mail delivery log, SMTP test.

## What is new in version 2 (mentor changes + Milestone 2 completion)

* **Two panels, styled like the mockups** (blue + white, red for failures and alerts):
  * **User panel** (light sidebar): Dashboard, My Files, Shared with Me, Shared by Me, Recent, Favorites, Trash, Storage, File Analytics, Activity Logs, Security, Settings.
  * **Admin panel** (navy sidebar, admins only, opens right after an admin logs in): Dashboard, User Management, File Management, Sharing Reports, **Security Dashboard**, Analytics, System Monitoring, Activity Logs, Settings.
* Videos (`.mp4`, `.mov`, `.webm`) can be uploaded (25 MB limit) so the analytics show Documents / Images / Videos / Others.
* **File Analytics**: summary cards with % change vs the previous period, storage donut, upload / download / sharing charts, recent uploads and downloads, one date-range dropdown (7/30/90 days or custom).
* **Admin Security Dashboard** (`/admin/security`, with % change vs the previous period): login monitoring, unauthorized + blocked attempts, security events (repeated failures, suspicious IP, unauthorized access, policy violations, file threats), recent logins with location, audit monitoring. **Locked on the server** with `require_roles("admin")`.
* **User Security page**: ten cards (AES-256, TLS, JWT, OAuth2, RBAC, temporary links, download tracking, audit logging, secure tokens, key rotation). **Learn More** opens live numbers for that layer.
* **Trash** (30-day restore), **Favorites**, **Recent**, **Shared by Me**.
* **OAuth2**: `POST /auth/token` (works with the Authorize button in `/docs`) + optional Google sign-in.
* Share links now also die when the file is trashed or the link creator loses the right to share it.
* Docs: `docs/KEY_MANAGEMENT.md`, `docs/MILESTONE2_CHECKLIST.md`, `docs/DATABASE_SCHEMA.md`, `docs/S3_SETUP.md`, `docs/OAUTH2_SETUP.md`, Postman collection.

### New look of the dashboards (mentor feedback)
* **Dashboard** (user): animated hero with a floating shield, count-up numbers with sparklines, a protection-score ring, a 7x24 **activity heatmap** (when your vault is busiest), quick-action tiles and a live activity feed.
* **Admin Dashboard = Command Center**: platform security level (CALM / ELEVATED / HIGH), live numbers, platform heatmap, service health, live security feed and shortcuts.
* **Security Dashboard is now the 2nd item** in the admin sidebar, right after Dashboard, and it also contains the **Activity Analytics** graphs (storage donut, upload / download / sharing charts, recent uploads and downloads) for the whole platform. It has three parts: Overview (with analytics), Threat Monitor.

### Threat Monitor (inside the admin Security Dashboard)
Open **Security Dashboard → Threat Monitor** (second tab). It answers three questions:
1. **Who tried to enter an admin area without being an admin?** Every signed-in non-admin who calls an admin page or API is listed (name, e-mail, what they tried, IP, how many times).
2. **Who is trying to log in?** A live feed of every attempt (known or *unknown account*, reason, IP, location), plus "accounts being targeted" and "attacking IP addresses" with a risk level.
3. **Which triggers exist?** Six automatic rules; each one creates an alert and **notifies every admin** (bell, a red pop-up that appears within 8 seconds on any admin page, and e-mail if SMTP is set). Open alerts also show as a red number on the sidebar.

**Check the alert pipeline first:** Threat Monitor → *Active triggers* → **Send test alert**. Within 8 seconds you should see a pop-up, a number on the bell and a new row in "Recent threat alerts". If you do, notifications work.

**Then try the real triggers:**
1. Non-admin in an admin area: in a private window log in as a *normal user* and type `http://localhost:3000/admin` (the browser sends you back to your dashboard **and tells the server**). Or call an admin API from `http://localhost:8000/docs` while authorized as that user (RBAC answers 403).
2. Admin account under attack: 3 wrong passwords for the admin e-mail.
3. Unknown accounts: 3 wrong logins with 3 different made-up e-mails.
4. New admin IP: sign in as admin from another network/device.

No Docker needed to see the rules work: `cd backend` then `python scripts/check_triggers.py`.

If nothing appears: `docker compose logs backend --tail 60` (look for `SECURITY ALERT` lines or `Audit logging failed`), and make sure you ran `docker compose up --build`.

### See the Security Dashboard come alive (demo)
1. Log in as the admin, open **Security Dashboard**.
2. In a private window try a wrong password 5 times for any email → "Repeated login failures" alert.
3. Try wrong passwords for 3 different emails → "Suspicious IP access" alert.
4. Create a text file containing the harmless EICAR test string and upload it → blocked, "Potential file threat" alert.
5. Log in as a normal user and open `http://localhost:3000/admin/security` → redirected; calling `GET /reports/security-dashboard` by hand → **403**, and the attempt appears in the audit log as `admin_access`.

## Updating from the previous version

Your data is kept. Just replace the code and rebuild:

```bash
docker compose up --build
```

Keep your existing `.env` file (it holds your database passwords and encryption master key). Do **not** run `docker compose down -v`, or the data is deleted.

## First steps in the app

1. Sign up with **admin@trustshare.com** (set as `ADMIN_EMAIL` in `.env`): this account becomes **Admin**. Other accounts become **User**.
2. Upload a PDF/image. Look in `backend/uploads/` (or the Docker volume): the stored `.enc` file is unreadable ciphertext.
3. Click Share to create a link (expiry, download limit, password, view-only). Open it in a private window.
4. Open **File Analytics** and **Activity Logs** to see your charts and audit log.
5. As admin, open **Admin Dashboard** (users, storage, encryption keys) and **Security Dashboard** (sidebar, Control room).
   Platform capacity shown there comes from `PLATFORM_STORAGE_GB` (default 10 GB; add it to `.env` to change).

## Run the tests

```bash
cd backend
pip install -r requirements.txt
pytest -v
```

## Folder map

```
backend/app/core/       config, security (bcrypt/JWT/TOTP), crypto (AES-256), storage (local/S3), validation, deps (RBAC)
backend/app/db/         PostgreSQL, MongoDB, Redis connections
backend/app/models/     PostgreSQL tables + MongoDB documents
backend/app/routers/    auth, folders, files, share, analytics, reports, admin, notifications
backend/app/services/   audit + security monitoring, geo lookup, trash purge, notifications (email), decrypt helpers, expiry reminders
backend/scripts/        verify_encryption.py (proves stored bytes are unreadable)
backend/tests/          pytest: encryption integrity, security, validation, storage, API guards
frontend/src/           React pages + components (Vite, Tailwind, Axios, Zustand, Recharts)
docker-compose.yml      all 5 services with healthchecks
```

## Using AWS S3 instead of local disk

In `.env` set `STORAGE_BACKEND=s3`, `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and restart. Nothing else changes: the same encrypted bytes go to S3.
