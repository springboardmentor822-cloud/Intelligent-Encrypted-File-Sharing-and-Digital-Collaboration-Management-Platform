# Architecture

```
 Browser (Next.js) ──HTTPS──► nginx (TLS) ──► FastAPI ─┬─► PostgreSQL   users, files, versions, wrapped keys, shares, notifications
                                                       ├─► MongoDB      audit_logs, login_events, security_events, access_attempts, download_events, share_events
                                                       ├─► Redis        sessions, rate limits, lockout counters, analytics cache, MFA/OAuth one-time state
                                                       ├─► S3 / MinIO   encrypted objects only
                                                       └─► KMS (opt.)   master key operations
```

## Upload (encrypt)
1. `POST /files/upload` — JWT checked, user must be `user`/`admin` (guests are read-only), rate limited.
2. Validate: extension allow-list → size → magic bytes / UTF-8 → quota. Failures create `Policy Violations` or `Malware/File Threat` security events.
3. `generate_data_key()` (256-bit) → `encrypt_bytes()` (AES-256-GCM, random nonce, AAD = `file_id:version`).
4. `key_provider.wrap(dek)` → wrapped DEK + master-key version.
5. Ciphertext → S3 (`<owner>/<file>/v<n>-<random>.bin`). Metadata + wrapped DEK → PostgreSQL. If the DB write fails, the object is deleted.
6. Audit entry written to MongoDB.

## Download (decrypt)
1. Authenticate (JWT + live Redis session) → authorise (owner, or active direct share with `download`, or valid share link) → 403/404/410 *before* touching storage.
2. Fetch ciphertext → unwrap DEK → decrypt in memory → GCM tag verified. Tampering → `critical` security event, nothing is returned.
3. Response: `Content-Disposition`, `Cache-Control: no-store`, `nosniff`, sandbox CSP. Download recorded (`download_events`), owner notified.

## Data model (PostgreSQL)
`users` · `folders(parent_id)` · `files` (name, category, size, current_version, is_favorite, deleted_at) ·
`file_versions` (storage_key, wrapped_dek, kek_version, sha256, algorithm) · `share_links` (token_hash, permission, expires_at, revoked_at, max_downloads, counters) ·
`file_shares` (shared_with, permission, share_type, expires_at, revoked_at) · `notifications` · `password_reset_tokens`.

## Mongo collections
| Collection | Written when | Feeds |
|---|---|---|
| `audit_logs` | every important action | Activity Logs (user: own + on own files; admin: all) |
| `login_events` | every sign-in success/failure | Login activity, recent logins |
| `security_events` | detections, denials, key rotation | Security events donut/table, admin alerts |
| `access_attempts` | `unauthorized` (role/permission denied) and `blocked` (rate limit, lockout, bad/expired/revoked link) | Access Attempts chart |
| `download_events` | each download | Download analytics, recent downloads |
| `share_events` | link created/opened/downloaded/revoked | Share activity monitoring |

## Detection rules
| Rule | Trigger | Event |
|---|---|---|
| Brute force | 5 failed sign-ins for one email in 15 min (also locks the account) | Multiple Login Attempts — high |
| Password spraying | one IP fails against 3+ accounts | Suspicious IP Access — high |
| New location | sign-in from an IP never seen for that user | Suspicious IP Access — medium (+ user notification) |
| Unauthorized access | role or file permission denied | Unauthorized Access — high |
| Unsafe upload | executable/HTML/SVG, or content ≠ extension | Malware/File Threat — high |
| Integrity failure | GCM tag mismatch on download | Malware/File Threat — critical |
| Refresh token reuse | rotated refresh token replayed | Others — high (session revoked) |
| Download anomaly | >25 downloads in 10 min from one actor | Others — medium |

High and critical events also raise an in-app notification for every admin.

## Roles
| | Admin | User | Guest |
|---|---|---|---|
| Upload / manage own files | yes | yes | no |
| Receive shares, view/download if permitted | yes | yes | yes |
| `/admin/*` APIs | yes | 403 | 403 |
| Download other people's files | **no** | no | no |
