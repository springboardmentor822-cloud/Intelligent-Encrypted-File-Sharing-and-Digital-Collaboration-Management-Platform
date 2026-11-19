# TrustShare

TrustShare is a secure file-sharing and collaboration application. It has a React frontend and a FastAPI backend. Files are encrypted before storage, and users can manage files, create time-limited share links, and review security activity.

## Features

- User and administrator authentication
- Role-protected backend APIs
- Encrypted file upload and download using AES-256-GCM
- Temporary file-sharing links with expiration and revocation
- File activity, notifications, and audit views
- Security and administration dashboards

## Tech stack

- **Frontend:** React 18, Vite
- **Backend:** Python, FastAPI, SQLAlchemy
- **Database:** SQLite by default
- **File storage:** Local encrypted vault by default; optional AWS S3

## Requirements

- Python 3.12
- Node.js and npm

## Run locally

Open two separate PowerShell terminals from the project directory.

### 1. Start the backend

```powershell
cd backend
py -3.12 -m pip install fastapi uvicorn sqlalchemy python-multipart cryptography argon2-cffi boto3 "pydantic[email]" pytest httpx
py -3.12 seed_db.py
py -3.12 -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API will be available at [http://127.0.0.1:8000](http://127.0.0.1:8000). Interactive API documentation is at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### 2. Start the frontend

```powershell
cd frontend
npm install
npm run dev
```

Open the local address printed by Vite, usually [http://localhost:5173](http://localhost:5173).

## Demo accounts

The database seed script creates local demonstration accounts. Their credentials are set in `backend/seed_db.py`. These are for local development only—change them before deploying or publishing a production service.

## Run backend tests

```powershell
cd backend
py -3.12 -m pytest -q
```

## Configuration and security

- The application uses SQLite and local file storage by default.
- AWS S3 can be configured with environment variables for storage credentials and bucket details.
- In production, set a strong `MASTER_ENCRYPTION_KEY` through a secure environment or secrets manager. Never commit encryption keys, passwords, or `.env` files.
- Do not upload the local database, encrypted vault contents, `node_modules`, build output, or Python cache files to GitHub.

## Project documentation

- [API documentation](API_DOCUMENTATION.md)
- [Implementation roadmap](IMPLEMENTATION_ROADMAP.md)
- [Project analysis](PROJECT_ANALYSIS.md)
- [Security audit](SECURITY_AUDIT.md)

## License

Add a license before redistributing this project.
