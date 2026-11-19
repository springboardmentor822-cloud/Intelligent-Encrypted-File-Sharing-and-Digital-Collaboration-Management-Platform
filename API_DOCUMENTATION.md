# TrustShare 2.0: Comprehensive API Architecture & Endpoint Specification
**Framework:** FastAPI 0.110+ | Python 3.12  
**Specification:** OpenAPI 3.1.0 / RESTful  
**Lead Architect:** Likitha Manchikanti  
**Date:** November 17, 2026  

---

## 1. Architectural Overview & Security Conventions

All TrustShare 2.0 API routes are modularized across distinct domain routers.

### 1.1 Authentication & Header Conventions
- **Session Identification:** Authenticated requests carry an HttpOnly cookie `trustshare_session` or an `Authorization: Bearer <session_token>` header.
- **Request Tracing:** Every incoming request receives a unique `X-Request-ID` header (UUIDv4) attached by the `request_id` middleware.
- **CSRF Protection:** Safe methods (`GET`, `HEAD`, `OPTIONS`) are exempt; mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) require a matching `X-CSRF-Token` header.
- **Standard Error Responses:**
  - `400 Bad Request`: Validation failure or malformed payload.
  - `401 Unauthorized`: Missing, expired, or invalid session credentials.
  - `403 Forbidden`: Authenticated caller lacks permissions (e.g., standard USER accessing ADMIN endpoints, or non-owner accessing private files).
  - `404 Not Found`: Target resource does not exist.
  - `429 Too Many Requests`: Rate limit exceeded.

---

## 2. API Domain Mapping & Modular Router Structure

```
backend/
├── routers/
│   ├── auth.py          # /api/v1/auth/*
│   ├── users.py         # /api/v1/users/*
│   ├── files.py         # /api/v1/files/*
│   ├── shares.py        # /api/v1/shares/*
│   ├── audit.py         # /api/v1/audit/*
│   ├── notifications.py # /api/v1/notifications/*
│   ├── analytics.py     # /api/v1/analytics/*
│   ├── admin.py         # /api/v1/admin/*
│   ├── security.py      # /api/v1/security/*
│   └── crypto.py        # /api/v1/crypto/*
```

---

## 3. Detailed Endpoint Inventory

### 3.1 Authentication Router (`/api/v1/auth`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public (Configurable) | Registers a new standard user account. Requires valid email, full name, and strong password. |
| `POST` | `/api/v1/auth/login` | Public | Authenticates credentials with Argon2id, generates a secure session, sets HttpOnly cookie, and returns user profile. |
| `POST` | `/api/v1/auth/logout` | Authenticated (Any) | Invalidates active server-side session in database and clears session cookies. |
| `GET` | `/api/v1/auth/me` | Authenticated (Any) | Returns current authenticated user profile, assigned role (`USER` or `ADMIN`), and active permissions. |
| `POST` | `/api/v1/auth/change-password` | Authenticated (Any) | Verifies current password and updates password hash with Argon2id. |
| `GET` | `/api/v1/auth/sessions` | Authenticated (Any) | Lists all active sessions for current user (IP, user agent, login time, idle state). |
| `DELETE` | `/api/v1/auth/sessions/{session_id}` | Authenticated (Any) | Terminates a specific active session. |

---

### 3.2 User Management Router (`/api/v1/users`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users/profile` | Authenticated (Own) | Retrieves account profile, storage quota, and security configuration. |
| `PATCH` | `/api/v1/users/profile` | Authenticated (Own) | Updates profile metadata (display name, notification preferences). |
| `GET` | `/api/v1/users/security-status` | Authenticated (Own) | Returns verification status of all 10 Security Pillars for user dashboard. |

---

### 3.3 File Management Router (`/api/v1/files`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/files/upload` | Authenticated (USER / ADMIN) | Validates extension, MIME signature, and 25MB limit. Generates fresh DEK + nonce, encrypts via AES-256-GCM with AAD, wraps DEK with KEK, and persists encrypted object to storage vault. |
| `GET` | `/api/v1/files` | Authenticated (USER / ADMIN) | Lists files. Standard users only see files they own. Admin can view system files if authorized. Supports pagination and search. |
| `GET` | `/api/v1/files/{file_id}` | Authenticated (Owner / Admin) | Retrieves file metadata, encryption key version, size, upload timestamp, and share count. |
| `GET` | `/api/v1/files/{file_id}/download` | Authenticated (Owner / Admin) | Fetches ciphertext from storage vault, unwraps DEK with KEK, verifies AAD, decrypts in-memory, updates download counter, and streams decrypted file over HTTPS. |
| `DELETE` | `/api/v1/files/{file_id}` | Authenticated (Owner / Admin) | Moves file to Recycle Bin (soft delete) or permanently deletes from database and storage vault. |
| `POST` | `/api/v1/files/{file_id}/restore` | Authenticated (Owner / Admin) | Restores a soft-deleted file from the Recycle Bin. |
| `GET` | `/api/v1/files/{file_id}/versions` | Authenticated (Owner / Admin) | Lists previous versions of the file if versioning is active. |

