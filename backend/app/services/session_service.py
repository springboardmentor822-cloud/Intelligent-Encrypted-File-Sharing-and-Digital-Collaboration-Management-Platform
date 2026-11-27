"""Server-side sessions in Redis. Access tokens carry a session id (sid) that must still exist."""
import time
import uuid

from app.core.config import settings
from app.core.redis_client import get_redis

TTL = settings.refresh_token_days * 86400


def create_session(user_id, ip: str, user_agent: str, refresh_jti: str) -> str:
    sid = uuid.uuid4().hex
    r = get_redis()
    key = f"session:{sid}"
    r.hset(key, mapping={
        "user_id": str(user_id), "ip": ip, "ua": user_agent[:200],
        "created_at": int(time.time()), "refresh_jti": refresh_jti,
    })
    r.expire(key, TTL)
    r.sadd(f"user_sessions:{user_id}", sid)
    r.expire(f"user_sessions:{user_id}", TTL)
    return sid


def get_session(sid: str) -> dict | None:
    data = get_redis().hgetall(f"session:{sid}")
    return data or None


def set_refresh_jti(sid: str, jti: str) -> None:
    r = get_redis()
    r.hset(f"session:{sid}", "refresh_jti", jti)
    r.expire(f"session:{sid}", TTL)


def delete_session(sid: str, user_id=None) -> None:
    r = get_redis()
    if user_id is None:
        user_id = r.hget(f"session:{sid}", "user_id")
    r.delete(f"session:{sid}")
    if user_id:
        r.srem(f"user_sessions:{user_id}", sid)


def list_sessions(user_id) -> list[dict]:
    r = get_redis()
    out = []
    for sid in r.smembers(f"user_sessions:{user_id}"):
        s = r.hgetall(f"session:{sid}")
        if not s:
            r.srem(f"user_sessions:{user_id}", sid)
            continue
        out.append({"id": sid, "ip": s.get("ip"), "user_agent": s.get("ua"), "created_at": int(s.get("created_at", 0))})
    return sorted(out, key=lambda x: -x["created_at"])


def delete_all_sessions(user_id) -> None:
    for s in list_sessions(user_id):
        delete_session(s["id"], user_id)
