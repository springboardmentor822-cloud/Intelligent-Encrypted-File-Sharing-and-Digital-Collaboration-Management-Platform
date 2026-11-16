from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "TrustShare"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "trustshare_dev_super_secret_key_2026_change_in_prod"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # PostgreSQL Database
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "TrustShare_Users"
    DATABASE_URL: Optional[str] = None

 # MongoDB Atlas (Document & Activity Logs)
    MONGODB_URL: Optional[str] = None
    MONGODB_DB_NAME: str = "TrustShare_Logs"

# Redis (Session Cache & Rate Limiting)
    REDIS_URL: str = "redis://localhost:6379/0"


    # Cryptographic Master Key (Envelope Encryption KEK)
    # If not set, safely derived from SECRET_KEY using HKDF-SHA256
    MASTER_ENCRYPTION_KEY: Optional[str] = None

    # File uploads
    UPLOAD_DIR: str = "uploads"
    MAX_FILE_SIZE_MB: int = 50

    # Milestone 2 Task 2: Cloud Storage Integration (AWS S3 / MinIO / S3-Compatible)
    STORAGE_BACKEND: str = "local"  # "s3" or "local"
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_REGION: str = "us-east-1"
    AWS_S3_BUCKET: str = "trustshare-encrypted-vault"
    AWS_S3_ENDPOINT_URL: Optional[str] = None  # e.g., for MinIO or LocalStack

    # Milestone 3 Task 3: Email Notification & Alert Service (SMTP & AWS SES)
    EMAIL_PROVIDER: str = "auto"  # "ses", "smtp", "console"
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_USE_TLS: bool = True
    EMAILS_FROM_EMAIL: str = "notifications@trustshare.io"
    EMAILS_FROM_NAME: str = "TrustShare Security Vault"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def get_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"


settings = Settings()
