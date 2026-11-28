
import redis
from app.config import REDIS_URL


class RedisService:
    client = None

    @classmethod
    def connect(cls):
        if cls.client is None:
            cls.client = redis.Redis.from_url(
                REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=5
            )

        cls.client.ping()
        return cls.client

    @classmethod
    def get_client(cls):
        if cls.client is None:
            raise RuntimeError("Redis is not connected.")
        return cls.client

    @classmethod
    def close(cls):
        if cls.client is not None:
            cls.client.close()
            cls.client = None
