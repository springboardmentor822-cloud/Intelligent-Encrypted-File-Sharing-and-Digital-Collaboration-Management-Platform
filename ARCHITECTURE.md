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