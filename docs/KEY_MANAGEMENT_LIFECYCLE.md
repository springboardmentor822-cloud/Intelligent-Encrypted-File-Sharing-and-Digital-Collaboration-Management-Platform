# TrustShare Cryptographic Key Management & Lifecycle Specification
**Milestone 2 Task 7: Encryption Key Management, Rotation, and Disaster Recovery**

---

## 1. Cryptographic Architecture & Envelope Encryption

TrustShare employs an **Envelope Encryption** paradigm to achieve zero-trust file storage across distributed infrastructure and AWS S3 cloud storage.

```
+-----------------------------------------------------------------------------------------+
|                                    MASTER KEY HIERARCHY                                 |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |                  Master Key Encryption Key (KEK) [256-bit AES]                  |   |
|   |         Managed securely by TrustShare Vault / KMS via HKDF-SHA256 Derivation     |   |
|   +---------------------------------------+-----------------------------------------+   |
|                                           |                                             |
|                     Wraps (AES-256-GCM)   |   Wraps (AES-256-GCM)                       |
|                                           v                                             |
|               +---------------------------------------+                                 |
|               |  File Data Encryption Key (DEK #1)    |                                 |
|               |  Cryptographically unique per file    |                                 |
|               +-------------------+-------------------+                                 |
|                                   |                                                     |
|             Encrypts Payload      | (AES-256-GCM, 96-bit Nonce, 128-bit Auth Tag)       |
|                                   v                                                     |
|               +---------------------------------------+                                 |
|               |      Encrypted Ciphertext Payload     |                                 |
|               |       Stored in AWS S3 Cloud Vault    |                                 |
|               +---------------------------------------+                                 |
+-----------------------------------------------------------------------------------------+
```

### 1.1 Cryptographic Primitives
* **Symmetric Cipher:** AES-256-GCM (Galois/Counter Mode).
  * Provides both **confidentiality** and **authenticated integrity**.
* **Key Size:** 256 bits (32 bytes) of cryptographic entropy generated via `os.urandom(32)`.
* **Initialization Vector (Nonce):** 96 bits (12 bytes) uniquely generated per operation. Nonces are never reused.
* **Authentication Tag:** 128 bits (16 bytes) verifying data integrity and preventing chosen-ciphertext tampering.
* **Key Derivation Function (KDF):** HKDF-SHA256 (RFC 5869) for deriving master Key Encryption Keys from environmental entropy.

---

## 2. Key Lifecycle Stages

The lifecycle of cryptographic keys in TrustShare follows strict NIST SP 800-57 recommendations:

### 2.1 Stage 1: Key Generation
1. When a user uploads a file, the FastAPI backend invokes `generate_dek()`.
2. A high-entropy 256-bit symmetric key is generated in volatile RAM:
   $$\text{DEK} \leftarrow \text{CSPRNG}(32)$$
3. The DEK never touches persistent disk storage or cloud objects in plaintext.

### 2.2 Stage 2: Envelope Wrapping & Storage
1. The backend derives the active Master KEK:
   $$\text{KEK} \leftarrow \text{HKDF-SHA256}(\text{MASTER\_SECRET}, \text{salt}=\text{"TrustShare-KEK-v1"})$$
2. The DEK is encrypted using AES-256-GCM under the KEK with a random 96-bit nonce:
   $$\text{Wrapped\_DEK} = \text{Nonce} \parallel \text{AES-GCM}_{\text{KEK}}(\text{DEK}) \parallel \text{Tag}$$
3. The wrapped DEK is stored in PostgreSQL (`FileRecord.encrypted_dek`).
4. The raw DEK is used to encrypt the incoming file stream and is immediately purged from Python memory.

### 2.3 Stage 3: Key Retrieval & In-Memory Unwrapping
1. When an authorized user requests a download, the backend:
   * Validates JWT identity and RBAC permissions.
   * Retrieves `FileRecord.encrypted_dek` from PostgreSQL.
   * Unwraps the DEK in memory using the Master KEK.
   * Streams the encrypted ciphertext from AWS S3 (`trustshare-vault-sanjith`).
   * Verifies the 128-bit authentication tag.
   * Streams decrypted plaintext directly to the client HTTP response buffer.

### 2.4 Stage 4: Key Rotation Policy
TrustShare provides **Zero-Downtime Envelope Key Rotation**:
* **Why Envelope Rotation Matters:** In traditional systems, rotating a key requires re-encrypting terabytes of file data stored in cloud storage. With envelope encryption, rotating the Master KEK only requires re-wrapping the stored DEKs in PostgreSQL.
* **Rotation Procedure:**
  1. The administrator triggers `POST /api/v1/admin/keys/rotate` with `current_master_key` and `new_master_key`.
  2. For each active record in PostgreSQL:
     * DEK is unwrapped using $\text{KEK}_{\text{old}}$.
     * DEK is re-wrapped using $\text{KEK}_{\text{new}}$.
     * `encrypted_dek` column is updated in a transactional commit.
  3. The underlying ciphertext in AWS S3 remains completely valid and untouched, saving massive I/O bandwidth and cloud transfer fees.

### 2.5 Stage 5: Key Revocation & Secure Destruction
* When a file is deleted by its owner or an administrator:
  * The file record and its wrapped DEK are permanently deleted from PostgreSQL (`CASCADE`).
  * The encrypted ciphertext in AWS S3 is deleted via `boto3.delete_object`.
  * Even if an attacker possessed a snapshot of the cloud storage bucket, crypto-shredding guarantees that without the destroyed DEK, the data is mathematically unrecoverable.

---

## 3. Tamper Detection & Integrity Verification

During decryption, AES-256-GCM calculates the expected authentication tag over the ciphertext and associated data:
* If even a single bit of ciphertext is modified in AWS S3, the tag check fails:
  ```python
  from cryptography.exceptions import InvalidTag
  # Raises InvalidTag -> caught as DecryptionError
  ```
* TrustShare intercepts this exception, aborts download delivery, logs an `UNAUTHORIZED_ACCESS` event to MongoDB Atlas, and triggers an automated administrator security alert.

---

## 4. Threat Model & Security Guarantees

| Attack Vector | Countermeasure | Security Outcome |
| :--- | :--- | :--- |
| **AWS S3 Breach** | Server-side pre-encryption (zero plaintext stored in AWS S3) | Attacker obtains only high-entropy AES ciphertext. Plaintext zero-exposure. |
| **Database Compromise** | Envelope encryption (only wrapped DEKs stored in PostgreSQL) | Attacker cannot unwrap DEKs without Master KEK stored outside the database. |
| **Ciphertext Bit Flipping** | AES-GCM 128-bit authentication tag | Tampering triggers `InvalidTag` and halts processing immediately. |
| **Unauthorized Token Reuse** | Cryptographic hash matching (SHA-256) & TTL expiration check | Stolen tokens cannot decrypt files after revocation or expiry. |

