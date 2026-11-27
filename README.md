# TrustShare
**Deployed and running at:** https://trustshare-lime.vercel.app/

**Admin Gate at:** https://trustshare-lime.vercel.app/admin/login


**A secure file sharing platform**:
Strong File security provided as files are encrypted with AES-256-GCM per-file data key wrapped by a versioned master key before reaching storage.


## Quick start 
Requires Python 3.11+.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1         
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
```powershell
cd frontend
npm install
npm run dev                           
```

## What's new in this build
- **Admin(password-gated admin entry for any account)**:  Opening it shows a restricted-area password gate, only people who know the admin-visit password can proceed. On success the server issues a 60-minute scoped grant bound to that user id, which the UI stores in sessionStorage only.

- **Encryption & Key Registry in the Security Dashboard**: Live document view of the envelope encryption state: algorithm (AES-256-GCM), 256-bit data keys, 96-bit nonces, KEK version per file, a non-reversible DEK fingerprint, wrapped-DEK size, key status, and last access.

- **Live threat LED & abnormal-activity triggers**: The Security Dashboard header carries a pulsing red LED with an open-alert count.  Triggers include: failed login, unknown-email login, brute-force bursts, successful sign-in from a new IP, wrong share passcode, failed vault unlock, abnormal download volume, decryption/integrity failure, and failed Admin Visit password.

- **Clean UI/UX**: Deep blue, lavender gradient system, gradient photography on the landing/auth/share pages, glass style panels, gradient imagery, and a consistent component design. Charts and graphs use a dark red colour palette.

- **Passcode-protected shares**: Link-based or direct shares with an optional 4–64 character passcode. Recipients must verify the passcode before accessing the file. Incorrect attempts are rate-limited, recorded, and flagged as security alerts.

- **Secure Folder (per user)**: A private vault for each user. Users can create a vault password and unlock the folder to upload, preview, download, and move files in and out.

- **Per-file encryption keys**: Every file receives a unique AES-256-GCM data encryption key (DEK). The versioned master key (KEK) wraps the DEK instead of directly encrypting file contents. Encryption keys are managed separately from stored ciphertext. Key rotation re-wraps the data keys without re-encrypting the files. Each file ID is also used as Additional Authenticated Data (AAD) to prevent ciphertext from being swapped between files.


**Milestone 1:**
Designed the system architecture, with a React frontend talking to a FastAPI backend and three databases (PostgreSQL, MongoDB, Redis).
Set up the project with Docker for the databases, environment variables for configuration, and Tailwind CSS plus Axios on the frontend.
Built registration and login with bcrypt password hashing and JWT sessions.
Added role-based access control (Admin, User, Guest). MFA and OAuth were laid down as foundations, and Google and Microsoft sign-in now work.
Built the file upload pipeline, which validates file type and size, stores the file, and saves metadata.
Built the dashboard with a sidebar, search bar, storage indicator, upload modal with progress, file list, and folder navigation and filtering.

**Milestone 2:**
Every file is encrypted with AES-256-GCM before it reaches storage. Each file gets its own data key (DEK) and a unique nonce.
Added envelope encryption. A versioned master key (KEK) wraps each DEK, and keys are stored separately from the ciphertext.
Key rotation re-wraps the DEKs without re-encrypting any files, so old files stay decryptable.
The file ID is used as Additional Authenticated Data, so ciphertext cannot be swapped between files, and tampering is detected.
Encrypted files go to private cloud storage. PostgreSQL keeps the metadata and the protected key references.
Downloads check ownership or permission first, then fetch, decrypt in memory, and verify integrity.
Secure share links use unpredictable tokens, owner-set expiry, revocation, and view-only or download permissions. Passcode protection is optional.
Access control is enforced in the backend on every request. Expired, revoked, or unauthorized access is denied.

**Milestone 3:**
Activity monitoring: logins, failed logins, uploads, downloads, shares, link events, and unauthorized attempts are recorded in MongoDB with user, file, status, IP, and timestamp.
Audit logging: a reusable audit function feeds an audit_logs collection. Admin-only APIs filter by user, file, activity type, date, and status.
Notifications: in-app notifications for shares, downloads, and link-expiry reminders, plus security alerts for admins. Email notifications and a bell icon with an unread count and mark-as-read.
Reports: upload, download, sharing, user activity, and security reports with filters, shown as tables and charts in the admin dashboard.
Storage analytics: total and per-user storage, file statistics, most downloaded files, and charts (pie, bar, line) filtered by date, user, and file type.
Suspicious activity detection: rule-based detection (brute force, unauthorized access, excessive downloads, expired or revoked link attempts). Alerts carry a severity and appear in the Security Dashboard, with the live threat LED.

**Demo Video Screen Recording of Website working and Admin Gate:** 
Watch the demo here: https://drive.google.com/file/d/1KQrzR44yzvOOUSZ2tWTn1Qff6twrgKwD/view?usp=sharing
