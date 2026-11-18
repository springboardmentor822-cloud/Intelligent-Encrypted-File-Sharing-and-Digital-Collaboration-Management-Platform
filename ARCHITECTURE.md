# TrustShare - Architecture & Database Design (Milestone 1)

## 1. Overview
TrustShare is a secure file-sharing platform. For Milestone 1, the goal is to set up the base system: user authentication, database connections (PostgreSQL, MongoDB, Redis), local file upload validation, and the frontend dashboard.

---

## 2. Tech Stack & Responsibilities
- **Frontend (Next.js / Tailwind CSS):** Handles UI for login, registration, and file dashboard. Makes API requests using Axios.
- **Backend (FastAPI):** Validates incoming requests, hashes passwords, handles JWT tokens, checks file types/sizes, and connects to the databases.
- **PostgreSQL:** Used for user accounts, passwords, and role permissions (Admin, User, Guest).
- **MongoDB:** Used for file metadata (filename, size, file path) and activity/audit logs.
- **Redis:** Used for managing user sessions and rate limiting API requests.

---

## 3. Database Schema

### A. PostgreSQL Tables (Auth & Roles)

#### `roles`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | SERIAL | PRIMARY KEY | Unique ID |
| name | VARCHAR(50) | UNIQUE, NOT NULL | admin, user, guest |
| description | VARCHAR(255) | | Role description |

#### `users`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PRIMARY KEY | User ID |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Login email |
| hashed_password | VARCHAR(255) | NOT NULL | bcrypt hash |
| full_name | VARCHAR(100) | NOT NULL | User's full name |
| role_id | INT | FOREIGN KEY (roles.id) | Linked to roles table |
| is_active | BOOLEAN | DEFAULT TRUE | Active account flag |
| is_mfa_enabled | BOOLEAN | DEFAULT FALSE | MFA status |
| created_at | TIMESTAMP | DEFAULT NOW() | Registration date |
| updated_at | TIMESTAMP | DEFAULT NOW() | Profile update date |

---

### B. MongoDB Collections

#### `file_metadata`
Stores details of uploaded files:
{
  "_id": "ObjectId",
  "owner_id": "UUID",
  "original_filename": "report.pdf",
  "stored_filename": "unique_file_id.pdf",
  "file_path": "storage/uploads/unique_file_id.pdf",
  "file_size": 2048576,
  "mime_type": "application/pdf",
  "is_encrypted": false,
  "created_at": "ISO_DATE"
}

#### `activity_logs`
Tracks user actions:
{
  "_id": "ObjectId",
  "user_id": "UUID",
  "action": "FILE_UPLOAD",
  "resource_id": "ObjectId",
  "ip_address": "127.0.0.1",
  "timestamp": "ISO_DATE"
}

---

### C. Redis Key Structure
- **Sessions:** `session:<jwt_id>` -> `user_id` (expires when the token expires, used for logout).
- **Rate Limiting:** `rate_limit:<ip_address>:<endpoint>` -> count (expires every 60 seconds to prevent spam).

---

## 4. UI Wireframes & Layout Specifications

### Wireframe 1: User Login (`/login`)
+-------------------------------------------------------------+
|                        TrustShare                           |
|                  Secure File Collaboration                  |
+-------------------------------------------------------------+
|                                                             |
|                    +---------------------+                  |
|                    |     Sign In         |                  |
|                    +---------------------+                  |
|                    | Email Address:      |                  |
|                    | [ user@example.com] |                  |
|                    |                     |                  |
|                    | Password:           |                  |
|                    | [ ****************] |                  |
|                    |                     |                  |
|                    | [ ] Remember me     |                  |
|                    | [  Sign In Button ] |                  |
|                    |                     |                  |
|                    | Forgot Password?    |                  |
|                    | Don't have account? |                  |
|                    | [Create Account]    |                  |
|                    +---------------------+                  |
|                                                             |
+-------------------------------------------------------------+

