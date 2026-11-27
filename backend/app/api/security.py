"""Per-user Security page and activity log (regular users only ever see their own data)."""
import re

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.mongo import get_mongo
from app.models import FileVersion, StoredFile, User
from app.services import key_service, oauth_service, session_service

router = APIRouter(tags=["security"])


@router.get("/security/overview")
def security_overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    provider = key_service.get_key_provider()
    key_rows = db.execute(select(FileVersion.kek_version, func.count()).join(StoredFile, StoredFile.id == FileVersion.file_id)
                          .where(StoredFile.owner_id == user.id).group_by(FileVersion.kek_version)).all()
    encrypted_versions = sum(n for _, n in key_rows)
    https = settings.frontend_url.startswith("https://")
    oauth_enabled = bool(oauth_service.enabled_providers())
    features = [
        {"key": "aes256", "name": "AES-256 Encryption", "status": "active",
         "description": "Every file is encrypted with its own AES-256-GCM key before it reaches storage."},
        {"key": "tls", "name": "HTTPS/TLS Communication", "status": "active" if https else "dev",
         "description": "Data travels between your browser and TrustShare over HTTPS/TLS." if https
         else "This development environment uses HTTP. Production deployments enforce HTTPS/TLS."},
        {"key": "jwt", "name": "JWT Authentication", "status": "active",
         "description": "Short-lived signed tokens protect every API request, backed by server-side sessions."},
        {"key": "oauth2", "name": "OAuth2 Authentication", "status": "active" if oauth_enabled else "off",
         "description": "Sign in with your Google or Microsoft account." if oauth_enabled
         else "No OAuth2 provider is configured by your administrator."},
        {"key": "rbac", "name": "Role-Based Access Control", "status": "active",
         "description": f"Your role is “{user.role}”. Permissions are enforced on the server for every request."},
        {"key": "share_links", "name": "Temporary Share Links", "status": "active",
         "description": "Links expire automatically, can be limited to view-only, and can be revoked at any time."},
        {"key": "download_tracking", "name": "Download Tracking", "status": "active",
         "description": "Every download of your files is recorded with who, when and from where."},
        {"key": "audit", "name": "Audit Logging", "status": "active",
         "description": "Important file and security actions are written to an audit trail."},
        {"key": "tokens", "name": "Secure Token Generation", "status": "active",
         "description": "Share and reset tokens are 256-bit random values; only their hashes are stored."},
        {"key": "rotation", "name": "Key Rotation", "status": "active",
         "description": f"Data keys are wrapped by master key {provider.active_version}. Administrators can rotate it without re-uploading files."},
    ]
    return {
        "features": features,
        "account": {
            "mfa_enabled": user.mfa_enabled, "oauth_provider": user.oauth_provider, "role": user.role,
            "active_sessions": len(session_service.list_sessions(user.id)), "last_login_at": user.last_login_at,
            "encrypted_file_versions": encrypted_versions,
            "key_versions": [{"kek_version": k, "count": n} for k, n in key_rows],
        },
    }


@router.get("/security/my-logins")
def my_logins(user: User = Depends(get_current_user)):
    docs = get_mongo().login_events.find({"$or": [{"user_id": str(user.id)}, {"email": user.email}]}).sort("ts", -1).limit(10)
    return {"items": [{"ts": d["ts"], "status": d["status"], "ip": d.get("ip"), "location": d.get("location"),
                       "user_agent": d.get("user_agent"), "reason": d.get("reason")} for d in docs]}


@router.get("/activity")
def my_activity(page: int = 1, page_size: int = 25, q: str | None = None, user: User = Depends(get_current_user)):
    """Actions you performed plus actions other people performed on your files."""
    page, page_size = max(page, 1), min(max(page_size, 1), 100)
    flt: dict = {"$or": [{"actor_id": str(user.id)}, {"owner_id": str(user.id)}]}
    if q:
        rx = {"$regex": re.escape(q[:60]), "$options": "i"}
        flt = {"$and": [flt, {"$or": [{"action": rx}, {"details.name": rx}, {"actor_name": rx}]}]}
    coll = get_mongo().audit_logs
    total = coll.count_documents(flt)
    docs = coll.find(flt).sort("ts", -1).skip((page - 1) * page_size).limit(page_size)
    items = [{"id": str(d["_id"]), "ts": d["ts"], "action": d["action"], "actor_name": d.get("actor_name") or "Someone with a link",
              "by_me": d.get("actor_id") == str(user.id), "resource_type": d.get("resource_type"),
              "details": d.get("details", {}), "ip": d.get("ip")} for d in docs]
    return {"items": items, "total": total, "page": page, "page_size": page_size}
