import csv
from io import StringIO
from fastapi.responses import StreamingResponse
from app.services.notification_service import NotificationService
from app.services.audit_service import AuditService
from fastapi import HTTPException, Depends
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from app.services.audit_service import AuditService

from sqlalchemy import exc, text
from app.models import User, File, LoginAttempt, FileShare
from app.schemas import UserCreate, UserLogin, ShareRequest, PasswordChange
import os
import uuid
from pathlib import Path
from app.services.encryption_service import EncryptionService
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    UploadFile,
    File as FastAPIFile,
)
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pwdlib import PasswordHash

from app.database import SessionLocal
from app.models import User, File, LoginAttempt
from app.schemas import UserCreate, UserLogin
from app.security import (
    create_access_token,
    verify_access_token,
    bearer_scheme,
)
from app.services.storage_service import StorageService
from app.services.redis_service import RedisService
from app.config import RUSTFS_BUCKET_NAME
from app.services.mongodb_service import MongoDBService
import time
import json
router = APIRouter()

password_hash = PasswordHash.recommended()

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".txt",
    ".png",
    ".jpg",
    ".jpeg",
    ".docx",
    ".csv",
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/health")
def health_check():
    return {
        "project": "TrustShare",
        "status": "healthy",
        "message": "TrustShare backend is working"
    }