### Wireframe 2: Account Registration (`/register`)
+-------------------------------------------------------------+
|                        TrustShare                           |
+-------------------------------------------------------------+
|                                                             |
|                    +---------------------+                  |
|                    |   Create Account    |                  |
|                    +---------------------+                  |
|                    | Full Name:          |                  |
|                    | [ Alice           ] |                  |
|                    |                     |                  |
|                    | Email Address:      |                  |
|                    | [ user@example.com] |                  |
|                    |                     |                  |
|                    | Password:           |                  |
|                    | [ ****************] |                  |
|                    |                     |                  |
|                    | Role Selection:     |                  |
|                    | (o) User  ( ) Admin |                  |
|                    |                     |                  |
|                    | [ Register Button ] |                  |
|                    |                     |                  |
|                    | Already registered? |                  |
|                    | [Log In]            |                  |
|                    +---------------------+                  |
|                                                             |
+-------------------------------------------------------------+

### Wireframe 3: Password Recovery (`/reset-password`)
+-------------------------------------------------------------+
|                        TrustShare                           |
+-------------------------------------------------------------+
|                                                             |
|                    +---------------------+                  |
|                    |   Reset Password    |                  |
|                    +---------------------+                  |
|                    | Enter your account  |                  |
|                    | email to receive a  |                  |
|                    | recovery link.      |                  |
|                    |                     |                  |
|                    | Email Address:      |                  |
|                    | [ user@example.com] |                  |
|                    |                     |                  |
|                    | [Send Reset Link]   |                  |
|                    |                     |                  |
|                    | < Back to Login     |                  |
|                    +---------------------+                  |
|                                                             |
+-------------------------------------------------------------+

### Wireframe 4: Main File Workspace Dashboard (`/dashboard`)
+---------------------------------------------------------------------------------------+
| TrustShare Logo  |  [ Search files by name or type... ]  | (Bell) | [ User Profile (v) ] |
+------------------+---------------------------------------+--------+-------------------+
|                  |                                                                    |
| [NAVIGATION]     |  Workspace Files                         [ + Upload File Button ]   |
|                  |  ----------------------------------------------------------------  |
| * My Files       |  | Name            | Size    | Type | Upload Date  | Actions     | |
| * Shared Files   |  |-----------------+---------+------+--------------+-------------| |
| * Recent Uploads |  | report.pdf      | 2.4 MB  | PDF  | 2026-10-11   | [v Download]| |
| * Activity Log   |  | data_sheet.xlsx | 1.1 MB  | XLSX | 2026-10-10   | [v Download]| |
| * Trash          |  | diagram.png     | 850 KB  | PNG  | 2026-10-09   | [v Download]| |
|                  |  ----------------------------------------------------------------  |
| ---------------- |                                                                    |
| STORAGE USAGE    |  [ Upload File Modal Preview ]                                     |
| [====----] 45%   |  +--------------------------------------------------------------+  |
| 4.5 GB / 10 GB   |  | Drag and drop files here, or [Browse Files]                  |  |
|                  |  | Supported: PDF, DOCX, XLSX, PNG (Max: 25MB)                  |  |
|                  |  +--------------------------------------------------------------+  |
+------------------+--------------------------------------------------------------------+

---

# TrustShare - Milestone 2: Encryption and Secure File Sharing

## 1. Overview
Milestone 2 secures the TrustShare platform with enterprise-grade **AES-256-GCM authenticated server-side encryption**, **envelope key management**, **cloud storage integration (AWS S3 / Azure Blob Storage)**, **granular access control**, **temporary link expiration**, and **zero plaintext at rest**.

---

## 2. Milestone 2 Core Architecture Workflow
```
[User Browser]
      |
      | 1. Upload Document over HTTPS
      v
[FastAPI Backend]
      |
      | 2. Generate unique 256-bit DEK
      | 3. Encrypt file using AES-256-GCM (with 96-bit unique IV)
      | 4. Wrap DEK using Master KEK (PBKDF2-SHA256 derived)
      |
      +------------------------------------------+
      |                                          |
      v (Encrypted Blob)                         v (Metadata & Wrapped Key)
[Private Cloud Storage]                   [PostgreSQL & MongoDB]
(AWS S3 / Azure Blob / Private Vault)     - file_records / file_metadata
- Stored as ciphertext only               - encrypted_dek, dek_iv, dek_tag
- Zero plaintext at rest                  - file_iv, file_tag, sha256_checksum
```

---

## 3. Milestone 2 Implementation Tasks

