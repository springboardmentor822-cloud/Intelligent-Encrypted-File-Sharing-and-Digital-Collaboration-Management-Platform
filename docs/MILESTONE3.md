# Milestone 3: Monitoring, Notifications and Analytics

How each task in the Milestone 3 guide is implemented, where to find it in the app, and how to demonstrate it.
The app is one FastAPI service, so the "modules" in the guide are implemented as service and API files rather than
separate folders (same behaviour, simpler wiring).

| Task | Implementation | Where to see it (Admin sidebar) |
|---|---|---|
| 1. Activity monitoring | `services/audit_service.py` records logins, logouts, failed logins, uploads, downloads, shares, file access, link creation / expiry / revocation and unauthorized attempts. Link expiry is recorded by a background job (`services/scheduler.py`). Fields: log id, user id, activity type, file id, status, IP, timestamp. Stored in MongoDB. | Activity Logs, Audit Logs |
| 2. Audit logging | `audit_logs` collection; one reusable writer `log_audit()` used by auth, files, folders, sharing, admin and security code. Retrieval API in `api/audit.py` (`/audit-logs`, `/user/{id}`, `/file/{id}`, `/filter`) with filters for user, activity type, file name or ID, date range and status. Admin-only. | Audit Logs |
| 3. Notifications and alerts | `notifications` table (PostgreSQL). Notifications for shares, downloads, link opens, security alerts, expiry reminders and expired links. Email through SMTP (MailHog in development). UI: bell with unread count, full history page, mark-as-read; admin management page with broadcast. | Bell (top right), Notifications (user), Notifications (admin) |
| 4. Reports | `api/reports.py`: uploads, downloads, sharing, per-user activity and security reports with filters and CSV export. | Reports |
| 5. Storage analytics | `api/analytics_admin.py`: total storage, user-wise storage, file / download / sharing statistics, most-downloaded files; pie, bar and line charts; filters for date range, user, file type and activity type. | Storage Analytics |
| 6. Suspicious activity | `services/detection_service.py` and `detection_rules.py` (plus lockout and download-spike rules in `threat_service.py`). Alerts have an alert ID, user, severity and status (open, investigating, resolved) and notify administrators. `api/security_monitoring.py` and the Security Monitoring page. | Security Monitoring, Security Dashboard |

## Detection rules (thresholds are configurable in `.env`)
| Rule | Default | Setting |
|---|---|---|
| Failed logins | 5 failures in 15 minutes locks the account and raises a high alert | `LOGIN_MAX_FAILURES`, `LOGIN_LOCK_MINUTES` |
| Excessive downloads | more than 20 downloads in 10 minutes by one user (medium) | `DOWNLOAD_ANOMALY_THRESHOLD` |
| Repeated unauthorized access | 3 denied requests by one user in 10 minutes (high) | `DETECT_UNAUTHORIZED_MAX`, `DETECT_WINDOW_SECONDS` |
| Expired / revoked link access | every attempt creates a low alert and notifies admins (once per visitor per window); 3 attempts from one IP raises a medium alert | `DETECT_LINK_ATTEMPTS_MAX` |

After changing `.env`: `docker compose up -d` (recreates the backend with the new values).

## Test scenarios (Task 6, Step 8) and where to look afterwards
Open **Admin > Security Monitoring** (alerts and counters), **Audit Logs**, **Reports > Security**, and the notification bell.

1. **Repeated wrong password.** On the login page enter a wrong password 5 times for one account.
   Expected: the 5th is followed by "Too many failed attempts"; alert "Multiple failed login attempts" (high); admin notification.
2. **File access without permission.** Run `py scripts/smoke_test.py` (user B tries user A's file and admin pages).
   Expected: "Unauthorized access attempt" alerts and, after 3, "Repeated unauthorized access" (high); counted as unauthorized attempts.
3. **Repeated downloads.** Set `DOWNLOAD_ANOMALY_THRESHOLD=3` in `.env`, run `docker compose up -d`, then download one file 4 times.
   Expected: "File download anomaly" (medium).
4. **Expired link.** Create a share link, then force it to expire:
   `docker compose exec postgres psql -U trustshare -d trustshare -c "UPDATE share_links SET expires_at = now() - interval '1 minute' WHERE revoked_at IS NULL;"`
   and open the link. Expected: "This link has expired"; alert "Attempt to use an expired share link"; within 2 minutes an audit entry `share.link_expired`.
5. **Revoked link.** Create a link, revoke it under *Shared by Me*, then open it.
   Expected: "The owner has revoked this link"; alert "Attempt to use a revoked share link".

In Security Monitoring change an alert's status to *investigating* or *resolved*; the change is audited (`security.event_status`).

## Final integration checklist
1. Register and sign in as a user. 2. Upload a file. 3. Confirm a `.bin` appears in `storage_data` (encrypted).
4. Share with a second user. 5. Download as that user. 6. Check Activity / Audit Logs and notifications (bell on both accounts).
7. Trigger scenarios 1 to 5. 8. Sign in as admin. 9. Check Reports, Storage Analytics, Audit Logs, Security Monitoring and Security Dashboard.

The seven admin sections of the guide map to the sidebar: User Activity Monitoring (Activity Logs, Reports > User activity),
File Activity Reports (Reports), Audit Logs, Storage Analytics, Notification Management, Security Monitoring, Suspicious Activity Alerts (Security Monitoring).
