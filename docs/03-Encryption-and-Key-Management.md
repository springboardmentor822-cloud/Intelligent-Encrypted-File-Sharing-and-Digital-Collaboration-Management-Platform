\# TrustShare – Encryption and Key Management



\## 1. Overview



TrustShare uses AES-256-GCM authenticated encryption to protect uploaded files.



The platform implements envelope encryption, where each file is encrypted using a randomly generated Data Encryption Key (DEK). The DEK is then wrapped using a versioned Master Key managed by the Key Management Service.



This design separates file encryption from master-key management.



\## 2. Encryption Algorithm



\*\*Algorithm:\*\* AES-256-GCM



Important properties:



\- 256-bit encryption key.

\- 12-byte (96-bit) nonce.

\- Authenticated encryption.

\- Authentication tag verification during decryption.

\- Random nonce generated using `os.urandom(12)`.



The Python `cryptography` library provides the AESGCM implementation.



\## 3. Envelope Encryption Architecture



TrustShare uses two levels of encryption keys.



\### Data Encryption Key (DEK)



\- A separate DEK is generated for file encryption.

\- The DEK is 256 bits long.

\- The DEK encrypts the original file content.

\- The DEK is not stored directly with the encrypted file.



\### Master Key



\- The Master Key wraps the DEK.

\- The wrapped DEK is stored as encryption metadata.

\- Key version information identifies the Master Key version needed for unwrapping.



\## 4. Encryption Workflow



1\. User uploads a file.

2\. EncryptionService generates a random DEK through KeyManagementService.

3\. AES-256-GCM encrypts the original file using the DEK.

4\. A random 12-byte nonce is generated.

5\. KeyManagementService wraps the DEK using the active Master Key.

6\. The application returns encrypted data and encryption metadata.

7\. The encrypted file is stored in RustFS.

8\. Encryption metadata is stored with the file record.



\### Stored Encryption Metadata



| Field | Purpose |

|---|---|

| encrypted\_data | Encrypted file content |

| encryption\_nonce | Nonce used for file encryption |

| wrapped\_key | Encrypted DEK |

| key\_nonce | Nonce used during DEK wrapping |

| key\_version | Master Key version identifier |



\## 5. Decryption Workflow



1\. An authorized user requests a file download.

2\. The backend retrieves encrypted file data and metadata.

3\. KeyManagementService unwraps the DEK using the recorded Master Key version.

4\. AES-256-GCM decrypts the file using the DEK and original nonce.

5\. Authentication verification is performed by AES-GCM.

6\. Original file data is returned to the authorized user.



If authenticated decryption fails, the cryptographic library raises an exception instead of returning unauthenticated plaintext.



\## 6. Encryption Architecture Diagram



```mermaid

flowchart TD

&#x20;   A\[Original File] --> B\[Generate Random DEK]

&#x20;   B --> C\[AES-256-GCM Encryption]

&#x20;   C --> D\[Encrypted File]

&#x20;   B --> E\[Wrap DEK with Master Key]

&#x20;   E --> F\[Wrapped DEK]

&#x20;   D --> G\[Storage]

&#x20;   F --> H\[Encryption Metadata]

&#x20;   G --> I\[Authorized Download]

&#x20;   H --> I

&#x20;   I --> J\[Unwrap DEK]

&#x20;   J --> K\[Decrypt File]

&#x20;   K --> L\[Original File]

```



\## 7. Key Versioning and Rotation



TrustShare supports versioned Master Key management.



The stored `key\_version` identifies which Master Key version should be used to unwrap a particular file's DEK.



This enables key rotation while retaining the ability to decrypt files encrypted under earlier key versions, provided the corresponding old Master Keys remain available.



\## 8. Security Benefits



\- AES-256-GCM provides confidentiality and authentication.

\- Random DEKs isolate file encryption keys.

\- Envelope encryption separates file encryption from master-key management.

\- Key versioning supports controlled key rotation.

\- Authentication-tag verification detects modified or invalid encrypted data.



\## 9. Implementation Files



| File | Responsibility |

|---|---|

| `encryption\_service.py` | File encryption and decryption |

| `key\_management\_service.py` | DEK generation, wrapping and unwrapping |

| `storage\_service.py` | File storage integration |



\## 10. Important Implementation Notes



\- AES-256 requires exactly 32-byte keys.

\- AES-GCM requires a 12-byte nonce in this implementation.

\- A nonce must not be reused with the same encryption key.

\- Master Keys must be stored securely and never committed to source control.

\- Old Master Key versions must be retained securely as long as existing wrapped DEKs depend on them.



\## 11. Testing



Encryption should be tested through:



\- Successful file encryption and decryption.

\- Original and decrypted file size comparison.

\- SHA-256 hash comparison of original and downloaded files.

\- Invalid nonce and key handling.

\- Authentication failure after encrypted-data modification.

\- Key version compatibility during rotation.
