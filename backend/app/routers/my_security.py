"""My Security — the signed-in user's own security centre (data for the charts + key rotation).

Everything here is scoped to the caller: files they own, shares they created, sign-in attempts against
their own account. No other user's data is ever returned.

Key rotation (policy)
---------------------
* ``rewrap``    re-protects each file's data key under the *active* master key (KEK). Ciphertext untouched.
* ``data_key``  replaces the file's data key itself: decrypt -> fresh random AES-256 key -> re-encrypt -> write
                to a NEW storage object -> switch the database pointer -> delete the old object. The old
                object is only removed after the database commit succeeds, so a failure never loses a file.
A file is "due" when its last rotation (or upload) is older than ``TS_KEY_ROTATION_DAYS`` or it is still wrapped
by an older master-key version. Last-rotation time is read from the append-only audit log (``key.file_rotate``),
so no database migration is needed.
"""
from collections import Counter
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db, iso, utcnow
from ..deps import current_user, days_between, parse_range
from ..models import AuditLog, DownloadRecord, File, LoginEvent, Share, User
from ..services.audit import audit
from ..services.encryption import DecryptionError
from ..services.storage import new_key
from ..state import encryption, key_manager, storage

settings = get_settings()
router = APIRouter(prefix="/api/my-security", tags=["my-security"])
ROTATE_ACTION = "key.file_rotate"
MAX_ROTATE_BATCH = 200


def _last_rotations(db: Session, user_id: str) -> dict:
    rows = db.execute(select(AuditLog.resource_id, AuditLog.created_at).where(
        AuditLog.actor_id == user_id, AuditLog.action == ROTATE_ACTION, AuditLog.outcome == "success")).all()
    out: dict = {}
    for rid, at in rows:
        if rid and (rid not in out or at > out[rid]):
            out[rid] = at
    return out


def _key_row(f: File, rot: dict, now) -> dict:
    last = rot.get(f.id) or f.created_at
    age = max(0, (now - last).days)
    outdated = f.kek_version < key_manager.active_version
    return {"id": f.id, "name": f.original_name, "category": f.category, "size": f.size, "secure": bool(f.is_secure),
            "algorithm": f.enc_alg, "kek_version": f.kek_version, "last_rotated": iso(rot.get(f.id)),
            "key_created_or_rotated": iso(last), "age_days": age, "outdated_master_key": outdated,
            "due": outdated or age >= settings.key_rotation_days}


def _bucket_age(days: int) -> str:
    return "0–30 days" if days <= 30 else "31–60 days" if days <= 60 else "61–90 days" if days <= 90 else "90+ days"


BUCKETS = ["0–30 days", "31–60 days", "61–90 days", "90+ days"]


def _daily(dates: list, days: list[str]) -> dict:
    c = Counter(d.date().isoformat() for d in dates)
    return {d: c.get(d, 0) for d in days}


@router.get("/overview")
def overview(start: str | None = None, end: str | None = None, user: User = Depends(current_user),
             db: Session = Depends(get_db)):
    s, e = parse_range(start, end, default_days=30)
    days, now = days_between(s, e), utcnow()
    files = db.scalars(select(File).where(File.owner_id == user.id, File.deleted_at.is_(None))).all()
    rot = _last_rotations(db, user.id)
    rows = [_key_row(f, rot, now) for f in files]

    shares = db.scalars(select(Share).where(Share.owner_id == user.id)).all()
    status = Counter("revoked" if x.revoked_at else "expired" if x.expires_at <= now else "active" for x in shares)
    perm = Counter(x.permission for x in shares if not x.revoked_at and x.expires_at > now)

    fails = db.scalars(select(LoginEvent).where(LoginEvent.user_id == user.id, LoginEvent.created_at >= s,
                                                LoginEvent.created_at < e).order_by(LoginEvent.id.desc()).limit(5000)).all()
    f_days = _daily([x.created_at for x in fails if not x.success], days)
    ok_days = _daily([x.created_at for x in fails if x.success], days)
    dl = db.scalars(select(DownloadRecord.created_at).where(DownloadRecord.owner_id == user.id,
                                                            DownloadRecord.created_at >= s, DownloadRecord.created_at < e).limit(20000)).all()
    denied = db.scalars(select(AuditLog.created_at).where(AuditLog.owner_id == user.id, AuditLog.outcome == "denied",
                                                          AuditLog.created_at >= s, AuditLog.created_at < e).limit(20000)).all()
    dl_d, den_d = _daily(list(dl), days), _daily(list(denied), days)

    window_start = now - timedelta(minutes=settings.user_wrong_password_window_minutes)
    recent_window = sum(1 for x in fails if not x.success and x.created_at >= window_start)
    thr = settings.user_wrong_password_alert_threshold
    return {
        "range": {"start": s.date().isoformat(), "end": (e - timedelta(days=1)).date().isoformat()},
        "files": {"total": len(files), "encrypted": len(files), "secure_folder": sum(1 for f in files if f.is_secure),
                  "bytes": sum(f.size for f in files), "algorithm": "AES-256-GCM",
                  "active_master_key": key_manager.active_version, "policy_days": settings.key_rotation_days,
                  "rotation_due": sum(1 for r in rows if r["due"]),
                  "by_master_key": [{"version": f"v{v}", "files": n} for v, n in sorted(Counter(r["kek_version"] for r in rows).items())],
                  "key_age": [{"bucket": b, "files": sum(1 for r in rows if _bucket_age(r["age_days"]) == b)} for b in BUCKETS],
                  "by_type": [{"category": c, "files": n} for c, n in Counter(r["category"] for r in rows).items()]},
        "shares": {"total": len(shares), "by_status": [{"name": k, "value": status.get(k, 0)} for k in ("active", "expired", "revoked")],
                   "active_by_permission": [{"name": k, "value": perm.get(k, 0)} for k in ("view", "download")],
                   "passcode_protected": sum(1 for x in shares if x.passcode_hash),
                   "with_download_limit": sum(1 for x in shares if x.max_downloads)},
        "series": {"sign_ins": [{"date": d, "failed": f_days[d], "success": ok_days[d]} for d in days],
                   "downloads": [{"date": d, "count": dl_d[d]} for d in days],
                   "denied": [{"date": d, "count": den_d[d]} for d in days]},
        "password_trigger": {
            "threshold": thr, "window_minutes": settings.user_wrong_password_window_minutes,
            "failed_in_window": recent_window, "state": "alert" if recent_window >= thr else "watching" if recent_window else "clear",
            "failed_in_range": sum(1 for x in fails if not x.success),
            "recent_failed": [{"at": iso(x.created_at), "ip": x.ip, "device": (x.user_agent or "")[:70], "reason": x.reason}
                              for x in fails if not x.success][:8]},
    }


