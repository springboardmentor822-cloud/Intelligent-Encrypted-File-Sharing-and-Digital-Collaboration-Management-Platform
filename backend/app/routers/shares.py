from datetime import timedelta
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..config import get_settings
from ..db import get_db, iso, utcnow
from ..deps import current_user
from ..models import DownloadRecord, File, Share, User
from ..serializers import file_out, share_out, share_status
from ..services import files as fs
from ..services.audit import audit, denied, raise_alert, security_event
from ..services.ratelimit import rate_limit
from ..services.security import (create_scope_token, decode_scope_token, hash_password, new_token, sha256,
                                 verify_password)
from .files import owned_file

settings = get_settings()
router = APIRouter(prefix="/api", tags=["shares"])


def _public_base(request: Request) -> str:
    """Return the browser-facing origin for generated share links.

    ``settings.frontend_url`` is only a static default; in development the Vite
    dev-server port can differ from it (and behind a proxy the public origin is
    not known to the backend at all).  Prefer the origin the caller is actually
    browsing from so the copied link always opens, then fall back to config.
    """
    from urllib.parse import urlsplit

    for header in ("origin", "referer"):
        value = request.headers.get(header)
        if not value:
            continue
        parts = urlsplit(value)
        if parts.scheme in ("http", "https") and parts.netloc:
            return f"{parts.scheme}://{parts.netloc}"
    return settings.frontend_url.rstrip("/")


class ShareIn(BaseModel):
    file_id: str
    kind: str = Field(pattern="^(link|user)$")
    permission: str = Field(pattern="^(view|download)$")
    expires_in_hours: int = Field(ge=1)
    recipient_email: EmailStr | None = None
    max_downloads: int | None = Field(None, ge=1, le=10000)
    passcode: str | None = Field(None, min_length=4, max_length=64)
    model_config = {"extra": "forbid"}


