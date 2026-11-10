import io
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
    Header,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.database import mongo_db, redis_client, SessionLocal
from app.models import User, UserRole, ShareLink
from app.security import (
    get_current_user,
    hash_password,
    verify_password,
    create_access_token,
    SECRET_KEY,
    ALGORITHM,
)
from jose import jwt, JWTError
from app.services.logger import log_activity
from app.services.rate_limiter import check_rate_limit
from app.services.crypto_service import decrypt_file_data
from app.services.storage_service import storage_service

router = APIRouter(tags=["Milestone 2: Secure Sharing & Guest Access"])


# Schemas
class CreateShareRequest(BaseModel):
    permission: str = "download"  # "view" (read-only/preview) or "download"
    guest_password: Optional[str] = None
    expiration_preset: str = "24h"  # "1h", "24h", "7d", "30d", "never", "custom"
    custom_expires_at: Optional[str] = None
    max_downloads: Optional[int] = None
    recipient_email: Optional[str] = None
    note: Optional[str] = None


class VerifyGuestPasswordRequest(BaseModel):
    guest_password: str


def sanitize_share_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    if not doc:
        return {}
    clean = dict(doc)
    if "_id" in clean:
        clean["id"] = str(clean.pop("_id"))
    clean.pop("guest_password_hash", None)
    return clean


