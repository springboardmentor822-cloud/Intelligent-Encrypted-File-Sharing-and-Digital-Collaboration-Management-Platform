"""Plain-dict serialisers (FastAPI converts UUID/datetime automatically)."""
from app.models import FileShare, Folder, Notification, ShareLink, StoredFile, User


def user_dict(u: User) -> dict:
    return {
        "id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "is_active": u.is_active,
        "mfa_enabled": u.mfa_enabled, "oauth_provider": u.oauth_provider, "has_password": u.hashed_password is not None,
        "storage_quota_bytes": u.storage_quota_bytes, "created_at": u.created_at, "last_login_at": u.last_login_at,
    }


def file_dict(f: StoredFile, access: str = "owner", **extra) -> dict:
    return {
        "id": f.id, "name": f.name, "content_type": f.content_type, "category": f.category,
        "size_bytes": f.size_bytes, "current_version": f.current_version, "folder_id": f.folder_id,
        "is_favorite": f.is_favorite, "deleted_at": f.deleted_at, "created_at": f.created_at,
        "updated_at": f.updated_at, "owner_id": f.owner_id, "owner_name": f.owner.full_name if f.owner else None,
        "access": access, **extra,
    }


def folder_dict(f: Folder, **extra) -> dict:
    return {"id": f.id, "name": f.name, "parent_id": f.parent_id, "created_at": f.created_at, **extra}


def link_dict(l: ShareLink) -> dict:
    return {
        "id": l.id, "file_id": l.file_id, "file_name": l.file.name if l.file else None, "permission": l.permission,
        "expires_at": l.expires_at, "revoked_at": l.revoked_at, "max_downloads": l.max_downloads,
        "download_count": l.download_count, "access_count": l.access_count, "created_at": l.created_at,
        "status": l.status, "created_by": l.created_by, "created_by_name": l.creator.full_name if l.creator else None,
    }


def user_share_dict(s: FileShare) -> dict:
    return {
        "id": s.id, "file_id": s.file_id, "file_name": s.file.name if s.file else None,
        "shared_with_email": s.recipient.email, "shared_with_name": s.recipient.full_name,
        "shared_by_name": s.sharer.full_name, "permission": s.permission, "share_type": s.share_type,
        "expires_at": s.expires_at, "revoked_at": s.revoked_at, "created_at": s.created_at, "status": s.status,
    }


def notification_dict(n: Notification) -> dict:
    return {"id": n.id, "type": n.type, "title": n.title, "message": n.message, "link": n.link,
            "is_read": n.is_read, "created_at": n.created_at}
