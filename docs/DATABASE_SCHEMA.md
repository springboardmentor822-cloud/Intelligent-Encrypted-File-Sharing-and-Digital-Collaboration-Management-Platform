# Database schema (version 2)

## PostgreSQL (`models/postgres.py`)
| Table | Purpose | Key columns |
|---|---|---|
| `users` | accounts | `email` (unique), `hashed_password` (bcrypt), `is_active`, `mfa_enabled`, `mfa_secret` |
| `roles`, `user_roles` | RBAC | roles: `admin`, `user`, `guest` |
| `folders` | folder tree | `owner_id`, `parent_id` |
| `files` | one row per encrypted file | `storage_key`, `nonce`, **`wrapped_dek`**, **`kek_version`**, `sha256`, 🆕 **`deleted_at`** (NULL = normal, set = in Trash) |
| `file_permissions` | per-person access | `file_id`, `user_id`, `level` = view / download / admin |
| `shared_links` | secure links | `token_hash` (SHA-256 only), `expires_at`, `max_downloads`, `download_count`, `allow_download`, `revoked`, `created_by` |
| 🆕 `favorites` | starred files | `user_id`, `file_id` (unique pair) |

## MongoDB (`models/mongo.py`)
`file_metadata`, `audit_logs` (🆕 `location` on login events; failed uploads carry `details.category` = `policy_violation` or `file_threat`), `security_alerts`, `notifications`.

## Redis
`refresh:<jti>` sessions · `blacklist:<jti>` logged-out tokens · `rl:*` rate limits · `loginfail:*` lockouts · 🆕 `failaccounts:<ip>` (suspicious-IP detection) · 🆕 `oauth_state:*`, `oauth_code:*` · 🆕 `geo:<ip>` location cache.

## Upgrading an existing database
Nothing to do. On start the backend runs `ALTER TABLE files ADD COLUMN IF NOT EXISTS deleted_at …` and creates the new `favorites` table.
(Simplified: production would use Alembic migrations.)
