# Milestone 3 - Monitoring, Notifications and Analytics: where every requirement lives

Legend: ✅ already existed in version 2 · 🆕 added or completed in version 3

## Task 1 - Activity monitoring
| Requirement | Status | Where | How to show it |
|---|---|---|---|
| Record login, logout, success and failed logins, uploads, downloads, sharing, file access, link creation / **expiration** / revocation, unauthorized attempts | ✅ 🆕 (link expiry) | `services/audit.py` `log_event()` called from every router; expiry: `services/reminders.py` `log_expired_links()` | Admin → Audit Logs, filter activity type |
| Activity ID, user ID, type, file ID, status, IP, timestamp stored in MongoDB | ✅ | collection `audit_logs` | see "Database structure" |
| Connected to existing APIs automatically | ✅ | auth, files, share, admin routers | Perform an action, open Audit Logs |
| 🆕 User Activity Monitoring screen (per user: logins, failed, uploads, downloads, shares, denied, last IP, online) + timeline | 🆕 | `routers/activity.py`, `pages/AdminUserActivity.jsx` | Admin → User Activity |

## Task 2 - Audit logging
| Requirement | Status | Where |
|---|---|---|
| `audit_logs` collection, reusable `log_event()` | ✅ | `services/audit.py` |
| Log ID, user ID, **username**, type, file ID, **description**, status, IP, date | 🆕 (username + description) | `services/audit_view.py` (`describe`, `to_rows`) |
| Retrieval APIs `GET /audit-logs`, `/audit-logs/user/{id}`, `/audit-logs/file/{id}`, `/audit-logs/filter` | 🆕 | `routers/audit_logs.py` |
| Filters: user, activity type, file name/ID, date range, status | 🆕 | same + `pages/AdminAuditLogs.jsx` |
| Admin only; records cannot be modified | ✅ 🆕 | `require_roles("admin")`; only GET routes exist (tested) |
| CSV export | 🆕 | `GET /audit-logs/export` |

## Task 3 - Notifications and alerts
| Requirement | Status | Where |
|---|---|---|
| Notification module, MongoDB `notifications` with id, user, title, message, **type**, read flag, time | ✅ 🆕 (type) | `services/notifications.py` |
| Share notification (recipient, file name, sender) | ✅ 🆕 (sender e-mail) | `routers/files.py` |
| Download notification to the owner (file name, **who**, **time**) | ✅ 🆕 | `routers/files.py` (people), `routers/share.py` (links) |
| Security notifications to admins | ✅ | `services/audit.py` `create_alert` |
| Link expiry reminder + **expired** notice | ✅ 🆕 | `services/reminders.py` |
| E-mail integration (SMTP) + **delivery log** + **test e-mail** | ✅ 🆕 | `send_email`, `email_log`, `POST /admin/notifications/test-email` |
| UI: bell, unread **number**, messages, date/time, mark as read, **history page**, delete, e-mail on/off | ✅ 🆕 | `Layout.jsx` bell, `pages/Notifications.jsx` |
| 🆕 Notification management for admins (stats, e-mail log, announcements) | 🆕 | `routers/notification_admin.py`, `pages/AdminNotifications.jsx` |

## Task 4 - Reports
| Requirement | Status | Where |
|---|---|---|
| Upload report: total, per user, date/time, type, status | 🆕 | `GET /reports/uploads` |
| Download report: total, per user, most downloaded, date/time, failed attempts | 🆕 | `GET /reports/downloads` |
| Sharing report: total shared, per user, recipients, active / expired / revoked links | 🆕 | `GET /reports/sharing` |
| User activity report | 🆕 | `GET /activity/users/{id}` (+ Audit Logs by user) |
| Security report: failed logins, unauthorized, suspicious downloads, expired-link attempts, alerts | 🆕 | `GET /reports/security` |
| Filters (user, activity type, file, dates) + CSV | 🆕 | `routers/report_center.py`, `pages/AdminReports.jsx` |