### Task 1: Server-Side AES-256-GCM File Encryption
- **Module:** `backend/app/services/encryption_service.py` (aliased in `app/services/crypto_service.py`)
- **Algorithm:** Advanced Encryption Standard in Galois/Counter Mode (`AES-256-GCM`).
- **Nonce/IV:** Unique 96-bit (12-byte) cryptographically random nonce per file.
- **Integrity Tag:** 128-bit (16-byte) authentication tag generated for every file.
- **AAD (Additional Authenticated Data):** Bound to `file_id` to prevent ciphertext translocation attacks.
- **Checksum:** SHA-256 plaintext checksum computed prior to encryption for integrity validation.

### Task 2: Cloud Storage Integration (AWS S3 & Azure Blob Storage)
- **Service:** `backend/app/services/storage_service.py`
- **Supported Providers:**
  1. **AWS S3 (`S3StorageProvider`):** Stores encrypted blobs in private S3 bucket under `encrypted_vault/`. Supports custom endpoints (MinIO/LocalStack).
  2. **Azure Blob Storage (`AzureBlobStorageProvider`):** Stores encrypted blobs in private Azure container.
  3. **Local Private Vault (`LocalStorageProvider`):** Stores encrypted blobs in secure filesystem with zero plaintext at rest.
- **Zero Plaintext Guarantee:** Only AES-256 encrypted bytes are transmitted to and persisted in storage. Direct inspection of stored blobs yields only random-looking ciphertext.

### Task 3 & 8: Encrypted File Retrieval & Secure Decryption
- **Workflow:**
  1. User authenticates via JWT or Guest Token.
  2. Permissions and role verified (Owner, Admin, or authorized share token recipient).
  3. Encrypted blob retrieved from cloud/local storage.
  4. Wrapped DEK retrieved from database and unwrapped in memory using Master KEK.
  5. Ciphertext authenticated and decrypted in memory via AES-256-GCM.
  6. If ciphertext bit or tag is tampered with, `InvalidTag` is caught and request is rejected.
  7. Plaintext streamed directly to client over HTTPS; never retained on disk or logged.

### Task 4 & 5: Secure File Sharing & Access Permissions
- **Granular Permissions:**
  - `view`: Allows in-browser inline preview; file downloads are strictly forbidden (HTTP 403).
  - `download`: Allows both in-browser preview and file download.
- **Cryptographic Token Hashing:** Each share link generates a 24-byte high-entropy URL-safe token. The SHA-256 hash of the token (`share_token_hash`) is indexed in the database for secure lookup.
- **Situation Matrix Enforcement:**
  | Situation | Expected Behavior | HTTP Status |
  |-----------|-------------------|-------------|
  | File owner requests file | Allow access | 200 OK |
  | User has valid sharing permission | Allow only permitted action (view vs download) | 200 OK |
  | User has no permission | Deny access | 403 Forbidden |
  | Sharing link has expired | Deny access | 410 Gone |
  | Sharing link has been revoked | Deny access | 404 Not Found / 410 Gone |
  | View-only user attempts download | Deny access | 403 Forbidden |
  | Tampered ciphertext / invalid tag | Cryptographic rejection | 500 Cryptographic Error |

### Task 6: Temporary Link Expiration & Revocation
- **Expiration Presets:** `1h`, `24h`, `7d`, `30d`, `custom` (future timestamp), or `never`.
- **Runtime Validation:** Current server time (`UTC`) compared against `expires_at` on every request.
- **Revocation:** Owners can immediately revoke links via `DELETE /files/shares/{share_id}`, terminating all guest access in real time.
- **Status Badges:** Frontend UI displays explicit badges: **Active** (Emerald), **Expired** (Rose), **Revoked** (Slate), and **Exhausted** (Amber).

### Task 7: Encryption Key Management & Envelope Encryption
- **Key Architecture:**
  - **DEK (Data Encryption Key):** Unique 256-bit AES key generated per file via `AESGCM.generate_key(256)`.
  - **KEK (Key Encryption Key):** 256-bit Master Key derived using PBKDF2-HMAC-SHA256 with 100,000 iterations and dedicated salt.