@router.post("/shares", status_code=201)
def create_share(body: ShareIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = owned_file(db, request, user, body.file_id)
    if body.expires_in_hours > settings.max_share_days * 24:
        raise HTTPException(422, f"Expiry cannot exceed {settings.max_share_days} days")
    s = Share(file_id=f.id, owner_id=user.id, kind=body.kind, permission=body.permission,
              expires_at=utcnow() + timedelta(hours=body.expires_in_hours), max_downloads=body.max_downloads)
    if body.passcode:
        s.passcode_hash = hash_password(body.passcode)   # Argon2id; raw passcode is never stored or returned
    raw = None
    rec = None
    if body.kind == "user":
        if not body.recipient_email:
            raise HTTPException(422, "recipient_email is required for direct shares")
        rec = db.scalar(select(User).where(User.email == body.recipient_email.lower(), User.is_active == True))  # noqa: E712
        if not rec or rec.id == user.id:
            raise HTTPException(404, "No eligible registered user with that email")
        s.recipient_id = rec.id
    else:
        raw = new_token(32)
        s.token_hash = sha256(raw)          # only the hash is stored
    db.add(s); db.commit()
    audit(db, "share.create", request=request, actor_id=user.id, owner_id=user.id, resource_type="share", resource_id=s.id,
          details={"file_id": f.id, "kind": s.kind, "permission": s.permission, "expires_at": iso(s.expires_at)})
    # Milestone 3 — activity stream + recipient notification for direct shares.
    try:
        from ..activity_monitoring import service as activity
        activity.record(db, "share_create", user_id=user.id, file_id=f.id, request=request,
                        details={"share_id": s.id, "kind": s.kind, "permission": s.permission})
        if rec:
            from ..notifications import service as notify_service
            notify_service.notify(db, rec.id, "A file was shared with you",
                                  f"{(user.full_name or user.email)} shared \u201c{f.original_name}\u201d with you "
                                  f"({s.permission} access).",
                                  type="file_shared", severity="info", link="/app/shared-with-me",
                                  meta={"share_id": s.id, "file_id": f.id, "from": user.id})
    except Exception:
        pass
    out = share_out(s, utcnow(), rec)
    if raw:
        out["url"] = f"{_public_base(request)}/s/{raw}"
        out["note"] = "This link is shown only once. Store it now; it cannot be retrieved later."
    return out


@router.get("/shares/mine")
def mine(user: User = Depends(current_user), db: Session = Depends(get_db)):
    now = utcnow()
    rows = db.scalars(select(Share).where(Share.owner_id == user.id).order_by(Share.created_at.desc()).limit(500)).all()
    rec = {u.id: u for u in db.scalars(select(User).where(User.id.in_([r.recipient_id for r in rows if r.recipient_id])))}
    return {"items": [share_out(s, now, rec.get(s.recipient_id)) for s in rows]}


@router.post("/shares/{share_id}/revoke")
def revoke(share_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = db.get(Share, share_id)
    if not s:
        raise HTTPException(404, "Share not found")
    if s.owner_id != user.id:
        denied(db, request, user_id=user.id, action="share.access_denied", resource_type="share", resource_id=s.id,
               owner_id=s.owner_id, severity="medium", description="Attempt to modify another user's share")
        raise HTTPException(403, "You do not have access to this share")
    if not s.revoked_at:
        s.revoked_at = utcnow(); db.commit()
        audit(db, "share.revoke", request=request, actor_id=user.id, owner_id=user.id, resource_type="share", resource_id=s.id)
        try:
            from ..activity_monitoring import service as activity
            activity.record(db, "share_revoke", user_id=user.id, file_id=s.file_id, request=request,
                            details={"share_id": s.id})
        except Exception:
            pass
    return share_out(s, utcnow())


@router.get("/shares/{share_id}/downloads")
def share_downloads(share_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = db.get(Share, share_id)
    if not s or s.owner_id != user.id:
        raise HTTPException(404, "Share not found")
    rows = db.scalars(select(DownloadRecord).where(DownloadRecord.share_id == s.id).order_by(DownloadRecord.created_at.desc()).limit(200)).all()
    return {"items": [{"action": r.action, "ip": r.ip, "created_at": iso(r.created_at), "user_id": r.user_id} for r in rows]}


@router.get("/downloads/mine")
def my_download_history(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Downloads/views of files this user owns (by themselves or through shares)."""
    rows = db.execute(select(DownloadRecord, File, User).join(File, File.id == DownloadRecord.file_id)
                      .outerjoin(User, User.id == DownloadRecord.user_id).where(DownloadRecord.owner_id == user.id)
                      .order_by(DownloadRecord.created_at.desc()).limit(200)).all()
    return {"items": [{"file_name": f.original_name, "action": r.action, "by": (u.full_name or u.email) if u else "Anonymous link visitor",
                       "via": "share link" if r.share_id else "owner", "size": r.bytes, "created_at": iso(r.created_at)} for r, f, u in rows]}


# ---------- passcode gate (optional extra layer on any share) ----------
def _scope_for(s: Share) -> str:
    return f"share:{s.id}"


def _require_passcode(db, request, s: Share, grant: str | None, user_id: str | None):
    """If the share is passcode-protected, require a valid short-lived grant obtained from /verify."""
    if not s.passcode_hash:
        return
    if not grant:
        raise HTTPException(401, "This share is passcode protected", headers={"X-Share-Passcode": "required"})
    try:
        claims = decode_scope_token(grant, _scope_for(s))
    except jwt.PyJWTError:
        denied(db, request, user_id=user_id, action="share.passcode_denied", resource_type="share", resource_id=s.id,
               owner_id=s.owner_id, severity="medium", description="Invalid or expired share passcode grant",
               category="sharing_link_misuse", kind="blocked")
        raise HTTPException(401, "Passcode verification required", headers={"X-Share-Passcode": "required"})
    if claims.get("sub") != s.id:
        raise HTTPException(401, "Passcode verification required", headers={"X-Share-Passcode": "required"})


def _check_passcode(db, request, s: Share, passcode: str, user_id: str | None):
    if not verify_password(passcode, s.passcode_hash):
        denied(db, request, user_id=user_id, action="share.passcode_failed", resource_type="share", resource_id=s.id,
               owner_id=s.owner_id, severity="medium", description="Incorrect passcode entered for a protected share",
               category="sharing_link_misuse", kind="blocked")
        raise_alert(db, "passcode_failure", "medium", "Incorrect share passcode",
                    f"An incorrect passcode was entered for share of '{s.file.original_name if s.file else 'a file'}'.",
                    request=request, user_id=s.owner_id, resource=f"share:{s.id}", details={"share_id": s.id})
        raise HTTPException(401, "Incorrect passcode")


# ---------- recipient (registered user) access ----------
def _direct_share(db, request, user, share_id, need_download: bool) -> Share:
    s = db.get(Share, share_id)
    if not s or s.kind != "user" or s.recipient_id != user.id:
        denied(db, request, user_id=user.id, action="share.access_denied", resource_type="share", resource_id=share_id,
               severity="medium", description="Attempt to use a share not issued to this user")
        raise HTTPException(403, "You do not have access to this share")
    st = share_status(s, utcnow())
    if st != "active":
        denied(db, request, user_id=user.id, action=f"share.{st}_use", resource_type="share", resource_id=s.id, owner_id=s.owner_id,
               severity="low", description=f"Use of a {st.replace('_', ' ')} share", category="sharing_link_misuse", kind="blocked")
        try:
            from ..activity_monitoring import service as activity
            atype = "share_expired_access" if st == "expired" else "share_revoked_access" if st == "revoked" else "unauthorized_access"
            activity.record(db, atype, user_id=user.id, file_id=s.file_id, status="denied", request=request,
                            details={"share_id": s.id, "state": st})
        except Exception:
            pass
        raise HTTPException(403, f"This share is {st.replace('_', ' ')}")
    return s


@router.get("/shares/with-me")
def with_me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    now = utcnow()
    rows = db.execute(select(Share, File, User).join(File, File.id == Share.file_id).join(User, User.id == Share.owner_id)
                      .where(Share.recipient_id == user.id, Share.kind == "user").order_by(Share.created_at.desc())).all()
    items = []
    for s, f, o in rows:
        d = share_out(s, now); d["file"] = file_out(f, owner=o); items.append(d)
    return {"items": items}


def _serve(db, request, s: Share, user_id: str | None, action: str, grant: str | None = None):
    _require_passcode(db, request, s, grant, user_id)
    f = s.file
    if action == "download" and s.permission != "download":
        denied(db, request, user_id=user_id, action="share.permission_exceeded", resource_type="share", resource_id=s.id,
               owner_id=s.owner_id, severity="low", description="Download attempted on a view-only share",
               category="sharing_link_misuse", kind="blocked")
        raise HTTPException(403, "This share is view-only")
    if action == "view" and f.ext not in fs.INLINE_SAFE:
        raise HTTPException(415, "Preview is not available for this file type; ask for a download-enabled share")
    data = fs.read_decrypted(db, f, request, user_id)
    s.use_count += 1; s.last_used_at = utcnow(); db.commit()
    fs.record_download(db, f, request, user_id=user_id, share_id=s.id, action=action)
    try:
        from ..activity_monitoring import service as activity
        activity.record(db, "share_access", user_id=user_id, file_id=f.id, request=request,
                        details={"share_id": s.id, "action": action, "permission": s.permission})
    except Exception:
        pass
    return fs.file_response(f, data, inline=(action == "view"))


@router.get("/shares/{share_id}/view")
def direct_view(share_id: str, request: Request, x_share_passcode_token: str | None = Header(None),
                user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _serve(db, request, _direct_share(db, request, user, share_id, False), user.id, "view", x_share_passcode_token)


@router.get("/shares/{share_id}/download")
def direct_download(share_id: str, request: Request, x_share_passcode_token: str | None = Header(None),
                    user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _serve(db, request, _direct_share(db, request, user, share_id, True), user.id, "download", x_share_passcode_token)


class PasscodeIn(BaseModel):
    passcode: str = Field(max_length=64)


@router.post("/shares/{share_id}/verify")
def direct_verify(share_id: str, body: PasscodeIn, request: Request,
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _direct_share(db, request, user, share_id, False)
    if not s.passcode_hash:
        return {"passcode_required": False, "passcode_token": None}
    _check_passcode(db, request, s, body.passcode, user.id)
    tok, exp = create_scope_token(_scope_for(s), s.id, minutes=15)
    audit(db, "share.passcode_verified", request=request, actor_id=user.id, owner_id=s.owner_id,
          resource_type="share", resource_id=s.id)
    return {"passcode_required": True, "passcode_token": tok, "expires_at": iso(exp)}


# ---------- public link access (guest, no account) ----------
pub = APIRouter(prefix="/api/public/shares", tags=["public-share"], dependencies=[Depends(rate_limit("public_share", 60))])


def _link(db: Session, request: Request, token: str) -> Share:
    s = db.scalar(select(Share).where(Share.token_hash == sha256(token), Share.kind == "link"))
    if not s:
        denied(db, request, user_id=None, action="share.invalid_token", resource_type="share", severity="low",
               description="Invalid share-link token presented", category="sharing_link_misuse", kind="blocked")
        raise HTTPException(404, "This link is invalid")
    st = share_status(s, utcnow())
    if st != "active":
        denied(db, request, user_id=None, action=f"share.{st}_use", resource_type="share", resource_id=s.id, owner_id=s.owner_id,
               severity="low", description=f"Use of a {st.replace('_', ' ')} share link", category="sharing_link_misuse", kind="blocked")
        try:
            from ..activity_monitoring import service as activity
            atype = "share_expired_access" if st == "expired" else "share_revoked_access" if st == "revoked" else "unauthorized_access"
            activity.record(db, atype, user_id=None, file_id=s.file_id, status="denied", request=request,
                            details={"share_id": s.id, "state": st, "via": "link"})
        except Exception:
            pass
        raise HTTPException(410 if st in ("expired", "revoked", "file_deleted", "exhausted") else 403, f"This link is {st.replace('_', ' ')}")
    return s


@pub.get("/{token}")
def link_info(token: str, request: Request, db: Session = Depends(get_db)):
    s = _link(db, request, token)
    return {"file_name": s.file.original_name, "size": s.file.size, "ext": s.file.ext, "permission": s.permission,
            "expires_at": iso(s.expires_at), "can_preview": s.file.ext in fs.INLINE_SAFE,
            "passcode_protected": bool(s.passcode_hash)}


@pub.post("/{token}/verify")
def link_verify(token: str, body: PasscodeIn, request: Request, db: Session = Depends(get_db)):
    s = _link(db, request, token)
    if not s.passcode_hash:
        return {"passcode_required": False, "passcode_token": None}
    _check_passcode(db, request, s, body.passcode, None)
    tok, exp = create_scope_token(_scope_for(s), s.id, minutes=15)
    audit(db, "share.passcode_verified", request=request, owner_id=s.owner_id, resource_type="share", resource_id=s.id,
          details={"via": "link"})
    return {"passcode_required": True, "passcode_token": tok, "expires_at": iso(exp)}


@pub.get("/{token}/view")
def link_view(token: str, request: Request, x_share_passcode_token: str | None = Header(None), db: Session = Depends(get_db)):
    return _serve(db, request, _link(db, request, token), None, "view", x_share_passcode_token)


@pub.get("/{token}/download")
def link_download(token: str, request: Request, x_share_passcode_token: str | None = Header(None), db: Session = Depends(get_db)):
    return _serve(db, request, _link(db, request, token), None, "download", x_share_passcode_token)
