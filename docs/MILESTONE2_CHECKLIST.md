# Milestone 2 checklist — every requirement, where it lives, how to prove it

Status: ✅ done in earlier version · 🆕 added/changed in this update

| # | Requirement (from the Milestone 2 PDF) | Status | Code | How to show it |
|---|---|---|---|---|
| 1 | AES-256-GCM encryption, unique key per file, unique nonce | ✅ | `core/crypto.py` | `python scripts/verify_encryption.py` · `pytest tests/test_crypto.py` |
| 2 | Cloud storage (S3), private bucket, upload/get/delete, encrypted data only, credentials outside code | ✅ 🆕 | `core/storage.py` (+ S3 server-side encryption layer) · `docs/S3_SETUP.md` | Download the `.enc` object from S3 and try to open it |
| 3 | Encrypted file retrieval: auth → permission check → fetch → unwrap key → decrypt → verify → send, deny before returning bytes | ✅ | `routers/files.py` `download_file`, `services/file_service.py` | Postman folder 2 and 4 |
| 4 | Secure sharing: create link, view/download permission, expiry, revoke, record creator + file, validate on every access, hashed token | ✅ 🆕 | `routers/share.py`, `core/security.py` | Postman folder 3 |
| 5 | Access control table (owner / permitted / none / expired / revoked / unauthorized) enforced in the backend | ✅ 🆕 | `files.require_file_access`, `share.link_blocker`, `core/deps.py` | Postman folder 4; admin routes answer 403 and write `admin_access` to the audit log |
| 6 | Temporary link expiration: owner picks period, timestamp stored, checked on every use, status shown, **handles deleted file / changed owner permissions** | ✅ 🆕 | `share.link_status`, `share.link_blocker` (file in Trash, creator disabled, creator lost admin right → link dies) | Trash a file, then open its link: "no longer available" |
| 7 | Key management: key per file, protected keys, only wrapped key in DB, never in responses/logs, lifecycle documented, rotation keeps old files readable | ✅ 🆕 | `core/crypto.py`, `routers/admin.py` · **`docs/KEY_MANAGEMENT.md`** | Admin Panel → System Monitoring → Encryption keys → Rotate |
| 8 | Secure decryption in memory, verify GCM tag, safe errors, no plaintext logging | ✅ | `services/file_service.py` | Tamper test in `scripts/verify_encryption.py` |
| 9 | JWT, **OAuth2**, RBAC, HTTPS/TLS (tech-stack table) | ✅ 🆕 | `OAuth2PasswordBearer` + `POST /auth/token` + optional Google flow · `docs/OAUTH2_SETUP.md` | `/docs` → Authorize |
| 10 | Optional download restrictions | ✅ | max downloads, password, view-only in `ShareModal` | Create a view-only link |
| 11 | Test encryption, unauthorized access, expired and revoked links | ✅ 🆕 | `backend/tests/` (new: `test_milestone2_features.py`) · `docs/TrustShare_Milestone2.postman_collection.json` | `pytest -v` |
| 12 | Update DB schema + documentation | 🆕 | `docs/DATABASE_SCHEMA.md`, this file, README | — |
| 13 | Final demo + submission | — | `docs/MENTOR_GUIDE.md` has a demo script | — |

## TLS note (simplified vs production)
Locally the app runs on `http://localhost`. That is acceptable for development only. In production put the app behind
HTTPS (a reverse proxy such as Nginx/Caddy or a cloud load balancer with a certificate) and pass `X-Forwarded-Proto: https`.
The **Security** page shows whether the current connection is HTTPS.
