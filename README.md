# TrustShare – Secure Encrypted File Sharing Platform

TrustShare is a secure, web-based file storage and sharing platform designed to protect files while enabling safe collaboration. It uses AES-256-GCM encryption to protect uploaded files and provides authenticated access, controlled file sharing, activity tracking, and security monitoring.

The application provides separate User and Admin panels, allowing users to manage their files while administrators monitor platform activity, security events, access permissions, and storage usage.

<<<<<<< HEAD
## 1. What TrustShare does
=======
---

## 1. Key Features

### User Features
- Secure user registration and login.
- JWT-based authentication.
- Upload, download, preview, and manage files.
- AES-256-GCM file encryption.
- Create folders and organize files.
- Share files through controlled sharing links.
- Configure link expiry, download limits, passwords, and view-only access.
- Manage shared files, favorites, recent files, and trash.
- Restore deleted files during the retention period.
- View file analytics and activity logs.
- Monitor personal security activity.

### Admin Features
- Dedicated administrator dashboard.
- User management and account approval.
- File and sharing management.
- Security dashboard and threat monitoring.
- Audit logs and activity tracking.
- Security alerts and notifications.
- Storage analytics and monitoring.
- Access control and IP blocking.
- Security reports and CSV exports.
- Encryption key management.

### Security Features
- AES-256-GCM file encryption.
- JWT-based authentication.
- Password hashing using bcrypt.
- Role-Based Access Control (RBAC).
- Multi-Factor Authentication (MFA) support using TOTP.
- Audit logging and security event monitoring.
- Controlled file-sharing links.
- Encryption key rotation support.

---

## 2. Technology Stack
>>>>>>> 42655aa (Updated TrustShare README documentation)

| Component | Technology |
|---|---|
| Frontend | React.js, JavaScript |
| Styling | Tailwind CSS |
| Build Tool | Vite |
| Backend | Python, FastAPI |
| Database | PostgreSQL |
| Document / Log Storage | MongoDB |
| Caching | Redis |
| Authentication | JWT |
| Password Hashing | bcrypt |
| File Encryption | AES-256-GCM |
| API Communication | Axios |
| Charts and Analytics | Recharts |
| Containerization | Docker, Docker Compose |

---

## 3. Project Structure

```text
trustshare/
│
├── backend/
│   ├── app/
│   │   ├── core/          # Configuration, security and encryption
│   │   ├── db/            # Database connections
│   │   ├── models/        # Database models
│   │   ├── routers/       # API endpoints
│   │   ├── schemas/       # Request and response schemas
│   │   ├── services/      # Business logic and security services
│   │   └── main.py        # FastAPI application entry point
│   │
│   ├── scripts/           # Utility scripts
│   ├── tests/             # Backend test cases
│   ├── uploads/           # Local file storage
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Application pages
│   │   ├── store/         # Application state
│   │   └── lib/           # API and utility functions
│   │
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
│
├── docs/                  # Project documentation
├── .env.example
├── .gitignore
├── docker-compose.yml
├── update.ps1
└── README.md
```

---

## 4. Prerequisites

Install the following before running the application:

1. **Git** – For source code management.
2. **Docker Desktop** – For running the application and databases.
3. **Node.js and npm** – For frontend development.
4. **Python 3.12** – For backend development.

For the easiest setup, Docker Desktop is recommended.

---

## 5. Run the Application Using Docker (Recommended)

Docker Compose allows you to run the frontend, backend, PostgreSQL, MongoDB, and Redis together.

### Step 1: Clone the repository

```bash
git clone <YOUR_REPOSITORY_URL>
```

Navigate into the project directory:

```bash
cd trustshare
```

### Step 2: Prepare the local environment file

Make sure your local `.env` file is available in the root project directory. If you have an `.env.example` file, create your local copy:

```powershell
<<<<<<< HEAD
docker --version
docker compose version
node --version
python --version
=======
Copy-Item .env.example .env
```