- **Key Lifecycle:**
  1. *Generation:* DEK generated randomly on upload.
  2. *Wrapping:* DEK encrypted using KEK via AES-256-GCM -> yields `encrypted_dek`, `dek_iv`, `dek_tag`.
  3. *Storage:* Only wrapped DEK material stored in PostgreSQL/MongoDB. Raw DEK zeroized from memory.
  4. *Retrieval:* Unwrapped in memory only during authorized download/preview.
  5. *Rotation:* `rotate_dek(dek_info, old_kek, new_kek)` re-wraps DEKs under new KEK versions without re-encrypting file blobs.
- **Sanitization Guarantee:** API responses (`sanitize_item`) strip all key materials (`dek_info`, `encrypted_dek`, `dek_iv`, `dek_tag`, `file_iv`, `file_tag`, `password_hash`).

---

## 4. Milestone 2 Database Schema Updates

### PostgreSQL Tables

#### `file_records`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR(64) | PRIMARY KEY | Unique File UUID |
| `owner_id` | INT | FOREIGN KEY (users.id) | Owning User ID |
| `name` | VARCHAR(255) | NOT NULL | Original Filename |
| `stored_filename` | VARCHAR(255) | NOT NULL | Safe unique storage name |
| `file_path` | VARCHAR(500) | NOT NULL | Cloud storage key / local path |
| `storage_provider` | VARCHAR(50) | NOT NULL | 's3', 'azure', or 'local' |
| `file_size` | INT | NOT NULL | Original plaintext size (bytes) |
| `cipher_size` | INT | NOT NULL | Stored ciphertext size (bytes) |
| `mime_type` | VARCHAR(100) | NOT NULL | File MIME type |
| `category` | VARCHAR(50) | NOT NULL | document, spreadsheet, image, etc. |
| `is_encrypted` | BOOLEAN | DEFAULT TRUE | Server-side encryption flag |
| `encryption_algorithm` | VARCHAR(50) | DEFAULT 'AES-256-GCM' | Encryption algorithm |
| `envelope_version` | VARCHAR(20) | DEFAULT '2.0' | Envelope specification version |
| `file_iv` | VARCHAR(255) | | Base64 96-bit AES-GCM IV |
| `file_tag` | VARCHAR(255) | | Base64 128-bit AES-GCM Auth Tag |
| `encrypted_dek` | TEXT | | Protected Envelope DEK |
| `dek_iv` | VARCHAR(255) | | Base64 KEK IV |
| `dek_tag` | VARCHAR(255) | | Base64 KEK Auth Tag |
| `sha256_checksum` | VARCHAR(64) | | Plaintext SHA-256 hash |
| `is_password_protected` | BOOLEAN | DEFAULT FALSE | Owner password protection |
| `password_hash` | VARCHAR(255) | | bcrypt hash of access password |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Upload timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

#### `share_links`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR(64) | PRIMARY KEY | Unique Share ID |
| `share_token` | VARCHAR(128) | UNIQUE, NOT NULL | High-entropy URL token |
| `share_token_hash` | VARCHAR(64) | INDEX | SHA-256 hash of token |
| `item_id` | VARCHAR(64) | FOREIGN KEY (file_records.id) | Linked file ID |
| `owner_id` | INT | FOREIGN KEY (users.id) | Link creator user ID |
| `permission` | VARCHAR(20) | NOT NULL | 'view' or 'download' |
| `has_guest_password` | BOOLEAN | DEFAULT FALSE | Guest passcode enabled |
| `guest_password_hash` | VARCHAR(255) | | bcrypt hash of guest passcode |
| `expiration_preset` | VARCHAR(50) | DEFAULT '24h' | 1h, 24h, 7d, 30d, custom, never |
| `expires_at` | TIMESTAMP | | Expiration timestamp (UTC) |
| `max_downloads` | INT | | Download limit (burn-after-read) |
| `downloads_count` | INT | DEFAULT 0 | Completed downloads |
| `views_count` | INT | DEFAULT 0 | Completed views |
| `is_active` | BOOLEAN | DEFAULT TRUE | Active link flag |
| `revoked_at` | TIMESTAMP | | Revocation timestamp |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `last_accessed_at` | TIMESTAMP | | Last accessed timestamp |


---

# TrustShare - Milestone 3: Monitoring, Notifications & Analytics

## Task 1: Activity Monitoring System

