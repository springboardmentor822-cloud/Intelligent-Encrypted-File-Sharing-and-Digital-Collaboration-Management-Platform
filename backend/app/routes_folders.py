
from pathlib import Path
import logging
import base64
import hashlib
import hmac
import json
import secrets
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_db, require_roles
from app.activity import create_notification, record_activity
from app.models import Folder, FolderShare, StoredFile, User
from app.database import redis_client
from app.models import FileShare
from app.services import storage_service
from app.gmail_service import GmailDeliveryUncertain, gmail_status, send_gmail_message
from app.schemas import (
    FolderCreateRequest,
    FolderResponse,
    FolderShareRequest,
    FolderShareUpdateRequest,
    FolderUpdateRequest,
    FolderUnlockRequest,
)


router = APIRouter(prefix="/folders", tags=["Folders"])
folder_logger = logging.getLogger("trustshare.folders")
FOLDER_UNLOCK_TTL_SECONDS = 15 * 60


def _folder_unlock_key(token: str) -> str:
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return f"trustshare:folder-unlock:{digest}"


def hash_folder_password(password: str) -> str:
    """Hash a folder password; never store the plain-text password."""
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=2**14,
        r=8,
        p=1,
        dklen=32,
    )

    return (
        "scrypt$"
        + base64.b64encode(salt).decode("ascii")
        + "$"
        + base64.b64encode(derived).decode("ascii")
    )


def verify_folder_password(password: str, stored_hash: str) -> bool:
    """Verify a password against its stored scrypt hash."""
    try:
        algorithm, salt_text, hash_text = stored_hash.split("$")
        if algorithm != "scrypt":
            return False

        salt = base64.b64decode(salt_text, validate=True)
        expected = base64.b64decode(hash_text, validate=True)

        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=2**14,
            r=8,
            p=1,
            dklen=len(expected),
        )

        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def require_folder_password(
    folder: Folder,
    password: str | None,
) -> None:
    if not folder.password_hash:
        return

    if password is None or not verify_folder_password(
        password, folder.password_hash
    ):
        raise HTTPException(
            status_code=403,
            detail="A correct folder password is required.",
        )


def require_folder_unlock(
    folder: Folder,
    user: User,
    password: str | None = None,
    unlock_token: str | None = None,
) -> None:
    if not folder.password_hash:
        return
    if isinstance(password, str) and verify_folder_password(password, folder.password_hash):
        return
    failure_reason = "password_or_unlock_token_missing"
    if isinstance(unlock_token, str) and unlock_token:
        try:
            raw = redis_client.get(_folder_unlock_key(unlock_token))
        except Exception as exc:
            folder_logger.warning("Folder unlock storage unavailable: error_type=%s", type(exc).__name__)
            raise HTTPException(status_code=503, detail="Folder unlock is temporarily unavailable.") from exc
        if raw:
            try:
                session = json.loads(raw)
            except (TypeError, ValueError):
                session = {}
            if session.get("folder_id") == folder.id and session.get("user_id") == user.id:
                return
            failure_reason = "unlock_token_scope_mismatch"
        else:
            failure_reason = "unlock_token_not_found_or_expired"
    folder_logger.warning(
        "Folder unlock denied: folder_id=%s user_id=%s owner_id=%s reason=%s",
        folder.id,
        user.id,
        folder.owner_id,
        failure_reason,
    )
    raise HTTPException(status_code=403, detail="A correct folder password is required.")


def normalized_folder_name(name: str) -> str:
    normalized = name.strip()

    if not normalized or normalized in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid folder name.")

    if "/" in normalized or "\\" in normalized:
        raise HTTPException(
            status_code=400,
            detail="Folder names cannot contain path separators.",
        )

    return normalized


def folder_response(folder: Folder) -> dict:
    return {
        "id": folder.id,
        "name": folder.name,
        "owner_id": folder.owner_id,
        "created_at": folder.created_at,
        "is_password_protected": bool(folder.password_hash),
        "is_shared": False,
        "permission": "owner",
    }


