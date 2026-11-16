import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Request
from fastapi.responses import FileResponse as FastFileResponse, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.mongo import log_activity, log_file_metadata
from app.models.user import User, UserRole
from app.models.file import FileRecord
from app.models.share_link import ShareLink
from app.schemas.file import FileResponse
from app.schemas.share_link import CreateShareLinkRequest, ShareLinkResponse, PublicShareInfoResponse
from app.routers.auth import get_current_active_user
from app.core.config import settings
from app.services.encryption_service import EncryptionService, DecryptionError
from app.services.storage_service import StorageService
from app.services.sharing_service import SharingService
from app.notifications.service import NotificationService


router = APIRouter(prefix="/files", tags=["Files"])

StorageService.initialize()


# ==============================================================================
# 1. FILE UPLOAD WITH AES-256-GCM ENCRYPTION & ENVELOPE KEY MANAGEMENT
# ==============================================================================
@router.post("/upload", response_model=FileResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "127.0.0.1"

    # Administrators manage the platform and are restricted from uploading personal files
    if current_user.role == UserRole.ADMIN:
        await log_activity(
            user_id=current_user.id,
            user_email=current_user.email,
            action="FILE_UPLOAD_FAILED",
            details={"reason": "Admin privilege restriction", "filename": file.filename, "ip": client_ip},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrators manage the platform and are restricted from uploading personal vault files.",
        )

    max_size_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    file_bytes = await file.read()
    file_size = len(file_bytes)

    if file_size > max_size_bytes:
        await log_activity(
            user_id=current_user.id,
            user_email=current_user.email,
            action="FILE_UPLOAD_FAILED",
            details={"reason": f"File exceeds maximum size {settings.MAX_FILE_SIZE_MB}MB", "filename": file.filename, "ip": client_ip},
        )
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {settings.MAX_FILE_SIZE_MB}MB",
        )

    # Milestone 2: Authenticated AES-256-GCM Encryption with Envelope Key Management
    try:
        enc_result = EncryptionService.encrypt_bytes(file_bytes)
    except Exception as e:
        await log_activity(
            user_id=current_user.id,
            user_email=current_user.email,
            action="FILE_UPLOAD_FAILED",
            details={"reason": f"Encryption failed: {str(e)}", "filename": file.filename, "ip": client_ip},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to encrypt file contents before storage.",
        )

    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4().hex}{file_ext}.enc"
    
    # Save ciphertext into private storage vault
    storage_path = StorageService.save_encrypted_object(unique_filename, enc_result["ciphertext"])

    record = FileRecord(
        filename=unique_filename,
        original_filename=file.filename,
        file_path=storage_path,
        file_size=file_size,
        content_type=file.content_type,
        owner_id=current_user.id,
        is_encrypted=True,
        encryption_algorithm=enc_result["algorithm"],
        nonce=enc_result["nonce"],
        encrypted_dek=enc_result["encrypted_dek"],
        dek_nonce=enc_result["dek_nonce"],
        sha256_hash=enc_result["sha256_hash"],
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    await log_file_metadata({
        "sql_file_id": record.id,
        "filename": record.filename,
        "original_filename": record.original_filename,
        "file_size": record.file_size,
        "content_type": record.content_type,
        "owner_id": record.owner_id,
        "owner_email": current_user.email,
        "is_encrypted": True,
        "encryption_algorithm": record.encryption_algorithm,
        "sha256_hash": record.sha256_hash,
    })

    await log_activity(
        user_id=current_user.id,
        user_email=current_user.email,
        action="FILE_UPLOAD",
        details={
            "file_id": record.id,
            "filename": record.original_filename,
            "size": record.file_size,
            "encryption": record.encryption_algorithm,
            "ip": client_ip
        },
    )

    return record


# ==============================================================================
# 2. FILE LISTING AND DETAIL RETRIEVAL
# ==============================================================================
@router.get("/", response_model=List[FileResponse])
def list_files(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if current_user.role == UserRole.ADMIN:
        return db.query(FileRecord).all()
    return db.query(FileRecord).filter(FileRecord.owner_id == current_user.id).all()


@router.get("/{file_id}", response_model=FileResponse)
def get_file_details(
    file_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    record = db.query(FileRecord).filter(FileRecord.id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    if record.owner_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized to access this file")
    return record


# ==============================================================================
# 3. SECURE FILE DECRYPTION & DOWNLOAD (AUTHENTICATED OWNER/ADMIN)
# ==============================================================================
@router.get("/{file_id}/download")
async def download_file(
    file_id: int,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "127.0.0.1"
    record = db.query(FileRecord).filter(FileRecord.id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    
    if record.owner_id != current_user.id and current_user.role != UserRole.ADMIN:
        await log_activity(
            user_id=current_user.id,
            user_email=current_user.email,
            action="UNAUTHORIZED_ACCESS",
            details={"reason": "Unauthorized file download attempt", "file_id": file_id, "ip": client_ip},
        )
        raise HTTPException(status_code=403, detail="Not authorized to download this file")
    
    if not StorageService.exists(record.file_path):
        raise HTTPException(status_code=404, detail="Encrypted file missing from storage vault")

    # If the file is encrypted, decrypt in-memory and verify integrity tag
    if record.is_encrypted and record.encrypted_dek and record.nonce and record.dek_nonce:
        try:
            ciphertext = StorageService.get_encrypted_object(record.file_path)
            decrypted_bytes = EncryptionService.decrypt_bytes(
                ciphertext=ciphertext,
                nonce_b64=record.nonce,
                encrypted_dek_b64=record.encrypted_dek,
                dek_nonce_b64=record.dek_nonce,
                expected_sha256=record.sha256_hash,
            )
        except DecryptionError as e:
            await log_activity(
                user_id=current_user.id,
                user_email=current_user.email,
                action="UNAUTHORIZED_ACCESS",
                details={"reason": f"Decryption integrity violation: {str(e)}", "file_id": file_id, "ip": client_ip},
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Security Decryption Error: File has been tampered with or cryptographic tag check failed.",
            )

        await log_activity(
            user_id=current_user.id,
            user_email=current_user.email,
            action="FILE_DOWNLOAD",
            details={"file_id": record.id, "filename": record.original_filename, "decrypted": True, "ip": client_ip},
        )

        return Response(
            content=decrypted_bytes,
            media_type=record.content_type or "application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{record.original_filename}"',
                "X-Encrypted-Storage": "AES-256-GCM",
                "X-Integrity-Verified": "true",
            },
        )

    # Legacy pre-encryption fallback
    await log_activity(
        user_id=current_user.id,
        user_email=current_user.email,
        action="FILE_DOWNLOAD",
        details={"file_id": record.id, "filename": record.original_filename, "ip": client_ip},
    )

    return FastFileResponse(
        path=record.file_path,
        filename=record.original_filename,
        media_type=record.content_type or "application/octet-stream",
    )


# ==============================================================================
# 4. FILE DELETION
# ==============================================================================
@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: int,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "127.0.0.1"
    record = db.query(FileRecord).filter(FileRecord.id == file_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    
    if record.owner_id != current_user.id and current_user.role != UserRole.ADMIN:
        await log_activity(
            user_id=current_user.id,
            user_email=current_user.email,
            action="UNAUTHORIZED_ACCESS",
            details={"reason": "Unauthorized delete attempt", "file_id": file_id, "ip": client_ip},
        )
        raise HTTPException(status_code=403, detail="Not authorized to delete this file")
    
    StorageService.delete_encrypted_object(record.file_path)

    await log_activity(
        user_id=current_user.id,
        user_email=current_user.email,
        action="FILE_DELETE",
        details={"file_id": record.id, "filename": record.original_filename, "ip": client_ip},
    )

    db.delete(record)
    db.commit()
    return None


# ==============================================================================
# 5. SECURE FILE SHARING (MILESTONE 2: TASKS 4, 5, 6)
# ==============================================================================
@router.post("/{file_id}/share", response_model=ShareLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_share_link(
    file_id: int,
    payload: CreateShareLinkRequest,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "127.0.0.1"
    try:
        share_link, raw_token = SharingService.create_share_link(
            db=db,
            file_id=file_id,
            user=current_user,
            expires_in_hours=payload.expires_in_hours,
            permission=payload.permission,
            max_downloads=payload.max_downloads,
        )
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))

    await log_activity(
        user_id=current_user.id,
        user_email=current_user.email,
        action="SHARE_LINK_CREATED",
        details={
            "file_id": file_id,
            "link_id": share_link.id,
            "permission": share_link.permission,
            "expires_in_hours": payload.expires_in_hours,
            "ip": client_ip,
        },
    )

    # Base URL for frontend sharing
    base_url = "http://localhost:3000"
    share_url = f"{base_url}/share?token={raw_token}"

    # Milestone 3: Dispatch notification if recipient was designated
    if payload.recipient_email:
        try:
            fname = file_record.original_filename if file_record else "file"
            NotificationService.notify_file_shared(
                recipient_email=payload.recipient_email,
                sender_email=current_user.email,
                file_name=fname,
                share_link_url=share_url,
            )
        except Exception as ne:
            print(f"File share notification error: {ne}")


    return ShareLinkResponse(
        id=share_link.id,
        file_id=share_link.file_id,
        original_filename=share_link.file.original_filename if share_link.file else "File",
        permission=share_link.permission,
        created_at=share_link.created_at,
        expires_at=share_link.expires_at,
        is_revoked=share_link.is_revoked,
        download_count=share_link.download_count,
        max_downloads=share_link.max_downloads,
        token=raw_token,
        share_url=share_url,
    )


@router.get("/shares/all", response_model=List[ShareLinkResponse])
def list_user_share_links(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    links = SharingService.list_links_for_user(db, current_user)
    res = []
    for l in links:
        fname = l.file.original_filename if l.file else "Unknown"
        res.append(
            ShareLinkResponse(
                id=l.id,
                file_id=l.file_id,
                original_filename=fname,
                permission=l.permission,
                created_at=l.created_at,
                expires_at=l.expires_at,
                is_revoked=l.is_revoked,
                download_count=l.download_count,
                max_downloads=l.max_downloads,
            )
        )
    return res


@router.post("/shares/{link_id}/revoke", response_model=ShareLinkResponse)
async def revoke_share_link(
    link_id: int,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "127.0.0.1"
    try:
        revoked_link = SharingService.revoke_share_link(db, link_id, current_user)
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))

    await log_activity(
        user_id=current_user.id,
        user_email=current_user.email,
        action="SHARE_LINK_REVOKED",
        details={"link_id": link_id, "file_id": revoked_link.file_id, "ip": client_ip},
    )

    fname = revoked_link.file.original_filename if revoked_link.file else "File"
    return ShareLinkResponse(
        id=revoked_link.id,
        file_id=revoked_link.file_id,
        original_filename=fname,
        permission=revoked_link.permission,
        created_at=revoked_link.created_at,
        expires_at=revoked_link.expires_at,
        is_revoked=revoked_link.is_revoked,
        download_count=revoked_link.download_count,
        max_downloads=revoked_link.max_downloads,
    )


# ==============================================================================
# 6. PUBLIC ACCESS ENDPOINTS (RECIPIENT SECURE ACCESS VIA TOKEN)
# ==============================================================================
@router.get("/public/share/{token}/info", response_model=PublicShareInfoResponse)
def get_public_share_info(
    token: str,
    db: Session = Depends(get_db),
):
    try:
        link, file_record = SharingService.validate_and_get_link(db, token)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(ve))

    return PublicShareInfoResponse(
        original_filename=file_record.original_filename,
        file_size=file_record.file_size,
        content_type=file_record.content_type,
        permission=link.permission,
        expires_at=link.expires_at,
        download_count=link.download_count,
        max_downloads=link.max_downloads,
        is_valid=True,
    )


@router.get("/public/share/{token}/download")
async def download_public_shared_file(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "127.0.0.1"

    try:
        link, file_record = SharingService.validate_and_get_link(db, token)
    except ValueError as ve:
        err_msg = str(ve).lower()
        if "expired" in err_msg:
            suspicious_action = "EXPIRED_LINK_ACCESS"
        elif "revoked" in err_msg:
            suspicious_action = "REVOKED_LINK_ACCESS"
        else:
            suspicious_action = "UNAUTHORIZED_ACCESS"

        await log_activity(
            user_id=0,
            user_email="public_recipient",
            action=suspicious_action,
            details={"reason": f"Share link access rejected: {str(ve)}", "token": token[:8] + "...", "ip": client_ip},
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(ve))


    if not StorageService.exists(file_record.file_path):
        raise HTTPException(status_code=404, detail="File is missing from vault storage.")

    # In-memory decryption and integrity validation
    if file_record.is_encrypted and file_record.encrypted_dek and file_record.nonce and file_record.dek_nonce:
        try:
            ciphertext = StorageService.get_encrypted_object(file_record.file_path)
            decrypted_bytes = EncryptionService.decrypt_bytes(
                ciphertext=ciphertext,
                nonce_b64=file_record.nonce,
                encrypted_dek_b64=file_record.encrypted_dek,
                dek_nonce_b64=file_record.dek_nonce,
                expected_sha256=file_record.sha256_hash,
            )
        except DecryptionError as e:
            await log_activity(
                user_id=0,
                user_email="public_recipient",
                action="UNAUTHORIZED_ACCESS",
                details={"reason": f"Public share decryption error: {str(e)}", "file_id": file_record.id, "ip": client_ip},
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Security Decryption Error: Cryptographic tag check failed.",
            )

        # Record download event and update quotas
        SharingService.record_access(db, link)
        await log_activity(
            user_id=link.created_by_id,
            user_email="shared_recipient",
            action="FILE_DOWNLOAD",
            details={
                "file_id": file_record.id,
                "filename": file_record.original_filename,
                "share_link_id": link.id,
                "permission": link.permission,
                "ip": client_ip,
            },
        )

        # Milestone 3: Notify file owner that their shared file was accessed
        try:
            NotificationService.notify_file_downloaded(
                owner_id=file_record.owner_id,
                file_name=file_record.original_filename,
                downloader_info=f"recipient ({client_ip})",
            )
        except Exception as ne:
            print(f"Download notification warning: {ne}")


        disposition = "inline" if link.permission == "view" else "attachment"
        return Response(
            content=decrypted_bytes,
            media_type=file_record.content_type or "application/octet-stream",
            headers={
                "Content-Disposition": f'{disposition}; filename="{file_record.original_filename}"',
                "X-Encrypted-Storage": "AES-256-GCM",
                "X-Integrity-Verified": "true",
            },
        )

    # Legacy fallback
    SharingService.record_access(db, link)
    return FastFileResponse(
        path=file_record.file_path,
        filename=file_record.original_filename,
        media_type=file_record.content_type or "application/octet-stream",
    )