### 1. Overview
The Activity Monitoring module tracks and records all user, file, sharing, and security-relevant activities in TrustShare.

### 2. Architecture & Folder Structure
```
backend/app/
├── activity_monitoring/
│   ├── __init__.py       # Service & Schema exports
│   ├── routes.py         # REST endpoints for activity retrieval & metrics
│   ├── service.py        # ActivityMonitoringService: record & query operations
│   ├── models.py         # ActivityType & ActivityStatus enumerations
│   └── schemas.py        # Pydantic schemas (ActivityRecordResponse, ActivitySummaryStats)
├── authentication/ (auth.py)
├── file_management/ (files.py)
├── secure_sharing/ (shares.py)
└── main.py
```

### 3. Tracked Activity Matrix
| Activity Category | Monitored Actions | Activity Type | Default Status |
| :--- | :--- | :--- | :--- |
| **Authentication** | `LOGIN_SUCCESS`, `OAUTH_LOGIN` | `login` | `successful` |
| **Failed Authentication** | `LOGIN_FAILED`, `MFA_FAILED` | `login` | `failed` |
| **Session Termination** | `LOGOUT` | `logout` | `successful` |
| **File Creation** | `FILE_UPLOAD` | `upload` | `successful` |
| **File Retrieval** | `FILE_DOWNLOAD`, `GUEST_FILE_DOWNLOAD` | `download` | `successful` |
| **File Access** | `FILE_PREVIEW`, `GUEST_FILE_PREVIEW` | `file_access` | `successful` |
| **Sharing Creation** | `SECURE_SHARE_CREATED` | `share_create` | `successful` |
| **Link Expiration** | `SHARE_EXPIRED_ACCESS_ATTEMPT` | `share_expire` | `failed` |
| **Link Revocation** | `SECURE_SHARE_REVOKED`, `SHARE_REVOKED_ACCESS_ATTEMPT` | `share_revoke` | `successful` / `failed` |
| **Unauthorized Access** | `ACCESS_DENIED`, `PASSWORD_VERIFY_FAILED`, `GUEST_PASSWORD_FAILED`, `UNAUTHORIZED_DOWNLOAD_BLOCKED` | `unauthorized_access` | `failed` |

### 4. MongoDB Schema (`activity_logs`)
Each record captures the 7 mandatory fields:
```json
{
  "_id": "ObjectId",
  "activity_id": "act_8a7d3b2f1c04...",
  "user_id": 42,
  "username": "usha_admin",
  "activity_type": "upload",
  "file_id": "file_uuid_4901",
  "resource_name": "Project_Report.pdf",
  "status": "successful",
  "ip_address": "192.168.1.15",
  "timestamp": "2026-11-10T11:15:30.000Z",
  "details": {
    "file_size": 2048576,
    "encryption": "AES-256-GCM"
  }
}
```


## Task 2: Implement Audit Logging Workflows

### 1. Overview
Audit Logging maintains a permanent, immutable history of all critical activities performed within TrustShare in a dedicated MongoDB collection named `audit_logs`.

### 2. Audit Log Document Structure (`audit_logs`)
Every audit log record in `audit_logs` encapsulates the 9 required fields:
```json
{
  "_id": "6730a91f4b2c1e8a...",
  "log_id": "audit_b82a39c4d0e1...",
  "user_id": 42,
  "username": "usha_admin",
  "activity_type": "upload",
  "file_id": "file_817290124",
  "file_name": "Project_Report.pdf",
  "activity_description": "User Usha uploaded confidential Project_Report.pdf (2.4 MB, AES-256-GCM)",
  "activity_status": "successful",
  "ip_address": "192.168.1.15",
  "date_and_time": "2026-11-10T11:15:30.123+00:00",
  "details": {
    "cipher_algorithm": "AES-256-GCM",
    "storage_backend": "s3"
  }
}
```

### 3. Reusable Logging Integration
A centralized, reusable function `log_audit_event(...)` in `app/activity_monitoring/audit_service.py` is invoked across all core backend modules:
1. **Authentication:** Records login successes, failed logins, MFA challenges, logouts.
2. **File Upload:** Records AES-256 encrypted uploads and quota impacts.
3. **File Download:** Records authorized file retrieval and streaming.
4. **File Sharing:** Records share link generation, token hashing, expiration presets.
5. **Access Permissions:** Records permission enforcement, view-only downloads blocked, guest password verification.
6. **Security Monitoring:** Records unauthorized attempts, brute-force detections, administrative actions.