def get_owned_folder(
    folder_id: int,
    user: User,
    db: Session,
) -> Folder:
    folder = (
        db.query(Folder)
        .filter(
            Folder.id == folder_id,
            Folder.owner_id == user.id,
        )
        .first()
    )

    if folder is None:
        record_activity(
            "unauthorized_access",
            user.id,
            username=getattr(user, "full_name", None),
            folder_id=folder_id,
            details="Folder access denied",
            severity="warning",
        )
        raise HTTPException(status_code=404, detail="Folder not found.")

    return folder


def folder_share_is_active(share: FolderShare) -> bool:
    if share.revoked:
        return False
    if share.expires_at is None:
        return True
    expires_at = share.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at > datetime.now(timezone.utc)


def get_active_folder_share(folder_id: int, user: User, db: Session) -> FolderShare | None:
    share = db.query(FolderShare).filter(
        FolderShare.folder_id == folder_id,
        FolderShare.recipient_email == user.email,
    ).first()
    return (
        share
        if share is not None
        and share.permission in {"viewer", "editor"}
        and folder_share_is_active(share)
        else None
    )


@router.post("", response_model=FolderResponse, status_code=201)
def create_folder(
    data: FolderCreateRequest,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    password_hash = (
        hash_folder_password(data.password)
        if data.password
        else None
    )

    folder = Folder(
        name=normalized_folder_name(data.name),
        owner_id=current_user.id,
        password_hash=password_hash,
    )

    db.add(folder)

    try:
        db.commit()
        db.refresh(folder)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A folder with this name already exists.",
        ) from exc

    record_activity("folder_create_success", current_user.id, username=getattr(current_user, "full_name", None), folder_id=folder.id)
    return FolderResponse(**folder_response(folder))


