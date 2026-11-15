# Encryption key management (Milestone 2, Task 7)

## In simple words
Think of every file as a **box** and its **data key (DEK)** as the box's own padlock key.
All the padlock keys are kept together in a **safe**, and the safe has one **master key (KEK)**.
A thief who steals the boxes (storage) gets nothing. A thief who steals the list of locked padlock keys (database)
also gets nothing. Both are useless without the master key, which lives only in the server's environment.

This pattern is called **envelope encryption**. Code: `backend/app/core/crypto.py`.

## Key lifecycle

| Stage | What happens | Where in the code |
|---|---|---|
| **Generation** | On every upload a new random 256-bit DEK is created (`AESGCM.generate_key`) and a fresh 12-byte nonce | `KeyManager.encrypt_file` |
| **Use** | The file is encrypted with AES-256-GCM. The file id is bound into the encryption ("associated data"), so a stolen ciphertext cannot be swapped onto another file record | `crypto.py` `_file_aad` |
| **Protection** | The DEK is itself encrypted ("wrapped") with the current master key. Only the wrapped DEK, nonce and master-key *version label* are saved in PostgreSQL (`files.wrapped_dek`, `files.nonce`, `files.kek_version`) | `KeyManager._wrap` |
| **Storage of the master key** | `MASTER_KEYS` in `.env` (format `v1:<base64 32 bytes>`). Never in the database, never in storage, never in API responses or logs | `core/config.py` |
| **Retrieval** | On an authorized download the backend reads the wrapped DEK, unwraps it with the matching master-key version, decrypts the file **in memory**, checks the GCM tag and the SHA-256, then discards the keys | `services/file_service.py` |
| **Rotation** | Add `,v2:<new key>` to `MASTER_KEYS`, set `MASTER_KEY_CURRENT=v2`, restart, then press **Rotate file keys** (Admin Panel → System Monitoring → Encryption keys) or call `POST /admin/keys/rotate`. Only the small wrapped DEKs are re-wrapped. The encrypted files in storage are never touched | `routers/admin.py` `rotate_keys` |
| **Old files stay readable** | Each file remembers the version that wrapped its DEK, so v1 files keep working until they are re-wrapped. Keep old versions in `MASTER_KEYS` until rotation shows 0 files on them | `kek_version` column |
| **Recovery** | Keep an offline copy of `MASTER_KEYS` (password manager / printed in a safe). **If every copy of a master key is lost, the files wrapped by it are permanently unreadable** — that is the whole point of encryption | — |
| **Deletion** | Deleting a file permanently removes the ciphertext and its wrapped DEK, so nothing is left to decrypt | `services/trash.py` |

## Who can touch the keys
* Ordinary users **never** receive any key (not in API responses, not in the browser).
* Only the backend process holds the master key in memory. Only admins can trigger rotation, and rotation is written to the audit log (`key_rotation`).
* The `/auth/…` and `/files/…` responses expose only the version label (`"v1"`) shown as the seal badge in the UI, never key material.

## Simplified for a student project vs production

| Student project (this repo) | Production-grade |
|---|---|
| Master key kept in an environment variable | Master key held by a key-management service (**AWS KMS**, Azure Key Vault, HashiCorp Vault). The app asks the service to wrap/unwrap and never sees the master key |
| One master key per version for the whole platform | Separate keys per tenant/environment, with hardware-backed protection (HSM) and access policies |
| Whole file is encrypted in one piece in memory (25 MB limit) | Chunked / streaming encryption for large files |
| Rotation is a manual admin click | Scheduled rotation with alerting |

Switching to KMS later only changes `_wrap` / `_unwrap`; the rest of the app stays the same.
