
# TrustShare – Security Audit and Assessment

**Project:** TrustShare 2.0  
**Application Type:** Secure File Sharing and Digital Collaboration Platform  
**Backend:** Python, FastAPI  
**Frontend:** React, TypeScript, Vite  
**Database:** SQLite / SQLAlchemy  
**Encryption:** AES-256-GCM  
**Authentication:** Argon2id, JWT/session authentication, Google OAuth 2.0 and Microsoft OAuth 2.0  
**Deployment:** Vercel (Frontend) and Render (Backend)

---

## 1. Introduction

TrustShare is designed to provide secure file storage, controlled document sharing and collaborative file management. Since the application handles user accounts, private documents, encryption keys and access permissions, security must be considered across the entire application rather than only at the login stage.

This document reviews the security architecture of TrustShare, identifies the main areas of risk and outlines the controls required to protect user information and application resources.

The assessment is based on the documented system architecture, API specification and deployment configuration. Items marked for verification require confirmation against the actual implementation and deployed environment.

## 2. Security Objectives

The application is designed around the following security objectives:

- **Confidentiality:** Prevent unauthorised access to private files and user information.
- **Integrity:** Protect uploaded documents and application records against unauthorised modification.
- **Authentication:** Verify the identity of users accessing the platform.
- **Authorisation:** Restrict operations according to user roles and resource ownership.
- **Availability:** Maintain access to application services and stored information.
- **Accountability:** Maintain records of important user and administrative activities.

## 3. Security Architecture

TrustShare uses multiple security mechanisms across its frontend, backend, authentication and file-storage layers.

### 3.1 Authentication and Account Security

The authentication system supports:

- Email and password authentication.
- Google OAuth 2.0 integration.
- Microsoft OAuth 2.0 integration.
- Password hashing using Argon2id.
- Authenticated session management.
- Logout and session termination.
- Password-change functionality.
- Role-based access for standard users and administrators.

**Security considerations:**

Passwords should never be stored in plaintext. Password verification should be performed on the backend using secure password-hashing functions.

OAuth credentials must remain on the server and must never be exposed through frontend source code.

Session cookies should use appropriate HttpOnly, Secure and SameSite attributes. Session expiration and invalidation should also be enforced.

### 3.2 Role-Based Access Control (RBAC)

TrustShare distinguishes between standard users and administrators.

| Role | Access |
|---|---|
| USER | Personal files, uploads, downloads, sharing and account management |
| ADMIN | Administrative dashboard, user management, security monitoring and authorised system operations |

Resource ownership must also be checked on the backend.

A standard user should not be able to access another user's private files simply by changing a file ID or API request.

Administrative endpoints must verify the administrator role on every request.

### 3.3 File Encryption and Data Protection

TrustShare uses AES-256-GCM as its documented file-encryption mechanism.

The specified encryption workflow involves:

1. Generating a Data Encryption Key (DEK).
2. Generating a nonce for the encryption operation.
3. Encrypting file contents using AES-256-GCM.
4. Using Additional Authenticated Data (AAD) where configured.
5. Wrapping the DEK using a Key Encryption Key (KEK).
6. Storing the encrypted file in the storage vault.

During an authorised download, the backend retrieves the encrypted data, unwraps the DEK, verifies authenticated data and decrypts the file.

**Security requirements:**

- Each encryption operation must use a unique nonce for its key.
- Encryption keys must not be stored in publicly accessible locations.
- Master encryption keys must be maintained separately from encrypted file data.
- Authentication-tag verification must succeed before decrypted content is released.
- Key rotation must preserve the ability to access previously encrypted files.
- Plaintext files should not remain in temporary storage after processing.

### 3.4 Secure File Sharing

TrustShare provides controlled file sharing through temporary links.

The documented sharing design includes:

- Cryptographically secure random share tokens.
- SHA-256 token hashing for database lookup.
- Configurable link expiration.
- VIEW and DOWNLOAD permissions.
- Optional passcode protection.
- Link revocation.
- Download-limit enforcement.
- Recipient-access logging.

**Security requirements:**

Share tokens should be unpredictable and sufficiently long. Only authorised owners should be able to create and revoke their sharing links.

Expired or revoked links must not provide access to the original file.

Sensitive tokens should not be exposed in application logs or analytics records.

### 3.5 API Security

The backend uses FastAPI with modular REST API endpoints.

The documented API security mechanisms include:

- Authenticated API requests.
- Bearer-token or session-cookie authentication.
- Role-based endpoint restrictions.
- CSRF protection for state-changing requests.
- Request identification using UUIDv4 request IDs.
- Input validation.
- Standardised HTTP error responses.

The backend must independently validate all requests, including those originating from the frontend.

Frontend validation alone is not sufficient to protect API endpoints.

## 4. Threat Assessment

The following table identifies important threats relevant to TrustShare and the controls required to address them.

