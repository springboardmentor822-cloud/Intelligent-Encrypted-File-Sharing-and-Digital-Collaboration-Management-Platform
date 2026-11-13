"""Application settings (environment variables prefixed with TS_)."""
import json, os, secrets, stat
from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TS_", extra="ignore")

    env: str = "development"                      # development | production | test
    database_url: str = "sqlite:///./data/trustshare.db"
    data_dir: str = "./data"
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    remember_token_days: int = 7
    cors_origins: str = "http://localhost:5173"
    frontend_url: str = "http://localhost:5173"
    public_base_url: str = "http://localhost:8000"
    trust_proxy: bool = False
    https_enforced: bool = False                  # set true only when TLS terminates in front of the API

    max_upload_mb: int = 25
    user_quota_mb: int = 1024
    max_share_days: int = 90

    storage_backend: str = "local"                # local | s3
    local_storage_dir: str = "./data/objects"
    s3_bucket: str = ""
    s3_region: str = ""
    s3_endpoint_url: str = ""
    s3_prefix: str = "trustshare/"

    master_keys: str = ""                         # "1:<base64 32 bytes>,2:<base64 32 bytes>"
    active_key_version: int = 1

    # --- Admin Visit: password-gated entry into the admin panel from any account ---
    # Any signed-in user who knows this password may open the admin panel ("admin can be any user").
    # Change it in production via TS_ADMIN_VISIT_PASSWORD.
    admin_visit_password: str = "123meadmin"
    admin_visit_minutes: int = 60
    admin_visit_max_attempts: int = 5
    admin_visit_enabled: bool = True

    rate_limit_enabled: bool = True
    login_rate_per_min: int = 10
    abnormal_download_threshold: int = 30         # downloads by one user in 10 minutes

    # --- Milestone 3: optional MongoDB mirror for activity/audit/notification records ---
    # When TS_MONGO_URL is unset the mirror is a deliberate no-op; SQL remains the source of truth.
    mongo_url: str = ""
    mongo_db: str = "trustshare"

    # --- Milestone 3: key-management policy (periodic encryption-key rotation) ---
    key_rotation_days: int = 90

    # --- Milestone 3: per-user wrong-password security trigger ---
    user_wrong_password_alert_threshold: int = 3
    user_wrong_password_window_minutes: int = 15

    # --- Milestone 3: suspicious-activity detection rule thresholds/windows ---
    failed_login_threshold: int = 5
    failed_login_window_minutes: int = 10
    unauthorized_threshold: int = 5
    unauthorized_window_minutes: int = 10
    download_burst_threshold: int = 20
    download_burst_window_minutes: int = 5
    link_abuse_threshold: int = 3
    link_abuse_window_minutes: int = 10
    detection_scan_limit: int = 50

    # --- Milestone 3: notifications / email delivery (disabled unless configured) ---
    notifications_email_enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_from: str = "no-reply@trustshare.local"
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_ssl: bool = False
    smtp_starttls: bool = True
    share_expiry_reminder_hours: int = 24

    google_client_id: str = ""
    google_client_secret: str = ""
    microsoft_client_id: str = ""
    microsoft_client_secret: str = ""
    microsoft_tenant: str = "common"

    dev_expose_tokens: bool = False               # development only: return reset/verify tokens in API response

    @property
    def is_prod(self) -> bool:
        return self.env == "production"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    Path(s.data_dir).mkdir(parents=True, exist_ok=True)
    if not s.jwt_secret:
        if s.is_prod:
            raise RuntimeError("TS_JWT_SECRET must be set in production")
        p = Path(s.data_dir) / "dev_jwt_secret"
        if not p.exists():
            p.write_text(secrets.token_urlsafe(64))
            os.chmod(p, stat.S_IRUSR | stat.S_IWUSR)
        s.jwt_secret = p.read_text().strip()
    return s