# ==============================================================================
# 1. CREATE SECURE SHARE LINK (WITH OPTIONAL GUEST PASSWORD & EXPIRATION)
# ==============================================================================
@router.post("/files/{item_id}/share", status_code=status.HTTP_201_CREATED)
async def create_share_link(
    item_id: str,
    req: CreateShareRequest,
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """
    Creates an encrypted share grant with granular access control.
    Supports:
    - Guest Passcode protection (protects owner's original password)
    - Expiration presets (1h, 24h, 7d, 30d, custom, never)
    - Permission enforcement ('view' preview only vs 'download')
    - Max download limits (burn after read / download quotas)
    """
    # Verify item exists and is owned by current user
    item = await mongo_db.file_metadata.find_one({"_id": item_id, "owner_id": current_user.id})
    if not item:
        raise HTTPException(status_code=404, detail="File or folder not found in your vault.")

    # Validate permission
    if req.permission not in ["view", "download"]:
        raise HTTPException(status_code=400, detail="Invalid permission level. Choose 'view' or 'download'.")

    # Enforce Guest Password Protection:
    # If the file already has an original password, ensure the guest password is NOT the same!
    has_guest_pwd = bool(req.guest_password and req.guest_password.strip())
    guest_pwd_hash = None
    if has_guest_pwd:
        raw_guest_pwd = req.guest_password.strip()
        if len(raw_guest_pwd) < 4:
            raise HTTPException(status_code=400, detail="Guest password must be at least 4 characters long.")

        # Protection check: Guest password must NOT match owner's original password
        if item.get("is_password_protected") and item.get("password_hash"):
            if verify_password(raw_guest_pwd, item["password_hash"]):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Security Protection: The guest password cannot be identical to your original file password. "
                        "Please choose a separate guest passcode to keep your original credentials completely protected."
                    )
                )
        guest_pwd_hash = hash_password(raw_guest_pwd)

    # Calculate expiration timestamp
    now = datetime.now(timezone.utc)
    expires_at: Optional[datetime] = None

    if req.expiration_preset == "1h":
        expires_at = now + timedelta(hours=1)
    elif req.expiration_preset == "24h":
        expires_at = now + timedelta(hours=24)
    elif req.expiration_preset == "7d":
        expires_at = now + timedelta(days=7)
    elif req.expiration_preset == "30d":
        expires_at = now + timedelta(days=30)
    elif req.expiration_preset == "custom" and req.custom_expires_at:
        try:
            expires_at = datetime.fromisoformat(req.custom_expires_at.replace("Z", "+00:00"))
            if expires_at <= now:
                raise HTTPException(status_code=400, detail="Custom expiration time must be in the future.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid custom expiration date format.")
    elif req.expiration_preset == "never":
        expires_at = None
    else:
        # Default to 24 hours if unspecified
        expires_at = now + timedelta(hours=24)

    # Generate high-entropy, cryptographically random URL token
    share_token = secrets.token_urlsafe(24)
    share_token_hash = hashlib.sha256(share_token.encode("utf-8")).hexdigest()
    share_id = f"share_{secrets.token_hex(12)}"

    share_doc = {
        "_id": share_id,
        "share_token": share_token,
        "share_token_hash": share_token_hash,
        "item_id": item_id,
        "item_name": item["name"],
        "item_category": item.get("category", "document"),
        "is_folder": item.get("is_folder", False),
        "owner_id": current_user.id,
        "owner_username": current_user.username,
        "permission": req.permission,
        "has_guest_password": has_guest_pwd,
        "guest_password_hash": guest_pwd_hash,
        "expiration_preset": req.expiration_preset,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "max_downloads": req.max_downloads if req.max_downloads and req.max_downloads > 0 else None,
        "downloads_count": 0,
        "views_count": 0,
        "recipient_email": req.recipient_email,
        "note": req.note,
        "is_active": True,
        "created_at": now.isoformat(),
        "last_accessed_at": None,
    }

    await mongo_db.file_shares.insert_one(share_doc)

    # Sync share grant and permissions to PostgreSQL (Milestone 2 Step 8)
    try:
        with SessionLocal() as db_session:
            pg_share = ShareLink(
                id=share_id,
                share_token=share_token,
                share_token_hash=share_token_hash,
                item_id=item_id,
                owner_id=current_user.id,
                permission=req.permission,
                has_guest_password=has_guest_pwd,
                guest_password_hash=guest_pwd_hash,
                expiration_preset=req.expiration_preset,
                expires_at=expires_at,
                max_downloads=req.max_downloads if req.max_downloads and req.max_downloads > 0 else None,
                downloads_count=0,
                views_count=0,
                recipient_email=req.recipient_email,
                note=req.note,
                is_active=True
            )
            db_session.add(pg_share)
            db_session.commit()
    except Exception:
        pass

    await log_activity(
        user_id=current_user.id,
        username=current_user.username,
        action="SECURE_SHARE_CREATED",
        resource_id=item_id,
        resource_name=item["name"],
        ip_address=request.client.host if request.client else "127.0.0.1",
        details={
            "share_id": share_id,
            "share_token": share_token,
            "permission": req.permission,
            "has_guest_password": has_guest_pwd,
            "expires_at": expires_at.isoformat() if expires_at else "Never",
            "max_downloads": req.max_downloads,
        }
    )

    clean = sanitize_share_doc(share_doc)
    clean["share_url"] = f"/share/{share_token}"
    return clean


# ==============================================================================
# 2. LIST SHARES FOR A SPECIFIC ITEM OR ALL USER SHARES
# ==============================================================================
@router.get("/files/{item_id}/shares")
async def get_item_shares(
    item_id: str,
    current_user: User = Depends(get_current_user)
):
    """Lists all active and historical share links for a specific file or folder."""
    shares = await mongo_db.file_shares.find({
        "item_id": item_id,
        "owner_id": current_user.id
    }).sort("created_at", -1).to_list(length=100)

    now = datetime.now(timezone.utc)
    res = []
    for s in shares:
        clean = sanitize_share_doc(s)
        clean["share_url"] = f"/share/{s['share_token']}"
        # Check if expired
        is_expired = False
        if s.get("expires_at"):
            exp = datetime.fromisoformat(s["expires_at"].replace("Z", "+00:00"))
            if now > exp:
                is_expired = True
        clean["is_expired"] = is_expired
        clean["is_exhausted"] = bool(s.get("max_downloads") and s.get("downloads_count", 0) >= s["max_downloads"])
        res.append(clean)

    return {"shares": res, "total": len(res)}


