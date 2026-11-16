# TrustShare: Intelligent Encrypted File Sharing & Digital Collaboration Management Platform

[![Docker Compose](https://img.shields.io/badge/Docker-Compose_3.8-blue.svg)](docker-compose.yml)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI_0.110-009688.svg)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js_16-000000.svg)](https://nextjs.org)
[![AWS S3](https://img.shields.io/badge/Cloud_Vault-AWS_S3-FF9900.svg)](https://aws.amazon.com/s3/)
[![MongoDB Atlas](https://img.shields.io/badge/Audit_DB-MongoDB_Atlas-47A248.svg)](https://www.mongodb.com/atlas)
[![PostgreSQL](https://img.shields.io/badge/Relational_DB-PostgreSQL_16-336791.svg)](https://www.postgresql.org)
[![AES-256-GCM](https://img.shields.io/badge/Cryptography-AES--256--GCM-critical.svg)](docs/KEY_MANAGEMENT_LIFECYCLE.md)

---

## 1. Project Overview

**TrustShare** is a secure, end-to-end encrypted cloud document collaboration and sharing platform built to protect sensitive organizational assets against unauthorized access, data leaks, and tampering. The system implements a **zero-trust architecture** with server-side pre-encryption (AES-256-GCM envelope encryption), live AWS S3 cloud storage, immutable MongoDB Atlas audit logging, temporal share links with granular quotas, and an automated rule-based threat detection engine.

### Core Architectural Highlights
* **Zero Plaintext Cloud Storage:** 100% of files are encrypted using unique 256-bit symmetric keys in memory *before* being transmitted to AWS S3.
* **Envelope Encryption (DEK & KEK):** File Data Encryption Keys (DEKs) are wrapped by a master Key Encryption Key (KEK) using HKDF-SHA256 derivation.
* **Polyglot Multi-Database Storage:**
  * **PostgreSQL 16:** User accounts, roles, file metadata, temporal share links, and wrapped DEK vault.
  * **MongoDB Atlas Cloud:** Immutable audit logs, activity streams, security events, and email dispatch audit history.
  * **Redis 7:** Token blacklisting, session state, and rate limiting.
  * **AWS S3:** Private cloud object vault storing encrypted ciphertext payloads.
* **Automated Threat Detection Engine:** Monitors logins, downloads, and link access in real-time, detecting brute-force attempts, download spikes, and unauthorized breaches.
* **Multi-Channel Alerts:** In-app real-time notification drawer and automated email delivery via AWS SES and SMTP.
* **Enterprise Reporting & Analytics:** Visual telemetry dashboard and instant CSV audit exports.

---

## 2. Milestone Deliverables Summary

### Milestone 1: Core Platform Architecture & Identity (Weeks 1–2) — 100% Complete
- [x] Docker multi-container stack (PostgreSQL, Redis, FastAPI, Next.js).
- [x] User registration, login, and bcrypt password hashing.
- [x] JWT authentication and Role-Based Access Control (`User` and `Admin`).
- [x] File intake validation (size limits, MIME types) and metadata recording.
- [x] Interactive responsive web dashboard with upload modal, search, and inventory views.

### Milestone 2: Encryption & Secure Cloud File Sharing (Weeks 3–4) — 100% Complete
- [x] **AES-256-GCM File Encryption:** 96-bit unique nonces, 128-bit authentication tags.
- [x] **AWS S3 Cloud Storage Integration:** Live connection to bucket `trustshare-vault-sanjith` in `ap-southeast-2`.
- [x] **Envelope Key Management:** Per-file DEK wrapped by master KEK; Master Key zero-downtime rotation.
- [x] **Encrypted File Retrieval & In-Memory Decryption:** Verified decryption and streaming to authorized clients.
- [x] **Tamper Detection:** Authentication tag verification with `InvalidTag` alerting.
- [x] **Secure File Sharing:** 256-bit entropy tokens, hashed DB storage, and permissions (`view`/`download`).
- [x] **Temporal Link Expiration & Revocation:** Configurable TTL, max downloads quota, and manual revocation.
- [x] [Key Management & Lifecycle Documentation](docs/KEY_MANAGEMENT_LIFECYCLE.md).

### Milestone 3: Monitoring, Notifications, Analytics & Security (Weeks 5–6) — 100% Complete
- [x] **Activity Monitoring System:** Continuous tracking of logins, uploads, downloads, and shares in MongoDB.
- [x] **Audit Logging Workflows:** Permanent `audit_logs` collection with admin query filters and local timezone formatting.
- [x] **Multi-Channel Notification System:** In-app notification center and email notification service (AWS SES / SMTP).
- [x] **Automated Link Expiry Scanner:** Background worker scanning soon-to-expire links and alerting owners.
- [x] **File Activity & Security Reports:** Comprehensive reports on uploads, downloads, sharing, and security.
- [x] **Report CSV Export:** One-click CSV export for upload, download, sharing, and security audit logs.
- [x] **Storage Analytics Dashboard:** Real-time quota calculation, file type distributions, and user usage charts.
- [x] **Suspicious Activity Detection Engine:** Real-time rule evaluation (failed logins >5 in 10m, unauthorized access, excessive downloads >20 in 5m, expired/revoked link reuse).
- [x] **Unified Admin Dashboard:** Comprehensive interface integrating analytics, activity, security alerts, and system telemetry.
- [x] [Architecture & System Design Documentation](docs/ARCHITECTURE.md).
- [x] [Complete REST API Reference Manual](docs/API_DOCUMENTATION.md).

---

## 3. Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Lucide Icons, Axios, Recharts |
| **Backend API** | Python 3.12, FastAPI, Pydantic v2, Uvicorn, SQLAlchemy 2.0 |
| **Cryptography** | Python `cryptography` (AES-256-GCM, HKDF-SHA256, CSPRNG) |
| **Cloud Storage** | AWS S3 (`boto3`) |
| **Databases** | PostgreSQL 16, MongoDB Atlas Cloud, Redis 7 |
| **Email Service**| AWS Simple Email Service (SES) & Standard SMTP |
| **DevOps** | Docker, Docker Compose |

---

## 4. Quickstart & Deployment Guide

### Prerequisites
* Docker and Docker Compose installed.
* Python 3.10+ and Node.js 18+ (if running locally outside Docker).

### Running with Docker Compose (Recommended)
Clone the repository and launch the multi-container stack:

```bash
# 1. Start all 4 microservices
docker compose up -d --build

# 2. Check container status
docker ps
```

The services will be available at:
* **Frontend Web Dashboard:** `http://localhost:3000`
* **FastAPI Backend & Interactive Swagger API Docs:** `http://localhost:8000/docs`
* **PostgreSQL Database:** `localhost:5433` (mapped to internal `5432`)
* **Redis Cache:** `localhost:6379`

### Environment Configuration

The backend environment variables are configured in `backend/.env` and `docker-compose.yml`:

```env
# Application Settings
PROJECT_NAME="TrustShare"
SECRET_KEY="your-production-secret-key"
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# PostgreSQL Configuration
DATABASE_URL="postgresql+psycopg2://postgres:trustshare_secure_db_pass@db:5432/TrustShare_Users"

# MongoDB Atlas Configuration
MONGODB_URL="mongodb+srv://<username>:<password>@cluster0.jegyxqy.mongodb.net/?appName=Cluster0"
MONGODB_DB_NAME="TrustShare_Logs"

# Redis Cache
REDIS_URL="redis://redis:6379/0"

# Milestone 2: AWS S3 Cloud Storage Integration
STORAGE_BACKEND="s3"
AWS_ACCESS_KEY_ID="AKIAR4ND6YNDSIA2TQVF"
AWS_SECRET_ACCESS_KEY="your-aws-secret-access-key"
AWS_REGION="ap-southeast-2"
AWS_S3_BUCKET="trustshare-vault-sanjith"

# Milestone 3: Notification & Email Configuration
EMAIL_PROVIDER="auto"          # "ses", "smtp", or "console"
EMAILS_FROM_EMAIL="notifications@trustshare.io"
```

---

## 5. Verification & Testing Suites

TrustShare includes end-to-end test suites verifying all cryptographic guarantees:

```bash
# Test 1: Milestone 2 Cloud Storage & AES-256-GCM Live Upload Test
python backend/test_live_s3_upload.py

# Test 2: Milestone 2 Storage Backend Verification
python backend/test_e2e_storage.py

# Test 3: Milestone 3 Activity Monitoring & Security Anomaly Testing
python backend/test_milestone3_monitoring.py
```

---

## 6. Project Documentation Index

* [System Architecture & Data Flows](docs/ARCHITECTURE.md)
* [Cryptographic Key Management & Envelope Rotation](docs/KEY_MANAGEMENT_LIFECYCLE.md)
* [REST API Reference Manual](docs/API_DOCUMENTATION.md)

---

## 7. License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
