# TrustShare

**A secure, encrypted file-sharing platform with a built-in security control room.**

Every file is encrypted with **AES-256-GCM** before it is stored. Owners decide exactly who can open a file and for how long. Administrators get live monitoring: who is active, who is attacking, who gets let in, and how storage is used.

Built with **FastAPI (Python)**, **React**, **PostgreSQL**, **MongoDB** and **Redis**, and started with a single Docker command.

## 1. What TrustShare does

Normal sharing tools store files readable and hand out links that never expire. TrustShare works differently:

1. **Upload:** the server checks the file (type, size, disguised programs, test-virus signature).
2. **Encrypt:** each file gets its own random 256-bit key. Only unreadable bytes are stored.
3. **Share:** with specific people, or with links that expire, can be password-protected, limited, or revoked.
4. **Watch:** every action is written to a read-only audit log, and rules raise alerts when something looks wrong.
5. **Control:** the administrator decides who gets in, can block attackers, and can plant trap files.

Think of it like this: every file is a box with its own padlock key. All the padlock keys sit in a safe, and the safe has one master key that only the server knows. Steal the boxes or the database and you get nothing.

---

## 2. Features

### Encryption and data protection
- **AES-256-GCM envelope encryption:** a fresh key and nonce for every file; keys are wrapped by a master key and never reach the browser.
- **Tamper detection:** a changed byte makes decryption fail, and the download is refused.
- **Master-key rotation:** keys have versions; rotating re-wraps only the small file keys, so old files stay readable.
- **Private storage:** only encrypted bytes are saved (local disk or AWS S3).
- **Upload checks:** allowed types only, 25 MB limit, real content must match the extension, programs disguised as documents and the antivirus test string are blocked.

### Accounts and sign-in
- Registration and login with **bcrypt** password hashing and short-lived **JWT** tokens; logging out cancels the token.
- **Two-factor login (TOTP)** with an authenticator app.
- **OAuth2:** standard password flow (works with the Authorize button in the API docs) and optional **Sign in with Google**.
- Account lock after repeated wrong passwords, plus rate limiting.
- **Roles (RBAC):** `admin` and `user`, enforced on the server for every request. A normal user can never open admin pages, even by typing the address.
- Optional **approval of new accounts** by an administrator.

### Files
- Upload with drag and drop, folders, search, filters by type, preview and download.
- Supported: PDF, images, Word, Excel, PowerPoint, TXT, CSV, MP4, MOV, WEBM.
- **Favorites**, **Recent**, **Trash** (restore within 30 days, then deleted for good).
- **Shared with Me** and **Shared by Me** pages.
- **Storage limit of 1 GB** for the platform and for each user.

### Secure sharing
- Share with people at **view**, **download** or **admin** level.
- **Share links** that expire at a chosen time, can be **view-only**, **download-limited** and **password-protected**, and can be **revoked** at any time.
- Links stop working automatically when the file is trashed or the creator loses the right to share.
- Link tokens are random 256-bit values; only their hash is stored.

### Notifications
- Bell with unread count, full **history page**, mark as read, delete, filter by type.
- Types: file shared, file downloaded, security alert, link expiring, announcement, access request.
- **E-mail** for shares, downloads, link expiry reminders and security alerts (SMTP optional), with a per-user on/off switch.
- Admins can broadcast announcements and see an **e-mail delivery log**.

### User panel
| Page | What it shows |
|---|---|
| Dashboard | animated overview, protection score, activity heatmap, live activity feed |
| My Files / Shared with Me / Shared by Me / Recent / Favorites / Trash | file management |
| Storage | usage of your 1 GB, by file type, largest files |
| File Analytics | your uploads, downloads and sharing over time (date filters) |
| Activity Logs | your own audit trail |
| Notifications | full notification history |
| My Security | security score, account protection (2FA, password, session), the ten protection layers, who can reach your files, your recent sign-ins |
| Settings | profile, change password, two-factor login |

### Admin panel (administrators only)
| Page | What it does |
|---|---|
| **Command Center** | platform security level, live numbers, platform heatmap, service health, live security feed |
| **Security Dashboard** | login monitoring, unauthorized and blocked attempts, security events, recent logins with location, **activity analytics**, audit log |
| **Threat Monitor** | non-admin users in admin areas, live login-attempt feed, targeted accounts, attacking IPs, active triggers |
| **Access Control** | approve or decline new accounts, **block IP addresses** (manual or automatic), **tripwire (trap) files** |
| **User Activity** | one row per user (logins, uploads, downloads, shares, denied, last IP) and a **live stream** of everything happening |
| **Audit Logs** | filter by user, activity, file, status, dates; CSV export; read-only (no edit or delete exists) |
| **Security Alerts** | alerts with Low / Medium / High severity, resolve with a note, **editable detection rules**, **test scenarios** |
| **Reports** | upload, download, sharing and security reports with filters and CSV export |
| **Storage Analytics** | 1 GB gauge, warning levels, days-until-full forecast, per-user storage, uploads / downloads / sharing charts with filters |
| File Analytics, Sharing Reports | platform-wide charts and every share link with its status |
| User Management | roles, enable or disable accounts |
| File Management | every file's details (never contents or keys), tripwire switch |
| Notifications | statistics, announcements, e-mail log, SMTP test |
| System Monitoring | health and response time of every service, encryption key status and rotation |

### Detection rules (14, all editable)
Repeated failed logins · repeated unauthorized file access · too many downloads · expired-link access · revoked-link access · guessed link tokens · one IP trying many accounts · attack on an admin account · unknown accounts tried · non-admin in an admin area · admin login from a new IP · repeated upload policy violations · dangerous upload blocked · tripwire file touched.

Each rule has a **threshold**, a **time window**, a **severity** and an on/off switch. Rules about an attacking IP can **auto-block** it for a chosen number of minutes. Private and local addresses are never blocked, so you cannot lock yourself out. When a rule fires, an alert is saved, every admin is notified (bell, pop-up, e-mail) and the event appears in the dashboards.

### Look and feel
- Distinct **user** and **admin** panels with their own menus.
- Four colour themes (Aurora, Ocean, Emerald, Sunset) from the palette button.
- A public home page with a live encryption lab that runs in the visitor's browser.

---

## 3. Technology

| Part | Technology | Used for |
|---|---|---|
| Frontend | React, Vite, Tailwind CSS, Recharts, Zustand | the website and charts |
| Backend | Python, FastAPI | the API, encryption, access checks, detection rules |
| PostgreSQL | structured data | users, roles, file records and wrapped keys, share links, permissions |
| MongoDB | logs and documents | audit log, security alerts, notifications, detection rules, IP block list |
| Redis | fast temporary data | sessions, rate limits, detection counters, block list cache |
| Storage | local folder or AWS S3 | encrypted files |
| Docker | docker compose | starts all five services together |

Where things happen: **Browser → FastAPI → (encrypt) → storage**, with metadata in PostgreSQL, logs in MongoDB and counters in Redis.

---

## 4. Run it (copy and paste)

All commands are for the **VS Code terminal** (`` Ctrl + ` ``). On Windows use PowerShell.

### 4.1 Install once

- **Docker Desktop** (start it and wait until it says "running")
- **VS Code**
- For development mode and the tests only: **Node.js 18 or newer** and **Python 3.11 or newer**

Check that everything is installed:

```powershell
docker --version
docker compose version
node --version
python --version
