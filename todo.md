# TrustShare — Admin Visit + Encryption Transparency + Live Threat Alerts

## Phase 1 — Backend: Admin Visit gate
- [x] config: admin_visit_password (default 123meadmin), admin_visit_minutes
- [x] routers/admin_visit.py: status, unlock, lock (rate-limited, audited, alert on failure)
- [x] deps.require_admin: accept X-Admin-Visit scope token (any user with password)
- [x] main.py: include router

## Phase 2 — Backend: encryption registry + abnormal activity
- [x] /admin/security/encryption: per-file key registry + summary + KEK versions
- [x] /admin/security/encryption/{id}/verify: decrypt+verify integrity, alert on failure
- [x] raise alerts on integrity failure, key drift, abnormal download, new-location login
- [x] /admin/security/live: poll payload for LED trigger

## Phase 3 — Backend: tests
- [x] admin visit: wrong password denied+alert, correct password elevates, non-admin blocked without token
- [x] encryption registry shape, verify endpoint
- [x] live endpoint

## Phase 4 — Frontend: Admin Visit
- [x] api.ts X-Admin-Visit header + 403 handling
- [x] AdminVisit page (password gate, session badge, exit)
- [x] nav item + route + Guard allows elevated users
- [x] admin shell shows admin-visit session + exit button

## Phase 5 — Frontend: Security Dashboard
- [x] Encryption & Key Registry panel (summary, per-file keys, verify, KEK chart)
- [x] LED glow alert trigger + polling + animations in index.css
- [x] abnormal activity surfaced in alerts feed

## Phase 6 — Frontend: shared-with-me passcode
- [x] passcode prompt for protected direct shares

## Phase 7 — Build & package
- [x] npm build
- [x] pytest
- [x] new zip
