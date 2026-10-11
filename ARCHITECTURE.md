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