### 4. Administrator-Only REST Endpoints
Mounted at `/audit-logs` and guarded by `require_role(UserRole.ADMIN)`:
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/audit-logs` | Retrieve all audit logs (paginated) |
| `GET` | `/audit-logs/user/{user_id}` | Retrieve audit history for a specific user |
| `GET` | `/audit-logs/file/{file_id}` | Retrieve complete audit trail for a specific file |
| `GET` | `/audit-logs/filter` | Granular filtering by user, activity type, file name/ID, date range, and status |
| `GET` | `/audit-logs/{log_id}` | Retrieve a specific audit log record |

---

## Task 3: Build a Notification and Security Alert System

### 1. Overview
The Notification and Security Alert System proactively alerts users and administrators when critical file operations or security anomalies occur. It features real-time in-app delivery, database persistence in MongoDB, automated email notifications (via SMTP or simulated logging), and a dedicated interface in the dashboard.

### 2. Notification Document Schema (`notifications`)
Every record in the MongoDB `notifications` collection contains the required 7 fields:
```json
{
  "_id": "6730b91f4b2c1e8a...",
  "notification_id": "notif_f47ac10b58cc...",
  "user_id": 42,
  "notification_title": "New File Shared with You",
  "notification_message": "Alice shared 'Project_Report.pdf' with you (DOWNLOAD access).",
  "notification_type": "file_share",
  "priority": "normal",
  "is_read": false,
  "created_at": "2026-11-10T11:45:00.000Z",
  "date_and_time": "2026-11-10T11:45:00.000Z",
  "target_url": "/share/tok_abc123",
  "file_id": "file_817290124",
  "file_name": "Project_Report.pdf",
  "details": {
    "sender": "Alice",
    "permission": "download",
    "recipient_email": "bob@trustshare.internal"
  }
}
```

### 3. Notification Types & Workflows
1. **File-Sharing Notifications (`file_share`):**
   - Triggered when an owner shares a file with a recipient.
   - Saves a notification for the recipient and dispatches an email notification with access link.
2. **File-Download Notifications (`file_download`):**
   - Triggered when a shared file is downloaded by an authorized recipient or guest.
   - Alerts the file owner with timestamp and downloader identity.
3. **Security Alert Notifications (`security_alert`):**
   - Broadcast to system administrators.
   - Covers: repeated failed login attempts, unauthorized file access attempts, expired link access attempts, and revoked link access attempts.
4. **Link Expiration Reminders (`link_expiration`):**
   - Scans active shares nearing their expiration deadline (within 24 hours).
   - Generates reminder alerts for the file owner with file details and expiration timestamps.
5. **System Notifications (`system`):**
   - General maintenance and operational notices.

### 4. REST Endpoints (`/notifications`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/notifications` | Retrieve user notifications, total count, and unread count |
| `POST` | `/notifications/mark-read` | Mark one, multiple, or all notifications as read |
| `DELETE` | `/notifications` | Clear notification history for the current user |
| `POST` | `/notifications/check-expirations` | Scan active shares and dispatch expiration reminders |

### 5. Frontend Notification Interface
- **Navbar Bell Icon:** Displays a live badge with `unreadNotificationsCount` for all authenticated users.
- **Unified Notification Modal:**
  - Categorized badges & visual icons for all 5 notification types.
  - Interactive "Mark as Read" (single or mark all).
  - Clear history button.
  - Direct navigation links to files/shares and security audit logs.
  - Periodic polling (every 15s) for real-time notification delivery.

---

## Task 4: Generate File Activity and Security Reports

### 1. Overview
The Reporting Engine (`app/reports`) aggregates telemetry from PostgreSQL (`users` table) and MongoDB (`file_metadata`, `audit_logs`, `activity_logs`, `file_shares`, `notifications`) into categorized audit and operational reports. It provides real-time dashboard analytics, interactive date/user/file/status filtering, and export to CSV/JSON.