| Threat | Potential Impact | Required Security Control |
|---|---|---|
| Unauthorised account access | Exposure of user data | Strong authentication and secure sessions |
| Password attacks | Account compromise | Argon2id hashing and login rate limiting |
| Privilege escalation | Unauthorised administrative access | Server-side RBAC |
| IDOR attacks | Access to another user's files | Ownership verification on every resource request |
| Brute-force attacks | Account or share-link compromise | Rate limiting and attempt monitoring |
| Malicious file uploads | Malware or application compromise | File validation, size restrictions and safe storage |
| Share-link leakage | Unauthorised document access | Random tokens, expiry and revocation |
| CSRF attacks | Unauthorised state-changing actions | CSRF token validation and cookie restrictions |
| XSS attacks | Session theft or malicious script execution | Output encoding and Content Security Policy |
| SQL injection | Unauthorised database access | Parameterised queries and ORM safeguards |
| Encryption-key exposure | Compromise of stored documents | Secure key management and environment isolation |
| Data loss | Permanent loss of uploaded files | Persistent storage and tested backups |
| API abuse | Service disruption | Rate limiting and request validation |

## 5. Important Security Controls

### 5.1 Password and Session Protection

The application should:

- Hash passwords using Argon2id.
- Never return password hashes through API responses.
- Use secure session identifiers.
- Set HttpOnly and Secure cookie attributes in production.
- Implement appropriate session expiration.
- Invalidate sessions after logout.
- Support termination of individual or all active sessions.
- Apply rate limits to login and password-reset endpoints.

### 5.2 File Upload Security

File uploads represent an important attack surface.

The following controls should be maintained:

- Validate file extensions.
- Verify MIME types and actual file signatures.
- Enforce maximum upload size.
- Generate safe internal storage filenames.
- Prevent path traversal.
- Reject malformed or unsupported files.
- Store uploaded content outside publicly accessible directories.
- Avoid executing uploaded files.
- Ensure temporary plaintext data is securely handled.

The documented upload specification defines a 25 MB file-size limit. The deployed implementation should be checked to confirm that this restriction is enforced server-side.

### 5.3 Database Security

The database contains sensitive information such as user records, file metadata, permissions and audit information.

Recommended controls include:

- Restrict database access to the backend.
- Use parameterised database operations.
- Avoid exposing database files through public URLs.
- Protect database credentials.
- Maintain regular backups.
- Validate user ownership before database operations.
- Avoid logging sensitive personal information unnecessarily.

### 5.4 Encryption Key Management

Encryption keys are among the most sensitive components of TrustShare.

The following practices are recommended:

- Store master encryption keys in protected environment variables or a dedicated secrets manager.
- Never commit encryption keys to GitHub.
- Keep encryption keys separate from encrypted file storage.
- Maintain key-version information.
- Implement controlled key rotation.
- Restrict key access to authorised backend operations.
- Avoid exposing key material in API responses, browser storage or logs.

A key rotation procedure must also account for existing encrypted files so that they remain decryptable.

### 5.5 Secure API Configuration

Production API configuration should include:

- HTTPS-only communication.
- Restricted CORS origins.
- CSRF validation for state-changing requests when cookie authentication is used.
- Server-side role and ownership checks.
- Request validation.
- Rate limiting.
- Secure error handling.
- Appropriate security headers.

Detailed internal exceptions, database paths, secrets and stack traces should not be returned to ordinary users.

### 5.6 OAuth Security

TrustShare supports Google and Microsoft authentication.

The following OAuth safeguards should be maintained:

- Validate OAuth state values.
- Use exact registered redirect URIs.
- Protect client secrets on the backend.
- Validate callback requests.
- Prevent OAuth token leakage.
- Use HTTPS for authentication redirects.
- Avoid exposing authorisation codes in logs.
- Validate the identity information returned by the provider.

## 6. Deployment Security Assessment

TrustShare uses Vercel for frontend hosting and Render for backend hosting.

Production deployment introduces additional risks that may not appear during local development.

| Area | Security Requirement |
|---|---|
| Frontend hosting | HTTPS and protected production configuration |
| Backend hosting | Secure environment variables and restricted service access |
| Database | Persistent storage and access restrictions |
| File storage | Durable storage with controlled access |
| OAuth configuration | Exact production callback URLs |
| CORS | Allow only approved frontend origins |
| Secrets | Never expose credentials in GitHub |
| Logs | Avoid recording passwords, tokens and encryption keys |
| Backups | Maintain recoverable copies of important data |

**Important deployment consideration:**

Render's free service filesystem may be ephemeral. If SQLite databases or uploaded files are stored only on that filesystem, they may be lost after certain restarts or redeployments.

Persistent storage or an external database and file-storage service should be considered before using TrustShare for important user data.

## 7. Security Logging and Audit Trail

TrustShare's documented architecture includes audit logging and security monitoring.

Important events to record include:

- Successful and failed login attempts.
- Account creation.
- Password changes.
- File uploads and downloads.
- File deletion and restoration.
- Share-link creation and revocation.
- Access to shared files.
- Administrative account changes.
- Session termination.
- Security alerts and incident resolution.

Audit records should contain sufficient information for investigation without exposing passwords, session cookies, OAuth codes or encryption keys.

Where hash-chain verification is implemented, audit records should be checked for integrity.

## 8. Security Testing and Validation

