"""All settings are read from environment variables (or the .env file)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "TrustShare"
    ENVIRONMENT: str = "development"

    # PostgreSQL
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432

    # MongoDB
    MONGO_INITDB_ROOT_USERNAME: str
    MONGO_INITDB_ROOT_PASSWORD: str
    MONGO_HOST: str = "localhost"
    MONGO_PORT: int = 27017
    MONGO_DB_NAME: str = "trustshare_logs"

    # Redis
    REDIS_PASSWORD: str
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379

    # JWT
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = 15
    REFRESH_TOKEN_DAYS: int = 7

    # Encryption: "v1:<base64 32 bytes>,v2:<base64 32 bytes>"
    MASTER_KEYS: str
    MASTER_KEY_CURRENT: str = "v1"

    # Storage
    STORAGE_BACKEND: str = "local"  # "local" or "s3"
    LOCAL_STORAGE_PATH: str = "./uploads"
    S3_BUCKET: str = ""
    S3_REGION: str = "ap-south-1"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""

    # Upload limits
    MAX_UPLOAD_MB: int = 25
    # ONE storage limit for the whole platform AND for each user: 1 GB by default. (USER_QUOTA_MB and
    # PLATFORM_STORAGE_GB below are old settings that are no longer used; they stay only so an old .env still loads.)
    STORAGE_LIMIT_MB: int = 1024
    STORAGE_WARN_PERCENT: int = 80        # a warning alert when the platform is this full
    STORAGE_CRITICAL_PERCENT: int = 95    # a critical alert at this level
    USER_QUOTA_MB: int = 500
    PLATFORM_STORAGE_GB: int = 10

    # Web
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    FRONTEND_URL: str = "http://localhost:5173"

    # Admin + email (SMTP is optional; without it emails are printed in the logs)
    ADMIN_EMAIL: str = ""
    PROMOTE_FIRST_USER: bool = True   # if there is NO admin at start-up, make the oldest account the admin (student-project convenience)
    ADMIN_PASSWORD: str = ""   # optional: if set, the admin account is CREATED at start-up (min 8 chars, a letter and a number)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@trustshare.local"

    # Security monitoring thresholds
    ALERT_FAILED_THRESHOLD: int = 5
    ALERT_DOWNLOAD_BURST: int = 20
    ADMIN_FAIL_THRESHOLD: int = 3           # failed logins on an ADMIN account (10 min) that raise an alert
    UNKNOWN_ACCOUNT_THRESHOLD: int = 3      # different non-existing emails tried from one IP (10 min)
    ALERT_SUSPICIOUS_IP_ACCOUNTS: int = 3   # one IP failing logins on this many different accounts = suspicious

    # Trash: files stay restorable for this many days, then are deleted for good
    TRASH_RETENTION_DAYS: int = 30

    # Optional: look up the city/country of an IP address (needs internet). Off by default.
    GEOIP_ENABLED: bool = False

    # Optional OAuth2 login with Google (leave empty to disable). See docs/OAUTH2_SETUP.md
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    OAUTH_REDIRECT_BASE: str = "http://localhost:8000"   # public URL of the BACKEND

    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    @property
    def postgres_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def mongo_url(self) -> str:
        return (
            f"mongodb://{self.MONGO_INITDB_ROOT_USERNAME}:{self.MONGO_INITDB_ROOT_PASSWORD}"
            f"@{self.MONGO_HOST}:{self.MONGO_PORT}/?authSource=admin"
        )

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024

    @property
    def platform_capacity_bytes(self) -> int:
        return self.STORAGE_LIMIT_MB * 1024 * 1024

    @property
    def quota_bytes(self) -> int:
        return self.STORAGE_LIMIT_MB * 1024 * 1024


settings = Settings()