### 2. Supported Report Categories
1. **File Upload Reports (`/reports/uploads`):**
   - Total uploaded files and ingested volume (bytes).
   - Breakdown of files uploaded by each user.
   - Chronological upload date and time records.
   - File type distribution (PDF, Spreadsheet, Image, Archive, Code, Document, Other).
   - Upload status breakdown (successful vs failed attempts).
2. **File Download Reports (`/reports/downloads`):**
   - Total successful downloads.
   - Downloads by each user.
   - Most downloaded files leaderboard (ranked by download count).
   - Chronological download records with timestamps and IP addresses.
   - Failed download attempt analysis (view-only blocked, password failed, unauthorized).
3. **File Sharing Reports (`/reports/shares`):**
   - Distinct files shared and total share links created.
   - Shares generated by each user.
   - Sharing recipients distribution (recipient emails and public links).
   - Status counters: Active, Expired, Revoked links.
   - Detailed share link records with download limits and expirations.
4. **User Activity Reports (`/reports/user-activity`):**
   - Total registered and active users.
   - Individual user activity matrix: logins, uploads, downloads, shares, failed actions, and last active timestamp.
   - Chronological timeline of all user actions.
5. **Security Reports (`/reports/security`):**
   - Incident counts and listings for:
     - Failed login attempts.
     - Unauthorized access attempts.
     - Suspicious download activities.
     - Expired link access attempts.
     - Revoked link access attempts.
     - Security alerts triggered.

### 3. REST Endpoints (`/reports`)
All endpoints are strictly protected by `require_role(UserRole.ADMIN)`:
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/reports/summary` | Rollup metrics and dashboard leaderboard cards |
| `GET` | `/reports/uploads` | File upload reports with type and user distributions |
| `GET` | `/reports/downloads` | File download reports with failure analysis |
| `GET` | `/reports/shares` | File sharing reports with active/expired/revoked metrics |
| `GET` | `/reports/user-activity` | Individual user activity matrix and timeline |
| `GET` | `/reports/security` | Security incident reports and alert logs |
| `GET` | `/reports/export` | Export report data to CSV or JSON with active filters |

### 4. Admin Dashboard Reporting Interface
- Dedicated **"Activity & Reports"** panel accessible via the Admin sidebar.
- Presets: All Time, Today, Last 7 Days, Last 30 Days, Custom Date Range.
- Search filters: User search, File name search, Operation status filter.
- Interactive category tabs with KPI cards, leaderboard tables, and status pill badges.
- One-click CSV and JSON export buttons.

---

## Task 5: Develop Storage Analytics and Usage Monitoring Dashboard

### 1. Overview
The Storage Analytics engine (`app/analytics`) queries PostgreSQL `file_records` and MongoDB `file_metadata` to measure real physical disk consumption, user-wise storage quotas, and document access telemetry.

### 2. File Metadata Retrieval (Step 1)
Connects directly to the existing database schema to extract actual stored metadata:
- **File ID**: Unique persistent identifier.
- **File Name**: Original document filename.
- **File Size**: Stored size in raw bytes.
- **File Owner**: Owner user ID, username, and email.
- **Upload Date**: ISO UTC creation timestamp.
- **Storage Location**: Physical disk path and storage provider (`local`, `s3`, `azure`).

### 3. Core Calculations & Statistics
- **Total Storage Usage (Step 2)**: Combined size of all uploaded files with capacity utilization gauge against total system quota.
- **User-Wise Storage Usage (Step 3)**: Breakdown per user account:
  - User identity (username, email, full name)
  - Files uploaded count
  - Storage used (raw bytes & human-readable formatting)
  - Percentage of total system storage occupied
- **File Statistics (Step 4)**:
  - Total uploaded files
  - Total downloaded files
  - Total shared files
  - Total storage occupied
  - Average file size and largest file
  - AES-256-GCM encrypted document count
  - Most frequently downloaded files leaderboard

### 4. REST Endpoints (`/analytics`)
All endpoints are strictly protected by `require_role(UserRole.ADMIN)`:
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/analytics/storage` | Retrieve total storage usage and provider breakdown |
| `GET` | `/analytics/users/storage` | Retrieve user-wise storage usage table |
| `GET` | `/analytics/files` | Retrieve file statistics and leaderboard |
| `GET` | `/analytics/downloads` | Retrieve download volume, failure rate, and daily trends |
| `GET` | `/analytics/sharing` | Retrieve sharing statistics (active, expired, revoked links) |
| `GET` | `/analytics/dashboard` | Retrieve full analytics payload with pre-computed chart series |

