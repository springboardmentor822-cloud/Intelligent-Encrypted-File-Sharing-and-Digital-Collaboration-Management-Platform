# TrustShare — Intelligent Encrypted File Sharing and Digital Collaboration Management Platform

**Live demo:** https://52-64-46-232.nip.io

> The demo runs on a single AWS EC2 server and may be stopped outside demo times to save cost.

TrustShare is a secure file-sharing platform. Every file is encrypted before it is stored, access is controlled by user roles, and every share link can be limited, made view-only, or revoked at any time. Administrators get audit logs, upload reports, security monitoring and analytics.

## Features

- **Server-side AES-256-GCM envelope encryption** – every file is encrypted before it is stored; the master key is held in AWS KMS (or locally in development), with versioned keys for rotation.
- **Secure sharing links** – expiring links, view-only links that show the decrypted file but refuse downloads, revocable links (revoked links return 410), and unknown links return 404.
- **Suspicious-activity detection** – rule-based detection feeding the security monitoring dashboard.
- **Upload protection** – executable files are rejected, and files whose content does not match their extension are blocked.
- **Role-based access control** – normal users are blocked from admin overview, audit logs, upload reports, security monitoring and analytics.
- **Audit logs and admin dashboards** – activity tracking, upload reports, storage analytics, security monitoring summary and analytics overview.
- **File lifecycle** – soft delete and permanent delete.
- **Authentication** – JWT access and refresh tokens, multi-factor authentication (MFA), and optional Google and Microsoft OAuth2 sign-in.
- **Storage quotas and upload limits** – configurable per-user quota and maximum upload size.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, Tailwind CSS |
| Backend | Python, FastAPI, Alembic migrations, pytest |
| Databases | PostgreSQL 16, MongoDB 7, Redis 7 |
| File storage | AWS S3 (MinIO in development) |
| Key management | AWS KMS (local master keys in development) |
| Web server | nginx (TLS termination, single public entry point) |
| Certificates | Let's Encrypt |
| Infrastructure | Docker Compose on AWS EC2 (Ubuntu 24.04) |

## Architecture

```
Browser ──HTTPS──> nginx ──> frontend (Next.js)
                        └──> backend API (/api/v1) ──> PostgreSQL, MongoDB, Redis
                                                  ├──> AWS S3 (encrypted files)
                                                  └──> AWS KMS (master key)
```

In production only nginx is reachable from the internet (ports 80 and 443). The databases are not published, and the server reaches S3 and KMS through an IAM role, so no AWS access keys are stored in the app.

## Run locally

Requirements: Docker Desktop (Compose v2.24 or newer) and Python 3.

```bash
git clone --branch ramcharan-trust-share https://github.com/springboardmentor822-cloud/Intelligent-Encrypted-File-Sharing-and-Digital-Collaboration-Management-Platform.git trustshare
cd trustshare

# Create .env with random secrets (or copy .env.example to .env and fill it in)
python scripts/generate_env.py

docker compose up -d --build
```

Then open:

- App: http://localhost:3000
- API: http://localhost:8000/api/v1
- MailHog (catches all emails in development): http://localhost:8025

Sign in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your `.env`.

## Deploy to production

The production overlay adds nginx with HTTPS, removes all database ports, bakes the code into the images and switches file storage to AWS S3:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Full AWS steps (S3 bucket, KMS key, IAM role, EC2, certificate and production `.env`) are in [docs/DEPLOYMENT_AWS.md](docs/DEPLOYMENT_AWS.md).

## Testing

End-to-end smoke test against any running instance:

```bash
python scripts/smoke_test.py http://localhost:8000/api/v1
```

It checks sharing links, revocation, role-based access, upload validation and permanent deletion. Backend unit tests run with pytest from the `backend` folder.

## Security notes

- Never commit `.env`, `*.pem` key files, `storage_data/` or `deploy/certs/` (all listed in `.gitignore`).
- In production set `SEED_DEMO_USERS=false` and use strong, random secrets.

## License

See [LICENSE](LICENSE).