Security testing should be carried out before treating the application as production-ready.

The following checks are recommended.

### Authentication Testing

- [ ] Valid login succeeds.
- [ ] Invalid passwords are rejected.
- [ ] Passwords are not stored in plaintext.
- [ ] Google OAuth login works.
- [ ] Microsoft OAuth login works.
- [ ] Logout invalidates the active session.
- [ ] Expired sessions cannot access protected resources.
- [ ] Password-reset functionality is secure.
- [ ] Repeated failed login attempts are rate-limited.

### Authorisation Testing

- [ ] Standard users cannot access administrator endpoints.
- [ ] Users cannot access another user's private files.
- [ ] Users cannot modify another user's file metadata.
- [ ] Administrators can access only the operations permitted by their role.
- [ ] Changing resource IDs does not bypass ownership checks.

### File Security Testing

- [ ] Supported file types upload successfully.
- [ ] Unsupported file types are rejected.
- [ ] Oversized files are rejected.
- [ ] Downloaded files match their original contents.
- [ ] Encrypted files cannot be decrypted without the correct key.
- [ ] Tampered ciphertext fails authentication-tag verification.
- [ ] File deletion and restoration behave correctly.
- [ ] Temporary plaintext files are not left exposed.

### Sharing Security Testing

- [ ] Valid share links provide the permitted access.
- [ ] Expired links are rejected.
- [ ] Revoked links are rejected.
- [ ] Incorrect passcodes are rejected.
- [ ] VIEW permission does not unintentionally permit downloads.
- [ ] Download limits are enforced.
- [ ] Unauthorised users cannot revoke another user's links.

### API Security Testing

- [ ] Protected endpoints reject unauthenticated requests.
- [ ] Administrator endpoints enforce role checks.
- [ ] Invalid input is rejected.
- [ ] CSRF protection is enforced where required.
- [ ] Rate limiting works on sensitive endpoints.
- [ ] Internal error details are not exposed to users.
- [ ] CORS restrictions are correctly configured.

### Deployment Testing

- [ ] HTTPS works for frontend and backend.
- [ ] Production secrets are not present in GitHub.
- [ ] Database records survive service restarts.
- [ ] Uploaded files survive redeployment.
- [ ] Backups can be restored.
- [ ] Production OAuth redirect URIs are correct.
- [ ] Application logs do not expose sensitive information.

## 9. Identified Areas Requiring Verification

The following areas deserve particular attention before production use.

| Priority | Area | Verification Required |
|---|---|---|
| Critical | Default administrator credentials | Confirm that all default credentials have been changed or disabled. |
| Critical | Encryption key protection | Confirm that production keys are securely generated, stored and backed up. |
| Critical | File ownership | Test for IDOR and unauthorised file access. |
| High | Persistent storage | Confirm database and uploaded files survive restarts and redeployments. |
| High | Session management | Verify expiry, logout and server-side invalidation. |
| High | File validation | Test MIME validation, file signatures and upload restrictions. |
| High | Share-link protection | Test expiry, passcodes, revocation and access limits. |
| Medium | Rate limiting | Verify protection against repeated authentication and API requests. |
| Medium | Security logging | Check that events are recorded without exposing secrets. |
| Medium | Backup and recovery | Test backup restoration and data recovery procedures. |

These are verification priorities, not confirmed vulnerabilities. Their actual status must be determined through source-code review and testing.

## 10. Security Recommendations

The following improvements are recommended as the project develops:

1. **Automated security testing:** Integrate dependency scanning and static analysis into the development workflow.
2. **Penetration testing:** Conduct controlled tests for authentication, access control, file handling and API vulnerabilities.
3. **Centralised key management:** Consider a dedicated key-management service for production encryption keys.
4. **Persistent storage:** Use reliable database and object-storage infrastructure for production documents.
5. **Backup strategy:** Maintain encrypted backups and periodically test recovery.
6. **Rate limiting:** Apply stricter limits to login, password reset, sharing and other sensitive endpoints.
7. **Security monitoring:** Review audit records and alert administrators about suspicious activity.
8. **Dependency maintenance:** Keep Python packages and frontend dependencies updated.
9. **Security headers:** Configure appropriate browser security headers.
10. **Incident response:** Establish a procedure for credential rotation, session revocation and investigation of suspected data exposure.

## 11. Assessment Scope and Limitations

This document is an architecture-based security assessment of TrustShare. It describes the documented security design, identifies important risks and provides a validation checklist.

It is not a certification, formal compliance assessment or independent penetration-test report.

A security control should be considered verified only after its implementation has been inspected and its behaviour has been tested.

The final security posture depends on the actual backend code, frontend implementation, environment configuration, storage infrastructure and deployment practices.

## 12. Conclusion

TrustShare incorporates several important security concepts, including authenticated file encryption, protected authentication, role-based access control, controlled file sharing and audit monitoring.

However, secure application development requires more than implementing individual security mechanisms. These controls must work together and be validated under realistic conditions.

Continued testing of authentication, authorisation, encryption, storage, API protection and deployment configuration is essential to maintaining the confidentiality, integrity and availability of user data.
