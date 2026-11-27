# Data model

## PostgreSQL (structured data)
| Table | Key columns |
|---|---|
| `users` | id, email (unique), full_name, hashed_password (bcrypt), role (admin/user/guest), is_active, mfa_enabled, mfa_secret_enc (encrypted), oauth_provider, storage_quota_bytes, last_login_at |
| `folders` | id, owner_id, parent_id, name |
| `files` | id, owner_id, folder_id, name, content_type, category, size_bytes, current_version, is_favorite, deleted_at |
| `file_versions` | id, file_id, version, storage_key, size_bytes, encrypted_size, sha256, **wrapped_dek**, kek_version, algorithm |
| `share_links` | id, file_id, created_by, **token_hash**, permission, expires_at, revoked_at, max_downloads, download_count, access_count |
| `file_shares` | id, file_id, shared_by, shared_with, permission, share_type (direct/internal), expires_at, revoked_at |
| `notifications` | id, user_id, type, title, message, link, is_read, created_at |
| `password_reset_tokens` | id, user_id, token_hash, expires_at, used_at |

Raw encryption keys and raw share tokens are never stored: only the wrapped key and the SHA-256 of the token.

## MongoDB (activity and security records)
| Collection | Fields |
|---|---|
| `audit_logs` | log_id, ts, action (activity type), category, status (success/failed), description, actor_id, actor_email, actor_name, owner_id, resource_type, resource_id (file id), ip, user_agent, details |
| `login_events` | ts, email, user_id, name, status, reason, ip, location, user_agent |
| `security_events` | alert_id, ts, category, severity (info/low/medium/high/critical), status (open/investigating/resolved), title, details, ip, user_id, user_email |
| `access_attempts` | ts, kind (unauthorized/blocked), reason, path, method, ip, user_id, user_email |
| `download_events` | ts, file_id, file_name, size_bytes, owner_id, actor, actor_name, via (owner/direct/link), share_id, ip |
| `share_events` | ts, file_id, kind, share_id, actor_id, ip, details |

## Redis (fast, temporary)
`session:*` and `user_sessions:*` (sign-in sessions) · `rl:*` (rate limits) · `fail:*` (failed-login counters and lockouts) ·
`known_ips:*` (new-device detection) · `dl:*` (download-spike counter) · `det:*` (suspicious-activity counters) ·
`mfa_*`, `oauth_*` (short-lived auth state) · `analytics:*` (30 s dashboard cache) · `audit:expired_links_logged`