@router.get("/keys")
def keys(user: User = Depends(current_user), db: Session = Depends(get_db)):
    now = utcnow()
    rot = _last_rotations(db, user.id)
    files = db.scalars(select(File).where(File.owner_id == user.id, File.deleted_at.is_(None))
                       .order_by(File.created_at.desc()).limit(500)).all()
    rows = [_key_row(f, rot, now) for f in files]
    rows.sort(key=lambda r: (not r["due"], -r["age_days"]))
    return {"policy": {"rotate_every_days": settings.key_rotation_days, "active_master_key": key_manager.active_version,
                       "available_master_keys": sorted(key_manager.keys), "master_key_source": key_manager.mode,
                       "automatic": False,
                       "description": "Data keys are rotated on request (or when a file is flagged due). Master-key changes are "
                                      "performed by an administrator; use 'Re-wrap' afterwards to move your files onto the new version."},
            "due": sum(1 for r in rows if r["due"]), "total": len(rows), "files": rows}


class RotateIn(BaseModel):
    mode: str = Field("data_key", pattern="^(data_key|rewrap)$")
    file_ids: list[str] | None = Field(None, max_length=MAX_ROTATE_BATCH)
    only_due: bool = False
    model_config = {"extra": "forbid"}


def _rotate_one(db: Session, f: File, mode: str) -> str | None:
    """Rotate one file's key. Returns the old storage key to delete AFTER commit (data_key mode) or None."""
    if mode == "rewrap":
        f.wrapped_dek, f.kek_version = encryption.rewrap(f.wrapped_dek, f.kek_version, f.id)
        return None
    plain = encryption.decrypt(storage().get(f.storage_key), file_id=f.id, nonce_b64=f.nonce,
                               wrapped_dek=f.wrapped_dek, kek_version=f.kek_version)
    blob = encryption.encrypt(plain, f.id)
    new_k, old_k = new_key(), f.storage_key
    storage().put(new_k, blob.ciphertext)
    f.storage_key, f.nonce, f.wrapped_dek, f.kek_version = new_k, blob.nonce_b64, blob.wrapped_dek, blob.kek_version
    f._new_key = new_k  # type: ignore[attr-defined]  (used for cleanup on failure)
    return old_k


@router.post("/keys/rotate")
def rotate(body: RotateIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(File).where(File.owner_id == user.id, File.deleted_at.is_(None))
    if body.file_ids:
        q = q.where(File.id.in_(body.file_ids))
    files = db.scalars(q.limit(MAX_ROTATE_BATCH)).all()
    if body.file_ids and not files:
        raise HTTPException(404, "No matching files")
    now, rot = utcnow(), _last_rotations(db, user.id)
    if body.only_due:
        files = [f for f in files if _key_row(f, rot, now)["due"]]
    done, failed = 0, []
    for f in files:
        before = f.kek_version
        try:
            old_k = _rotate_one(db, f, body.mode)
            db.commit()
        except Exception as ex:  # one bad file must not stop the batch
            db.rollback()
            nk = getattr(f, "_new_key", None)
            if nk:
                try: storage().delete(nk)
                except Exception: pass
            failed.append({"id": f.id, "name": f.original_name, "error": "integrity check failed" if isinstance(ex, DecryptionError) else "storage unavailable"})
            audit(db, ROTATE_ACTION, request=request, actor_id=user.id, owner_id=user.id, resource_type="file",
                  resource_id=f.id, outcome="failure", details={"mode": body.mode})
            continue
        if old_k:
            try: storage().delete(old_k)
            except Exception: pass   # orphaned ciphertext is harmless (still encrypted) and can be swept later
        audit(db, ROTATE_ACTION, request=request, actor_id=user.id, owner_id=user.id, resource_type="file",
              resource_id=f.id, details={"mode": body.mode, "kek_from": before, "kek_to": f.kek_version})
        done += 1
    return {"mode": body.mode, "rotated": done, "failed": failed,
            "active_master_key": key_manager.active_version}