@router.post("/register", status_code=201)
def register_user(
    user_data: UserCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    existing_user = (
        db.query(User)
        .filter(User.email == user_data.email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="Email is already registered"
        )

    hashed_password = password_hash.hash(user_data.password)

    new_user = User(
        email=str(user_data.email),
        hashed_password=hashed_password
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    AuditService.log_event(
    category="AUTH",
    action="USER_REGISTERED",
    actor_id=new_user.id,
    actor_email=new_user.email,
    resource_type="USER",
    resource_id=new_user.id,
    status="SUCCESS",
    ip_address=request.client.host if request.client else None,
)

    return {
        "message": "User registered successfully",
        "user": {
            "id": new_user.id,
            "email": new_user.email
        }
    }

@router.post("/login")
def login_user(
    user_data: UserLogin,
    request: Request,
    db: Session = Depends(get_db)
):
    attempted_email = str(user_data.email)

    user = (
        db.query(User)
        .filter(User.email == attempted_email)
        .first()
    )

    if not user or not password_hash.verify(
        user_data.password,
        user.hashed_password if user else ""
    ):
        attempt = LoginAttempt(
            attempted_email=attempted_email,
            ip_address=request.client.host if request.client else None,
            status="Failed",
        )
        db.add(attempt)
        db.commit()
        AuditService.log_event(
    category="AUTH",
    action="USER_LOGIN_FAILED",
    actor_email=attempted_email,
    resource_type="AUTHENTICATION",
    status="FAILED",
    ip_address=request.client.host if request.client else None,
)

        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    access_token = create_access_token(str(user.id))
    AuditService.log_event(
    category="AUTH",
    action="USER_LOGIN_SUCCESS",
    actor_id=user.id,
    actor_email=user.email,
    resource_type="AUTHENTICATION",
    resource_id=user.id,
    status="SUCCESS",
    ip_address=request.client.host if request.client else None,
)

    return {
    "message": "Login successful",
    "access_token": access_token,
    "token_type": "bearer",
    "role": user.role
     }


@router.get("/protected")
def protected_route(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    user_id = verify_access_token(credentials.credentials)

    return {
        "message": "You have accessed a protected route successfully!",
        "user_id": user_id,
    }

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    user_id = verify_access_token(credentials.credentials)

    user = db.query(User).filter(User.id == int(user_id)).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="User not found",
        )

    return user


def require_admin(
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "Admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required",
        )

    return current_user

@router.get("/admin")
def admin_dashboard(
    current_user: User = Depends(require_admin),
):
    return {
        "message": "Welcome to the Admin dashboard!",
        "user_id": current_user.id,
        "role": current_user.role,
    }

@router.get("/admin/users")
def get_admin_users(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        users = (
            db.query(User)
            .order_by(User.id.desc())
            .all()
        )

        return {
            "total_users": len(users),
            "users": [
                {
                    "id": user.id,
                    "email": user.email,
                    "role": user.role,
                }
                for user in users
            ],
        }

    except Exception as exc:
        print(f"Admin users error: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch users",
        )
@router.get("/admin/files")
def get_admin_files(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        files = (
            db.query(File, User.email)
            .join(User, File.owner_id == User.id)
            .order_by(File.id.desc())
            .all()
        )

        return {
            "total_files": len(files),
            "files": [
                {
                    "id": file.id,
                    "filename": file.filename,
                    "content_type": file.content_type,
                    "size": file.size,
                    "owner_id": file.owner_id,
                    "owner_email": email,
                }
                for file, email in files
            ],
        }

    except Exception as exc:
        print(f"Admin files error: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch files",
        )
@router.get("/admin/shares")
def get_admin_shares(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        shares = (
            db.query(FileShare, File, User)
            .join(File, FileShare.file_id == File.id)
            .join(User, FileShare.shared_by_id == User.id)
            .order_by(FileShare.id.desc())
            .all()
        )

        now = datetime.now(timezone.utc)

        result = []
        active_count = 0
        expired_count = 0
        revoked_count = 0

        for share, shared_file, owner in shares:
            expiry = share.expires_at

            if expiry and expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)

            is_expired = bool(expiry and expiry <= now)

            if share.is_revoked:
                status = "Revoked"
                revoked_count += 1
            elif is_expired:
                status = "Expired"
                expired_count += 1
            else:
                status = "Active"
                active_count += 1

            recipient_email = None

            if share.shared_with_user_id:
                recipient_email = (
                    db.query(User.email)
                    .filter(User.id == share.shared_with_user_id)
                    .scalar()
                )

            result.append({
                "share_id": share.id,
                "file_id": shared_file.id,
                "filename": shared_file.filename,
                "shared_by": owner.email,
                "shared_with": recipient_email or "Anyone with link",
                "permission": share.permission,
                "expires_at": expiry.isoformat() if expiry else None,
                "status": status,
            })

        return {
            "total_shares": len(result),
            "active_shares": active_count,
            "expired_shares": expired_count,
            "revoked_shares": revoked_count,
            "shares": result,
        }

    except Exception as exc:
        print(f"Admin shares error: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch sharing reports",
        )

@router.get("/admin/system-monitoring")
def get_system_monitoring(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    services = {}

    def check_service(name, check_function):
        start_time = time.perf_counter()

        try:
            check_function()
            response_time = round(
                (time.perf_counter() - start_time) * 1000, 2
            )

            services[name] = {
                "status": "Healthy",
                "response_time_ms": response_time,
            }

        except Exception as exc:
            response_time = round(
                (time.perf_counter() - start_time) * 1000, 2
            )

            print(f"{name} health check failed: {exc}")

            services[name] = {
                "status": "Unhealthy",
                "response_time_ms": response_time,
            }

    # PostgreSQL
    check_service(
        "PostgreSQL",
        lambda: db.execute(text("SELECT 1"))
    )

    # MongoDB
    check_service(
        "MongoDB",
        lambda: MongoDBService.get_database().command("ping")
    )

    # Redis
    check_service(
        "Redis",
        lambda: RedisService.get_client().ping()
    )

    # RustFS
    check_service(
        "RustFS",
        lambda: StorageService.get_client().head_bucket(
            Bucket=RUSTFS_BUCKET_NAME
        )
    )

    healthy_count = sum(
        1 for service in services.values()
        if service["status"] == "Healthy"
    )

    overall_status = (
        "Healthy"
        if healthy_count == len(services)
        else "Degraded"
        if healthy_count > 0
        else "Unhealthy"
    )

    return {
        "overall_status": overall_status,
        "healthy_services": healthy_count,
        "total_services": len(services),
        "services": services,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
@router.get("/admin/settings")
def get_admin_settings(
    current_user: User = Depends(require_admin),
):
    return {
        "email": current_user.email,
        "role": current_user.role,
    }


@router.post("/admin/settings/change-password")
def change_admin_password(
    password_data: PasswordChange,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not password_hash.verify(
        password_data.current_password,
        current_user.hashed_password
    ):
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect"
        )

    if password_data.current_password == password_data.new_password:
        raise HTTPException(
            status_code=400,
            detail="New password must be different"
        )

    current_user.hashed_password = password_hash.hash(
        password_data.new_password
    )

    db.commit()

    AuditService.log_event(
        category="AUTH",
        action="ADMIN_PASSWORD_CHANGED",
        actor_id=current_user.id,
        actor_email=current_user.email,
        resource_type="USER",
        resource_id=current_user.id,
        status="SUCCESS",
    )

    return {"message": "Password changed successfully"}

@router.get("/admin/security/failed-logins")
def get_failed_login_attempts(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    attempts = (
        db.query(LoginAttempt)
        .filter(LoginAttempt.status == "Failed")
        .order_by(LoginAttempt.attempted_at.desc())
        .limit(100)
        .all()
    )

    return {
        "total_failed_attempts": len(attempts),
        "attempts": [
            {
                "email": attempt.attempted_email,
                "ip_address": attempt.ip_address,
                "status": attempt.status,
                "attempted_at": attempt.attempted_at,
            }
            for attempt in attempts
        ],
    }


USER_STORAGE_LIMIT = 1_073_741_824   # 1 GB
ADMIN_STORAGE_LIMIT = 2_147_483_648  # 2 GB


def get_storage_limit(user):
    if user.role and user.role.strip().lower() == "admin":
        return ADMIN_STORAGE_LIMIT

    return USER_STORAGE_LIMIT



@router.post("/upload", status_code=201)
def upload_file(
    request: Request,
    uploaded_file: UploadFile = FastAPIFile(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    original_name = Path(uploaded_file.filename or "").name
    extension = Path(original_name).suffix.lower()

    if not original_name or extension not in ALLOWED_EXTENSIONS:
        uploaded_file.file.close()
        raise HTTPException(
            status_code=400,
            detail="File type is not allowed",
        )

    object_key = None

    try:
        content = uploaded_file.file.read(MAX_FILE_SIZE + 1)

        if not content:
            raise HTTPException(
                status_code=400,
                detail="Empty files are not allowed",
            )

        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="File size must not exceed 10 MB",
            )

        used_storage = (
            db.query(func.coalesce(func.sum(File.size), 0))
            .filter(File.owner_id == current_user.id)
            .scalar()
        )
        storage_limit = get_storage_limit(current_user)

        if used_storage + len(content) > storage_limit:
            raise HTTPException(
                status_code=413,
                detail="Your storage capacity has been exceeded.",
            )

        encrypted = EncryptionService.encrypt_and_wrap(content)

        stored_name = f"{uuid.uuid4().hex}{extension}"
        object_key = f"users/{current_user.id}/{stored_name}"

        StorageService.ensure_bucket()

        StorageService.upload_file(
            object_key,
            encrypted["encrypted_data"],
        )

        new_file = File(
            filename=original_name,
            storage_path=f"rustfs://{object_key}",
            content_type=(
                uploaded_file.content_type
                or "application/octet-stream"
            ),
            size=len(content),
            owner_id=current_user.id,
            encryption_nonce=encrypted["nonce"],
            wrapped_key=encrypted["wrapped_key"],
            key_nonce=encrypted["key_nonce"],
            key_version=int(
                os.getenv("TRUSTSHARE_MASTER_KEY_VERSION", "1")
            ),
        )

        db.add(new_file)
        db.commit()
        db.refresh(new_file)

        # Audit log: successful file upload
        AuditService.log_event(
            category="FILE",
            action="FILE_UPLOADED",
            actor_id=current_user.id,
            actor_email=current_user.email,
            resource_type="FILE",
            resource_id=new_file.id,
            status="SUCCESS",
            ip_address=request.client.host if request.client else None,
            details={
                "filename": new_file.filename,
                "size": new_file.size,
                "content_type": new_file.content_type,
            },
        )

        # Invalidate user's files cache
        try:
            redis_client = RedisService.get_client()
            redis_client.delete(
                f"trustshare:user:{current_user.id}:files"
            )
            print("Redis cache invalidated after upload")
        except Exception as exc:
            print(f"Redis cache invalidation failed: {exc}")

        return {
            "message": "File encrypted and uploaded successfully",
            "file": {
                "id": new_file.id,
                "filename": new_file.filename,
                "size": new_file.size,
                "content_type": new_file.content_type,
                "owner_id": new_file.owner_id,
                "encrypted": True,
            },
        }

    except HTTPException:
        raise

    except Exception:
        db.rollback()

        if object_key:
            try:
                StorageService.delete_file(object_key)
            except Exception:
                pass

        raise HTTPException(
            status_code=500,
            detail="Encrypted file upload failed",
        )

    finally:
        uploaded_file.file.close()

@router.get("/files")
def list_my_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cache_key = f"trustshare:user:{current_user.id}:files"

    # 1. Check Redis cache
    try:
        redis_client = RedisService.get_client()
        cached_data = redis_client.get(cache_key)

        if cached_data:
            print("Redis Cache HIT")
            return json.loads(cached_data)

    except Exception as exc:
        print(f"Redis cache read failed: {exc}")

    # 2. Fetch files from PostgreSQL
    files = (
        db.query(File)
        .filter(File.owner_id == current_user.id)
        .order_by(File.id.desc())
        .all()
    )

    # 3. Calculate storage usage
    used_storage = sum(file.size for file in files)
    storage_limit = get_storage_limit(current_user)
    remaining_storage = max(0, storage_limit - used_storage)

    usage_percentage = round(
        (used_storage / storage_limit) * 100, 2
    )

    # 4. Prepare response
    response_data = {
        "files": [
            {
                "id": file.id,
                "filename": file.filename,
                "size": file.size,
                "content_type": file.content_type,
                "owner_id": file.owner_id,
            }
            for file in files
        ],
        "storage": {
            "limit_bytes": storage_limit,
            "used_bytes": used_storage,
            "remaining_bytes": remaining_storage,
            "usage_percentage": usage_percentage,
            "total_files": len(files),
        },
    }

    # 5. Store response in Redis for 60 seconds
    try:
        redis_client.setex(
            cache_key,
            60,
            json.dumps(response_data)
        )
        print("Redis Cache MISS - Data stored")

    except Exception as exc:
        print(f"Redis cache write failed: {exc}")

    return response_data

from collections import Counter
from datetime import date, timedelta
from sqlalchemy import func
from fastapi.responses import Response

@router.post("/share/{file_id}", status_code=201)
def create_file_share(
    request: Request,
    file_id: int,
    share_data: ShareRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. Only file owner can create a share
    stored_file = (
        db.query(File)
        .filter(
            File.id == file_id,
            File.owner_id == current_user.id,
        )
        .first()
    )

    if not stored_file:
        raise HTTPException(
            status_code=404,
            detail="File not found",
        )

    # 2. Verify recipient
    recipient = None

    if share_data.shared_with_email:
        recipient = (
            db.query(User)
            .filter(User.email == str(share_data.shared_with_email))
            .first()
        )

        if not recipient:
            raise HTTPException(
                status_code=404,
                detail="Recipient user is not registered",
            )

        if recipient.id == current_user.id:
            raise HTTPException(
                status_code=400,
                detail="You cannot share a file with yourself",
            )

    # 3. Generate secure sharing token
    raw_token = secrets.token_urlsafe(32)

    token_hash = hashlib.sha256(
        raw_token.encode("utf-8")
    ).hexdigest()

    expires_at = datetime.now(timezone.utc) + timedelta(
        hours=share_data.expires_in_hours
    )

    new_share = FileShare(
        file_id=stored_file.id,
        shared_by_id=current_user.id,
        shared_with_user_id=recipient.id if recipient else None,
        permission=share_data.permission,
        token_hash=token_hash,
        expires_at=expires_at,
        is_revoked=False,
    )

    try:
        db.add(new_share)
        db.commit()
        db.refresh(new_share)

        # 4. Notify registered recipient
        if recipient:
            NotificationService.create_notification(
                user_id=recipient.id,
                title="New File Shared With You",
                message=(
                    f"{current_user.email} shared "
                    f"'{stored_file.filename}' with you."
                ),
                notification_type="FILE_SHARED",
                metadata={
                    "file_id": stored_file.id,
                    "filename": stored_file.filename,
                    "sender_id": current_user.id,
                    "sender_email": current_user.email,
                    "share_id": new_share.id,
                    "permission": new_share.permission,
                    "expires_at": expires_at.isoformat(),
                },
            )

        # 5. Record share creation audit event
        AuditService.log_event(
            category="SHARE",
            action="FILE_SHARED",
            actor_id=current_user.id,
            actor_email=current_user.email,
            resource_type="FILE_SHARE",
            resource_id=new_share.id,
            status="SUCCESS",
            ip_address=request.client.host if request.client else None,
            details={
                "file_id": stored_file.id,
                "filename": stored_file.filename,
                "permission": new_share.permission,
                "recipient_email": recipient.email if recipient else None,
                "expires_at": expires_at.isoformat(),
            },
        )

        return {
            "message": "File shared successfully",
            "share": {
                "share_id": new_share.id,
                "file_id": stored_file.id,
                "filename": stored_file.filename,
                "shared_with": recipient.email if recipient else None,
                "permission": new_share.permission,
                "expires_at": expires_at.isoformat(),
                "sharing_token": raw_token,
            },
        }

    except Exception as exc:
        db.rollback()
        print(f"File sharing failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Unable to create file share",
        )

@router.post("/share/revoke/{share_id}")
def revoke_file_share(
    request: Request,
    share_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. Only the owner who created the share can revoke it
    share = (
        db.query(FileShare)
        .filter(
            FileShare.id == share_id,
            FileShare.shared_by_id == current_user.id,
        )
        .first()
    )

    if not share:
        raise HTTPException(
            status_code=404,
            detail="Share not found",
        )

    if share.is_revoked:
        return {
            "message": "Sharing has already been revoked",
            "share_id": share.id,
        }

    # Save details before updating
    share_id_value = share.id
    file_id_value = share.file_id
    permission_value = share.permission
    recipient_id = share.shared_with_user_id

    try:
        # 2. Revoke sharing
        share.is_revoked = True
        db.commit()

        # 3. Record audit event
        AuditService.log_event(
            category="SHARE",
            action="SHARE_REVOKED",
            actor_id=current_user.id,
            actor_email=current_user.email,
            resource_type="FILE_SHARE",
            resource_id=share_id_value,
            status="SUCCESS",
            ip_address=request.client.host if request.client else None,
            details={
                "file_id": file_id_value,
                "permission": permission_value,
                "recipient_id": recipient_id,
            },
        )

        return {
            "message": "File sharing revoked successfully",
            "share_id": share_id_value,
            "file_id": file_id_value,
            "is_revoked": True,
        }

    except Exception as exc:
        db.rollback()
        print(f"Share revocation failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Unable to revoke file sharing",
        )

@router.get("/shared-with-me")
def get_shared_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    shares = (
        db.query(FileShare, File, User)
        .join(File, FileShare.file_id == File.id)
        .join(User, FileShare.shared_by_id == User.id)
        .filter(
            FileShare.shared_with_user_id == current_user.id,
            FileShare.is_revoked.is_(False),
        )
        .all()
    )

    now = datetime.now(timezone.utc)

    result = []

    for share, shared_file, owner in shares:
        if share.expires_at is None:
            continue

        expiry = share.expires_at
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)

        if expiry <= now:
            continue

        result.append({
            "share_id": share.id,
            "file_id": shared_file.id,
            "filename": shared_file.filename,
            "shared_by": owner.email,
            "permission": share.permission,
            "expires_at": expiry.isoformat(),
        })

    return {
        "total_shared_files": len(result),
        "files": result,
    }

@router.get("/shared-by-me")
def get_files_shared_by_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    shares = (
        db.query(FileShare, File, User)
        .join(File, FileShare.file_id == File.id)
        .outerjoin(User, FileShare.shared_with_user_id == User.id)
        .filter(
            FileShare.shared_by_id == current_user.id
        )
        .order_by(FileShare.id.desc())
        .all()
    )

    now = datetime.now(timezone.utc)
    result = []

    for share, shared_file, recipient in shares:
        expiry = share.expires_at

        if expiry and expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)

        result.append({
            "share_id": share.id,
            "file_id": shared_file.id,
            "filename": shared_file.filename,
            "shared_with": recipient.email if recipient else "Anyone with link",
            "permission": share.permission,
            "expires_at": expiry.isoformat() if expiry else None,
            "is_revoked": share.is_revoked,
            "is_expired": bool(expiry and expiry <= now),
        })

    return {
        "total_shares": len(result),
        "shares": result,
    }

@router.put("/update/{file_id}")
def update_file(
    request: Request,
    file_id: int,
    uploaded_file: UploadFile = FastAPIFile(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    original_name = Path(uploaded_file.filename or "").name
    extension = Path(original_name).suffix.lower()

    if not original_name or extension not in ALLOWED_EXTENSIONS:
        uploaded_file.file.close()
        raise HTTPException(
            status_code=400,
            detail="File type is not allowed",
        )

    new_object_key = None
    old_storage_path = None

    try:
        # 1. Find existing file
        stored_file = (
            db.query(File)
            .filter(File.id == file_id)
            .first()
        )

        if not stored_file:
            raise HTTPException(
                status_code=404,
                detail="File not found",
            )

        # 2. Check owner or Editor permission
        is_owner = stored_file.owner_id == current_user.id

        if not is_owner:
            shares = (
                db.query(FileShare)
                .filter(
                    FileShare.file_id == file_id,
                    FileShare.shared_with_user_id == current_user.id,
                    FileShare.permission == "Editor",
                    FileShare.is_revoked.is_(False),
                )
                .all()
            )

            now = datetime.now(timezone.utc)
            valid_editor = False

            for share in shares:
                if share.expires_at is None:
                    continue

                expiry = share.expires_at

                if expiry.tzinfo is None:
                    expiry = expiry.replace(tzinfo=timezone.utc)

                if expiry > now:
                    valid_editor = True
                    break

            if not valid_editor:
                raise HTTPException(
                    status_code=403,
                    detail="Only owner or active Editor can update this file",
                )

        # 3. Read updated file
        content = uploaded_file.file.read(MAX_FILE_SIZE + 1)

        if not content:
            raise HTTPException(
                status_code=400,
                detail="Empty files are not allowed",
            )

        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="File size must not exceed 10 MB",
            )

        # 4. Check owner's storage quota
        used_storage = (
            db.query(func.coalesce(func.sum(File.size), 0))
            .filter(
                File.owner_id == stored_file.owner_id,
                File.id != stored_file.id,
            )
            .scalar()
        )

        owner = db.query(User).filter(
            User.id == stored_file.owner_id
        ).first()

        if not owner:
            raise HTTPException(
                status_code=404,
                detail="File owner not found",
            )

        storage_limit = get_storage_limit(owner)

        if used_storage + len(content) > storage_limit:
            raise HTTPException(
                status_code=413,
                detail="File owner's storage capacity has been exceeded.",
            )

        # 5. Encrypt updated file
        encrypted = EncryptionService.encrypt_and_wrap(content)

        stored_name = f"{uuid.uuid4().hex}{extension}"

        new_object_key = (
            f"users/{stored_file.owner_id}/{stored_name}"
        )

        # 6. Upload encrypted object to RustFS
        StorageService.ensure_bucket()

        StorageService.upload_file(
            new_object_key,
            encrypted["encrypted_data"],
        )

        # Save old path for deletion after successful DB commit
        old_storage_path = stored_file.storage_path

        # 7. Update database metadata
        stored_file.filename = original_name
        stored_file.storage_path = f"rustfs://{new_object_key}"
        stored_file.content_type = (
            uploaded_file.content_type
            or "application/octet-stream"
        )
        stored_file.size = len(content)
        stored_file.encryption_nonce = encrypted["nonce"]
        stored_file.wrapped_key = encrypted["wrapped_key"]
        stored_file.key_nonce = encrypted["key_nonce"]
        stored_file.key_version = int(
            os.getenv("TRUSTSHARE_MASTER_KEY_VERSION", "1")
        )

        db.commit()
        db.refresh(stored_file)

        # 8. Audit logging
        AuditService.log_event(
            category="FILE",
            action="FILE_UPDATED",
            actor_id=current_user.id,
            actor_email=current_user.email,
            resource_type="FILE",
            resource_id=stored_file.id,
            status="SUCCESS",
            ip_address=(
                request.client.host if request.client else None
            ),
            details={
                "filename": stored_file.filename,
                "size": stored_file.size,
                "owner_id": stored_file.owner_id,
            },
        )

        # 9. Invalidate owner's Redis cache
        try:
            redis_client = RedisService.get_client()
            redis_client.delete(
                f"trustshare:user:{stored_file.owner_id}:files"
            )
        except Exception as exc:
            print(f"Redis cache invalidation failed: {exc}")

        # 10. Delete old storage object after DB commit
        if old_storage_path:
            try:
                if old_storage_path.startswith("rustfs://"):
                    old_object_key = old_storage_path[len("rustfs://"):]
                    if old_object_key != new_object_key:
                        StorageService.delete_file(old_object_key)
                else:
                    old_path = Path(old_storage_path)
                    if old_path.is_file():
                        old_path.unlink()
            except Exception as exc:
                print(f"Old file cleanup failed: {exc}")

        return {
            "message": "File updated and encrypted successfully",
            "file": {
                "id": stored_file.id,
                "filename": stored_file.filename,
                "size": stored_file.size,
                "content_type": stored_file.content_type,
                "owner_id": stored_file.owner_id,
                "encrypted": True,
            },
        }

    except HTTPException:
        db.rollback()

        if new_object_key:
            try:
                StorageService.delete_file(new_object_key)
            except Exception:
                pass

        raise

    except Exception as exc:
        db.rollback()

        if new_object_key:
            try:
                StorageService.delete_file(new_object_key)
            except Exception:
                pass

        print(f"File update failed: {exc}")

        raise HTTPException(
            status_code=500,
            detail="File update failed",
        )

    finally:
        uploaded_file.file.close()

@router.get("/download/{file_id}")
def download_file(
    request: Request,
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. Find the file
    stored_file = (
        db.query(File)
        .filter(File.id == file_id)
        .first()
    )

    if not stored_file:
        raise HTTPException(
            status_code=404,
            detail="File not found",
        )

    # 2. Check file ownership
    is_owner = stored_file.owner_id == current_user.id

    # 3. Check sharing permission
    if not is_owner:
        shares = (
            db.query(FileShare)
            .filter(
                FileShare.file_id == file_id,
                FileShare.shared_with_user_id == current_user.id,
                FileShare.is_revoked.is_(False),
            )
            .all()
        )

        now = datetime.now(timezone.utc)
        valid_share = False

        for share in shares:
            if share.expires_at is None:
                continue

            expiry = share.expires_at

            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)

            if expiry > now:
                valid_share = True
                break

        if not valid_share:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to download this file",
            )
    print(
        "DOWNLOAD DEBUG:",
        "file_id =", stored_file.id,
        "nonce =", bool(stored_file.encryption_nonce),
        "wrapped_key =", bool(stored_file.wrapped_key),
        "key_nonce =", bool(stored_file.key_nonce),
        "key_version =", stored_file.key_version,
    )

    # 4. Verify encryption metadata
    if not all([
        stored_file.encryption_nonce,
        stored_file.wrapped_key,
        stored_file.key_nonce,
    ]):
        raise HTTPException(
            status_code=400,
            detail="File encryption metadata is missing",
        )

    try:

        storage_path = stored_file.storage_path

        if storage_path.startswith("rustfs://"):
            object_key = storage_path[len("rustfs://"):]

            encrypted_data = StorageService.download_file(
                object_key
            )
        else:
            file_path = Path(storage_path)

            if not file_path.is_file():
                raise HTTPException(
                    status_code=404,
                    detail="Stored file not found",
                )

            encrypted_data = file_path.read_bytes()

        # 6. Read original master key version
        key_version = stored_file.key_version or 1

        # 7. Decrypt file
        original_data = EncryptionService.unwrap_and_decrypt(
            encrypted_data=encrypted_data,
            nonce=stored_file.encryption_nonce,
            wrapped_key=stored_file.wrapped_key,
            key_nonce=stored_file.key_nonce,
            key_version=key_version,
        )

        # 8. Record successful download
        AuditService.log_event(
            category="FILE",
            action="FILE_DOWNLOADED",
            actor_id=current_user.id,
            actor_email=current_user.email,
            resource_type="FILE",
            resource_id=stored_file.id,
            status="SUCCESS",
            ip_address=request.client.host if request.client else None,
            details={
                "filename": stored_file.filename,
                "size": stored_file.size,
            },
        )

# Return original decrypted file
        return Response(
    content=original_data,
    media_type=stored_file.content_type or "application/octet-stream",
    headers={
        "Content-Disposition": (
            f'inline; filename="{Path(stored_file.filename).name}"'
        ),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    },
)

    except HTTPException:
        raise

    except Exception as exc:
        print(f"File download failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="File decryption failed",
        )

@router.get("/shared-download/{token}")
def download_shared_file(
    request: Request,
    token: str,
    db: Session = Depends(get_db),
):
    # 1. Hash received token
    token_hash = hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()

    # 2. Find valid share
    share = (
        db.query(FileShare)
        .filter(
            FileShare.token_hash == token_hash,
            FileShare.is_revoked.is_(False),
        )
        .first()
    )

    if not share:
        AuditService.log_event(
            category="SECURITY",
            action="INVALID_OR_REVOKED_SHARE_LINK_ATTEMPT",
            status="FAILED",
            ip_address=request.client.host if request.client else None,
            details={
                "reason": "Invalid or revoked sharing link",
                "endpoint": "/shared-download",
            },
        )
        raise HTTPException(
            status_code=404,
            detail="Invalid or revoked sharing link",
        )

    if share.expires_at is None:
        AuditService.log_event(
            category="SECURITY",
            action="SHARE_LINK_WITHOUT_EXPIRY_ATTEMPT",
            status="FAILED",
            resource_type="FILE_SHARE",
            resource_id=share.id,
            ip_address=request.client.host if request.client else None,
            details={
                "reason": "Sharing link has no expiry",
                "endpoint": "/shared-download",
            },
        )
        raise HTTPException(
            status_code=403,
            detail="Sharing link has no expiry",
        )

    expiry = share.expires_at

    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)

    if expiry <= datetime.now(timezone.utc):
        AuditService.log_event(
            category="SECURITY",
            action="EXPIRED_SHARE_LINK_ACCESS_ATTEMPT",
            status="FAILED",
            resource_type="FILE_SHARE",
            resource_id=share.id,
            ip_address=request.client.host if request.client else None,
            details={
                "reason": "Sharing link has expired",
                "endpoint": "/shared-download",
            },
        )
        raise HTTPException(
            status_code=403,
            detail="Sharing link has expired",
        )

    # 4. Find file
    stored_file = (
        db.query(File)
        .filter(File.id == share.file_id)
        .first()
    )

    if not stored_file:
        AuditService.log_event(
            category="SECURITY",
            action="SHARED_FILE_NOT_FOUND",
            status="FAILED",
            resource_type="FILE_SHARE",
            resource_id=share.id,
            ip_address=request.client.host if request.client else None,
            details={
                "reason": "Shared file not found",
                "endpoint": "/shared-download",
            },
        )
        raise HTTPException(
            status_code=404,
            detail="File not found",
        )

    # 5. Check encryption metadata
    if not all([
        stored_file.encryption_nonce,
        stored_file.wrapped_key,
        stored_file.key_nonce,
    ]):
        AuditService.log_event(
            category="SECURITY",
            action="SHARED_FILE_ENCRYPTION_METADATA_MISSING",
            status="FAILED",
            resource_type="FILE",
            resource_id=stored_file.id,
            ip_address=request.client.host if request.client else None,
            details={
                "reason": "File encryption metadata is missing",
                "endpoint": "/shared-download",
            },
        )

        raise HTTPException(
            status_code=400,
            detail="File encryption metadata is missing",
        )

    try:
        # 6. Download encrypted file
        storage_path = stored_file.storage_path

        if storage_path.startswith("rustfs://"):
            object_key = storage_path[len("rustfs://"):]

            encrypted_data = StorageService.download_file(
                object_key
            )
        else:
            file_path = Path(storage_path)

            if not file_path.is_file():
                raise HTTPException(
                    status_code=404,
                    detail="Stored file not found",
                )

            encrypted_data = file_path.read_bytes()

        # 7. Decrypt file
        original_data = EncryptionService.unwrap_and_decrypt(
            encrypted_data=encrypted_data,
            nonce=stored_file.encryption_nonce,
            wrapped_key=stored_file.wrapped_key,
            key_nonce=stored_file.key_nonce,
            key_version=stored_file.key_version or 1,
        )

        # 8. Record audit event
        AuditService.log_event(
            category="SHARE",
            action="SHARED_FILE_DOWNLOADED",
            actor_id=share.shared_with_user_id,
            actor_email=None,
            resource_type="FILE_SHARE",
            resource_id=share.id,
            status="SUCCESS",
            ip_address=request.client.host if request.client else None,
            details={
                "file_id": stored_file.id,
                "filename": stored_file.filename,
                "size": stored_file.size,
                "permission": share.permission,
            },
        )

        # 9. Notify file owner
        owner = (
            db.query(User)
            .filter(User.id == stored_file.owner_id)
            .first()
        )

        downloader = None

        if share.shared_with_user_id:
            downloader = (
                db.query(User)
                .filter(
                    User.id == share.shared_with_user_id
                )
                .first()
            )

        if owner:
            downloader_name = (
                downloader.email
                if downloader
                else "Someone using your sharing link"
            )

            NotificationService.create_notification(
                user_id=owner.id,
                title="Shared File Downloaded",
                message=(
                    f"{downloader_name} downloaded "
                    f"'{stored_file.filename}'."
                ),
                notification_type="FILE_DOWNLOADED",
                metadata={
                    "file_id": stored_file.id,
                    "filename": stored_file.filename,
                    "share_id": share.id,
                    "downloader_id": (
                        downloader.id if downloader else None
                    ),
                    "downloader_email": (
                        downloader.email if downloader else None
                    ),
                    "ip_address": (
                        request.client.host
                        if request.client else None
                    ),
                    "downloaded_at": (
                        datetime.now(timezone.utc).isoformat()
                    ),
                },
            )


# Return original decrypted file
        return Response(
    content=original_data,
    media_type=stored_file.content_type or "application/octet-stream",
    headers={
        "Content-Disposition": (
            f'inline; filename="{Path(stored_file.filename).name}"'
        ),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    },
)


    except HTTPException:
        raise

    except Exception as exc:
        import traceback

        # Log failed shared file download
        AuditService.log_event(
            category="SECURITY",
            action="SHARED_FILE_DOWNLOAD_FAILED",
            status="FAILED",
            resource_type="FILE",
            resource_id=stored_file.id,
            ip_address=request.client.host if request.client else None,
            details={
                "reason": "Shared file download failed",
                "error_type": type(exc).__name__,
                "share_id": share.id,
                "endpoint": "/shared-download",
            },
        )

        print(
            f"SHARED DOWNLOAD ERROR | File ID: {stored_file.id} | "
            f"Error: {type(exc).__name__}: {exc}"
        )

        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="File decryption failed",
        )
@router.get("/admin/overview")
def get_admin_overview(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    # 1. Real database totals
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_files = db.query(func.count(File.id)).scalar() or 0
    total_shares = db.query(func.count(FileShare.id)).scalar() or 0

    # 2. User Growth Analytics - Last 7 Days
    today = datetime.now(timezone.utc).date()

    start_date = datetime(
        today.year,
        today.month,
        today.day,
        tzinfo=timezone.utc,
    ) - timedelta(days=6)

    end_date = datetime.now(timezone.utc)

    registration_pipeline = [
        {
            "$match": {
                "category": "AUTH",
                "action": "USER_REGISTERED",
                "created_at": {
                    "$gte": start_date,
                    "$lt": end_date,
                },
            }
        },
        {
            "$group": {
                "_id": {
                    "$dateToString": {
                        "format": "%Y-%m-%d",
                        "date": "$created_at",
                    }
                },
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    registration_data = list(
        AuditService._get_collection().aggregate(registration_pipeline)
    )

    user_growth_trend = [
        {"date": item["_id"], "users": item["count"]}
        for item in registration_data
    ]

    # 3. Storage totals
    total_storage_bytes = (
        db.query(func.coalesce(func.sum(File.size), 0)).scalar() or 0
    )

    total_failed_logins = (
        db.query(func.count(LoginAttempt.id))
        .filter(LoginAttempt.status == "Failed")
        .scalar()
        or 0
    )

    # 4. User role distribution
    role_rows = (
        db.query(User.role, func.count(User.id))
        .group_by(User.role)
        .all()
    )

    users_by_role = {
        role: count for role, count in role_rows
    }

    # 5. Detailed file type and storage distribution
    file_rows = db.query(File.filename, File.size).all()

    file_type_stats = {}

    for filename, size in file_rows:
        file_type = Path(filename).suffix.lower() or "no_extension"

        if file_type not in file_type_stats:
            file_type_stats[file_type] = {
                "count": 0,
                "storage_bytes": 0,
            }

        file_type_stats[file_type]["count"] += 1
        file_type_stats[file_type]["storage_bytes"] += size or 0

    files_by_type = [
        {
            "file_type": file_type,
            "count": stats["count"],
            "storage_bytes": stats["storage_bytes"],
            "storage_mb": round(stats["storage_bytes"] / (1024 * 1024), 2),
        }
        for file_type, stats in sorted(
            file_type_stats.items(),
            key=lambda item: item[1]["storage_bytes"],
            reverse=True,
        )
    ]

    # 6. User-wise storage analytics
    user_storage_rows = (
        db.query(
            User.id,
            User.email,
            User.role,
            func.count(File.id),
            func.coalesce(func.sum(File.size), 0),
        )
        .outerjoin(File, File.owner_id == User.id)
        .group_by(User.id, User.email, User.role)
        .all()
    )

    user_storage = [
        {
            "user_id": user_id,
            "email": email,
            "total_files": file_count,
            "storage_bytes": storage_bytes,
            "storage_mb": round(storage_bytes / (1024 * 1024), 2),
            "storage_limit_bytes": (
                ADMIN_STORAGE_LIMIT
                if role and role.strip().lower() == "admin"
                else USER_STORAGE_LIMIT
            ),
            "usage_percentage": round(
                (
                    storage_bytes
                    / (
                        ADMIN_STORAGE_LIMIT
                        if role and role.strip().lower() == "admin"
                        else USER_STORAGE_LIMIT
                    )
                )
                * 100,
                2,
            ),
        }
        for user_id, email, role, file_count, storage_bytes in user_storage_rows
    ]

    user_storage.sort(
        key=lambda user: user["storage_bytes"],
        reverse=True,
    )

    # Overall provisioned storage utilization
    total_storage_capacity = sum(
        (
            ADMIN_STORAGE_LIMIT
            if role and role.strip().lower() == "admin"
            else USER_STORAGE_LIMIT
        )
        for role, count in role_rows
        for _ in range(count)
    )

    storage_utilization_percentage = (
        round((total_storage_bytes / total_storage_capacity) * 100, 2)
        if total_storage_capacity
        else 0
    )

    # 7. Failed login trend for the last 7 calendar days
    failed_login_today = date.today()
    first_day = failed_login_today - timedelta(days=6)

    daily_counts = {
        (first_day + timedelta(days=i)).isoformat(): 0
        for i in range(7)
    }

    login_rows = (
        db.query(LoginAttempt.attempted_at)
        .filter(LoginAttempt.status == "Failed")
        .all()
    )

    for (attempted_at,) in login_rows:
        if attempted_at is None:
            continue

        event_day = attempted_at.date().isoformat()

        if event_day in daily_counts:
            daily_counts[event_day] += 1

    failed_login_trend = [
        {"date": day, "failed_logins": count}
        for day, count in daily_counts.items()
    ]

    # 8. Recent uploaded files
    recent_file_rows = (
        db.query(File, User.email)
        .join(User, File.owner_id == User.id)
        .order_by(File.id.desc())
        .limit(10)
        .all()
    )

    recent_files = [
        {
            "id": file.id,
            "filename": file.filename,
            "size_bytes": file.size,
            "content_type": file.content_type,
            "owner_email": owner_email,
        }
        for file, owner_email in recent_file_rows
    ]

    # 9. Recent security events
    recent_attempt_rows = (
        db.query(LoginAttempt)
        .order_by(LoginAttempt.attempted_at.desc())
        .limit(10)
        .all()
    )

    recent_security_events = [
        {
            "email": attempt.attempted_email,
            "ip_address": attempt.ip_address,
            "status": attempt.status,
            "attempted_at": (
                attempt.attempted_at.isoformat()
                if attempt.attempted_at
                else None
            ),
        }
        for attempt in recent_attempt_rows
    ]

    return {
        "summary": {
            "total_users": total_users,
            "total_files": total_files,
            "total_shares": total_shares,
            "total_storage_bytes": total_storage_bytes,
            "total_storage_mb": round(
                total_storage_bytes / (1024 * 1024), 2
            ),
            "total_failed_logins": total_failed_logins,
            "total_storage_capacity_bytes": total_storage_capacity,
            "storage_utilization_percentage": storage_utilization_percentage,
        },
        "users_by_role": users_by_role,
        "files_by_type": files_by_type,
        "user_growth_trend": user_growth_trend,
        "user_storage": user_storage,
        "user_growth_trend": user_growth_trend,
        "failed_login_trend": failed_login_trend,
        "recent_files": recent_files,
        "recent_security_events": recent_security_events,
    }

def _build_admin_reports(db: Session):
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=6)

    # 1. User statistics
    total_users = db.query(func.count(User.id)).scalar() or 0

    users_by_role_rows = (
        db.query(User.role, func.count(User.id))
        .group_by(User.role)
        .all()
    )

    users_by_role = {
        role: count for role, count in users_by_role_rows
    }

    # 2. File and storage statistics
    total_files = db.query(func.count(File.id)).scalar() or 0

    total_storage_bytes = (
        db.query(func.coalesce(func.sum(File.size), 0)).scalar() or 0
    )

    # 3. File sharing statistics
    total_shares = db.query(func.count(FileShare.id)).scalar() or 0

    revoked_shares = (
        db.query(func.count(FileShare.id))
        .filter(FileShare.is_revoked.is_(True))
        .scalar() or 0
    )

    active_shares = (
        db.query(func.count(FileShare.id))
        .filter(
            FileShare.is_revoked.is_(False),
            FileShare.expires_at > now,
        )
        .scalar() or 0
    )

    expired_shares = (
        db.query(func.count(FileShare.id))
        .filter(
            FileShare.is_revoked.is_(False),
            FileShare.expires_at <= now,
        )
        .scalar() or 0
    )

    # 4. Login statistics from MongoDB audit logs
    audit_collection = AuditService._get_collection()

    successful_logins = audit_collection.count_documents({
        "category": "AUTH",
        "action": "USER_LOGIN_SUCCESS",
    })

    failed_logins = audit_collection.count_documents({
        "category": "AUTH",
        "action": "USER_LOGIN_FAILED",
    })

    # 5. Security statistics
    total_security_events = audit_collection.count_documents({
        "category": "SECURITY",
    })

    total_audit_events = audit_collection.count_documents({})

    # 6. Daily activity for the last 7 days
    daily_counts = {
        (seven_days_ago.date() + timedelta(days=i)).isoformat(): 0
        for i in range(7)
    }

    pipeline = [
        {
            "$match": {
                "created_at": {"$gte": seven_days_ago}
            }
        },
        {
            "$group": {
                "_id": {
                    "$dateToString": {
                        "format": "%Y-%m-%d",
                        "date": "$created_at",
                        "timezone": "UTC",
                    }
                },
                "count": {"$sum": 1},
            }
        },
    ]

    for item in audit_collection.aggregate(pipeline):
        if item["_id"] in daily_counts:
            daily_counts[item["_id"]] = item["count"]

    daily_activity = [
        {"date": day, "events": count}
        for day, count in daily_counts.items()
    ]

    return {
        "generated_at": now.isoformat(),
        "users": {
            "total": total_users,
            "by_role": users_by_role,
        },
        "files": {
            "total": total_files,
            "storage_bytes": total_storage_bytes,
            "storage_mb": round(
                total_storage_bytes / (1024 * 1024), 2
            ),
        },
        "sharing": {
            "total": total_shares,
            "active": active_shares,
            "expired": expired_shares,
            "revoked": revoked_shares,
        },
        "logins": {
            "successful": successful_logins,
            "failed": failed_logins,
        },
        "security": {
            "total_security_events": total_security_events,
            "total_audit_events": total_audit_events,
        },
        "daily_activity": daily_activity,
    }


@router.get("/admin/reports")
def get_admin_reports(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        return _build_admin_reports(db)

    except Exception as exc:
        print(f"Admin reports error: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate admin reports",
        )


@router.get("/admin/reports/export")
def export_admin_reports(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        report = _build_admin_reports(db)

        output = StringIO()
        writer = csv.writer(output)

        writer.writerow(["TrustShare Admin Report"])
        writer.writerow(["Generated At (UTC)", report["generated_at"]])
        writer.writerow([])

        writer.writerow(["Category", "Metric", "Value"])

        for category in (
            "users", "files", "sharing", "logins", "security"
        ):
            for metric, value in report[category].items():
                if isinstance(value, dict):
                    for sub_metric, sub_value in value.items():
                        writer.writerow([
                            category, sub_metric, sub_value
                        ])
                else:
                    writer.writerow([category, metric, value])

        writer.writerow([])
        writer.writerow(["Daily Activity"])
        writer.writerow(["Date (UTC)", "Events"])

        for item in report["daily_activity"]:
            writer.writerow([item["date"], item["events"]])

        output.seek(0)

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition":
                    'attachment; filename="trustshare_admin_report.csv"'
            },
        )

    except Exception as exc:
        print(f"Admin report export error: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Failed to export admin report",
        )

@router.get("/admin/audit-logs")
def get_admin_audit_logs(
    category: str = None,
    action: str = None,
    actor_id: int = None,
    status: str = None,
    limit: int = 50,
    skip: int = 0,
    current_user: User = Depends(require_admin),
):
    try:
        events = AuditService.get_events(
            category=category,
            action=action,
            actor_id=actor_id,
            status=status,
            limit=limit,
            skip=skip,
        )

        return {
            "total_returned": len(events),
            "limit": limit,
            "skip": skip,
            "filters": {
                "category": category,
                "action": action,
                "actor_id": actor_id,
                "status": status,
            },
            "audit_logs": [
                {
                    **event,
                    "created_at": (
                        event["created_at"].isoformat()
                        if event.get("created_at")
                        else None
                    ),
                }
                for event in events
            ],
        }

    except Exception as exc:
        print(f"Admin audit logs error: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch audit logs",
        )

@router.get("/admin/security/alerts")
def get_security_alerts(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        now = datetime.now(timezone.utc)
        time_window = now - timedelta(minutes=10)

        alerts = []

        # 1. Detect failed login attempts
        failed_attempts = (
            db.query(LoginAttempt)
            .filter(
                LoginAttempt.status == "Failed",
                LoginAttempt.attempted_at >= time_window,
            )
            .all()
        )

        ip_counts = {}
        email_counts = {}

        for attempt in failed_attempts:
            ip = attempt.ip_address
            email = (attempt.attempted_email or "").lower()

            if ip:
                ip_counts[ip] = ip_counts.get(ip, 0) + 1

            if email:
                email_counts[email] = email_counts.get(email, 0) + 1

        for ip, count in ip_counts.items():
            if count >= 5:
                alerts.append({
                    "type": "MULTIPLE_FAILED_LOGINS",
                    "severity": "HIGH",
                    "message": f"{count} failed login attempts from one IP",
                    "ip_address": ip,
                    "attempts": count,
                })

        for email, count in email_counts.items():
            if count >= 5:
                alerts.append({
                    "type": "ACCOUNT_BRUTE_FORCE",
                    "severity": "HIGH",
                    "message": f"{count} failed login attempts for one account",
                    "email": email,
                    "attempts": count,
                })

        # 2. Detect suspicious share-link access attempts
        audit_collection = AuditService._get_collection()

        suspicious_actions = [
            "INVALID_OR_REVOKED_SHARE_LINK_ATTEMPT",
            "EXPIRED_SHARE_LINK_ACCESS_ATTEMPT",
        ]

        suspicious_events = list(
            audit_collection.find({
                "category": "SECURITY",
                "action": {"$in": suspicious_actions},
                "status": "FAILED",
                "created_at": {"$gte": time_window},
            })
        )

        suspicious_ip_counts = {}
        suspicious_action_counts = {}

        for event in suspicious_events:
            ip = event.get("ip_address")
            action = event.get("action")

            if ip:
                suspicious_ip_counts[ip] = (
                    suspicious_ip_counts.get(ip, 0) + 1
                )

                key = (ip, action)
                suspicious_action_counts[key] = (
                    suspicious_action_counts.get(key, 0) + 1
                )

        # 3. Same IP: 3 or more invalid/revoked/expired attempts
        for (ip, action), count in suspicious_action_counts.items():
            if count >= 3:
                alerts.append({
                    "type": "SUSPICIOUS_SHARE_ACCESS",
                    "severity": "HIGH",
                    "message": (
                        f"{count} suspicious share-link attempts "
                        f"from one IP"
                    ),
                    "ip_address": ip,
                    "action": action,
                    "attempts": count,
                })

        # 4. Combined suspicious activity from one IP
        for ip, count in suspicious_ip_counts.items():
            if count >= 5:
                alerts.append({
                    "type": "REPEATED_SUSPICIOUS_ACCESS",
                    "severity": "CRITICAL",
                    "message": (
                        f"{count} suspicious share-link attempts "
                        f"detected from one IP"
                    ),
                    "ip_address": ip,
                    "attempts": count,
                })

        return {
            "total_alerts": len(alerts),
            "time_window_minutes": 10,
            "total_failed_logins": len(failed_attempts),
            "total_suspicious_share_attempts": len(suspicious_events),
            "alerts": alerts,
        }

    except Exception as exc:
        print(f"Security alerts error: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch security alerts",
        )

@router.delete("/delete/{file_id}")
def delete_file(
    request: Request,
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. Find file owned by current user
    stored_file = (
        db.query(File)
        .filter(
            File.id == file_id,
            File.owner_id == current_user.id,
        )
        .first()
    )

    if not stored_file:
        raise HTTPException(
            status_code=404,
            detail="File not found or you are not the owner",
        )

    # Save details before deleting database record
    filename = stored_file.filename
    file_size = stored_file.size
    owner_id = stored_file.owner_id
    storage_path = stored_file.storage_path

    try:
        # 2. Delete actual stored object
        if storage_path.startswith("rustfs://"):
            object_key = storage_path[len("rustfs://"):]
            StorageService.delete_file(object_key)

        else:
            # Handle legacy local uploads
            base_dir = (Path.cwd() / "uploads").resolve()
            local_path = (Path.cwd() / storage_path).resolve()

            # Prevent path traversal
            if not local_path.is_relative_to(base_dir):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid storage path",
                )

            if local_path.exists():
                if not local_path.is_file():
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid file path",
                    )
                local_path.unlink()

        # 3. Delete related sharing records
        db.query(FileShare).filter(
            FileShare.file_id == stored_file.id
        ).delete(synchronize_session=False)

        # 4. Delete file metadata
        db.delete(stored_file)
        db.commit()

        # 5. Record successful deletion
        AuditService.log_event(
            category="FILE",
            action="FILE_DELETED",
            actor_id=current_user.id,
            actor_email=current_user.email,
            resource_type="FILE",
            resource_id=file_id,
            status="SUCCESS",
            ip_address=request.client.host if request.client else None,
            details={
                "filename": filename,
                "size": file_size,
                "owner_id": owner_id,
            },
        )

        # 6. Invalidate user's files cache
        try:
            redis_client = RedisService.get_client()
            redis_client.delete(
                f"trustshare:user:{current_user.id}:files"
            )
            print("Redis cache invalidated after deletion")
        except Exception as exc:
            print(f"Redis cache invalidation failed: {exc}")

        return {
            "message": "File deleted successfully",
            "file_id": file_id,
            "filename": filename,
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception as exc:
        db.rollback()
        print(f"File deletion failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="File deletion failed",
        )

@router.get("/notifications")
def get_my_notifications(
    limit: int = 50,
    skip: int = 0,
    current_user: User = Depends(get_current_user),
):
    notifications = NotificationService.get_notifications(
        user_id=current_user.id,
        limit=limit,
        skip=skip,
    )

    return {
        "notifications": notifications,
        "unread_count": NotificationService.get_unread_count(
            current_user.id
        ),
    }


@router.get("/notifications/unread-count")
def get_notification_unread_count(
    current_user: User = Depends(get_current_user),
):
    return {
        "unread_count": NotificationService.get_unread_count(
            current_user.id
        )
    }


@router.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
):
    success = NotificationService.mark_as_read(
        user_id=current_user.id,
        notification_id=notification_id,
    )

    if not success:
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )

    return {"message": "Notification marked as read"}


@router.patch("/notifications/read-all")
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
):
    updated_count = NotificationService.mark_all_as_read(
        user_id=current_user.id
    )

    return {
        "message": "All notifications marked as read",
        "updated_count": updated_count,
    }
