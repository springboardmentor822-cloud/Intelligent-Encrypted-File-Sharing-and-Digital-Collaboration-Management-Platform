# TrustShare 2.0
## API Architecture and Endpoint Specification

**Framework:** FastAPI 0.110+  
**Runtime:** Python 3.12  
**API Style:** REST  
**API Specification:** OpenAPI 3.1.0  
**Lead Architect:** Likitha Manchikanti

---

## 1. Overview

TrustShare uses a modular REST API to handle authentication, user management, encrypted file operations, secure sharing, audit records, notifications, analytics, administration and security monitoring.

Each functional area is organised into a separate router to keep the backend maintainable and make API responsibilities easier to manage.

### 1.1 Authentication and Request Conventions

Authenticated requests use either:

- The `trustshare_session` HttpOnly cookie.
- An `Authorization: Bearer <session_token>` header.

Every incoming request receives a unique `X-Request-ID` header containing a UUIDv4 value, generated through request middleware.

### 1.2 CSRF Protection

Safe HTTP methods (`GET`, `HEAD`, `OPTIONS`) are exempt from CSRF validation.

Mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`) require a matching `X-CSRF-Token` header.

### 1.3 Standard HTTP Responses

| Status Code | Description |
|---|---|
| 400 | Bad Request – Invalid input or malformed payload |
| 401 | Unauthorized – Missing, expired or invalid credentials |
| 403 | Forbidden – Insufficient permissions |
| 404 | Not Found – Requested resource does not exist |
| 429 | Too Many Requests – Rate limit exceeded |

---

## 2. API Router Structure

The backend follows a domain-based router structure.

```text
backend/
└── routers/
    ├── auth.py
    ├── users.py
    ├── files.py
    ├── shares.py
    ├── audit.py
    ├── notifications.py
    ├── analytics.py
    ├── admin.py
    ├── security.py
    └── crypto.py
```

Each router handles a specific application domain and its corresponding API operations.

---

## 3. API Endpoint Reference

### 3.1 Authentication API

**Base Path:** `/api/v1/auth`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Public (configurable) | Registers a standard user account using email, full name and password. |
| POST | `/api/v1/auth/login` | Public | Authenticates user credentials using Argon2id, creates a session and returns the user profile. |
| POST | `/api/v1/auth/logout` | Authenticated | Invalidates the active session and clears session cookies. |
| GET | `/api/v1/auth/me` | Authenticated | Retrieves the current user's profile, role and permissions. |
| POST | `/api/v1/auth/change-password` | Authenticated | Verifies the existing password and updates the password hash. |
| GET | `/api/v1/auth/sessions` | Authenticated | Lists active sessions with IP address, user agent and login information. |
| DELETE | `/api/v1/auth/sessions/{session_id}` | Authenticated | Terminates a selected active session. |

### 3.2 User Management API

**Base Path:** `/api/v1/users`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/v1/users/profile` | Own Account | Retrieves user profile, storage quota and security configuration. |
| PATCH | `/api/v1/users/profile` | Own Account | Updates display name and notification preferences. |
| GET | `/api/v1/users/security-status` | Own Account | Retrieves the verification status of the ten Security Pillars displayed on the dashboard. |

### 3.3 File Management API

**Base Path:** `/api/v1/files`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/v1/files/upload` | USER / ADMIN | Validates file extension, MIME signature and the specified 25 MB size limit. Generates a DEK and nonce, encrypts using AES-256-GCM with AAD, wraps the DEK using a KEK and stores the encrypted file. |
| GET | `/api/v1/files` | USER / ADMIN | Lists files with pagination and search. Users access their own files; administrators can view authorised system files. |
| GET | `/api/v1/files/{file_id}` | Owner / Admin | Retrieves file metadata, encryption-key version, size, upload timestamp and share count. |
| GET | `/api/v1/files/{file_id}/download` | Owner / Admin | Retrieves encrypted data, unwraps the DEK, verifies AAD, decrypts the file in memory and streams it over HTTPS. |
| DELETE | `/api/v1/files/{file_id}` | Owner / Admin | Moves a file to the Recycle Bin or permanently deletes it. |
| POST | `/api/v1/files/{file_id}/restore` | Owner / Admin | Restores a soft-deleted file from the Recycle Bin. |
| GET | `/api/v1/files/{file_id}/versions` | Owner / Admin | Retrieves previous file versions when versioning is enabled. |

### 3.4 Secure File Sharing API

**Base Path:** `/api/v1/shares`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/v1/shares/create` | File Owner | Generates a 32-byte cryptographically secure token and stores its SHA-256 hash. Supports 1–72 hour expiry, VIEW or DOWNLOAD permissions and optional password protection. |
| GET | `/api/v1/shares` | Owner / Admin | Lists created share links with their status, expiry and download counts. |
| POST | `/api/v1/shares/{share_id}/revoke` | Owner / Admin | Revokes an active sharing link and prevents subsequent access. |
| GET | `/api/v1/shares/access/{token}` | Public / Token | Validates the token, checks expiry and revocation, enforces download limits and provides the permitted file preview or download. Recipient access is logged. |

### 3.5 Audit and Compliance API