@router.get("", response_model=list[FolderResponse])
def list_folders(
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    folders = (
        db.query(Folder)
        .filter(Folder.owner_id == current_user.id)
        .order_by(Folder.name.asc())
        .all()
    )

    # Serialize owned folders through the same mapper used for shared folders.
    # FolderResponse's is_password_protected default is False, and the ORM model
    # intentionally exposes only password_hash; returning ORM rows directly
    # therefore hid protection from the frontend for owners.
    result = [folder_response(folder) for folder in folders]
    recipient_email = getattr(current_user, "email", None)
    if not recipient_email:
        return result
    shared = db.query(FolderShare).filter(
        FolderShare.recipient_email == recipient_email,
    ).all()
    for permission in shared:
        if not folder_share_is_active(permission):
            continue
        folder = db.query(Folder).filter(
            Folder.id == permission.folder_id,
            Folder.owner_id == permission.owner_id,
        ).first()
        if folder is not None and folder.owner_id != current_user.id:
            result.append({
                **folder_response(folder),
                "is_shared": True,
                "permission": permission.permission,
            })
    return result


@router.post("/{folder_id}/unlock")

def unlock_folder(
    folder_id: int,
    data: FolderUnlockRequest,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found.")

    if folder.owner_id != current_user.id:
        permission = get_active_folder_share(folder.id, current_user, db)

        if permission is None or permission.owner_id != folder.owner_id:
            folder_files = db.query(StoredFile).filter(
                StoredFile.folder_id == folder.id,
                StoredFile.owner_id == folder.owner_id,
            ).all()

            has_direct_file_share = False

            for item in folder_files:
                file_share = db.query(FileShare).filter(
                    FileShare.file_id == item.id,
                    FileShare.owner_id == folder.owner_id,
                    FileShare.recipient_email == current_user.email,
                ).first()

                if (
                    file_share is None
                    or file_share.revoked
                    or file_share.permission != "download"
                ):
                    continue

                expires_at = getattr(file_share, "expires_at", None)

                if expires_at is not None:
                    if expires_at.tzinfo is None:
                        expires_at = expires_at.replace(tzinfo=timezone.utc)

                    if expires_at <= datetime.now(timezone.utc):
                        continue

                has_direct_file_share = True
                break

            if not has_direct_file_share:
                raise HTTPException(
                    status_code=404,
                    detail="Folder not found.",
                )

    require_folder_password(folder, data.password)

    token = secrets.token_urlsafe(32)

    try:
        redis_client.setex(
            _folder_unlock_key(token),
            FOLDER_UNLOCK_TTL_SECONDS,
            json.dumps({
                "folder_id": folder.id,
                "user_id": current_user.id,
            }),
        )
    except Exception as exc:
        folder_logger.warning(
            "Folder unlock storage unavailable: error_type=%s",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=503,
            detail="Folder unlock is temporarily unavailable.",
        ) from exc

    return {
        "unlock_token": token,
        "expires_in": FOLDER_UNLOCK_TTL_SECONDS,
    }


@router.get("/{folder_id}/access")
def list_folder_access(
    folder_id: int,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    folder = get_owned_folder(folder_id, current_user, db)
    shares = db.query(FolderShare).filter(FolderShare.folder_id == folder.id).all()
    now = datetime.now(timezone.utc)
    result = []
    for share in shares:
        expiry = share.expires_at
        if expiry is not None and expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        status = "Revoked" if share.revoked else "Expired" if expiry and expiry <= now else "Active"
        result.append({
            "id": share.id,
            "recipient_email": share.recipient_email,
            "permission": share.permission,
            "status": status,
            "expires_at": share.expires_at,
            "email_status": share.email_status,
            "email_attempt_count": share.email_attempt_count,
            "email_attempted_at": share.email_attempted_at,
            "email_sent_at": share.email_sent_at,
            "email_error_category": share.email_error_category,
        })
    return {"folder_id": folder.id, "access": result}


@router.post("/{folder_id}/access", status_code=201)
def grant_folder_access(
    folder_id: int,
    data: FolderShareRequest,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    folder = get_owned_folder(folder_id, current_user, db)
    require_folder_unlock(folder, current_user, data.folder_password, data.folder_unlock_token)
    recipient_email = str(data.recipient_email).strip().lower()
    recipient = db.query(User).filter(User.email == recipient_email).first()
    if recipient is None:
        raise HTTPException(status_code=404, detail="No TrustShare account uses that email.")
    if recipient.id == current_user.id:
        raise HTTPException(status_code=422, detail="You cannot grant access to yourself.")
    if data.permission not in {"viewer", "editor"}:
        raise HTTPException(status_code=422, detail="Permission must be Viewer or Editor.")
    expires_at = data.expires_at
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            raise HTTPException(status_code=422, detail="Expiry must be a future date and time.")
        expires_at = expires_at.astimezone(timezone.utc).replace(tzinfo=None)
    share = db.query(FolderShare).filter(
        FolderShare.folder_id == folder.id,
        FolderShare.recipient_email == recipient_email,
    ).with_for_update().first()
    previous_state = None if share is None else (
        bool(share.revoked), share.permission, share.expires_at
    )
    changed = previous_state != (False, data.permission, expires_at)
    if share is None:
        share = FolderShare(
            folder_id=folder.id,
            owner_id=current_user.id,
            recipient_email=recipient_email,
            permission=data.permission,
            revoked=False,
            expires_at=expires_at,
        )
        db.add(share)
    else:
        share.permission = data.permission
        share.revoked = False
        share.expires_at = expires_at
    should_send_invitation = changed or getattr(share, "email_status", None) in {None, "pending", "failed"}
    if should_send_invitation:
        share.email_status = "sending"
        share.email_attempt_count = (share.email_attempt_count or 0) + 1
        share.email_attempted_at = datetime.now(timezone.utc)
        share.email_error_category = None
    try:
        db.commit()
        db.refresh(share)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Folder access changed concurrently. Reload and try again.") from exc
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Unable to grant folder access.")
    record_activity("folder_access_granted", current_user.id, username=getattr(current_user, "full_name", None), folder_id=folder.id, target_email=recipient_email)
    if changed:
        create_notification(
            recipient.id,
            "A folder was shared with you" if previous_state is None else "Folder sharing access changed",
            f"{current_user.full_name or current_user.email} granted you {data.permission} access to a folder.",
            "folder_shared" if previous_state is None else "folder_share_changed",
            dedupe_key=f"folder_share:{share.id}:{'created' if previous_state is None else data.permission + ':' + (expires_at.isoformat() if expires_at else 'never')}:{secrets.token_urlsafe(12)}",
        )
    email_sent = share.email_status == "sent"
    email_error = None
    if share.email_status == "uncertain":
        email_error = "Gmail may have accepted this invitation. Check Gmail Sent before retrying."
    elif should_send_invitation:
        try:
            sender_email = gmail_status(db, current_user.id).get("sender_email") or current_user.email
            send_gmail_message(
                db,
                current_user.id,
                recipient_email,
                f"{current_user.full_name} shared a folder with you on TrustShare",
                f'{current_user.full_name} ({sender_email}) shared the folder "{folder.name}" with you as a {share.permission}.\n\n'
                f"Sign in to TrustShare to view it: {os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/')}/dashboard\n\n"
                "The folder password and file contents are not included in this invitation.",
            )
            share.email_status = "sent"
            share.email_sent_at = datetime.now(timezone.utc)
            share.email_error_category = None
            db.commit()
            email_sent = True
        except GmailDeliveryUncertain as exc:
            share.email_status = "uncertain"
            share.email_error_category = "ambiguous_delivery"
            db.commit()
            folder_logger.warning(
                "Folder invitation outcome uncertain: share_id=%s status=%s",
                share.id,
                exc.status_code,
            )
            email_error = "Gmail may have accepted this invitation. Check Gmail Sent before retrying."
        except HTTPException as exc:
            share.email_status = "failed"
            share.email_error_category = "provider_error"
            db.commit()
            email_error = exc.detail
        except Exception as exc:
            db.rollback()
            share.email_status = "uncertain"
            share.email_error_category = "ambiguous_delivery"
            db.commit()
            folder_logger.warning(
                "Folder invitation outcome uncertain: share_id=%s error_type=%s",
                share.id,
                type(exc).__name__,
            )
            email_error = "Gmail may have accepted this invitation. Check Gmail Sent before retrying."
    return {
        "id": share.id,
        "folder_id": folder.id,
        "recipient_email": share.recipient_email,
        "permission": share.permission,
        "status": "Active",
        "expires_at": share.expires_at,
        "email_sent": email_sent,
        "email_error": email_error,
        "email_status": share.email_status,
        "email_attempt_count": share.email_attempt_count,
    }


@router.patch("/{folder_id}/access/{share_id}")
def update_folder_access(
    folder_id: int,
    share_id: int,
    data: FolderShareUpdateRequest,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    folder = get_owned_folder(folder_id, current_user, db)
    share = db.query(FolderShare).filter(
        FolderShare.id == share_id,
        FolderShare.folder_id == folder.id,
        FolderShare.owner_id == current_user.id,
    ).first()
    if share is None or share.revoked:
        raise HTTPException(status_code=404, detail="Folder access entry not found.")
    previous_state = (share.permission, share.expires_at)
    if data.permission not in {"viewer", "editor"}:
        raise HTTPException(status_code=422, detail="Permission must be Viewer or Editor.")
    expires_at = data.expires_at
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            raise HTTPException(status_code=422, detail="Expiry must be a future date and time.")
        expires_at = expires_at.astimezone(timezone.utc).replace(tzinfo=None)
    share.permission = data.permission
    share.expires_at = expires_at
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Unable to update folder access.")
    record_activity("folder_access_changed", current_user.id, username=getattr(current_user, "full_name", None), folder_id=folder.id, target_email=share.recipient_email)
    if previous_state != (share.permission, share.expires_at):
        recipient = db.query(User).filter(User.email == share.recipient_email).first()
        if recipient is not None:
            create_notification(
                recipient.id, "Folder sharing access changed",
                f"The owner changed your folder access to {share.permission}.",
                "folder_share_changed",
                dedupe_key=f"folder_share:{share.id}:changed:{share.permission}:{share.expires_at.isoformat() if share.expires_at else 'never'}",
            )
    return {"id": share.id, "permission": share.permission, "expires_at": share.expires_at}


@router.delete("/{folder_id}/access/{share_id}", status_code=204)
def revoke_folder_access(
    folder_id: int,
    share_id: int,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    folder = get_owned_folder(folder_id, current_user, db)
    share = db.query(FolderShare).filter(
        FolderShare.id == share_id,
        FolderShare.folder_id == folder.id,
        FolderShare.owner_id == current_user.id,
    ).first()
    if share is None:
        raise HTTPException(status_code=404, detail="Folder access entry not found.")
    share.revoked = True
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Unable to revoke folder access.")
    record_activity("folder_access_revoked", current_user.id, username=getattr(current_user, "full_name", None), folder_id=folder.id, target_email=share.recipient_email)
    recipient = db.query(User).filter(User.email == share.recipient_email).first()
    if recipient is not None:
        create_notification(
            recipient.id, "Folder access revoked", "The owner revoked your access to a shared folder.",
            "folder_share_revoked", dedupe_key=f"folder_share:{share.id}:revoked",
        )


@router.patch("/{folder_id}", response_model=FolderResponse)
def rename_folder(
    folder_id: int,
    data: FolderUpdateRequest,
    password: str | None = None,
    unlock_token: str | None = Header(default=None, alias="X-Folder-Unlock-Token"),
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    folder = get_owned_folder(folder_id, current_user, db)
    require_folder_unlock(folder, current_user, password, unlock_token)

    folder.name = normalized_folder_name(data.name)

    try:
        db.commit()
        db.refresh(folder)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A folder with this name already exists.",
        ) from exc

    record_activity("folder_rename_success", current_user.id, username=getattr(current_user, "full_name", None), folder_id=folder.id, target_name=folder.name)
    return FolderResponse(**folder_response(folder))


@router.delete("/{folder_id}", status_code=204)
def delete_folder(
    folder_id: int,
    action: str = "keep_files",
    password: str | None = None,
    unlock_token: str | None = Header(
        default=None,
        alias="X-Folder-Unlock-Token",
    ),
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    if action not in {"keep_files", "delete_files"}:
        raise HTTPException(
            status_code=400,
            detail="Invalid deletion choice.",
        )

    folder = get_owned_folder(folder_id, current_user, db)
    require_folder_unlock(folder, current_user, password, unlock_token)

    files = (
        db.query(StoredFile)
        .filter(
            StoredFile.folder_id == folder.id,
            StoredFile.owner_id == current_user.id,
        )
        .all()
    )

    if action == "keep_files":
        for stored_file in files:
            stored_file.folder_id = None

        db.delete(folder)

        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail="Unable to delete the folder.",
            ) from exc

        record_activity(
            "folder_delete_success",
            current_user.id,
            username=getattr(current_user, "full_name", None),
            folder_id=folder.id,
            target_name=folder.name,
        )
        return None

    # Collect object backups before deleting anything.
    object_backups = []
    upload_dir = (
        Path(__file__).resolve().parents[1] / "uploads"
    ).resolve()

    try:
        for stored_file in files:
            backend = (
                getattr(stored_file, "storage_backend", "local")
                or "local"
            )

            local_path = None
            if backend == "local":
                local_path = (
                    upload_dir / stored_file.stored_name
                ).resolve()

                if local_path.parent != upload_dir:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid stored file path.",
                    )

            object_data = storage_service.get_object(
                stored_file.stored_name,
                backend,
                local_path,
            )

            object_backups.append(
                {
                    "key": stored_file.stored_name,
                    "backend": backend,
                    "local_path": local_path,
                    "data": object_data,
                }
            )

        # Delete objects only after all backups have been collected.
        for backup in object_backups:
            storage_service.delete_object(
                backup["key"],
                backup["backend"],
                backup["local_path"],
            )

        for stored_file in files:
            db.delete(stored_file)

        db.delete(folder)
        db.commit()

    except Exception as exc:
        db.rollback()

        # Restore any objects that were deleted before failure.
        for backup in object_backups:
            try:
                if not storage_service.object_exists(
                    backup["key"],
                    backup["backend"],
                    backup["local_path"],
                ):
                    storage_service.put_object(
                        backup["key"],
                        backup["data"],
                        backup["backend"],
                        backup["local_path"],
                    )
            except Exception:
                file_logger.exception(
                    "Failed to restore stored object %s "
                    "after folder deletion rollback.",
                    backup["key"],
                )

        if isinstance(exc, HTTPException):
            raise

        file_logger.exception(
            "Unable to delete folder and its file records; folder_id=%s",
            folder_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Unable to delete the folder and its file records.",
        ) from exc

    record_activity(
        "folder_delete_success",
        current_user.id,
        username=getattr(current_user, "full_name", None),
        folder_id=folder.id,
        target_name=folder.name,
    )
    return None
