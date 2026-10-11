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

## 4. UI Screens Plan
- **Login (`/login`):** Email, password, and sign-in button.
- **Register (`/register`):** Name, email, password, and role selection.
- **Password Reset (`/reset-password`):** Simple form to request a reset link.
- **Dashboard (`/dashboard`):** 
  - Sidebar with navigation and storage space indicator.
  - Top bar with search and profile menu.
  - Main area with an "Upload File" button and a table showing uploaded files (name, size, type, upload date).