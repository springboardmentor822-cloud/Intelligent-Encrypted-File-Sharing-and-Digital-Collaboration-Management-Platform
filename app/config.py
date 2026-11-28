import os
from dotenv import load_dotenv

load_dotenv()

# JWT Configuration
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
)

if not JWT_SECRET_KEY or JWT_SECRET_KEY == "CHANGE_THIS_TO_A_RANDOM_SECRET":
    raise RuntimeError("Please configure a valid JWT secret in .env")


# RustFS / S3-Compatible Storage Configuration
RUSTFS_ENDPOINT_URL = os.getenv(
    "RUSTFS_ENDPOINT_URL",
    "http://localhost:9000"
)

RUSTFS_ACCESS_KEY = os.getenv("RUSTFS_ACCESS_KEY")
RUSTFS_SECRET_KEY = os.getenv("RUSTFS_SECRET_KEY")

RUSTFS_BUCKET_NAME = os.getenv(
    "RUSTFS_BUCKET_NAME",
    "trustshare-files"
)

RUSTFS_REGION = os.getenv("RUSTFS_REGION", "us-east-1")

# MongoDB Configuration
MONGODB_URL = os.getenv(
    "MONGODB_URL",
    "mongodb://localhost:27017"
)

MONGODB_DATABASE = os.getenv(
    "MONGODB_DATABASE",
    "trustshare"
)


# Redis Configuration
REDIS_URL = os.getenv(
    "REDIS_URL",
    "redis://localhost:6379/0"
)