### 5. Frontend Visual Dashboard & Charts
Located at `frontend/src/components/AdminStorageAnalyticsDashboard.jsx`:
- **Chart 1 (Pie Chart)**: Storage usage distribution by users with interactive hover slices and percentages.
- **Chart 2 (Bar Chart)**: File uploads by date tracking daily ingestion volume.
- **Chart 3 (Line / Bar Chart)**: File downloads over time comparing successful deliveries vs blocked/failed attempts.
- **Chart 4 (Multi-Segment Chart)**: File sharing lifecycle distribution (Active vs Expired vs Revoked) and permission split.
- **Filter Suite**: Dynamic filtering by Date Range (7/30/90 days or custom range), User search, File Type category, and Activity type.

---

## Task 6: Implement Suspicious Activity Detection

### 1. Overview
The Suspicious Activity Detection engine (`app/security_monitoring`) tracks real-time operations through sliding time windows to detect brute-force authentication attacks, unauthorized file access, download surges, and link abuse.

### 2. Detection Rules & Thresholds
| Rule Name | Event Type | Sliding Window | Configured Threshold | Severity | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Multiple Failed Logins** | `failed_logins` | 10 minutes (600s) | $\ge$ 3 failed attempts | **High** | Brute-force authentication anomaly |
| **Unauthorized Access** | `unauthorized_access` | 10 minutes (600s) | $\ge$ 3 blocked attempts | **High** | Restricted file access or password failure |
| **Excessive Downloads** | `excessive_downloads` | 5 minutes (300s) | $\ge$ 5 downloads | **Medium** | Rapid download surge / exfiltration risk |
| **Expired Link Access** | `expired_link` | 10 minutes (600s) | $\ge$ 2 attempts | **Medium** | Re-accessing expired share links |
| **Revoked Link Access** | `revoked_link` | 10 minutes (600s) | $\ge$ 2 attempts | **High** | Attempting access via revoked credentials |

### 3. Workflow & Data Persistence
1. **Activity Evaluation:** Hooked directly into `app.services.logger.log_activity`. Every logged operation evaluates its corresponding rule window.
2. **Event Persistence:** When a threshold is met, creates an immutable security record in MongoDB `security_events`:
   - `event_id`: Unique identifier (`sec_ev_...`).
   - `alert_id`: Linked alert reference.
   - `user_id` & `username`: Attacker / suspect identity.
   - `ip_address`: Originating IP address.
   - `event_type`: Rule category.
   - `severity`: Low, Medium, High, Critical.
   - `status`: Open, Investigating, Resolved, Dismissed.
   - `date_and_time`: ISO UTC timestamp.
3. **Admin Alerts:** Automatically creates a notification in MongoDB `notifications` and triggers SMTP email alerts.

### 4. REST Endpoints (`/security-monitoring`)
All endpoints are strictly protected by `require_role(UserRole.ADMIN)`:
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/security-monitoring/summary` | Retrieve 6 KPI summary counts and recent alerts |
| `GET` | `/security-monitoring/events` | Retrieve paginated events with User, Type, Severity, Status filters |
| `PATCH` | `/security-monitoring/events/{event_id}/status` | Update incident status (`Investigating`, `Resolved`, `Dismissed`) |
| `POST` | `/security-monitoring/trigger-scan` | Manually run rules against recent audit logs |

### 5. Frontend Security Monitoring Section
Located at `frontend/src/components/AdminSuspiciousActivityDashboard.jsx` and integrated into the Admin navigation panel:
- **6 Metric KPI Cards**: Total Security Events, Failed Logins, Unauthorized Access, Suspicious Downloads, Expired Link Hits, Revoked Link Hits.
- **Granular Filter Toolbar**: User / IP filter, Event Type dropdown, Severity dropdown, Incident Status dropdown, Date range presets.
- **Incident Response Table**: Severity indicators, attempt counters, direct status transition buttons ("Investigate", "Resolve", "Dismiss").