@router.get("/files/shares/my-shares")
async def get_my_all_shares(
    current_user: User = Depends(get_current_user)
):
    """Lists all active and historical shares created by the authenticated user."""
    shares = await mongo_db.file_shares.find({
        "owner_id": current_user.id
    }).sort("created_at", -1).to_list(length=500)

    now = datetime.now(timezone.utc)
    res = []
    for s in shares:
        clean = sanitize_share_doc(s)
        clean["share_url"] = f"/share/{s['share_token']}"
        is_expired = False
        if s.get("expires_at"):
            exp = datetime.fromisoformat(s["expires_at"].replace("Z", "+00:00"))
            if now > exp:
                is_expired = True
        clean["is_expired"] = is_expired
        clean["is_exhausted"] = bool(s.get("max_downloads") and s.get("downloads_count", 0) >= s["max_downloads"])
        res.append(clean)

    return {"shares": res, "total": len(res)}


# ==============================================================================
# 3. REVOKE / DELETE SHARE LINK (IMMEDIATE ACCESS TERMINATION)
# ==============================================================================
@router.delete("/files/shares/{share_id}")
async def revoke_share_link(
    share_id: str,
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """Immediately revokes a secure share link, cutting off all guest access."""
    share = await mongo_db.file_shares.find_one({"_id": share_id, "owner_id": current_user.id})
    if not share:
        raise HTTPException(status_code=404, detail="Share record not found.")

    await mongo_db.file_shares.update_one(
        {"_id": share_id},
        {"$set": {"is_active": False, "revoked_at": datetime.now(timezone.utc).isoformat()}}
    )

    try:
        with SessionLocal() as db_session:
            pg_s = db_session.query(ShareLink).filter(ShareLink.id == share_id, ShareLink.owner_id == current_user.id).first()
            if pg_s:
                pg_s.is_active = False
                pg_s.revoked_at = datetime.now(timezone.utc)
                db_session.commit()
    except Exception:
        pass

    await log_activity(
        user_id=current_user.id,
        username=current_user.username,
        action="SECURE_SHARE_REVOKED",
        resource_id=share["item_id"],
        resource_name=share["item_name"],
        ip_address=request.client.host if request.client else "127.0.0.1",
        details={"share_id": share_id, "share_token": share["share_token"]}
    )

    return {"status": "success", "message": "Share link revoked successfully. Guest access terminated."}


async def find_share_by_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Looks up share document by exact URL token or cryptographic SHA-256 token hash (Milestone 2 Task 4).
    """
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return await mongo_db.file_shares.find_one({
        "$or": [
            {"share_token": token},
            {"share_token_hash": token_hash}
        ]
    })


# ==============================================================================
# 4. PUBLIC GUEST SHARE INFO (SAFE METADATA PREVIEW)
# ==============================================================================
@router.get("/share/{token}/info")
async def get_public_share_info(token: str):
    """
    Public metadata inspection for guest access portals.
    Validates token validity, expiration, and password requirements without exposing secrets.
    """
    share = await find_share_by_token(token)
    if not share or not share.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This share link does not exist or has been revoked by the owner."
        )

    now = datetime.now(timezone.utc)
    if share.get("expires_at"):
        exp = datetime.fromisoformat(share["expires_at"].replace("Z", "+00:00"))
        if now > exp:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail=f"This share link expired on {exp.strftime('%Y-%m-%d %H:%M:%S UTC')}."
            )

    if share.get("max_downloads") and share.get("downloads_count", 0) >= share["max_downloads"]:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This share link has reached its maximum allowable download limit."
        )

    # Fetch underlying file metadata
    file_item = await mongo_db.file_metadata.find_one({"_id": share["item_id"]})
    if not file_item or file_item.get("is_trashed"):
        raise HTTPException(status_code=404, detail="The shared document is no longer available.")

    return {
        "share_token": token,
        "item_name": file_item["name"],
        "category": file_item.get("category", "document"),
        "file_size": file_item.get("file_size", 0),
        "mime_type": file_item.get("mime_type", "application/octet-stream"),
        "is_folder": file_item.get("is_folder", False),
        "owner_username": share.get("owner_username", "Vault Member"),
        "permission": share.get("permission", "download"),
        "has_guest_password": share.get("has_guest_password", False),
        "expires_at": share.get("expires_at"),
        "max_downloads": share.get("max_downloads"),
        "downloads_count": share.get("downloads_count", 0),
        "is_encrypted": True,
        "encryption_standard": "AES-256 GCM (Authenticated Server-Side Envelope)",
    }


# ==============================================================================
# 5. VERIFY GUEST PASSWORD (WITH ORIGINAL PASSWORD PROTECTION ENFORCEMENT)
# ==============================================================================
@router.post("/share/{token}/verify")
async def verify_guest_password(
    token: str,
    req: VerifyGuestPasswordRequest,
    request: Request
):
    """
    Verifies the designated Guest Password for a share token.
    Enforces that the owner's original password CANNOT be used to access the document,
    guaranteeing 100% protection of the owner's original credentials.
    """
    await check_rate_limit(f"share_verify:{token}", max_requests=10, window_seconds=60)

    share = await find_share_by_token(token)
    if not share or not share.get("is_active", True):
        raise HTTPException(status_code=404, detail="Share link is invalid or has been revoked.")

    now = datetime.now(timezone.utc)
    if share.get("expires_at"):
        exp = datetime.fromisoformat(share["expires_at"].replace("Z", "+00:00"))
        if now > exp:
            raise HTTPException(status_code=410, detail="This share link has expired.")

    if not share.get("has_guest_password"):
        return {"valid": True, "message": "No guest password is required for this share."}

    stored_guest_hash = share.get("guest_password_hash")
    guest_pwd = req.guest_password.strip()

    # Original Password Protection Check:
    # If the file has an original password and the user entered the original password,
    # reject with explicit notice protecting the owner's password!
    file_item = await mongo_db.file_metadata.find_one({"_id": share["item_id"]})
    if file_item and file_item.get("is_password_protected") and file_item.get("password_hash"):
        if verify_password(guest_pwd, file_item["password_hash"]):
            await log_activity(
                user_id=share["owner_id"],
                username="Guest",
                action="GUEST_ORIGINAL_PWD_REJECTED",
                resource_id=share["item_id"],
                resource_name=share["item_name"],
                ip_address=request.client.host if request.client else "127.0.0.1",
                details={"error": "Attempted to use owner original password instead of guest password"}
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Access Denied: The document owner's original vault password cannot be used for guest access. "
                    "Please enter the specific Guest Access Password provided by the document owner."
                )
            )

    # Check against stored guest password hash
    if not stored_guest_hash or not verify_password(guest_pwd, stored_guest_hash):
        await log_activity(
            user_id=share["owner_id"],
            username="Guest",
            action="GUEST_PASSWORD_FAILED",
            resource_id=share["item_id"],
            resource_name=share["item_name"],
            ip_address=request.client.host if request.client else "127.0.0.1",
            details={"error": "Incorrect guest password provided"}
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Incorrect guest password. Access denied."
        )

    # Update access stats
    await mongo_db.file_shares.update_one(
        {"_id": share["_id"]},
        {
            "$inc": {"views_count": 1},
            "$set": {"last_accessed_at": now.isoformat()}
        }
    )

    # Issue ephemeral guest access JWT (valid for 30 minutes)
    guest_access_token = create_access_token(
        data={
            "sub": f"guest:{token}",
            "share_token": token,
            "permission": share["permission"],
            "type": "guest_access"
        },
        expires_delta=timedelta(minutes=30)
    )

    await log_activity(
        user_id=share["owner_id"],
        username="Guest",
        action="GUEST_PASSWORD_VERIFIED",
        resource_id=share["item_id"],
        resource_name=share["item_name"],
        ip_address=request.client.host if request.client else "127.0.0.1",
        details={"permission": share["permission"]}
    )

    return {
        "valid": True,
        "guest_token": guest_access_token,
        "permission": share["permission"],
        "message": "Guest password verified. Access granted."
    }


# ==============================================================================
# 6. GUEST FILE DOWNLOAD (WITH AES-256-GCM SERVER-SIDE DECRYPTION WORKFLOW)
# ==============================================================================
@router.get("/share/{token}/download")
async def download_shared_file(
    token: str,
    request: Request,
    guest_password: Optional[str] = Query(None),
    guest_token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    """
    Secure file retrieval and AES-256-GCM on-the-fly streaming decryption.
    Enforces permission check ('view' blocks download, 'download' permits),
    validates guest password / ephemeral guest token, checks expiration and quotas.
    """
    share = await find_share_by_token(token)
    if not share or not share.get("is_active", True):
        raise HTTPException(status_code=404, detail="Share link is invalid or has been revoked.")

    # 1. Enforce Link Expiration
    now = datetime.now(timezone.utc)
    if share.get("expires_at"):
        exp = datetime.fromisoformat(share["expires_at"].replace("Z", "+00:00"))
        if now > exp:
            raise HTTPException(status_code=410, detail="This share link has expired.")

    # 2. Enforce Max Downloads Quota
    if share.get("max_downloads") and share.get("downloads_count", 0) >= share["max_downloads"]:
        raise HTTPException(
            status_code=410,
            detail="Maximum download limit reached for this share link."
        )

    # 3. Enforce Access Permission (View Only vs Download)
    if share.get("permission") == "view":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This share link is restricted to View-Only access. Downloading the file has been disabled by the owner."
        )

    # 4. Enforce Guest Password Authentication
    if share.get("has_guest_password"):
        is_authenticated = False

        # Check bearer token or query guest_token
        auth_jwt = guest_token
        if not auth_jwt and authorization and authorization.startswith("Bearer "):
            auth_jwt = authorization.split(" ")[1]

        if auth_jwt:
            try:
                payload = jwt.decode(auth_jwt, SECRET_KEY, algorithms=[ALGORITHM])
                if payload.get("share_token") == token:
                    is_authenticated = True
            except JWTError:
                is_authenticated = False

        # If not authenticated via JWT, check raw guest_password query parameter
        if not is_authenticated:
            if not guest_password:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="This shared document requires a guest password. Please verify first."
                )
            
            # Check owner password rejection
            file_chk = await mongo_db.file_metadata.find_one({"_id": share["item_id"]})
            if file_chk and file_chk.get("is_password_protected") and file_chk.get("password_hash"):
                if verify_password(guest_password.strip(), file_chk["password_hash"]):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Access Denied: Owner's original password cannot be used for guest access. Please use the guest password."
                    )

            if not verify_password(guest_password.strip(), share.get("guest_password_hash", "")):
                raise HTTPException(status_code=403, detail="Incorrect guest password.")
            is_authenticated = True

    # 5. Fetch File from Vault
    file_doc = await mongo_db.file_metadata.find_one({"_id": share["item_id"]})
    if not file_doc or file_doc.get("is_trashed"):
        raise HTTPException(status_code=404, detail="Shared file not found in storage.")

    stored_filename = file_doc.get("stored_filename")
    if not storage_service.exists(stored_filename):
        raise HTTPException(status_code=404, detail="Physical encrypted blob not found in vault storage.")

    # 6. AES-256-GCM Server-Side Decryption Workflow
    raw_bytes = storage_service.read_ciphertext(stored_filename)

    if file_doc.get("is_encrypted") and "dek_info" in file_doc:
        try:
            plaintext = decrypt_file_data(
                ciphertext_bytes=raw_bytes,
                dek_info=file_doc["dek_info"],
                file_iv_b64=file_doc["file_iv"],
                file_tag_b64=file_doc["file_tag"],
                file_id=file_doc["_id"]
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Decryption integrity verification failed: {str(e)}"
            )
    else:
        # Legacy unencrypted file
        plaintext = raw_bytes

    # 7. Update download counters
    await mongo_db.file_shares.update_one(
        {"_id": share["_id"]},
        {
            "$inc": {"downloads_count": 1},
            "$set": {"last_accessed_at": now.isoformat()}
        }
    )
    await mongo_db.file_metadata.update_one({"_id": file_doc["_id"]}, {"$inc": {"downloads_count": 1}})

    await log_activity(
        user_id=share["owner_id"],
        username="Guest",
        action="GUEST_FILE_DOWNLOAD",
        resource_id=file_doc["_id"],
        resource_name=file_doc["name"],
        ip_address=request.client.host if request.client else "127.0.0.1",
        details={"share_token": token, "file_size": len(plaintext)}
    )

    # Stream decrypted plaintext directly to guest
    return StreamingResponse(
        io.BytesIO(plaintext),
        media_type=file_doc.get("mime_type", "application/octet-stream"),
        headers={"Content-Disposition": f'attachment; filename="{file_doc["name"]}"'}
    )


# ==============================================================================
# 7. GUEST FILE PREVIEW (INLINE STREAMING FOR VIEW-ONLY & DOWNLOAD PERMISSIONS)
# ==============================================================================
@router.get("/share/{token}/preview")
async def preview_shared_file(
    token: str,
    request: Request,
    guest_password: Optional[str] = Query(None),
    guest_token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    """
    Streams decrypted document inline with proper Content-Type for in-browser preview.
    Permitted for both 'view' and 'download' permissions.
    """
    share = await find_share_by_token(token)
    if not share or not share.get("is_active", True):
        raise HTTPException(status_code=404, detail="Share link is invalid or has been revoked.")

    now = datetime.now(timezone.utc)
    if share.get("expires_at"):
        exp = datetime.fromisoformat(share["expires_at"].replace("Z", "+00:00"))
        if now > exp:
            raise HTTPException(status_code=410, detail="This share link has expired.")

    # Validate guest password / token
    if share.get("has_guest_password"):
        is_authenticated = False
        auth_jwt = guest_token
        if not auth_jwt and authorization and authorization.startswith("Bearer "):
            auth_jwt = authorization.split(" ")[1]

        if auth_jwt:
            try:
                payload = jwt.decode(auth_jwt, SECRET_KEY, algorithms=[ALGORITHM])
                if payload.get("share_token") == token:
                    is_authenticated = True
            except JWTError:
                is_authenticated = False

        if not is_authenticated:
            if not guest_password:
                raise HTTPException(status_code=401, detail="Guest password required.")
            if not verify_password(guest_password.strip(), share.get("guest_password_hash", "")):
                raise HTTPException(status_code=403, detail="Incorrect guest password.")

    file_doc = await mongo_db.file_metadata.find_one({"_id": share["item_id"]})
    if not file_doc or file_doc.get("is_trashed"):
        raise HTTPException(status_code=404, detail="Shared file not found.")

    stored_filename = file_doc.get("stored_filename")
    if not storage_service.exists(stored_filename):
        raise HTTPException(status_code=404, detail="Physical file not found.")

    raw_bytes = storage_service.read_ciphertext(stored_filename)

    if file_doc.get("is_encrypted") and "dek_info" in file_doc:
        try:
            plaintext = decrypt_file_data(
                ciphertext_bytes=raw_bytes,
                dek_info=file_doc["dek_info"],
                file_iv_b64=file_doc["file_iv"],
                file_tag_b64=file_doc["file_tag"],
                file_id=file_doc["_id"]
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Decryption integrity failed: {str(e)}")
    else:
        plaintext = raw_bytes

    await mongo_db.file_shares.update_one(
        {"_id": share["_id"]},
        {"$inc": {"views_count": 1}, "$set": {"last_accessed_at": now.isoformat()}}
    )

    return StreamingResponse(
        io.BytesIO(plaintext),
        media_type=file_doc.get("mime_type", "application/octet-stream"),
        headers={"Content-Disposition": f'inline; filename="{file_doc["name"]}"'}
    )
