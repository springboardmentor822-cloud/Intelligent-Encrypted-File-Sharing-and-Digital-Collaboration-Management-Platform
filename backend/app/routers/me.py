from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from ..config import get_settings
from ..db import get_db, iso, utcnow
from ..deps import current_user, days_between, paginate, parse_range, pct_change
from ..models import AuditLog, DownloadRecord, File, Share, User
from ..routers.auth import configured
from ..services.audit import audit
from ..services.security import hash_password, password_problem, verify_password
from ..serializers import user_out
from ..state import key_manager, storage

settings = get_settings()
router = APIRouter(prefix="/api", tags=["me"])


class ProfileIn(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=120)
    prefs: dict | None = None
    model_config = {"extra": "forbid"}     # role / is_active / quota can never be set here


@router.patch("/users/me")
def update_me(body: ProfileIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.full_name: user.full_name = body.full_name.strip()
    if body.prefs is not None:
        allowed = {"notify_shares", "notify_security", "default_share_hours"}
        user.prefs = {**(user.prefs or {}), **{k: v for k, v in body.prefs.items() if k in allowed and isinstance(v, (bool, int))}}
    db.commit()
    audit(db, "user.profile_update", request=request, actor_id=user.id, owner_id=user.id, resource_type="user", resource_id=user.id)
    return user_out(user)


class PwIn(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(max_length=128)


@router.post("/users/me/password")
def change_pw(body: PwIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        audit(db, "user.password_change", request=request, actor_id=user.id, outcome="failure", details={"reason": "bad_current_password"})
        raise HTTPException(400, "Current password is incorrect")
    if (p := password_problem(body.new_password)):
        raise HTTPException(422, p)
    user.password_hash = hash_password(body.new_password); db.commit()
    audit(db, "user.password_change", request=request, actor_id=user.id, owner_id=user.id)
    return {"ok": True}


@router.get("/activity")
def activity(page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), action: str | None = None,
             user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Only entries the user performed or that concern the user's own resources."""
    stmt = select(AuditLog).where(or_(AuditLog.actor_id == user.id, AuditLog.owner_id == user.id))
    if action:
        stmt = stmt.where(AuditLog.action.like(f"{action}%"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(AuditLog.id.desc()).limit(page_size).offset((page - 1) * page_size)).all()
    return {"items": [{"id": r.id, "action": r.action, "outcome": r.outcome, "resource_type": r.resource_type,
                       "resource_id": r.resource_id, "by_me": r.actor_id == user.id, "ip": r.ip if r.actor_id == user.id else None,
                       "details": r.details, "created_at": iso(r.created_at)} for r in rows], **paginate(total, page, page_size)}


@router.get("/security/status")
def security_status(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    now = utcnow()
    https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    last_rot = db.scalar(select(func.max(__import__("app.models", fromlist=["KeyRotation"]).KeyRotation.created_at)))
    return {
        "role": user.role,
        "encryption": {"enabled": True, "algorithm": "AES-256-GCM", "scheme": "per-file data key wrapped by versioned master key",
                       "key_version": key_manager.active_version, "key_source": key_manager.mode,
                       "storage_backend": storage().name,
                       "files_encrypted": db.scalar(select(func.count()).select_from(File).where(File.owner_id == user.id))},
        "transport": {"request_over_https": https, "https_enforced": settings.https_enforced,
                      "note": "HTTPS must be provided by a TLS-terminating proxy in production; local development uses plain HTTP on localhost."},
        "jwt": {"algorithm": settings.jwt_algorithm, "access_token_minutes": settings.access_token_minutes,
                "remember_me_days": settings.remember_token_days, "revocation_on_logout": True, "refresh_tokens": False},
        "oauth": {"google": configured("google"), "microsoft": configured("microsoft"), "linked_provider": user.oauth_provider},
        "rbac": {"role": user.role, "self_service_role_change": False},
        "share_links": {"active": db.scalar(select(func.count()).select_from(Share).where(Share.owner_id == user.id, Share.revoked_at.is_(None), Share.expires_at > now)),
                        "total": db.scalar(select(func.count()).select_from(Share).where(Share.owner_id == user.id))},
        "download_tracking": {"records": db.scalar(select(func.count()).select_from(DownloadRecord).where(DownloadRecord.owner_id == user.id))},
        "audit": {"my_entries": db.scalar(select(func.count()).select_from(AuditLog).where(or_(AuditLog.actor_id == user.id, AuditLog.owner_id == user.id)))},
        "tokens": {"share_token_bytes": 32, "stored_as": "SHA-256 hash only"},
        "key_rotation": {"active_version": key_manager.active_version, "last_rotation": iso(last_rot), "automatic": False,
                         "note": "Rotation is performed manually by an administrator; no scheduler is configured."},
    }


# ---------------- analytics (own files only) ----------------
def _count(db, model, col, where, s, e):
    return db.scalar(select(func.count()).select_from(model).where(*where, col >= s, col < e)) or 0


@router.get("/analytics/overview")
def analytics(start: str | None = None, end: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s, e = parse_range(start, end)
    ps, pe = s - (e - s), s
    days = days_between(s, e)
    zero = lambda: {d: 0 for d in days}
    uid = user.id
    up = [File.owner_id == uid]
    dl = [DownloadRecord.owner_id == uid, DownloadRecord.action == "download"]
    sh = [Share.owner_id == uid]
    used = db.scalar(select(func.coalesce(func.sum(File.size), 0)).where(File.owner_id == uid)) or 0
    cur = {"uploads": _count(db, File, File.created_at, up, s, e), "downloads": _count(db, DownloadRecord, DownloadRecord.created_at, dl, s, e),
           "shares": _count(db, Share, Share.created_at, sh, s, e)}
    prev = {"uploads": _count(db, File, File.created_at, up, ps, pe), "downloads": _count(db, DownloadRecord, DownloadRecord.created_at, dl, ps, pe),
            "shares": _count(db, Share, Share.created_at, sh, ps, pe)}
    cats = db.execute(select(File.category, func.count(), func.coalesce(func.sum(File.size), 0)).where(File.owner_id == uid, File.deleted_at.is_(None)).group_by(File.category)).all()
    cat_bytes = {c: int(b) for c, _, b in cats}
    storage_by_type = [{"category": c, "bytes": cat_bytes.get(c, 0), "percent": round(cat_bytes.get(c, 0) / used * 100, 1) if used else 0} for c in ("documents", "images", "videos", "others")]
    uploads = {c: zero() for c in ("documents", "images", "videos", "others")}
    for cat, ts in db.execute(select(File.category, File.created_at).where(*up, File.created_at >= s, File.created_at < e)):
        uploads[cat][ts.date().isoformat()] += 1
    tot, uniq, shared, uset = zero(), zero(), zero(), {d: set() for d in days}
    drows = db.execute(select(DownloadRecord.created_at, DownloadRecord.user_id, DownloadRecord.share_id, DownloadRecord.ip).where(*dl, DownloadRecord.created_at >= s, DownloadRecord.created_at < e)).all()
    for ts, u, sid, ip in drows:
        d = ts.date().isoformat(); tot[d] += 1
        if sid: shared[d] += 1
        uset[d].add(u or f"ip:{ip}")
    uniq = {d: len(v) for d, v in uset.items()}
    shares = {"direct": zero(), "link": zero()}
    for kind, ts in db.execute(select(Share.kind, Share.created_at).where(*sh, Share.created_at >= s, Share.created_at < e)):
        shares["direct" if kind == "user" else "link"][ts.date().isoformat()] += 1
    ser = lambda m: [{"date": d, **{k: v[d] for k, v in m.items()}} for d in days]
    ru = db.scalars(select(File).where(File.owner_id == uid, File.deleted_at.is_(None)).order_by(File.created_at.desc()).limit(8)).all()
    rd = db.execute(select(DownloadRecord, File, User).join(File, File.id == DownloadRecord.file_id).outerjoin(User, User.id == DownloadRecord.user_id)
                    .where(*dl).order_by(DownloadRecord.created_at.desc()).limit(8)).all()
    return {
        "range": {"start": s.date().isoformat(), "end": (e - timedelta(days=1)).date().isoformat()},
        "summary": {"storage_used": used, "quota": user.quota_bytes,
                    "uploads": {"value": cur["uploads"], "change_pct": pct_change(cur["uploads"], prev["uploads"])},
                    "downloads": {"value": cur["downloads"], "change_pct": pct_change(cur["downloads"], prev["downloads"])},
                    "shares": {"value": cur["shares"], "change_pct": pct_change(cur["shares"], prev["shares"])}},
        "storage_by_type": storage_by_type,
        "uploads_series": ser(uploads),
        "downloads_series": ser({"total": tot, "unique_users": uniq, "shared": shared}),
        "downloads_totals": {"total": sum(tot.values()), "shared": sum(shared.values()), "unique_users": len(set().union(*uset.values())) if uset else 0},
        "shares_series": ser(shares),
        "sharing_note": "Direct = shared with a registered user; Link = tokenised link. 'Internal share' (team/group) is not modelled.",
        "recent_uploads": [{"id": f.id, "name": f.original_name, "size": f.size, "ext": f.ext, "created_at": iso(f.created_at)} for f in ru],
        "recent_downloads": [{"name": f.original_name, "by": (u.full_name or u.email) if u else "Anonymous link visitor", "size": r.bytes, "created_at": iso(r.created_at)} for r, f, u in rd],
    }
