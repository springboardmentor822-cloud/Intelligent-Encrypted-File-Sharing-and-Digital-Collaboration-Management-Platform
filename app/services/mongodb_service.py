
from pymongo import MongoClient
from app.config import MONGODB_URL, MONGODB_DATABASE


class MongoDBService:
    client = None
    db = None

    @classmethod
    def connect(cls):
        if cls.client is None:
            cls.client = MongoClient(
                MONGODB_URL,
                serverSelectionTimeoutMS=5000
            )

        # Verify MongoDB connection
        cls.client.admin.command("ping")

        cls.db = cls.client[MONGODB_DATABASE]

        return cls.db

    @classmethod
    def get_database(cls):
        if cls.db is None:
            raise RuntimeError(
                "MongoDB is not connected."
            )

        return cls.db

    @classmethod
    def close(cls):
        if cls.client is not None:
            cls.client.close()

        cls.client = None
        cls.db = None