## Task 5 - Storage analytics
| Requirement | Status | Where |
|---|---|---|
| Real file metadata from PostgreSQL | ✅ | `files` table |
| `GET /analytics/storage` | ✅ | `routers/analytics.py` |
| `GET /analytics/users/storage`, `/files`, `/downloads`, `/sharing` | 🆕 | `routers/storage_analytics.py` |
| Total storage, files, per-user storage, uploads, downloads, sharing, most downloaded | 🆕 | `pages/AdminStorage.jsx` |
| Pie (storage by user), bar (uploads by date), line (downloads), sharing chart | 🆕 | same (Recharts) |
| Filters: date range, user, file type, activity type | 🆕 | same |

## Task 6 - Suspicious activity detection
| Requirement | Status | Where |
|---|---|---|
| Detection rules: failed logins, unauthorized access, excessive downloads, **expired** link access, **revoked** link access | ✅ 🆕 (expired / revoked are separate rules) | `services/detection.py` |
| Rules configurable ("the team should configure limits") | 🆕 | Admin → Security Alerts → Detection rules (saved in MongoDB) |
| Runs on every new activity, stores events, alert id, user, activity, time, **severity Low / Medium / High**, notifies admin | ✅ 🆕 | `services/audit.py` `_evaluate` |
| Security monitoring page: totals, failed logins, unauthorized, suspicious downloads, expired-link attempts, recent alerts | 🆕 | `pages/AdminAlerts.jsx`, `pages/AdminSecurity.jsx` |
| Filters: user, type, severity, date, status | 🆕 | `GET /security/events` |
| Test the five scenarios | 🆕 | Security Alerts → **Test scenarios** (safe, marked SIMULATED) · `python scripts/check_triggers.py` |

## Final integration - the unified Admin Dashboard
| Module | Menu item |
|---|---|
| User Activity Monitoring | Monitor → User Activity |
| File Activity Reports | Insights → Reports |
| Audit Logs | Monitor → Audit Logs |
| Storage Analytics | Insights → Storage Analytics |
| Notification Management | Manage → Notifications |
| Security Monitoring | Security Dashboard (2nd item) |
| Suspicious Activity Alerts | Monitor → Security Alerts |

## Database structure
**PostgreSQL** (users, roles, files, shared_links, file_permissions, favorites, folders) - unchanged tables, see `DATABASE_SCHEMA.md`.

**MongoDB**
| Collection | Fields |
|---|---|
| `audit_logs` | `_id` (log / activity id), `user_id`, `user_email`, `action` (activity type), `result` (success / failure), `resource_type`, `resource_id` (file id), `owner_id`, `details` {name, reason, ...}, `ip`, `location`, `severity`, `timestamp` |
| `security_alerts` | `_id` (alert id), `type`, `severity` (info / warning / critical = Low / Medium / High), `message`, `user_id`, `ip`, `details` {rule, email, ...}, `resolved`, `resolved_at`, `resolved_by`, `resolution_note`, `created_at` |
| `detection_rules` | `_id` (rule id), `enabled`, `threshold`, `window_seconds`, `severity` (only saved changes; defaults live in code) |
| `notifications` | `user_id`, `title`, `message`, `type`, `link`, `read`, `email_status`, `created_at` |
| `notification_prefs` | `_id` (user id), `email_enabled` |
| `email_log` | `to`, `subject`, `status` (sent / failed / skipped), `error`, `kind`, `created_at` |

## API list (all need a login; "admin" = administrator only)
| Method and path | Who | Purpose |
|---|---|---|
| GET /audit-logs, /audit-logs/filter, /audit-logs/user/{id}, /audit-logs/file/{id}, /audit-logs/export | admin | audit history |
| GET /activity/users, /activity/users/{id} | admin | user activity monitoring |
| GET /security/summary, /security/events · PATCH /security/events/{id} | admin | security monitoring |
| GET /security/rules · PUT /security/rules/{id} · POST /security/rules/{id}/reset | admin | detection rules |
| GET /security/scenarios · POST /security/simulate | admin | test scenarios |
| GET /reports/uploads, /downloads, /sharing, /security (`format=csv`) | admin | reports |
| GET /analytics/overview, /users/storage, /files, /downloads, /sharing | admin | storage analytics |
| GET /notifications, /notifications/history, /preferences · POST /notifications/{id}/read, /read-all · DELETE /notifications/{id} · PUT /notifications/preferences | user | notifications |
| GET /admin/notifications/overview · POST /admin/notifications/broadcast, /test-email | admin | notification management |

## Screenshots to add to the submission
See `docs/screenshots/README.md`.
