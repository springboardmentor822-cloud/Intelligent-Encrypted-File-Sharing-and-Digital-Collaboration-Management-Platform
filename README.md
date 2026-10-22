# Intelligent Encrypted File Sharing & Digital Collaboration Management Platform (TrustShare)

TrustShare is an enterprise-grade, zero-knowledge encrypted cloud storage and collaboration platform powered by Next.js, FastAPI, PostgreSQL, MongoDB, and Redis.

---

## 🔐 System Credentials & Access Control

### 1. Pre-Configured Administrator Account
> **Important:** Administrator accounts **cannot** be created through the public registration (`/register`) portal. Administrator privileges are reserved for pre-configured system administrators and can only be accessed via the **Sign In** (`/login`) page.

| Role | Username / Identifier | Email Address | Password | Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **System Administrator** | `admin` | `admin@trustshare.io` | `Admin@123456` | Full platform analytics, user moderation, audit logs, file oversight, role updates |
| **Standard User (Demo)** | `demo_user` | `user@trustshare.io` | `User@123456` | Encrypted vault, file sharing, links, starred files, trash |

---

## 🛡️ Authentication Architecture & Rules

1. **Strict Public Registration Lockdown:**
   - Public registration (`POST /auth/register`) only creates accounts with the `user` role (`UserRole.USER`).
   - Any attempt to register with `role: "admin"`, username `admin`, or email `admin@trustshare.io` is strictly rejected with `HTTP 403 Forbidden`.
   - On the frontend (`/register`), client-side guards block registration using reserved administrator identifiers and display guidance redirecting to `/login`.

2. **One-Click Quick Login:**
   - The Login page (`/login`) includes interactive **Quick Fill** buttons for both **Administrator** and **Standard User** accounts.

---

## 📁 File Size & Storage Quotas

- **Maximum File Upload Size:** `500 MB` per file (enforced on both client-side and backend streaming verification).
- **Workspace Storage Quota:** `400 GB` per user vault.
- **Security Check:** Files exceeding 500 MB or containing executable extensions (`.exe`, `.bat`, `.cmd`, `.sh`, `.vbs`, `.msi`, `.dll`, `.scr`, `.ps1`) are automatically blocked.
