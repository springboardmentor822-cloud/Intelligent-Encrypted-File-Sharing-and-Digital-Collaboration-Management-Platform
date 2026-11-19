import os
from typing import List

class Settings:
    PROJECT_NAME: str = "TrustShare 2.0"
    PROJECT_VERSION: str = "2.0.0"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    BASE_DIR: str = os.path.dirname(os.path.abspath(__file__))
    DB_FILE: str = os.path.join(BASE_DIR, "trustshare_milestone2.db")
    
    # Absolute database URL for SQLite to prevent working directory divergence
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{DB_FILE.replace(os.sep, '/')}")
    
    # Secret Key for session signatures / CSRF
    SECRET_KEY: str = os.getenv("SECRET_KEY", "trustshare_zero_trust_enterprise_secret_key_2026_likitha")
    
    # Master Key (KEK) for Envelope Encryption (32 bytes hex).
    # Production must inject MASTER_ENCRYPTION_KEY explicitly. Development retains
    # the existing key for backward compatibility with stored encrypted files.
    MASTER_ENCRYPTION_KEY: str = os.getenv("MASTER_ENCRYPTION_KEY", "")
    
    # Session Settings
    SESSION_EXPIRE_HOURS: int = 24
    IDLE_TIMEOUT_MINUTES: int = 30
    SESSION_COOKIE_NAME: str = "trustshare_session"
    
    # File Limits
    MAX_FILE_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB
    ALLOWED_EXTENSIONS: set = {".pdf", ".docx", ".xlsx", ".png", ".jpg", ".jpeg", ".txt"}
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ]
    
    # Storage
    AWS_ACCESS_KEY_ID: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    AWS_SECRET_ACCESS_KEY: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
    AWS_S3_BUCKET_NAME: str = os.getenv("AWS_S3_BUCKET_NAME", "trustshare-encrypted-vault")
    LOCAL_VAULT_DIR: str = os.path.join(BASE_DIR, "cloud_storage_vault")

settings = Settings()
