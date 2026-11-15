"""Sets safe dummy settings BEFORE the app is imported, so tests need no real database."""
import base64
import os

os.environ.setdefault("POSTGRES_USER", "test")
os.environ.setdefault("POSTGRES_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB", "test")
os.environ.setdefault("MONGO_INITDB_ROOT_USERNAME", "test")
os.environ.setdefault("MONGO_INITDB_ROOT_PASSWORD", "test")
os.environ.setdefault("REDIS_PASSWORD", "test")
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-123")
os.environ.setdefault("MASTER_KEYS", "v1:" + base64.b64encode(b"A" * 32).decode())
os.environ.setdefault("MASTER_KEY_CURRENT", "v1")
