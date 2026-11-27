# Testing and security validation (Milestone 4)

## 1. Automated unit tests
`cd backend && pip install -r requirements.txt && pytest -q` covers: AES-256-GCM round trip, tamper and truncation detection,
wrong key, ciphertext swapped between files, envelope key wrapping and rotation, upload validation (executables, spoofed types,
oversize), password hashing, JWT type and expiry, share-token hashing, audit status/description helpers, detection-rule classification.

## 2. End-to-end smoke test (needs the app running)
```
py scripts/smoke_test.py
```
Registers two throw-away users and checks about 25 behaviours: upload, encrypted download with identical bytes, access denied for
another user, direct sharing, view-only link (cannot download), revoked link (410), unknown token (404), blocked admin routes for
normal users, blocked executables and spoofed file types. Exit code 0 means everything passed. Limit: registration allows 10 sign-ups
per hour per IP, so run it a few times at most per hour.

## 3. Manual security checks
| Check | How | Expected |
|---|---|---|
| Files are encrypted at rest | upload a text file, open the `.bin` in `storage_data` | unreadable bytes |
| Tamper detection | change one byte in a `.bin`, then download that file | "failed its integrity check", critical alert, nothing delivered |
| Brute-force lockout | 5 wrong passwords | 429 lockout, high alert |
| RBAC | as a normal user open an admin API URL with your token | 403, logged as unauthorized |
| Direct object access | request `/files/<someone else's id>/download` | 403, never the file |
| Share token secrecy | `SELECT token_hash FROM share_links;` | only SHA-256 hashes, no usable links |
| Link expiry and revocation | scenarios 4 and 5 in `docs/MILESTONE3.md` | 410 plus alerts |
| Session control | Security page, sign out another session | that session's next request returns 401 |
| Stored XSS | try uploading `.html` or `.svg` | blocked as unsafe |
| SQL injection | log in with `' OR 1=1 --` | 401 / validation error (queries are parameterised) |
| Password policy | register with `abc` | rejected |
| Secrets | search the repository for keys | `.env` is git-ignored, only `.env.example` is committed |

## 4. Performance metrics to record for the report
Encryption/decryption speed (time a 10 MB upload and download), API response time (browser Network tab or `/docs`),
upload speed, and concurrent users (open several browsers). Note the numbers in your documentation.

## 5. Evidence to collect
Screenshots of: login, My Files, share dialog, Security page, Admin Security Dashboard, Reports, Storage Analytics,
Security Monitoring with alerts, Audit Logs, notification history, `storage_data` with encrypted files, smoke-test output, CI run.