---

### 3.4 Secure File Sharing Router (`/api/v1/shares`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/shares/create` | Authenticated (Owner) | Generates a 32-byte CSPRNG token, stores SHA-256 token hash in database, sets expiration (1–72 hrs), access permission (`VIEW` or `DOWNLOAD`), and optional password. Returns public share URL. |
| `GET` | `/api/v1/shares` | Authenticated (Owner / Admin) | Lists all share links created by the current user (active, expired, revoked, download counts). |
| `POST` | `/api/v1/shares/{share_id}/revoke` | Authenticated (Owner / Admin) | Immediately revokes an active share link, preventing any subsequent access. |
| `GET` | `/api/v1/shares/access/{token}` | Public (Guest / Token) | Validates token by SHA-256 hash lookup. Verifies expiration, revocation, and download limits. Decrypts file in-memory and serves attachment (if `DOWNLOAD`) or preview payload (if `VIEW`). Logs recipient access. |

---

### 3.5 Audit & Compliance Router (`/api/v1/audit`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/audit/logs` | Authenticated (Admin / Owner) | Returns paginated audit trail. Standard users only see their own file operations; admins view global records. Filterable by action, status, and date. |
| `GET` | `/api/v1/audit/verify-chain` | Authenticated (Admin) | Performs cryptographic verification of the SHA-256 hash chain across all `AuditLog` rows. Reports whether the audit ledger is 100% intact or has suffered tampering. |
| `GET` | `/api/v1/audit/export` | Authenticated (Admin) | Exports audit records in signed JSON/CSV format for external compliance auditors. |

---

### 3.6 Real-Time Notifications Router (`/api/v1/notifications`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/notifications` | Authenticated (Own) | Returns user-specific notifications and unread count. |
| `PATCH` | `/api/v1/notifications/{notif_id}/read` | Authenticated (Own) | Marks a single notification as read. |
| `POST` | `/api/v1/notifications/mark-all-read` | Authenticated (Own) | Marks all notifications as read for current user. |

---

### 3.7 Storage & Usage Analytics Router (`/api/v1/analytics`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/analytics/storage` | Authenticated (USER / ADMIN) | Returns storage statistics: total encrypted bytes, file type breakdown, and quota remaining. |
| `GET` | `/api/v1/analytics/activity-summary` | Authenticated (USER / ADMIN) | Returns 7-day upload/download/share timeline for dashboard charting. |

---

### 3.8 Administration Router (`/api/v1/admin`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/users` | Authenticated (Admin Only) | Lists all registered user accounts with status, role, storage usage, and last login. |
| `PATCH` | `/api/v1/admin/users/{user_id}/status` | Authenticated (Admin Only) | Activates or deactivates a user account. |
| `POST` | `/api/v1/admin/users/{user_id}/revoke-sessions` | Authenticated (Admin Only) | Revokes all active sessions for a target user. |
| `GET` | `/api/v1/admin/system-health` | Authenticated (Admin Only) | Returns DB connection status, storage vault health, and memory stats. |

---

### 3.9 SIEM & Threat Monitoring Router (`/api/v1/security`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/security/alerts` | Authenticated (Admin Only) | Returns detected security alerts (Rules 1–10) with severity (`INFO`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) and investigation status. |
| `PATCH` | `/api/v1/security/alerts/{alert_id}/resolve` | Authenticated (Admin Only) | Resolves or closes a security incident with administrative resolution notes. |
| `POST` | `/api/v1/security/simulate` | Authenticated (Admin Only) | Clearly labeled test harness for triggering synthetic threat scenarios in viva/evaluation demos. |

---

### 3.10 Cryptographic Demonstration Router (`/api/v1/crypto`)

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/crypto/encrypt-demo` | Authenticated (Any) | Live AES-256-GCM demonstration. Uses isolated demonstration keys (never production KEK) to showcase DEK generation, nonce creation, and tag output. |
| `POST` | `/api/v1/crypto/decrypt-demo` | Authenticated (Any) | In-memory decryption demo with 1-bit tamper simulation and GHASH tag verification. |
| `GET` | `/api/v1/crypto/key-status` | Authenticated (Admin Only) | Returns active KEK version and key rotation history without exposing key bytes. |
| `POST` | `/api/v1/crypto/rotate-kek` | Authenticated (Admin Only) | Rotates Master Key to a new version and rewraps existing file DEKs. |