The application requires the appropriate environment variables to be configured before starting.

### Step 3: Start Docker Desktop

Open Docker Desktop and wait until the Docker engine is running.

### Step 4: Build and start the application

Run this command from the root `trustshare` directory:

```bash
docker compose up --build
```

Wait for all containers to start successfully.

### Step 5: Access the application

| Service | URL |
|---|---|
| TrustShare Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger API Documentation | http://localhost:8000/docs |
| Backend Health Check | http://localhost:8000/health |

### Step 6: Register and log in

1. Open the TrustShare frontend.
2. Register a user account.
3. Log in using your credentials.
4. Upload and manage files.
5. Test file sharing and other available features.

Administrator access depends on the administrator account configuration.

### Run Docker in the background

```bash
docker compose up -d --build
```

### Check running containers

```bash
docker compose ps
```

### View application logs

```bash
docker compose logs
```

View backend logs:

```bash
docker compose logs backend
```

View frontend logs:

```bash
docker compose logs frontend
```

### Stop the application

```bash
docker compose down
```

**Note:** Avoid `docker compose down -v` unless you intentionally want to delete the persistent database and uploaded-file volumes.

---

## 6. Run the Application in Development Mode

You can also run the backend and frontend separately while using Docker for the databases.

### Step 1: Start the database services

From the root project directory:

```bash
docker compose up -d postgres mongo redis
```

Check the database containers:

```bash
docker compose ps
```

### Step 2: Start the backend

Open a new terminal:

```powershell
cd backend
```

Create a virtual environment:

```powershell
python -m venv venv
```

Activate it:

```powershell
.\venv\Scripts\Activate.ps1
```

If PowerShell blocks activation:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Then activate again:

```powershell
.\venv\Scripts\Activate.ps1
```

Install backend dependencies:

```bash
pip install -r requirements.txt
```

Start the FastAPI server:

```bash
uvicorn app.main:app --reload
```

Backend URL:

http://localhost:8000

### Step 3: Start the frontend

Open another terminal:

```powershell
cd frontend
```

Install frontend dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Frontend URL:

http://localhost:5173

Keep both terminals running while using the application.

---

## 7. Running Backend Tests

The backend includes automated tests for application functionality and security.

Navigate to the backend directory:

```bash
cd backend
```

Activate the virtual environment:

```powershell
.\venv\Scripts\Activate.ps1
```

Run the tests:

```bash
pytest -v
```

---

## 8. API Documentation

TrustShare uses FastAPI to provide interactive API documentation.

Once the backend is running, open:

http://localhost:8000/docs

The Swagger interface allows developers to explore API endpoints, view request and response structures, and test supported API operations.

---

## 9. Important Application Modules

| Module | Description |
|---|---|
| Authentication | User registration, login and token management |
| File Management | Uploading, downloading and organizing files |
| Encryption | Protecting stored files using AES-256-GCM |
| File Sharing | Controlled sharing with expiry and access restrictions |
| User Dashboard | Personal file and activity management |
| Admin Dashboard | Platform-level management and monitoring |
| Security Dashboard | Security events and threat monitoring |
| Audit Logs | Tracking application activities |
| Analytics | File, storage and sharing statistics |
| Notifications | Application notifications and alerts |

---

## 10. Security Considerations

- Passwords are hashed before storage.
- JWT authentication protects secured API endpoints.
- Role-based access control restricts administrator functionality.
- AES-256-GCM protects stored file contents.
- Audit logs help track application activity.
- Sharing links support access restrictions and expiration.
- Sensitive credentials and encryption keys should be kept private.
- The `.env` file must never be uploaded to a public GitHub repository.

---

## 11. Future Enhancements

Potential improvements include:

- Advanced real-time collaboration.
- Additional cloud storage integrations.
- Enhanced notification mechanisms.
- More detailed security analytics.
- Improved mobile responsiveness.

>>>>>>> 42655aa (Updated TrustShare README documentation)
