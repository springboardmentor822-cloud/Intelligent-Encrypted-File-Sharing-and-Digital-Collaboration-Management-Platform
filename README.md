# TrustShare: Secure File-Sharing System

FastAPI + Next.js platform with server-side **AES-256-GCM envelope encryption**, JWT/MFA/OAuth2 authentication,
role-based access control, expiring and revocable share links, audit logging, reports, storage analytics and
rule-based suspicious-activity detection.

## Run it

```
python scripts/generate_env.py        # first time only: creates .env with random secrets
docker compose up -d                  # start everything
docker compose ps                     # check all services are running
```

| What | Address |
|---|---|
| App | http://localhost:3000 |
| API documentation | http://localhost:8000/docs |
| Emails sent by the app (dev) | http://localhost:8025 |

Encrypted files are stored in `./storage_data` (unreadable `.bin` files). Back up `MASTER_KEYS` from `.env`:
without it encrypted files cannot be decrypted. Never run `docker compose down -v` (it deletes all data).

**First admin:** sign in with the admin account created at first start (`ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`),
or promote any account:
`docker compose exec postgres psql -U trustshare -d trustshare -c "UPDATE users SET role='admin' WHERE email='you@example.com';"`

## Architecture

```
Next.js (Tailwind, Axios, Recharts) --HTTPS--> FastAPI --+--> PostgreSQL  users, files, versions, wrapped keys, shares, notifications
                                                          +--> MongoDB     audit, login, security-event, access-attempt, download logs
                                                          +--> Redis       sessions, rate limits, lockouts, detection counters, cache
                                                          +--> Storage     encrypted files: local folder (dev) or AWS S3 (production)
```

Upload: validate (type, size, magic bytes) -> new random 256-bit key -> AES-256-GCM encrypt -> store ciphertext ->
store the **wrapped** key + metadata in PostgreSQL. Download: authenticate -> check ownership/permission ->
fetch -> unwrap key -> decrypt in memory and verify the integrity tag -> return. A tampered file is rejected and
raises a critical security alert. Details: `docs/KEY_MANAGEMENT.md`.

## Roles
- **admin:** Admin Dashboard (users, file metadata, sharing reports, security dashboard, reports, storage analytics,
  security monitoring, audit logs, notification management, system and key management). Cannot read other users' file contents.
- **user:** upload, organise, share, personal analytics and activity, security page.
- **guest:** read-only access to files shared with them.

RBAC is enforced on the server for every request. Denied attempts are logged and counted on the Security Dashboard.

## Milestones
| # | Delivered |
|---|---|
| 1 | Docker services, FastAPI + Next.js, registration/login (bcrypt), JWT with refresh rotation, sessions, TOTP MFA, OAuth2, password reset, RBAC, validated uploads, folders, search, versions, trash, dashboard |
| 2 | AES-256-GCM, per-file keys, envelope key management and rotation (local keys or AWS KMS), encrypted storage (local / S3), encrypted retrieval, share links (hashed tokens, expiry, revoke, view/download, limits), direct shares |
| 3 | Audit logging and API with filters, notifications (in-app + email + history + admin management), reports (uploads, downloads, sharing, user activity, security), storage analytics, suspicious-activity detection with alert workflow, unified admin dashboard. See `docs/MILESTONE3.md` |
| 4 | Dockerfiles, production overlay with nginx/TLS, CI, automated tests, end-to-end smoke test, security test plan, AWS deployment guide, API and database documentation |

## Documentation
`docs/API.md` · `docs/DATABASE.md` · `docs/KEY_MANAGEMENT.md` · `docs/MILESTONE3.md` · `docs/TESTING.md` · `docs/DEPLOYMENT_AWS.md`

## Tests
```
cd backend && pip install -r requirements.txt && pytest -q     # unit tests
py scripts/smoke_test.py                                        # end-to-end test of the running app
```
