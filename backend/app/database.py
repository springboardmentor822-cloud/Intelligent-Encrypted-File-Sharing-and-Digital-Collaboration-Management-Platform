
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base
from pymongo import MongoClient
import redis


# Load environment variables from backend/.env
env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)


# Shared base for SQLAlchemy models
Base = declarative_base()


# MySQL connection
DATABASE_URL = (
    f"mysql+pymysql://{os.getenv('MYSQL_USER')}:"
    f"{os.getenv('MYSQL_PASSWORD')}@"
    f"{os.getenv('MYSQL_HOST')}:"
    f"{os.getenv('MYSQL_PORT')}/"
    f"{os.getenv('MYSQL_DATABASE')}"
)

mysql_engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)


# MongoDB connection
mongo_client = MongoClient(
    os.getenv("MONGODB_URI", "mongodb://localhost:27017/"),
    serverSelectionTimeoutMS=5000,
)

mongo_db = mongo_client[
    os.getenv("MONGODB_DB", "trustshare")
]


# Redis connection
redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", "6379")),
    db=int(os.getenv("REDIS_DB", "0")),
    decode_responses=True,
)


def test_connections():
    """Test MySQL, MongoDB, and Redis connections."""

    with mysql_engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    print("MySQL connected successfully!")

    mongo_client.admin.command("ping")
    print("MongoDB connected successfully!")

    redis_client.ping()
    print("Redis connected successfully!")


if __name__ == "__main__":
    try:
        test_connections()
    finally:
        mysql_engine.dispose()
        mongo_client.close()
        redis_client.close()
