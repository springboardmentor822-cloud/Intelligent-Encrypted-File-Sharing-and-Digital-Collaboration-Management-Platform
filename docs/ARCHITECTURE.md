# TrustShare Architecture & System Design Documentation

---

## 1. System Overview

**TrustShare** is an enterprise-grade intelligent encrypted file-sharing and digital collaboration management platform designed around zero-trust cryptographic guarantees, multi-cloud persistence, and real-time security observability.

```mermaid
flowchart TD
    subgraph ClientLayer["Client Layer (Frontend)"]
        UI["Next.js 16 Web Dashboard\n(Tailwind CSS, Axios, Recharts)"]
    end

    subgraph GatewayLayer["API Gateway & Services (Backend)"]
        API["FastAPI Cryptographic Backend Engine"]
        AUTH["JWT / RBAC Identity Provider"]
        CRYPTO["AES-256-GCM Envelope Encryption Engine"]
        SEC_ENG["Suspicious Activity Detection Engine"]
        REP["Reporting & Analytics Engine"]
        EMAIL["Notification & Email Service (SES / SMTP)"]
    end

    subgraph DataPersistence["Persistence & Storage Layer"]
        PG[("PostgreSQL 16\nUsers, File Metadata, RBAC, Wrapped DEKs")]
        MONGO[("MongoDB Atlas Cloud\nImmutable Audit Logs, Activity Streams, Alerts")]
        REDIS[("Redis 7 Cache\nSession Tokens & Rate Limits")]
        S3[("AWS S3 Private Cloud Vault\n(Encrypted Ciphertext Payloads)")]
    end

    UI <-->|HTTPS REST API / JWT| API
    API --> AUTH
    API --> CRYPTO
    API --> SEC_ENG
    API --> REP
    API --> EMAIL

    AUTH <-->|User Auth & Roles| PG
    CRYPTO <-->|Encrypted Payloads| S3
    CRYPTO <-->|Store Wrapped DEKs| PG
    SEC_ENG <-->|Audit Trails & Security Events| MONGO
    API <-->|Session Invalidation & Caching| REDIS
```

---

## 2. Multi-Database Architecture

TrustShare leverages a polyglot persistence model to maximize performance, scalability, and audit compliance:

| Database | Role | Schema / Collection Structure | Key Responsibilities |
| :--- | :--- | :--- | :--- |
| **PostgreSQL 16** | Relational System of Record | `users`, `files`, `share_links`, `notifications`, `audit_logs` | ACID transactions, user identity, file metadata, temporal share link validation, wrapped DEK storage. |
| **MongoDB Atlas** | High-Throughput Event Store | `activity_logs`, `audit_logs`, `security_alerts`, `email_dispatches` | Flexible document logging, immutable audit records, time-series threat detection queries, and telemetry aggregation. |
| **Redis 7** | In-Memory Cache | Key-value store | Token revocation blacklists, rapid session lookups, and brute-force rate-limiting. |
| **AWS S3** | Cloud Object Storage | Bucket: `trustshare-vault-sanjith` | Encrypted ciphertext storage. Zero plaintext bytes ever touch cloud storage. |

---

## 3. End-to-End File Upload and Download Flows

### 3.1 Upload Flow (Encrypt-Before-Store)
```mermaid
sequenceDiagram
    autonumber
    actor User as Client (Browser)
    participant API as FastAPI Backend
    participant KEK as Key Manager
    participant DB as PostgreSQL
    participant S3 as AWS S3 Vault
    participant Log as MongoDB Atlas

    User->>API: POST /api/v1/files/upload (Multipart Plaintext)
    API->>API: Validate MIME type, size limit (<50MB) & user quota
    API->>KEK: Generate random 256-bit DEK
    API->>API: Encrypt file with AES-256-GCM (Nonce + Ciphertext + Tag)
    API->>KEK: Wrap DEK with Master KEK via HKDF-SHA256
    API->>S3: Upload raw ciphertext payload to s3://trustshare-vault-sanjith/...
    API->>DB: Save metadata (name, size, S3 key, wrapped DEK)
    API->>Log: Log FILE_UPLOAD event with IP and timestamp
    API-->>User: 201 Created (File ID, name, encryption confirmation)
```

### 3.2 Download Flow (Decrypt-In-Memory)
```mermaid
sequenceDiagram
    autonumber
    actor User as Authorized Client
    participant API as FastAPI Backend
    participant DB as PostgreSQL
    participant S3 as AWS S3 Vault
    participant Log as MongoDB Atlas

    User->>API: GET /api/v1/files/{id}/download (Bearer Token)
    API->>DB: Verify user ownership or active share link
    API->>DB: Fetch wrapped DEK and S3 storage path
    API->>S3: Stream encrypted ciphertext
    API->>API: Unwrap DEK using Master KEK
    API->>API: Decrypt stream with AES-256-GCM & verify 128-bit auth tag
    alt Integrity Check Fails (Tampering Detected)
        API->>Log: Log UNAUTHORIZED_ACCESS & raise DecryptionError
        API-->>User: 400 Bad Request (Integrity Verification Failed)
    else Tag Matches
        API->>Log: Log FILE_DOWNLOAD event
        API-->>User: 200 OK (Decrypted original file stream)
    end
```

---

## 4. Security Observability & Anomaly Detection

The Suspicious Activity Detection Engine continuously processes incoming events against rule thresholds:

```
+-------------------------------------------------------------------------------+
|                       SUSPICIOUS ACTIVITY DETECTION RULES                     |
+-------------------------------------------------------------------------------+
| 1. Brute-Force Logins     : > 5 failed attempts in 10 minutes  --> HIGH       |
| 2. Unauthorized Access    : >= 3 unauthorized attempts in 15m  --> HIGH       |
| 3. Excessive Downloads    : > 20 downloads in 5 minutes        --> MEDIUM     |
| 4. Expired Link Access    : Any access attempt to expired link --> MEDIUM     |
| 5. Revoked Link Access    : Any access attempt to revoked link --> HIGH       |
+-------------------------------------------------------------------------------+
```

When a rule triggers:
1. A permanent alert is stored in PostgreSQL and MongoDB.
2. In-app notifications are created for administrators.
3. Automated security notification emails are dispatched via AWS SES / SMTP.
4. The Admin Dashboard reflects the threat in real-time with severity categorization.

