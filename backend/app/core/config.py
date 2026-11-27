"""Application settings, loaded from environment variables / .env."""
import base64
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

GB = 1024 ** 3
MB = 1024 ** 2


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "TrustShare"
    environment: str = "development"
    frontend_url: str = "http://localhost:3000"
    backend_public_url: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:3000"
    trust_proxy_headers: bool = False

    # Databases
    database_url: str = "postgresql+psycopg2://trustshare:trustshare@postgres:5432/trustshare"
    mongo_url: str = "mongodb://mongo:27017"
    mongo_db: str = "trustshare"
    redis_url: str = "redis://redis:6379/0"

    # Auth
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    login_max_failures: int = 5
    login_lock_minutes: int = 15

    # Encryption / key management
    key_provider: str = "local"  # local | aws_kms
    master_keys: str = ""        # "1:<base64 32 bytes>,2:<base64 32 bytes>"
    active_key_version: int = 1
    kms_key_id: str = ""
    kms_region: str = ""

    # Object storage (S3 / MinIO)
    s3_endpoint_url: str = ""    # set for MinIO, leave empty for AWS S3
    s3_bucket: str = "trustshare-files"
    s3_region: str = "us-east-1"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_sse: bool = False         # also request S3 server-side encryption (AWS only)

    # Limits
    max_upload_mb: int = 100
    default_quota_gb: int = 100
    trash_retention_days: int = 30
    share_max_hours: int = 24 * 30
    download_anomaly_threshold: int = 25

    # Email
    smtp_host: str = ""
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "TrustShare <no-reply@trustshare.local>"
    smtp_tls: bool = False

    # OAuth2 providers (optional)
    google_client_id: str = ""
    google_client_secret: str = ""
    microsoft_client_id: str = ""
    microsoft_client_secret: str = ""

    # Bootstrap
    admin_email: str = "admin@trustshare.local"
    admin_password: str = ""
    admin_name: str = "System Administrator"
    seed_demo_users: bool = False
    geoip_db_path: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * MB

    @property
    def default_quota_bytes(self) -> int:
        return self.default_quota_gb * GB

    @property
    def master_key_map(self) -> dict[int, bytes]:
        keys: dict[int, bytes] = {}
        for part in self.master_keys.split(","):
            part = part.strip()
            if not part:
                continue
            version, _, b64 = part.partition(":")
            raw = base64.b64decode(b64)
            if len(raw) != 32:
                raise ValueError(f"Master key v{version} must be 32 bytes (AES-256)")
            keys[int(version)] = raw
        return keys

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    def validate_for_runtime(self) -> None:
        if self.is_production:
            if len(self.jwt_secret) < 32 or self.jwt_secret.lower().startswith("change"):
                raise RuntimeError("JWT_SECRET must be a random string of 32+ characters in production")
            if self.key_provider == "local" and self.active_key_version not in self.master_key_map:
                raise RuntimeError("MASTER_KEYS must contain ACTIVE_KEY_VERSION in production")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
