# TrustShare REST API Reference Manual

Base URL: `http://localhost:8000/api/v1`  
Interactive OpenAPI Swagger Docs: `http://localhost:8000/docs`

---

## 1. Authentication & Identity Management

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/auth/register` | Register a new user account (creates bcrypt hashed credentials) | No |
| `POST` | `/auth/login` | Authenticate user credentials and issue signed JWT access token | No |
| `GET` | `/auth/me` | Fetch active user profile, assigned role (`admin`/`user`), and quota | Yes |
| `POST` | `/auth/logout` | Invalidate active session and blacklist token | Yes |

---

## 2. Encrypted File Operations (Milestones 1 & 2)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/files/upload` | Encrypt incoming file with AES-256-GCM and upload ciphertext to AWS S3 | Yes |
| `GET` | `/files` | List all files belonging to authenticated user | Yes |
| `GET` | `/files/{file_id}/download` | Retrieve ciphertext from AWS S3, decrypt in memory, and stream plaintext | Yes |
| `DELETE` | `/files/{file_id}` | Crypto-shred file (delete AWS S3 object and purge DEK from database) | Yes |

---

## 3. Secure File Sharing & Link Control (Milestone 2)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/files/{file_id}/share` | Generate secure share link with expiration date, max downloads, and view/download permissions | Yes |
| `GET` | `/files/share/{token}/download` | Access and decrypt shared file using secure token (checks expiry and quota) | No |
| `POST` | `/files/share/{share_id}/revoke` | Immediately revoke active sharing link | Yes |

---

## 4. Notifications & Alerts (Milestone 3)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/notifications` | Retrieve notifications for current user | Yes |
| `GET` | `/notifications/unread-count` | Get count of unread notifications | Yes |
| `PATCH`| `/notifications/{id}/read` | Mark a notification as read | Yes |
| `POST` | `/notifications/mark-all-read` | Mark all notifications as read | Yes |
| `POST` | `/notifications/run-expiry-check` | Trigger automated scanner for share links expiring soon | Yes |
| `POST` | `/notifications/test-email` | Dispatch test verification email via AWS SES / SMTP | Yes |

---

## 5. Reports & Telemetry (Milestone 3)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/reports/uploads` | Aggregate file upload statistics and user distribution | Admin |
| `GET` | `/reports/downloads` | Aggregate file download events, most accessed files, and failures | Admin |
| `GET` | `/reports/sharing` | Aggregate active, expired, and revoked share links | Admin |
| `GET` | `/reports/security` | Aggregate threat metrics and recent security alerts | Admin |
| `GET` | `/reports/export/csv` | Download structured report as CSV (`?report_type=uploads\|downloads\|sharing\|security`) | Admin |

---

## 6. Storage Analytics (Milestone 3)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/analytics/storage` | Retrieve total storage consumed, quota limits, and file counts | Admin |
| `GET` | `/analytics/users/storage` | Breakdown of storage consumed per registered user | Admin |
| `GET` | `/analytics/files` | File type distribution and storage allocations | Admin |

---

## 7. Security Monitoring & Intrusion Detection (Milestone 3)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/security-monitoring/summary` | Threat summary counts (failed logins, unauthorized access, suspicious downloads) | Admin |
| `GET` | `/security-monitoring/alerts` | List detected security alerts with severity filters (`LOW`, `MEDIUM`, `HIGH`) | Admin |
| `PATCH`| `/security-monitoring/alerts/{id}/resolve` | Mark security alert as resolved | Admin |

---

## 8. Cryptographic Key Management & Administration (Milestone 2 & 3)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/admin/metrics` | Platform-wide operational metrics and activity timeline | Admin |
| `GET` | `/admin/users` | List all registered users with file counts and status | Admin |
| `POST` | `/admin/keys/rotate` | Re-wrap all stored file DEKs under a new Master KEK without touching cloud objects | Admin |
| `GET` | `/audit-logs` | Query chronological audit logs from MongoDB Atlas with action filters | Admin |

