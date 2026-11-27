# Key management lifecycle

| Stage | What happens |
|---|---|
| Generation | A random 256-bit **data key (DEK)** is generated for every file version (`os.urandom` via `cryptography`). |
| Use | The DEK encrypts the file with AES-256-GCM, fresh 96-bit nonce, AAD = `file_id:version`. |
| Storage | The DEK is **wrapped** (AES-256-GCM) by a master key (KEK) with AAD binding it to its file record. Only the wrapped DEK is stored (PostgreSQL `file_versions.wrapped_dek`) along with the KEK version. The plaintext DEK is never persisted, logged or returned by any API. |
| Retrieval | After the permission check, the DEK is unwrapped in memory, used to decrypt, then discarded. |
| Rotation | Add a new key to `MASTER_KEYS` (`1:<b64>,2:<b64>`), set `ACTIVE_KEY_VERSION=2`, restart, then Admin > System Monitoring > *Re-wrap data keys*. Only the small wrapped keys are re-encrypted; files stay untouched and readable throughout. Retire old keys once the dashboard shows nothing under them. With `KEY_PROVIDER=aws_kms`, KMS rotates the key itself. |
| Recovery | Back up `MASTER_KEYS` (secrets manager / offline). Losing every master key version that protects a file makes that file permanently unreadable, by design. |
| Access | Only the API process holds master keys (environment or KMS role). Browsers never see any key. |

TOTP secrets are protected with the same master key before being stored.
