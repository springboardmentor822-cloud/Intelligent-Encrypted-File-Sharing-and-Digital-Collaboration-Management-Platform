
# TrustShare – Project Analysis

## 1. Introduction

TrustShare is a secure file-sharing and digital collaboration platform designed to make storing, managing, and sharing digital files more controlled and reliable.

Traditional file-sharing systems make it easy to transfer documents, but users may have limited control over how shared files are accessed, how long links remain active, and how file activity is monitored. TrustShare addresses these concerns by combining encrypted file storage, user authentication, access management, and controlled sharing within a single platform.

The project focuses on improving the security and management of digital files while maintaining a straightforward user experience.

## 2. Problem Statement

Digital files are frequently shared through email attachments, messaging applications, cloud storage services, and public links. Although these methods are convenient, they can introduce security and management challenges.

Some common concerns include:

- Unauthorised access to confidential files.
- Sharing links remaining accessible longer than intended.
- Limited control over who can view or download shared files.
- Difficulty tracking file access and user activity.
- Risks associated with weak authentication and inadequate access controls.
- Exposure of sensitive information if stored files or credentials are compromised.
- Limited visibility for administrators when monitoring platform activity.

TrustShare aims to address these challenges through a centralised platform that combines file protection, access control, and activity monitoring.

## 3. Project Objectives

The primary objectives of TrustShare are:

1. Provide a secure platform for uploading, storing, downloading, and managing files.
2. Protect stored files through authenticated encryption.
3. Support secure user authentication, including email/password and third-party OAuth login.
4. Implement role-based access control to separate user and administrator permissions.
5. Allow users to create controlled file-sharing links.
6. Support link expiration and revocation to give users greater control over shared content.
7. Maintain activity records for important file and account operations.
8. Provide administrative tools for managing users and monitoring platform activity.
9. Develop an interface that makes secure file management accessible and convenient.

## 4. Proposed System Overview

TrustShare follows a frontend-backend architecture.

The frontend provides the interface through which users interact with the platform. The backend handles authentication, access validation, file operations, encryption-related processes, and communication with the database and storage layer.

The system can be understood through the following components:

| Component | Responsibility |
|---|---|
| Frontend | User interface, navigation, file management, and dashboard views |
| Backend API | Business logic, authentication, validation, and request processing |
| Authentication | User login, registration, sessions, and OAuth integration |
| Database | User information, file metadata, sharing records, and activity data |
| Encryption layer | File encryption and decryption operations |
| Storage layer | Storage and retrieval of uploaded files |
| Administration | User management and system monitoring |

## 5. Technology Stack

The project uses the following technologies based on its current development and deployment setup.

| Technology | Purpose |
|---|---|
| React | Building the frontend interface |
| TypeScript | Providing type support for frontend development |
| Vite | Frontend development and build tooling |
| Tailwind CSS | Interface styling |
| Python | Backend development |
| FastAPI | Building backend REST APIs |
| SQLAlchemy | Database interaction and ORM |
| SQLite | Relational database in the default configuration |
| AES-256-GCM | Authenticated encryption for file protection |
| Google OAuth 2.0 | Google account authentication |
| Microsoft OAuth 2.0 | Microsoft account authentication |
| Vercel | Frontend hosting |
| Render | Backend hosting |
| AWS S3 | Optional storage integration |

The exact production configuration may differ depending on the environment variables and services enabled during deployment.

## 6. System Modules

### 6.1 User Authentication Module

This module manages user identity and access to the platform.

Its intended capabilities include:

- User registration and login.
- Password-based authentication.
- Google account login.
- Microsoft account login.
- Session management.
- Logout functionality.
- Password and account-related operations.

Authentication is an important part of TrustShare because file access and other protected operations should only be available to authorised users.

### 6.2 File Management Module

The file management module allows authenticated users to manage their digital files.

Its intended operations include:

- Uploading files.
- Viewing available files.
- Downloading stored files.
- Deleting files.
- Managing file versions, where supported.
- Restoring deleted files, where supported.

File operations should validate ownership and permissions before allowing access.

### 6.3 File Encryption Module

File protection is one of the central security aspects of TrustShare.

The project specification describes the use of AES-256-GCM for file encryption. This authenticated encryption algorithm provides confidentiality and integrity protection when implemented with appropriate key and nonce management.

The described design includes:

- Generating a Data Encryption Key (DEK).
- Encrypting file content using AES-256-GCM.
- Using a nonce for each encryption operation.
- Using Additional Authenticated Data (AAD) where applicable.
- Protecting the DEK through a Key Encryption Key (KEK).
- Verifying authentication data during decryption.

The encryption implementation should be tested to ensure that altered ciphertext, invalid authentication tags, and incorrect keys are rejected.

### 6.4 Secure File-Sharing Module

This module provides controlled access to files through sharing links.

The specified design includes:

- Creating shareable links.
- Setting link expiration.
- Supporting view-only or download permissions.
- Optional password protection.
- Revoking previously created links.
- Recording sharing and access activity.