**Base Path:** `/api/v1/audit`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/v1/audit/logs` | Admin / Owner | Retrieves paginated audit records with action, status and date filters. |
| GET | `/api/v1/audit/verify-chain` | Admin Only | Verifies the SHA-256 hash chain across audit records to check ledger integrity. |
| GET | `/api/v1/audit/export` | Admin Only | Exports audit records in signed JSON or CSV format. |

### 3.6 Notifications API

**Base Path:** `/api/v1/notifications`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/v1/notifications` | Own Account | Retrieves user-specific notifications and unread count. |
| PATCH | `/api/v1/notifications/{notif_id}/read` | Own Account | Marks an individual notification as read. |
| POST | `/api/v1/notifications/mark-all-read` | Own Account | Marks all notifications as read. |

### 3.7 Storage and Analytics API

**Base Path:** `/api/v1/analytics`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/v1/analytics/storage` | USER / ADMIN | Retrieves encrypted storage usage, file-type distribution and remaining quota. |
| GET | `/api/v1/analytics/activity-summary` | USER / ADMIN | Returns a seven-day summary of upload, download and sharing activity for dashboard visualisation. |

### 3.8 Administration API

**Base Path:** `/api/v1/admin`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/v1/admin/users` | Admin Only | Lists registered users with account status, role, storage usage and last-login information. |
| PATCH | `/api/v1/admin/users/{user_id}/status` | Admin Only | Activates or deactivates a user account. |
| POST | `/api/v1/admin/users/{user_id}/revoke-sessions` | Admin Only | Revokes all active sessions belonging to a selected user. |
| GET | `/api/v1/admin/system-health` | Admin Only | Retrieves database status, storage-vault health and memory statistics. |

### 3.9 Security and Threat Monitoring API

**Base Path:** `/api/v1/security`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/v1/security/alerts` | Admin Only | Retrieves security alerts from Rules 1–10, including severity and investigation status. |
| PATCH | `/api/v1/security/alerts/{alert_id}/resolve` | Admin Only | Resolves a security incident and records administrative notes. |
| POST | `/api/v1/security/simulate` | Admin Only | Runs a clearly labelled test harness for generating synthetic threat scenarios during demonstrations and evaluation. |

Severity levels include:

- INFO
- LOW
- MEDIUM
- HIGH
- CRITICAL

### 3.10 Cryptographic Demonstration API

**Base Path:** `/api/v1/crypto`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/v1/crypto/encrypt-demo` | Authenticated | Demonstrates AES-256-GCM encryption using isolated demonstration keys. Displays DEK generation, nonce creation and authentication-tag output. |
| POST | `/api/v1/crypto/decrypt-demo` | Authenticated | Demonstrates in-memory decryption, one-bit tampering simulation and GHASH authentication-tag verification. |
| GET | `/api/v1/crypto/key-status` | Admin Only | Retrieves active KEK version and key-rotation history without exposing key material. |
| POST | `/api/v1/crypto/rotate-kek` | Admin Only | Rotates the master key to a new version. |

---

## 4. Access Control

TrustShare uses role-based access control to restrict API operations.

| Access Level | Description |
|---|---|
| Public | Accessible without an authenticated session, subject to endpoint configuration. |
| Authenticated | Requires a valid user session. |
| USER | Standard user permissions. |
| ADMIN | Administrative permissions. |
| Owner | Access restricted to resources owned by the requesting user. |
| Owner / Admin | Access available to the resource owner or an authorised administrator. |

Access permissions are intended to be enforced by the backend rather than relying solely on frontend restrictions.

---

## 5. Cryptographic Architecture

TrustShare's file-protection design uses authenticated encryption and key wrapping.

| Component | Purpose |
|---|---|
| AES-256-GCM | Provides authenticated encryption and data integrity. |
| DEK (Data Encryption Key) | Encrypts individual file contents. |
| KEK (Key Encryption Key) | Protects or wraps the DEK. |
| Nonce | Supplies a unique value to the GCM encryption operation for a given key. |
| AAD | Additional Authenticated Data, which is authenticated but not encrypted. |
| Authentication Tag | Verifies the integrity and authenticity of encrypted data. |
| SHA-256 | Used for share-token hash lookup and audit-chain verification. |
| CSPRNG | Generates cryptographically secure random values for sharing tokens. |

Cryptographic demonstration operations use isolated demonstration keys and do not expose production key material.

---

## 6. API Documentation Interface

FastAPI provides an interactive interface for exploring and testing available API endpoints.

| Resource | Path |
|---|---|
| Swagger UI | `/docs` |
| OpenAPI Schema | `/openapi.json` |

These paths are relative to the backend base URL.

The generated OpenAPI schema should be used to confirm the actual request parameters, response structures and registered routes of the running application.

---

## 7. Implementation Notes

This document describes the TrustShare 2.0 API architecture and endpoint inventory.

Before treating it as the definitive API contract, verify the following against the deployed backend:

1. Confirm that every documented endpoint is registered in the FastAPI application.
2. Verify the API route prefix. This specification uses `/api/v1`.
3. Check request bodies, query parameters and response schemas against the generated OpenAPI specification.
4. Confirm authentication, ownership and administrator permissions at the backend level.
5. Verify optional functionality such as file versioning, audit exports, key rotation and threat simulation before describing it as available in production.

The endpoint descriptions above follow the supplied API specification. Actual deployed behaviour may differ depending on the implementation and configuration.
