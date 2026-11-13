from .db import iso
from .models import File, Share, User


def user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "is_verified": u.is_verified,
            "is_active": u.is_active, "created_at": iso(u.created_at), "last_login_at": iso(u.last_login_at),
            "quota_bytes": u.quota_bytes, "oauth_provider": u.oauth_provider, "prefs": u.prefs or {},
            "has_password": bool(u.password_hash), "secure_folder_enabled": bool(u.secure_folder_hash)}


def file_out(f: File, favorite: bool = False, owner: User | None = None) -> dict:
    d = {"id": f.id, "name": f.original_name, "ext": f.ext, "mime": f.mime, "size": f.size, "category": f.category,
         "folder_id": f.folder_id, "created_at": iso(f.created_at), "deleted_at": iso(f.deleted_at),
         "favorite": favorite, "encrypted": True, "enc_alg": f.enc_alg, "secure": bool(f.is_secure)}
    if owner:
        d["owner"] = {"id": owner.id, "name": owner.full_name or owner.email, "email": owner.email}
    return d


def share_status(s: Share, now) -> str:
    if s.revoked_at: return "revoked"
    if s.file and s.file.deleted_at: return "file_deleted"
    if s.expires_at <= now: return "expired"
    if s.max_downloads is not None and s.use_count >= s.max_downloads: return "exhausted"
    return "active"


def share_out(s: Share, now, recipient: User | None = None) -> dict:
    return {"id": s.id, "file_id": s.file_id, "file_name": s.file.original_name if s.file else None, "kind": s.kind,
            "permission": s.permission, "expires_at": iso(s.expires_at), "created_at": iso(s.created_at),
            "revoked_at": iso(s.revoked_at), "max_downloads": s.max_downloads, "use_count": s.use_count,
            "last_used_at": iso(s.last_used_at), "status": share_status(s, now),
            "passcode_protected": bool(s.passcode_hash),
            "recipient_email": recipient.email if recipient else None}
