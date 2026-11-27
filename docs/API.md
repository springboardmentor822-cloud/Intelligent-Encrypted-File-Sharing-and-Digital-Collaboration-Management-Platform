# API reference

Base URL `http://localhost:8000/api/v1`. Interactive docs: `http://localhost:8000/docs`.
Authenticated routes need `Authorization: Bearer <access token>`. "admin" routes return **403** for other roles.

## Authentication (`/auth`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/register`, `/login`, `/refresh`, `/logout` | account and session lifecycle |
| POST | `/mfa/verify` | second step of sign-in |
| POST | `/mfa/setup`, `/mfa/enable`, `/mfa/disable` | TOTP two-factor |
| GET/PATCH | `/me` | profile |
| POST | `/forgot-password`, `/reset-password`, `/change-password` | password recovery |
| GET/DELETE | `/sessions`, `/sessions/{sid}` | list / revoke sessions |
| GET | `/oauth/providers`, `/oauth/{provider}/login`, `/oauth/{provider}/callback`; POST `/oauth/exchange` | Google / Microsoft sign-in |

## Files and folders
| Method | Path | Purpose |
|---|---|---|
| POST | `/files/upload` | validate, encrypt, store |
| GET | `/files?view=all\|recent\|favorites\|trash&q&category&sort&folder_id` | list / search / filter |
| GET | `/files/{id}`, `/files/{id}/versions` | metadata, versions |
| GET | `/files/{id}/download`, `/files/{id}/view` | decrypt and deliver (permission checked every time) |
| POST | `/files/{id}/versions` | upload a new version |
| PATCH/DELETE | `/files/{id}` | rename, move, favourite / move to trash |
| POST/DELETE | `/files/{id}/restore`, `/files/{id}/permanent` | restore / erase |
| GET | `/files/storage/usage` | quota and usage by type |
| GET/POST | `/folders` | list / create; PATCH, DELETE `/folders/{id}` |

## Sharing
| Method | Path | Purpose |
|---|---|---|
| POST/GET | `/shares/links`, `/shares/links?file_id=` | create / list links (token shown once, only its hash is stored) |
| DELETE | `/shares/links/{id}` | revoke |
| POST/GET/DELETE | `/shares/users`, `/shares/users/{id}` | share with a person |
| GET | `/shares/with-me`, `/shares/by-me`, `/shares/activity?file_id=` | lists and share activity |
| GET | `/public/share/{token}`, `/view`, `/download` | link access, no login; expiry, revocation, limits and permission checked each time |

## Notifications, analytics, personal security
| Method | Path | Purpose |
|---|---|---|
| GET | `/notifications?limit=` | history and unread count |
| POST | `/notifications/read-all`, `/notifications/{id}/read` | mark read |
| GET | `/analytics/files?start&end` | your own storage / upload / download / share analytics |
| GET | `/security/overview`, `/security/my-logins`, `/activity` | your Security page and activity log |

## Administration (admin only)
| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/overview`, `/admin/analytics`, `/admin/system`, `/admin/sharing` | dashboards |
| GET/POST/PATCH | `/admin/users`, `/admin/users/{id}`; POST `/unlock`, `/reset-mfa` | user management |
| GET/DELETE | `/admin/files`, `/admin/files/{id}` | file inventory (metadata only) |
| GET/POST | `/admin/keys`, `/admin/keys/rotate` | key status / re-wrap data keys |
| GET | `/admin/security/summary`, `/logins`, `/events`, `/access-attempts` | Security Dashboard data |
| GET | `/admin/audit-logs`, `/admin/audit-logs/export` | audit trail (legacy view) and CSV |

### Audit logs (Milestone 3, Task 2)
Filters on every route: `user_id`, `activity_type` (group such as `file` or exact such as `file.download`), `file_id`, `file_name`,
`status` (`success`/`failed`), `start`, `end`, `q`, `page`, `page_size`.
| Path | Purpose |
|---|---|
| `GET /audit-logs` | all logs |
| `GET /audit-logs/user/{user_id}` | one user's logs |
| `GET /audit-logs/file/{file_id}` | activity for one file |
| `GET /audit-logs/filter` | filter by date, activity type, status, user, file |
| `GET /audit-logs/types` | distinct activity types |

### Reports (Task 4), filters: `start`, `end`, `user_id`, `file_type`, `file_id`
`GET /reports/uploads` · `/reports/downloads` · `/reports/sharing` · `/reports/users/{user_id}/activity` · `/reports/security`

### Storage analytics (Task 5), filters: `start`, `end`, `user_id`, `file_type`
`GET /admin/analytics/storage` · `/users/storage` · `/files` · `/downloads` · `/sharing` · `/overview`

### Security monitoring (Task 6)
| Path | Purpose |
|---|---|
| `GET /security-monitoring/summary` | counters and recent alerts |
| `GET /security-monitoring/events?user&event_type&severity&status&start&end` | filter alerts |
| `PATCH /security-monitoring/events/{id}` body `{"status":"open\|investigating\|resolved"}` | alert workflow |
| `GET /security-monitoring/rules` | detection rules in force |

### Notification management (Task 3)
`GET /admin/notifications?type&read&user_id` · `POST /admin/notifications/broadcast` body `{title, message, audience, send_email}`
