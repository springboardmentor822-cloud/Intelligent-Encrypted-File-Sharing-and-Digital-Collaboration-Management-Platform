import time
from typing import Optional
from app.core.config import settings

try:
    import redis
    # Test real redis connection
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1)
    redis_client.ping()
    print("Connected to Redis server.")
except Exception:
    redis_client = None


# Fallback in-memory store for Windows development
_memory_store = {}
_memory_expirations = {}


def set_cache(key: str, value: str, expire_seconds: int = 3600):
    """Sets a key with an expiration TTL (Time-To-Live)."""
    if redis_client:
        try:
            redis_client.setex(key, expire_seconds, value)
            return
        except Exception:
            pass
    # In-memory fallback
    _memory_store[key] = value
    _memory_expirations[key] = time.time() + expire_seconds


def get_cache(key: str) -> Optional[str]:
    """Gets a key, respecting TTL expiration."""
    if redis_client:
        try:
            return redis_client.get(key)
        except Exception:
            pass
    # In-memory fallback
    if key in _memory_store:
        if time.time() < _memory_expirations.get(key, 0):
            return _memory_store[key]
        # Expired
        _memory_store.pop(key, None)
        _memory_expirations.pop(key, None)
    return None


def is_rate_limited(client_ip: str, max_requests: int = 5, window_seconds: int = 60) -> bool:
    """
    Rate limiter: Returns True if client exceeded max_requests within window_seconds.
    Used to protect login routes from brute-force dictionary attacks.
    """
    key = f"rate:{client_ip}"
    if redis_client:
        try:
            current = redis_client.incr(key)
            if current == 1:
                redis_client.expire(key, window_seconds)
            return current > max_requests
        except Exception:
            pass
    
    # In-memory fallback
    now = time.time()
    count, expire_time = _memory_store.get(key, (0, now + window_seconds))
    if now > expire_time:
        count = 0
        expire_time = now + window_seconds
    
    count += 1
    _memory_store[key] = (count, expire_time)
    return count > max_requests