The API specification also describes generating secure random sharing tokens and storing their SHA-256 hashes rather than storing the original tokens directly.

These controls are intended to reduce the risk of unauthorised or continued access to shared files.

### 6.5 Role-Based Access Control Module

Role-based access control (RBAC) separates permissions according to the user's assigned role.

The platform distinguishes between ordinary users and administrators.

**User responsibilities may include:**
- Managing personal files.
- Creating and managing sharing links.
- Viewing relevant account activity.
- Managing profile information.

**Administrator responsibilities may include:**
- Viewing user records.
- Managing account status.
- Revoking user sessions.
- Monitoring system health.
- Reviewing security-related activity.

Every protected backend operation should independently verify the user's permissions. Hiding an interface option alone is not sufficient to enforce access control.

### 6.6 Audit and Activity Monitoring Module

The audit module is intended to maintain records of important operations performed within the platform.

Relevant events may include:

- User login and logout.
- Account creation.
- File uploads and downloads.
- File deletion.
- Sharing-link creation and revocation.
- Access to shared files.
- Password and session-related changes.
- Administrative operations.

Audit records help improve accountability and make it easier to investigate unusual activity.

Sensitive information such as passwords, session tokens, OAuth secrets, and encryption keys should never be written to application logs.

### 6.7 Notification Module

The notification module is intended to provide users with information about relevant account and file-related events.

Possible operations include:

- Retrieving notifications.
- Marking individual notifications as read.
- Marking all notifications as read.

The usefulness of this module depends on the events that are actually configured to generate notifications.

### 6.8 Analytics and Administration Module

The administration and analytics components provide visibility into platform activity.

The specified API design includes functionality for:

- Viewing user information.
- Managing account status.
- Revoking sessions.
- Checking system health.
- Viewing storage information.
- Reviewing activity summaries.

These features support platform administration and operational monitoring.

### 6.9 Security Monitoring Module

The security monitoring component is intended to identify and display potentially suspicious activity.

The project specification describes security alerts with different severity levels, including informational, low, medium, high, and critical.

It also describes an option to simulate synthetic security events for demonstration purposes.

Simulated alerts should be clearly distinguished from actual security incidents.

## 7. System Workflow

The general working process of TrustShare can be described as follows:

### Step 1: User Authentication

A user opens the platform and signs in using the available authentication method.

The backend validates the authentication request and establishes an authenticated session.

### Step 2: Access Validation

When a user requests a protected operation, the backend checks the user's session and permissions.

Requests that fail authentication or authorisation checks should be rejected.

### Step 3: File Upload

The user selects a file and submits it through the interface.

The backend validates the upload and processes the file according to the configured encryption and storage workflow.

### Step 4: Secure Storage

The file is stored using the configured storage system. Relevant file metadata is maintained in the database.

The encryption and key-management process should ensure that the original file content is not exposed through unauthorised access to stored data.

### Step 5: File Sharing

The user selects a file and creates a sharing link with the required permissions and expiration settings.

The system validates the request and generates the sharing information.

### Step 6: Shared File Access

A recipient opens the sharing link.

The backend checks whether the link exists, is valid, has expired, or has been revoked. It then applies the configured access restrictions before allowing the requested operation.

### Step 7: Activity Recording

Important operations are recorded in the relevant activity or audit records.

### Step 8: Administration and Monitoring

Administrators can use the available management and monitoring features to review users, account activity, and system status.

## 8. System Architecture

TrustShare uses a layered architecture that separates the user interface, application logic, data management, and file storage responsibilities.

```text
              USER
                |
                v
       REACT FRONTEND
                |
                v
          FASTAPI BACKEND
                |
       +--------+---------+
       |        |         |
       v        v         v
 AUTHENTI-   FILE       ACCESS
 CATION     PROCESSING   CONTROL
       |        |         |
       +--------+---------+
                |
        +-------+-------+
        |               |
        v               v
    DATABASE       ENCRYPTION
                       |
                       v
                 FILE STORAGE
```

The frontend communicates with the backend through API requests. The backend processes requests, checks permissions, interacts with the database, and performs the relevant file operations.

This separation makes the application easier to maintain and allows individual components to be improved independently.

## 9. Database and Data Management

The database is responsible for maintaining structured information required by the application.

Depending on the implemented schema, this may include:

- User accounts and profile information.
- Authentication and session records.
- File metadata.
- File ownership information.
- Sharing-link metadata.
- Notifications.
- Audit and activity records.
- Administrative and security-related information.

File content and file metadata should be treated separately. The database may store information about a file while the actual encrypted file is maintained in the configured storage system.

A production deployment should also consider persistent storage, database backups, recovery procedures, and appropriate database access permissions.

## 10. Security Analysis

Security is a major design consideration in TrustShare.

The following controls are part of the intended security approach:

| Security Area | Intended Protection |
|---|---|
| Authentication | Verifies user identity |
| OAuth 2.0 | Supports third-party account login |
| Password hashing | Protects stored password credentials |
| RBAC | Separates user and administrator permissions |
| AES-256-GCM | Protects file confidentiality and integrity |
| DEK and KEK | Separates file encryption keys from key-protection responsibilities |
| Expiring links | Limits the period of shared access |
| Link revocation | Allows access to be withdrawn |
| CSRF protection | Helps prevent cross-site request forgery |
| Audit logging | Supports accountability and investigation |
| Request validation | Helps reject malformed or invalid requests |

These controls describe the intended security design. Their effectiveness depends on correct implementation, configuration, and testing.

In particular, encryption key storage, session security, file ownership checks, upload validation, rate limiting, and production storage configuration require careful verification.

## 11. Advantages of the Proposed System

TrustShare offers several potential advantages:

1. **Centralised file management:** Users can manage their files through a single platform.
2. **Improved file protection:** Authenticated encryption helps protect stored file content.
3. **Controlled sharing:** Expiration and revocation provide greater control over shared links.
4. **Multiple authentication methods:** Users can access the platform through supported login methods.
5. **Permission management:** Role-based access control separates ordinary and administrative operations.
6. **Activity visibility:** Audit records support monitoring and accountability.
7. **Modular architecture:** Separate application modules make maintenance and future development easier.
8. **Deployment flexibility:** The frontend and backend can be deployed independently.

## 12. Limitations and Challenges

The following areas should be considered when evaluating the project:

### 12.1 Storage Persistence

Temporary or ephemeral storage can result in file loss when a hosting service restarts or redeploys.

A production system needs persistent storage or a suitable external storage service.

### 12.2 Encryption Key Management

Encryption security depends on how keys are generated, stored, accessed, rotated, and recovered.

A compromised key-management process can weaken the protection provided by file encryption.

### 12.3 Network Dependency

The platform requires network connectivity for communication between the frontend, backend, and configured storage services.

### 12.4 Hosting Constraints

Free hosting environments may have resource limits, service interruptions, or temporary storage limitations.

These factors can affect application availability and performance.

### 12.5 Security Verification

The presence of security-related modules does not automatically establish that the entire application is secure.

Authentication, authorisation, encryption, file handling, and sharing operations require systematic testing.

### 12.6 Scalability

The default database and storage configuration may need to be upgraded as the number of users, files, and simultaneous requests increases.

## 13. Testing and Evaluation

Testing is necessary to verify that the application behaves correctly and that security controls work as intended.

The following testing areas are relevant to TrustShare:

| Testing Area | What Should Be Verified |
|---|---|
| Authentication testing | Registration, login, logout, and OAuth flows |
| Session testing | Session validity, expiration, and revocation |
| Authorisation testing | Users cannot access another user's protected resources |
| File upload testing | Valid file handling, size restrictions, and invalid upload rejection |
| Encryption testing | Successful decryption and rejection of tampered ciphertext |
| Sharing testing | Link creation, expiration, permissions, and revocation |
| API testing | Correct responses for valid and invalid requests |
| Audit testing | Important operations generate appropriate records |
| Administration testing | Administrative operations are restricted to authorised roles |
| Deployment testing | Application availability, configuration, and persistent data storage |

Testing results should be documented separately, including the test conditions, expected behaviour, actual results, and any issues identified.

No test should be marked as passed without being performed.

## 14. Future Scope

TrustShare can be improved further through the following developments:

- Integration with a production-grade persistent database.
- Reliable cloud object storage for encrypted files.
- Centralised and more advanced encryption key management.
- Multi-factor authentication.
- More detailed security alerts and anomaly detection.
- Advanced file-version management.
- Improved backup and recovery mechanisms.
- More comprehensive automated security testing.
- Performance optimisation for large file uploads and downloads.
- Expanded administrative reports and analytics.
- Improved accessibility and mobile responsiveness.
- More granular sharing permissions and access policies.

These improvements could make the platform more suitable for larger deployments and more demanding security requirements.

## 15. Conclusion

TrustShare is designed to bring secure file management and controlled digital collaboration together in one platform.

Its architecture combines a React-based frontend, a FastAPI backend, database management, authenticated file encryption, authentication services, and access-control mechanisms. Features such as expiring sharing links, link revocation, role-based permissions, and activity monitoring are intended to give users greater control over their digital files.

The project also highlights the importance of considering security throughout the software development process rather than treating it as an additional feature.

Further implementation verification, security testing, persistent storage configuration, and improved key management will be important steps in strengthening the platform for production use.

Overall, TrustShare provides a foundation for a file-sharing system that places emphasis on security, controlled access, and responsible digital collaboration.

---

**Document:** Project Analysis  
**Project:** TrustShare – Intelligent Encrypted File Sharing and Digital Collaboration Management Platform  
**Document Purpose:** Technical overview, system analysis, architecture, and project evaluation
