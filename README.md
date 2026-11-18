# TrustShare – Intelligent Encrypted File Sharing and Digital Collaboration Management Platform

## 1. Project Overview

TrustShare is a secure file-sharing and digital collaboration platform designed to help users upload, store, manage, and share files securely.

The platform focuses on protecting sensitive information through encryption, authenticated access, controlled file sharing, and activity monitoring. It provides users with an organized environment to manage their files while offering administrators tools to monitor users, security events, and platform activities.

The application is developed using React.js for the frontend and Python FastAPI for the backend, with PostgreSQL, MongoDB, and Redis supporting data storage and application services.

## 2. Key Features

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

## 3. Technology Stack

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

## 4. Project Structure

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

## 5. Prerequisites

Install the following software before running the application:

1. **Git** – For source code management.
2. **Docker Desktop** – For running the application and supporting services.
3. **Node.js and npm** – For frontend development.
4. **Python 3.12** – For backend development.

For the easiest setup, Docker Desktop is recommended.

## 6. Running the Application Using Docker

Docker Compose allows the application and its supporting services to run together.

### Step 1: Clone the Repository

```bash
git clone <YOUR_REPOSITORY_URL>
```

Navigate to the project directory:

```bash
cd trustshare
```

### Step 2: Prepare the Environment File

If `.env.example` is available, create a local `.env` file.

For Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

For Git Bash or Unix:

```bash
cp .env.example .env
```

Configure the required values in `.env` according to the application's requirements.

Do not upload your actual `.env` file to GitHub.

### Step 3: Start Docker Desktop

Open Docker Desktop and wait until the Docker engine is running.

### Step 4: Build and Start the Application

From the root project directory, run:

```bash
docker compose up --build
```

Wait for the containers to start.

### Step 5: Access the Application

The following are the expected local service addresses, provided the Docker configuration uses these ports:

| Service | URL |
|---|---|
| TrustShare Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger API Documentation | http://localhost:8000/docs |
| Backend Health Check | http://localhost:8000/health |

### Step 6: Register and Log In

1. Open the TrustShare frontend.
2. Register a user account.
3. Log in using your credentials.
4. Upload and manage files.
5. Test file-sharing functionality and other available features.

Administrator access depends on the administrator account configuration.

### Run Docker in the Background

```bash
docker compose up -d --build
```

### Check Running Containers

```bash
docker compose ps
```

### View Application Logs

```bash
docker compose logs
```

### View Backend Logs

```bash
docker compose logs backend
```

### View Frontend Logs

```bash
docker compose logs frontend
```

### Stop the Application

```bash
docker compose down
```

**Note:** Avoid `docker compose down -v` unless you intentionally want to delete persistent database and uploaded-file volumes.

## 7. Running the Application in Development Mode

The backend and frontend can also be started separately while using Docker for the supporting database services.

### Step 1: Start the Database Services

From the root project directory:

```bash
docker compose up -d postgres mongo redis
```

Check the running services:

```bash
docker compose ps
```

### Step 2: Start the Backend

Open a new terminal and navigate to the backend directory:

```bash
cd backend
```

Create a Python virtual environment:

```bash
python -m venv venv
```

Activate the virtual environment in Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Then activate the environment again:

```powershell
.\venv\Scripts\Activate.ps1
```

Install the backend dependencies:

```bash
pip install -r requirements.txt
```

Start the FastAPI server:

```bash
uvicorn app.main:app --reload
```

Backend URL:

http://localhost:8000

### Step 3: Start the Frontend

Open another terminal and navigate to the frontend directory:

```bash
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

## 8. Running Backend Tests

Navigate to the backend directory:

```bash
cd backend
```

Activate the Python virtual environment and run:

```bash
pytest -v
```

This executes the available backend test cases.

## 9. API Documentation

TrustShare uses FastAPI to provide interactive API documentation.

After starting the backend, open:

http://localhost:8000/docs

The Swagger interface allows developers to:

- Explore available API endpoints.
- View request and response structures.
- Understand API parameters.
- Test supported API operations.

## 10. Important Application Modules

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

## 11. Security Considerations

- Passwords are hashed before storage.
- JWT authentication protects secured API endpoints.
- Role-Based Access Control restricts administrator functionality.
- AES-256-GCM protects stored file contents.
- Audit logs help track application activities.
- Sharing links support access restrictions and expiration.
- Sensitive credentials and encryption keys must be kept private.
- The `.env` file must never be uploaded to a public GitHub repository.
- Production deployments should use secure HTTPS connections and appropriately managed encryption keys.

## 12. Future Enhancements

Potential improvements include:

- Advanced real-time collaboration.
- Additional cloud storage integrations.
- Enhanced notification mechanisms.
- More detailed security analytics.
- Improved mobile responsiveness.

