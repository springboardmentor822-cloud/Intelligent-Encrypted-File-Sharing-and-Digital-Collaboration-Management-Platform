"""Optional MongoDB mirror for Milestone 3 document collections.

TrustShare's source of truth is the relational database (SQLite in dev, PostgreSQL in prod) so the
app runs with zero external services. When ``TS_MONGO_URL`` is set we additionally mirror activity,
audit, notification and security-event documents into MongoDB collections, matching the Milestone 3
requirement ("store in MongoDB") for deployments that provide it.

Mirroring is best-effort and never breaks a request: any connection/serialisation error is swallowed
and surfaced through :func:`status`.
"""
from __future__ import annotations

import threading
from datetime import datetime, date
from typing import Any

from ..config import get_settings

_lock = threading.Lock()
_client = None
_db = None
_error: str | None = None
_last_write: datetime | None = None
_writes = 0


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _connect():
    global _client, _db, _error
    s = get_settings()
    if not s.mongo_url:
        return None
    if _db is not None:
        return _db
    with _lock:
        if _db is not None:
            return _db
        try:
            from pymongo import MongoClient  # optional dependency

            _client = MongoClient(s.mongo_url, serverSelectionTimeoutMS=1500)
            _client.admin.command("ping")
            _db = _client[s.mongo_db]
            _error = None
        except Exception as exc:  # pragma: no cover - depends on deployment
            _error = f"{type(exc).__name__}: {exc}"[:300]
            _client = None
            _db = None
    return _db


def mirror(collection: str, doc: dict) -> bool:
    """Write one document to MongoDB if configured. Returns True when mirrored."""
    global _last_write, _writes, _error
    db = _connect()
    if db is None:
        return False
    try:
        db[collection].insert_one(_jsonable(doc))
        _last_write = datetime.utcnow()
        _writes += 1
        return True
    except Exception as exc:  # pragma: no cover
        _error = f"{type(exc).__name__}: {exc}"[:300]
        return False


def status() -> dict:
    s = get_settings()
    db = _connect() if s.mongo_url else None
    return {
        "configured": bool(s.mongo_url),
        "connected": db is not None,
        "database": s.mongo_db if s.mongo_url else None,
        "error": _error,
        "documents_mirrored": _writes,
        "last_write_at": _last_write.isoformat() if _last_write else None,
    }
