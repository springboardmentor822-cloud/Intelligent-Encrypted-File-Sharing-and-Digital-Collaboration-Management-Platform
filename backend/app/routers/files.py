import os
import io
import uuid
import shutil
import zipfile
import hashlib
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    Query,
    Request,
    status,
)
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from app.database import mongo_db, redis_client, SessionLocal
from app.models import User, UserRole, FileRecord
from app.security import get_current_user, hash_password, verify_password
from app.services.logger import log_activity
from app.services.rate_limiter import check_rate_limit
from app.services.crypto_service import encrypt_file_data, decrypt_file_data
from app.services.storage_service import storage_service

router = APIRouter(prefix="/files", tags=["Files & Folder Management"])

# Resolve storage root: backend/storage/uploads
STORAGE_DIR = Path(__file__).resolve().parent.parent.parent / "storage" / "uploads"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB limit per file
USER_STORAGE_QUOTA_BYTES = 500 * 1024 * 1024  # 500 MB per user quota
USER_STORAGE_QUOTA_MB = 500
USER_STORAGE_QUOTA_GB = 0.5

# Allowed file extensions whitelist (broad enterprise support)
ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt", ".md",
    ".xls", ".xlsx", ".csv", ".tsv",
    ".ppt", ".pptx",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp",
    ".zip", ".tar", ".gz", ".rar", ".7z",
    ".json", ".xml", ".yaml", ".yml",
    ".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".sql",
    ".mp3", ".wav", ".mp4", ".mov"
}

# Dangerous extensions blocked unconditionally
BLOCKED_EXTENSIONS = {".exe", ".bat", ".cmd", ".sh", ".vbs", ".msi", ".dll", ".scr", ".ps1"}

def get_file_category(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext in {".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt", ".md"}:
        return "document"
    if ext in {".xls", ".xlsx", ".csv", ".tsv"}:
        return "spreadsheet"
    if ext in {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"}:
        return "image"
    if ext in {".zip", ".tar", ".gz", ".rar", ".7z"}:
        return "archive"
    if ext in {".ppt", ".pptx"}:
        return "presentation"
    if ext in {".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".json", ".sql"}:
        return "code"
    return "other"


# Schemas
class CreateFolderRequest(BaseModel):
    name: str
    parent_folder_id: Optional[str] = None
    password: Optional[str] = None

class SetPasswordRequest(BaseModel):
    password: Optional[str] = None
    action: str = "set"  # "set" or "remove"

class VerifyPasswordRequest(BaseModel):
    password: str

class UpdateItemRequest(BaseModel):
    name: Optional[str] = None
    is_starred: Optional[bool] = None
    parent_folder_id: Optional[str] = None
    is_trashed: Optional[bool] = None


def sanitize_item(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Strip sensitive fields like password_hash and cryptographic key material before returning to client.
    Guarantees zero leakage of DEKs, KEK references, IVs, or auth tags.
    """
    if not doc:
        return {}
    clean = dict(doc)
    if "_id" in clean:
        clean["id"] = str(clean.pop("_id"))
    elif "id" not in clean:
        clean["id"] = str(clean.get("_id", ""))
    clean.pop("password_hash", None)
    clean.pop("dek_info", None)
    clean.pop("encrypted_dek", None)
    clean.pop("dek_iv", None)
    clean.pop("dek_tag", None)
    clean.pop("file_iv", None)
    clean.pop("file_tag", None)
    return clean


async def build_breadcrumbs(user_id: int, folder_id: Optional[str]) -> List[Dict[str, Any]]:
    """Build list of breadcrumbs from root to current folder"""
    crumbs = [{"id": None, "name": "My Vault"}]
    curr_id = folder_id
    visited = set()

    chain = []
    while curr_id and curr_id not in visited:
        visited.add(curr_id)
        folder = await mongo_db.file_metadata.find_one({
            "_id": curr_id,
            "owner_id": user_id,
            "is_folder": True
        })
        if not folder:
            break
        chain.append({"id": folder["_id"], "name": folder["name"]})
        curr_id = folder.get("parent_folder_id")

    # Reverse chain so it goes Root -> Child1 -> Child2
    chain.reverse()
    crumbs.extend(chain)
    return crumbs


# ==============================================================================
# 1. LIST FILES & FOLDERS (GOOGLE DRIVE HIERARCHY)
# ==============================================================================
@router.get("")
async def list_files(
    folder_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    filter_type: str = Query("all"),  # all, starred, trash, recent, shared
    sort_by: str = Query("date_desc"),  # date_desc, date_asc, name_asc, size_desc
    current_user: User = Depends(get_current_user)
):
    query: Dict[str, Any] = {"owner_id": current_user.id}

    # Retrieve active shares owned by current user
    active_shares = await mongo_db.file_shares.find({
        "owner_id": current_user.id,
        "is_active": True
    }).to_list(length=1000)

    # Filter out expired or exhausted shares
    now = datetime.now(timezone.utc)
    valid_active_item_ids = set()
    for s in active_shares:
        is_expired = False
        if s.get("expires_at"):
            exp = datetime.fromisoformat(s["expires_at"].replace("Z", "+00:00"))
            if now > exp:
                is_expired = True
        is_exhausted = bool(s.get("max_downloads") and s.get("downloads_count", 0) >= s["max_downloads"])
        if not is_expired and not is_exhausted:
            valid_active_item_ids.add(s["item_id"])

    user_shared_files_count = len(valid_active_item_ids)

    if filter_type == "trash":
        query["is_trashed"] = True
    elif filter_type == "starred":
        query["is_trashed"] = False
        query["is_starred"] = True
    elif filter_type == "recent":
        query["is_trashed"] = False
        query["is_folder"] = False
    elif filter_type == "shared":
        query["is_trashed"] = False
        query["_id"] = {"$in": list(valid_active_item_ids)}
    else:
        query["is_trashed"] = False

    # If searching across the vault or filtering by category, recent, or shared, ignore folder_id
    if search:
        query["name"] = {"$regex": search.strip(), "$options": "i"}
    elif filter_type in ["trash", "starred", "recent", "shared"]:
        pass
    elif not category or category == "all":
        query["parent_folder_id"] = folder_id
    elif category and category != "all":
        query["category"] = category

    # Sorting options
    sort_criteria = [("is_folder", -1)]  # Folders first by default
    if sort_by == "name_asc":
        sort_criteria.append(("name", 1))
    elif sort_by == "size_desc":
        sort_criteria.append(("file_size", -1))
    elif sort_by == "date_asc":
        sort_criteria.append(("created_at", 1))
    else:
        sort_criteria.append(("created_at", -1))

    fetch_limit = 50 if filter_type == "recent" else 1000
    cursor = mongo_db.file_metadata.find(query).sort(sort_criteria).limit(fetch_limit)
    docs = await cursor.to_list(length=fetch_limit)
    items = []
    for d in docs:
        san = sanitize_item(d)
        san["is_shared"] = san.get("id") in valid_active_item_ids
        items.append(san)

    # Current folder details (if not at root)
    current_folder = None
    if folder_id:
        cf = await mongo_db.file_metadata.find_one({"_id": folder_id, "owner_id": current_user.id})
        if cf:
            current_folder = sanitize_item(cf)

    breadcrumbs = await build_breadcrumbs(current_user.id, folder_id)

    # Calculate user's total active storage
    storage_pipeline = [
        {"$match": {"owner_id": current_user.id, "is_folder": False, "is_trashed": False}},
        {"$group": {"_id": None, "total_bytes": {"$sum": "$file_size"}, "total_files": {"$sum": 1}}}
    ]
    storage_agg = await mongo_db.file_metadata.aggregate(storage_pipeline).to_list(length=1)
    user_storage_bytes = storage_agg[0]["total_bytes"] if storage_agg else 0
    user_total_files = storage_agg[0]["total_files"] if storage_agg else 0
    user_remaining_bytes = max(0, USER_STORAGE_QUOTA_BYTES - user_storage_bytes)

    return {
        "items": items,
        "current_folder": current_folder,
        "breadcrumbs": breadcrumbs,
        "total_count": len(items),
        "user_storage_bytes": user_storage_bytes,
        "user_storage_quota_bytes": USER_STORAGE_QUOTA_BYTES,
        "user_remaining_bytes": user_remaining_bytes,
        "user_quota_mb": USER_STORAGE_QUOTA_MB,
        "user_quota_gb": USER_STORAGE_QUOTA_GB,
        "user_total_files": user_total_files,
        "user_shared_files_count": user_shared_files_count,
    }


# ==============================================================================
# 2. CREATE FOLDER
# ==============================================================================
@router.post("/folder", status_code=status.HTTP_201_CREATED)
async def create_folder(
    req: CreateFolderRequest,
    current_user: User = Depends(get_current_user)
):
    folder_name = req.name.strip()
    if not folder_name:
        raise HTTPException(status_code=400, detail="Folder name cannot be empty.")

    # Check if folder with same name already exists in target parent
    existing = await mongo_db.file_metadata.find_one({
        "owner_id": current_user.id,
        "parent_folder_id": req.parent_folder_id,
        "name": folder_name,
        "is_folder": True,
        "is_trashed": False
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"Folder '{folder_name}' already exists here.")

    folder_id = str(uuid.uuid4())
    is_protected = bool(req.password and req.password.strip())
    pwd_hash = hash_password(req.password.strip()) if is_protected else None

    now = datetime.now(timezone.utc).isoformat()
    folder_doc = {
        "_id": folder_id,
        "owner_id": current_user.id,
        "owner_username": current_user.username,
        "name": folder_name,
        "is_folder": True,
        "parent_folder_id": req.parent_folder_id,
        "file_size": 0,
        "mime_type": "folder",
        "category": "folder",
        "is_password_protected": is_protected,
        "password_hash": pwd_hash,
        "is_starred": False,
        "is_trashed": False,
        "downloads_count": 0,
        "created_at": now,
        "updated_at": now
    }

    await mongo_db.file_metadata.insert_one(folder_doc)
    await log_activity(
        user_id=current_user.id,
        username=current_user.username,
        action="FOLDER_CREATE",
        resource_id=folder_id,
        resource_name=folder_name,
        details={"is_password_protected": is_protected, "parent_folder_id": req.parent_folder_id}
    )

    return sanitize_item(folder_doc)


# ==============================================================================
# 3. UPLOAD FILES (SINGLE OR BATCH)
# ==============================================================================
@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_files(
    request: Request,
    files: List[UploadFile] = File(...),
    parent_folder_id: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    # Rate limit file uploads (e.g. max 120 files per minute per user)
    await check_rate_limit(f"upload:{current_user.id}", max_requests=120, window_seconds=60)

    # Validate parent folder if specified
    if parent_folder_id:
        p_folder = await mongo_db.file_metadata.find_one({
            "_id": parent_folder_id,
            "owner_id": current_user.id,
            "is_folder": True
        })
        if not p_folder:
            raise HTTPException(status_code=404, detail="Destination folder not found.")

    uploaded_items = []
    is_protected = bool(password and password.strip())
    pwd_hash = hash_password(password.strip()) if is_protected else None

    # Check user storage against 400GB individual quota
    storage_agg = await mongo_db.file_metadata.aggregate([
        {"$match": {"owner_id": current_user.id, "is_folder": False, "is_trashed": False}},
        {"$group": {"_id": None, "total_bytes": {"$sum": "$file_size"}}}
    ]).to_list(length=1)
    current_storage = storage_agg[0]["total_bytes"] if storage_agg else 0

    if current_storage >= USER_STORAGE_QUOTA_BYTES:
        raise HTTPException(
            status_code=400,
            detail="Storage quota limit reached (500 MB). Delete files from your vault to free up space."
        )

    for upload in files:
        ext = Path(upload.filename).suffix.lower()
        if ext in BLOCKED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Security alert: File extension '{ext}' is forbidden for system protection."
            )

        file_id = str(uuid.uuid4())
        safe_name = f"{file_id}_{Path(upload.filename).name.replace(' ', '_')}"

        # Read file bytes safely checking limits
        content_bytes = await upload.read()
        file_size = len(content_bytes)

        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File '{upload.filename}' exceeds maximum allowable size of 500MB."
            )
        if current_storage + file_size > USER_STORAGE_QUOTA_BYTES:
            remaining = max(0, USER_STORAGE_QUOTA_BYTES - current_storage)
            raise HTTPException(
                status_code=400,
                detail=f"Upload would exceed your 500 MB quota. Remaining space: {remaining // (1024*1024)} MB."
            )

        # Milestone 2 Task (i) & (vii): Perform AES-256-GCM Server-Side Envelope Encryption
        enc_res = encrypt_file_data(content_bytes, file_id)

        # Milestone 2 Task (ii): Secure Vault Storage (zero plaintext on disk)
        cipher_len, rel_path = storage_service.save_ciphertext(safe_name, enc_res["ciphertext"])

        current_storage += file_size
        now = datetime.now(timezone.utc).isoformat()
        file_doc = {
            "_id": file_id,
            "owner_id": current_user.id,
            "owner_username": current_user.username,
            "name": upload.filename,
            "stored_filename": safe_name,
            "file_path": rel_path,
            "file_size": file_size,
            "cipher_size": cipher_len,
            "mime_type": upload.content_type or "application/octet-stream",
            "category": get_file_category(upload.filename),
            "parent_folder_id": parent_folder_id,
            "is_folder": False,
            "is_encrypted": True,
            "encryption_algorithm": enc_res["encryption_algorithm"],
            "envelope_version": enc_res["envelope_version"],
            "file_iv": enc_res["file_iv"],
            "file_tag": enc_res["file_tag"],
            "dek_info": enc_res["dek_info"],
            "sha256_checksum": enc_res["sha256_checksum"],
            "is_password_protected": is_protected,
            "password_hash": pwd_hash,
            "is_starred": False,
            "is_trashed": False,
            "downloads_count": 0,
            "created_at": now,
            "updated_at": now
        }

        await mongo_db.file_metadata.insert_one(file_doc)

        # Milestone 2 Task (ii) & (vii): Sync file metadata & envelope key references to PostgreSQL
        try:
            with SessionLocal() as db_session:
                pg_record = FileRecord(
                    id=file_id,
                    owner_id=current_user.id,
                    name=upload.filename,
                    stored_filename=safe_name,
                    file_path=rel_path,
                    storage_provider=storage_service.provider_name,
                    file_size=file_size,
                    cipher_size=cipher_len,
                    mime_type=upload.content_type or "application/octet-stream",
                    category=get_file_category(upload.filename),
                    parent_folder_id=parent_folder_id,
                    is_folder=False,
                    is_encrypted=True,
                    encryption_algorithm=enc_res["encryption_algorithm"],
                    envelope_version=enc_res["envelope_version"],
                    file_iv=enc_res["file_iv"],
                    file_tag=enc_res["file_tag"],
                    encrypted_dek=enc_res["dek_info"]["encrypted_dek"],
                    dek_iv=enc_res["dek_info"]["dek_iv"],
                    dek_tag=enc_res["dek_info"]["dek_tag"],
                    sha256_checksum=enc_res["sha256_checksum"],
                    is_password_protected=is_protected,
                    password_hash=pwd_hash,
                    is_starred=False,
                    is_trashed=False,
                    downloads_count=0
                )
                db_session.add(pg_record)
                db_session.commit()
        except Exception:
            pass  # Resilient fallback if PostgreSQL is offline in testing environment

        uploaded_items.append(sanitize_item(file_doc))

        await log_activity(
            user_id=current_user.id,
            username=current_user.username,
            action="FILE_UPLOAD",
            resource_id=file_id,
            resource_name=upload.filename,
            ip_address=request.client.host if request.client else "127.0.0.1",
            details={
                "size_bytes": file_size,
                "mime_type": upload.content_type,
                "is_password_protected": is_protected,
                "parent_folder_id": parent_folder_id
            }
        )

    return {"uploaded": uploaded_items, "count": len(uploaded_items)}


# ==============================================================================
# 4. UPLOAD ENTIRE FOLDER (FOLDER-WISE UPLOAD PRESERVING DIRECTORY STRUCTURE)
# ==============================================================================
@router.post("/upload-folder", status_code=status.HTTP_201_CREATED)
async def upload_folder_structure(
    request: Request,
    files: List[UploadFile] = File(...),
    relative_paths: List[str] = Form(...),
    parent_folder_id: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """
    Accepts files and their relative path strings from webkitdirectory.
    Recreates nested folders in MongoDB and stores files in their matching folder.
    """
    if len(files) != len(relative_paths):
        raise HTTPException(status_code=400, detail="Mismatched file count and path count.")

    folder_cache: Dict[str, str] = {}  # relative_dir_path -> folder_id
    uploaded_files = []
    is_protected = bool(password and password.strip())
    pwd_hash = hash_password(password.strip()) if is_protected else None

    # Helper to get or create nested folders
    async def resolve_folder_id(path_str: str) -> Optional[str]:
        if not path_str or path_str == ".":
            return parent_folder_id

        if path_str in folder_cache:
            return folder_cache[path_str]

        parts = [p for p in path_str.replace("\\", "/").split("/") if p]
        curr_parent = parent_folder_id
        accumulated = ""

        for part in parts:
            accumulated = f"{accumulated}/{part}" if accumulated else part
            if accumulated in folder_cache:
                curr_parent = folder_cache[accumulated]
                continue

            # Look up or create folder
            existing = await mongo_db.file_metadata.find_one({
                "owner_id": current_user.id,
                "parent_folder_id": curr_parent,
                "name": part,
                "is_folder": True,
                "is_trashed": False
            })

            if existing:
                curr_parent = existing["_id"]
            else:
                new_fid = str(uuid.uuid4())
                now = datetime.now(timezone.utc).isoformat()
                new_folder = {
                    "_id": new_fid,
                    "owner_id": current_user.id,
                    "owner_username": current_user.username,
                    "name": part,
                    "is_folder": True,
                    "parent_folder_id": curr_parent,
                    "file_size": 0,
                    "mime_type": "folder",
                    "category": "folder",
                    "is_password_protected": is_protected,
                    "password_hash": pwd_hash,
                    "is_starred": False,
                    "is_trashed": False,
                    "downloads_count": 0,
                    "created_at": now,
                    "updated_at": now
                }
                await mongo_db.file_metadata.insert_one(new_folder)
                curr_parent = new_fid

            folder_cache[accumulated] = curr_parent

        return curr_parent

    # Check user storage against 400GB individual quota
    storage_agg = await mongo_db.file_metadata.aggregate([
        {"$match": {"owner_id": current_user.id, "is_folder": False, "is_trashed": False}},
        {"$group": {"_id": None, "total_bytes": {"$sum": "$file_size"}}}
    ]).to_list(length=1)
    current_storage = storage_agg[0]["total_bytes"] if storage_agg else 0

    if current_storage >= USER_STORAGE_QUOTA_BYTES:
        raise HTTPException(
            status_code=400,
            detail="Storage quota limit reached (500 MB). Delete files from your vault to free up space."
        )

    for upload, rel_path in zip(files, relative_paths):
        dir_name = os.path.dirname(rel_path.replace("\\", "/"))
        target_folder_id = await resolve_folder_id(dir_name)

        ext = Path(upload.filename).suffix.lower()
        if ext in BLOCKED_EXTENSIONS:
            continue

        file_id = str(uuid.uuid4())
        safe_name = f"{file_id}_{Path(upload.filename).name.replace(' ', '_')}"

        content_bytes = await upload.read()
        file_size = len(content_bytes)

        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File '{upload.filename}' exceeds maximum allowable size of 500MB."
            )
        if current_storage + file_size > USER_STORAGE_QUOTA_BYTES:
            remaining = max(0, USER_STORAGE_QUOTA_BYTES - current_storage)
            raise HTTPException(
                status_code=400,
                detail=f"Upload would exceed your 500 MB quota. Remaining space: {remaining // (1024*1024)} MB."
            )

        # Milestone 2 Task (i) & (vii): Perform AES-256-GCM Server-Side Envelope Encryption
        enc_res = encrypt_file_data(content_bytes, file_id)

        # Milestone 2 Task (ii): Secure Vault Storage (zero plaintext on disk)
        cipher_len, rel_path_stored = storage_service.save_ciphertext(safe_name, enc_res["ciphertext"])

        current_storage += file_size
        now = datetime.now(timezone.utc).isoformat()
        file_doc = {
            "_id": file_id,
            "owner_id": current_user.id,
            "owner_username": current_user.username,
            "name": Path(rel_path).name,
            "stored_filename": safe_name,
            "file_path": rel_path_stored,
            "file_size": file_size,
            "cipher_size": cipher_len,
            "mime_type": upload.content_type or "application/octet-stream",
            "category": get_file_category(upload.filename),
            "parent_folder_id": target_folder_id,
            "is_folder": False,
            "is_encrypted": True,
            "encryption_algorithm": enc_res["encryption_algorithm"],
            "envelope_version": enc_res["envelope_version"],
            "file_iv": enc_res["file_iv"],
            "file_tag": enc_res["file_tag"],
            "dek_info": enc_res["dek_info"],
            "sha256_checksum": enc_res["sha256_checksum"],
            "is_password_protected": is_protected,
            "password_hash": pwd_hash,
            "is_starred": False,
            "is_trashed": False,
            "downloads_count": 0,
            "created_at": now,
            "updated_at": now
        }
        await mongo_db.file_metadata.insert_one(file_doc)

        try:
            with SessionLocal() as db_session:
                pg_record = FileRecord(
                    id=file_id,
                    owner_id=current_user.id,
                    name=Path(rel_path).name,
                    stored_filename=safe_name,
                    file_path=rel_path_stored,
                    storage_provider=storage_service.provider_name,
                    file_size=file_size,
                    cipher_size=cipher_len,
                    mime_type=upload.content_type or "application/octet-stream",
                    category=get_file_category(upload.filename),
                    parent_folder_id=target_folder_id,
                    is_folder=False,
                    is_encrypted=True,
                    encryption_algorithm=enc_res["encryption_algorithm"],
                    envelope_version=enc_res["envelope_version"],
                    file_iv=enc_res["file_iv"],
                    file_tag=enc_res["file_tag"],
                    encrypted_dek=enc_res["dek_info"]["encrypted_dek"],
                    dek_iv=enc_res["dek_info"]["dek_iv"],
                    dek_tag=enc_res["dek_info"]["dek_tag"],
                    sha256_checksum=enc_res["sha256_checksum"],
                    is_password_protected=is_protected,
                    password_hash=pwd_hash,
                    is_starred=False,
                    is_trashed=False,
                    downloads_count=0
                )
                db_session.add(pg_record)
                db_session.commit()
        except Exception:
            pass

        uploaded_files.append(sanitize_item(file_doc))

    await log_activity(
        user_id=current_user.id,
        username=current_user.username,
        action="FOLDER_UPLOAD",
        ip_address=request.client.host if request.client else "127.0.0.1",
        details={"files_count": len(uploaded_files), "folders_created": len(folder_cache)}
    )

    return {
        "status": "success",
        "files_uploaded": len(uploaded_files),
        "folders_structured": len(folder_cache),
        "files": uploaded_files
    }


# ==============================================================================
# 5. USER PERSONAL ACTIVITY LOGS
# ==============================================================================
@router.get("/activity-logs")
async def get_user_activity_logs(
    limit: int = Query(50, ge=1, le=200),
    days: Optional[int] = Query(30, ge=1, le=365),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user)
):
    now_utc = datetime.now(timezone.utc)
    if start_date and end_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=timezone.utc)
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=timezone.utc)
            num_days = max(1, (end_dt.date() - start_dt.date()).days + 1)
        except Exception:
            num_days = days if days else 30
            end_dt = now_utc
            start_dt = end_dt - timedelta(days=num_days - 1)
    else:
        num_days = days if days else 30
        end_dt = now_utc
        start_dt = end_dt - timedelta(days=num_days - 1)

    since_iso = start_dt.isoformat()
    until_iso = (end_dt + timedelta(days=1)).isoformat()

    query: Dict[str, Any] = {
        "user_id": current_user.id,
        "timestamp": {"$gte": since_iso, "$lt": until_iso}
    }
    if action and action != "ALL":
        query["action"] = action

    cursor = mongo_db.activity_logs.find(query).sort("timestamp", -1).limit(limit)
    logs = await cursor.to_list(length=limit)
    total = await mongo_db.activity_logs.count_documents(query)

    return {
        "logs": [sanitize_item(l) for l in logs],
        "total": total,
        "date_range": f"{start_dt.strftime('%b %d, %Y')} - {end_dt.strftime('%b %d, %Y')}",
        "days": num_days
    }


# ==============================================================================
# 6. PASSWORD PROTECTION (SET, VERIFY, REMOVE)
# ==============================================================================
@router.post("/{item_id}/password")
async def update_item_password(
    item_id: str,
    req: SetPasswordRequest,
    current_user: User = Depends(get_current_user)
):
    item = await mongo_db.file_metadata.find_one({"_id": item_id, "owner_id": current_user.id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    if req.action == "remove":
        await mongo_db.file_metadata.update_one(
            {"_id": item_id},
            {"$set": {"is_password_protected": False, "password_hash": None, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        await log_activity(
            user_id=current_user.id,
            username=current_user.username,
            action="PASSWORD_REMOVED",
            resource_id=item_id,
            resource_name=item["name"]
        )
        return {"status": "success", "message": "Password protection removed successfully."}

    # Setting new password
    if not req.password or not req.password.strip():
        raise HTTPException(status_code=400, detail="Password cannot be blank.")

    pwd_hash = hash_password(req.password.strip())
    await mongo_db.file_metadata.update_one(
        {"_id": item_id},
        {"$set": {"is_password_protected": True, "password_hash": pwd_hash, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    await log_activity(
        user_id=current_user.id,
        username=current_user.username,
        action="PASSWORD_SET",
        resource_id=item_id,
        resource_name=item["name"]
    )

    return {"status": "success", "message": "Item is now password protected."}


@router.post("/{item_id}/verify-password")
async def verify_item_password(
    item_id: str,
    req: VerifyPasswordRequest,
    current_user: User = Depends(get_current_user)
):
    item = await mongo_db.file_metadata.find_one({"_id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    if not item.get("is_password_protected"):
        return {"valid": True, "message": "Item is not password protected."}

    stored_hash = item.get("password_hash")
    if not stored_hash or not verify_password(req.password, stored_hash):
        await log_activity(
            user_id=current_user.id,
            username=current_user.username,
            action="PASSWORD_VERIFY_FAILED",
            resource_id=item_id,
            resource_name=item.get("name", "Unknown Item"),
            details={"error": "Incorrect password entered", "item_type": "folder" if item.get("is_folder") else "file"}
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Incorrect password. Access denied.")

    await log_activity(
        user_id=current_user.id,
        username=current_user.username,
        action="PASSWORD_VERIFIED",
        resource_id=item_id,
        resource_name=item["name"]
    )

    return {"valid": True, "message": "Password verified successfully."}


# ==============================================================================
# 6. DOWNLOAD FILE (WITH PASSWORD VALIDATION)
# ==============================================================================
@router.get("/{item_id}/download")
async def download_file(
    item_id: str,
    password: Optional[str] = Query(None),
    share_token: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user)
):
    item = await mongo_db.file_metadata.find_one({"_id": item_id, "is_folder": False})
    if not item:
        raise HTTPException(status_code=404, detail="File not found.")

    # Role / Owner / Sharing Permission check (Milestone 2 - Task Three):
    # Admins, verified owners, or users with valid sharing permissions can download
    has_permission = False
    if item["owner_id"] == current_user.id or current_user.role == UserRole.ADMIN:
        has_permission = True
    else:
        # Check if user has received sharing permission via email or share token
        share_query: Dict[str, Any] = {"item_id": item_id, "is_active": True}
        if share_token:
            token_hash = hashlib.sha256(share_token.encode("utf-8")).hexdigest()
            share_query["$or"] = [{"share_token": share_token}, {"share_token_hash": token_hash}]
        else:
            share_query["recipient_email"] = current_user.email

        share = await mongo_db.file_shares.find_one(share_query)
        if share:
            now = datetime.now(timezone.utc)
            if share.get("expires_at"):
                exp = datetime.fromisoformat(share["expires_at"].replace("Z", "+00:00"))
                if now > exp:
                    raise HTTPException(status_code=410, detail="This shared file access has expired.")
            if share.get("permission") == "view":
                raise HTTPException(status_code=403, detail="Permission denied. You have view-only access to this file.")
            if share.get("max_downloads") and share.get("downloads_count", 0) >= share["max_downloads"]:
                raise HTTPException(status_code=410, detail="Maximum download limit reached for this shared file.")
            has_permission = True

    if not has_permission:
        raise HTTPException(status_code=403, detail="Permission denied to access this file.")

    # Check password protection if enabled
    if item.get("is_password_protected"):
        if not password:
            await log_activity(
                user_id=current_user.id,
                username=current_user.username,
                action="PASSWORD_VERIFY_FAILED",
                resource_id=item_id,
                resource_name=item.get("name", "Unknown Item"),
                details={"error": "Password required but not provided", "item_type": "file"}
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This file is password-protected. Please provide the access password."
            )
        if not verify_password(password, item.get("password_hash", "")):
            await log_activity(
                user_id=current_user.id,
                username=current_user.username,
                action="PASSWORD_VERIFY_FAILED",
                resource_id=item_id,
                resource_name=item.get("name", "Unknown Item"),
                details={"error": "Incorrect password entered", "item_type": "file"}
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Incorrect password. Access denied.")

    # Locate file on storage
    stored_name = item.get("stored_filename")
    if not storage_service.exists(stored_name):
        raise HTTPException(status_code=404, detail="Physical file not found on storage server.")

    # Increment download counter
    await mongo_db.file_metadata.update_one({"_id": item_id}, {"$inc": {"downloads_count": 1}})

    # Milestone 2 Task (viii): Decrypt on-the-fly if AES-256-GCM encrypted
    if item.get("is_encrypted") and "dek_info" in item:
        ciphertext = storage_service.read_ciphertext(stored_name)
        try:
            plaintext = decrypt_file_data(
                ciphertext_bytes=ciphertext,
                dek_info=item["dek_info"],
                file_iv_b64=item["file_iv"],
                file_tag_b64=item["file_tag"],
                file_id=item["_id"]
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Cryptographic integrity verification failed: {str(e)}"
            )

        await log_activity(
            user_id=current_user.id,
            username=current_user.username,
            action="FILE_DOWNLOAD",
            resource_id=item_id,
            resource_name=item["name"],
            details={"size_bytes": len(plaintext), "encryption": "AES-256-GCM Authenticated Decryption"}
        )

        return StreamingResponse(
            io.BytesIO(plaintext),
            media_type=item.get("mime_type", "application/octet-stream"),
            headers={"Content-Disposition": f'attachment; filename="{item["name"]}"'}
        )
    else:
        # Legacy unencrypted file
        disk_path = storage_service.get_absolute_path(stored_name)
        await log_activity(
            user_id=current_user.id,
            username=current_user.username,
            action="FILE_DOWNLOAD",
            resource_id=item_id,
            resource_name=item["name"],
            details={"size_bytes": item["file_size"]}
        )
        return FileResponse(
            path=str(disk_path),
            filename=item["name"],
            media_type=item.get("mime_type", "application/octet-stream")
        )


# ==============================================================================
# 7. DOWNLOAD FOLDER AS ZIP (FOLDER-WISE DOWNLOAD)
# ==============================================================================
@router.get("/{item_id}/download-folder")
async def download_folder_zip(
    item_id: str,
    password: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user)
):
    folder = await mongo_db.file_metadata.find_one({"_id": item_id, "is_folder": True})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found.")

    if folder["owner_id"] != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Permission denied to access this folder.")

    if folder.get("is_password_protected"):
        if not password:
            await log_activity(
                user_id=current_user.id,
                username=current_user.username,
                action="PASSWORD_VERIFY_FAILED",
                resource_id=item_id,
                resource_name=folder.get("name", "Unknown Item"),
                details={"error": "Password required but not provided", "item_type": "folder"}
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This folder is password-protected. Please provide the access password."
            )
        if not verify_password(password, folder.get("password_hash", "")):
            await log_activity(
                user_id=current_user.id,
                username=current_user.username,
                action="PASSWORD_VERIFY_FAILED",
                resource_id=item_id,
                resource_name=folder.get("name", "Unknown Item"),
                details={"error": "Incorrect folder password entered", "item_type": "folder"}
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Incorrect folder password. Access denied.")

    # Recursively gather all folders and files inside
    zip_buffer = io.BytesIO()

    async def add_folder_to_zip(zip_archive: zipfile.ZipFile, parent_id: str, current_zip_path: str):
        # Fetch child items
        children = await mongo_db.file_metadata.find({
            "owner_id": folder["owner_id"],
            "parent_folder_id": parent_id,
            "is_trashed": False
        }).to_list(length=2000)

        for child in children:
            if child["is_folder"]:
                new_path = f"{current_zip_path}/{child['name']}"
                await add_folder_to_zip(zip_archive, child["_id"], new_path)
            else:
                stored = child.get("stored_filename")
                if stored and storage_service.exists(stored):
                    archive_name = f"{current_zip_path}/{child['name']}"
                    if child.get("is_encrypted") and "dek_info" in child:
                        ciphertext = storage_service.read_ciphertext(stored)
                        plaintext = decrypt_file_data(
                            ciphertext_bytes=ciphertext,
                            dek_info=child["dek_info"],
                            file_iv_b64=child["file_iv"],
                            file_tag_b64=child["file_tag"],
                            file_id=child["_id"]
                        )
                        zip_archive.writestr(archive_name, plaintext)
                    else:
                        child_file = storage_service.get_absolute_path(stored)
                        zip_archive.write(child_file, arcname=archive_name)

    with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        await add_folder_to_zip(zf, folder["_id"], folder["name"])

    zip_buffer.seek(0)

    await log_activity(
        user_id=current_user.id,
        username=current_user.username,
        action="FOLDER_DOWNLOAD_ZIP",
        resource_id=item_id,
        resource_name=folder["name"]
    )

    zip_filename = f"{folder['name']}.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'}
    )


# ==============================================================================
# 8. UPDATE ITEM (RENAME, STAR, MOVE, TRASH/RESTORE)
# ==============================================================================
@router.patch("/{item_id}")
async def update_item(
    item_id: str,
    req: UpdateItemRequest,
    current_user: User = Depends(get_current_user)
):
    item = await mongo_db.file_metadata.find_one({"_id": item_id, "owner_id": current_user.id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    update_fields: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if req.name is not None and req.name.strip():
        update_fields["name"] = req.name.strip()
    if req.is_starred is not None:
        update_fields["is_starred"] = req.is_starred
    if req.parent_folder_id is not None:
        update_fields["parent_folder_id"] = req.parent_folder_id if req.parent_folder_id != "root" else None
    if req.is_trashed is not None:
        update_fields["is_trashed"] = req.is_trashed

    await mongo_db.file_metadata.update_one({"_id": item_id}, {"$set": update_fields})
    updated = await mongo_db.file_metadata.find_one({"_id": item_id})

    action = "FILE_UPDATE"
    if req.is_trashed is True:
        action = "FILE_TRASHED"
    elif req.is_trashed is False:
        action = "FILE_RESTORED"

    await log_activity(
        user_id=current_user.id,
        username=current_user.username,
        action=action,
        resource_id=item_id,
        resource_name=item["name"],
        details=req.model_dump(exclude_none=True)
    )

    return sanitize_item(updated)


# ==============================================================================
# 9. DELETE ITEM (SOFT DELETE OR PERMANENT)
# ==============================================================================
@router.delete("/{item_id}")
async def delete_item(
    item_id: str,
    permanent: bool = Query(False),
    current_user: User = Depends(get_current_user)
):
    item = await mongo_db.file_metadata.find_one({"_id": item_id, "owner_id": current_user.id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    if not permanent and not item.get("is_trashed"):
        # Soft delete (Move to Trash)
        await mongo_db.file_metadata.update_one(
            {"_id": item_id},
            {"$set": {"is_trashed": True, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        await log_activity(
            user_id=current_user.id,
            username=current_user.username,
            action="FILE_TRASHED",
            resource_id=item_id,
            resource_name=item["name"]
        )
        return {"status": "success", "message": "Moved to Trash."}

    # Permanent deletion
    async def delete_recursively(target_id: str):
        target = await mongo_db.file_metadata.find_one({"_id": target_id})
        if not target:
            return
        if target.get("is_folder"):
            sub_items = await mongo_db.file_metadata.find({"parent_folder_id": target_id}).to_list(length=1000)
            for sub in sub_items:
                await delete_recursively(sub["_id"])
        else:
            stored = target.get("stored_filename")
            if stored:
                f_path = STORAGE_DIR / stored
                if f_path.exists():
                    f_path.unlink()
        await mongo_db.file_metadata.delete_one({"_id": target_id})
        # Deactivate any active share links for this deleted file
        await mongo_db.file_shares.update_many(
            {"item_id": target_id},
            {"$set": {"is_active": False, "revoked_at": datetime.now(timezone.utc).isoformat()}}
        )
        try:
            with SessionLocal() as db_session:
                pg_file = db_session.query(FileRecord).filter(FileRecord.id == target_id).first()
                if pg_file:
                    db_session.delete(pg_file)
                    db_session.commit()
        except Exception:
            pass

    await delete_recursively(item_id)

    await log_activity(
        user_id=current_user.id,
        username=current_user.username,
        action="FILE_DELETE_PERMANENT",
        resource_id=item_id,
        resource_name=item["name"]
    )

    return {"status": "success", "message": "Permanently deleted."}


# ==============================================================================
# 11. REGULAR USER FILE ANALYTICS ENDPOINT
# ==============================================================================
@router.get("/analytics")
async def get_user_file_analytics(
    days: int = Query(30, ge=1, le=365),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    storage_view: Optional[str] = Query("type"),
    current_user: User = Depends(get_current_user)
):
    """
    Returns dynamic, real-valued file analytics, storage breakdown, upload trends,
    download analytics, sharing activity, and recent transaction history for the authenticated user.
    Supports flexible date filtering (days / custom date ranges).
    """
    now_utc = datetime.now(timezone.utc)

    # Resolve date boundaries
    if start_date and end_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=timezone.utc)
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=timezone.utc)
        except Exception:
            end_dt = now_utc
            start_dt = end_dt - timedelta(days=max(1, min(days, 365)) - 1)
    else:
        num_days = max(1, min(days, 365))
        end_dt = now_utc
        start_dt = end_dt - timedelta(days=num_days - 1)

    # 1. Gather all non-folder, non-trashed files owned by current user
    user_files = await mongo_db.file_metadata.find({
        "owner_id": current_user.id,
        "is_folder": False,
        "is_trashed": False
    }).to_list(length=5000)

    user_file_ids = [str(f["_id"]) for f in user_files]
    live_file_count = len(user_files)
    live_storage_bytes = sum(f.get("file_size", 0) for f in user_files)

    # User active shares count
    user_shares_count = await mongo_db.file_shares.count_documents({
        "owner_id": current_user.id,
        "is_active": True
    })

    # User total downloads: sum of downloads_count on user files + activity logs
    files_dl_sum = sum(f.get("downloads_count", 0) for f in user_files)
    dl_logs_count = 0
    if user_file_ids:
        dl_logs_count = await mongo_db.activity_logs.count_documents({
            "action": {"$in": ["FILE_DOWNLOAD", "SHARE_FILE_DOWNLOAD", "FOLDER_DOWNLOAD"]},
            "resource_id": {"$in": user_file_ids}
        })
    user_downloads_count = max(files_dl_sum, dl_logs_count)

    def fmt_sz(b: int) -> str:
        if b >= 1024 * 1024 * 1024:
            return f"{round(b / (1024**3), 2)} GB"
        if b >= 1024 * 1024:
            return f"{round(b / (1024**2), 1)} MB"
        if b >= 1024:
            return f"{round(b / 1024, 1)} KB"
        return f"{b} B"

    storage_used_str = fmt_sz(live_storage_bytes)

    # User standard quota: 100 GB
    quota_bytes = 100 * 1024 * 1024 * 1024
    storage_percentage = min(100.0, round((live_storage_bytes / max(quota_bytes, 1)) * 100, 2))

    # Compute growth over the selected period
    range_start_iso = start_dt.isoformat()
    period_files = [f for f in user_files if f.get("created_at", "") >= range_start_iso]
    period_uploads_count = len(period_files)
    period_storage_bytes = sum(f.get("file_size", 0) for f in period_files)

    uploads_change = round((period_uploads_count / max(live_file_count, 1)) * 100) if live_file_count > 0 else 0
    storage_change = round((period_storage_bytes / max(live_storage_bytes, 1)) * 100) if live_storage_bytes > 0 else 0
    downloads_change = 100 if user_downloads_count > 0 else 0
    shares_change = 100 if user_shares_count > 0 else 0

    # 2. Dynamic Storage Breakdowns
    # (a) By File Type
    doc_exts = {".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt", ".md"}
    img_exts = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"}
    vid_exts = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv"}

    doc_bytes = sum(f.get("file_size", 0) for f in user_files if Path(f.get("name", "")).suffix.lower() in doc_exts)
    img_bytes = sum(f.get("file_size", 0) for f in user_files if Path(f.get("name", "")).suffix.lower() in img_exts)
    vid_bytes = sum(f.get("file_size", 0) for f in user_files if Path(f.get("name", "")).suffix.lower() in vid_exts)
    oth_bytes = max(0, live_storage_bytes - (doc_bytes + img_bytes + vid_bytes))

    tot_b = max(live_storage_bytes, 1)
    if live_storage_bytes > 0:
        pct_doc = round((doc_bytes / tot_b) * 100)
        pct_img = round((img_bytes / tot_b) * 100)
        pct_vid = round((vid_bytes / tot_b) * 100)
        pct_oth = max(0, 100 - (pct_doc + pct_img + pct_vid))
    else:
        pct_doc, pct_img, pct_vid, pct_oth = 0, 0, 0, 0

    storage_breakdown_by_type = [
        {"name": "Documents", "size_str": fmt_sz(doc_bytes), "percentage": pct_doc, "color": "#3B82F6"},
        {"name": "Images", "size_str": fmt_sz(img_bytes), "percentage": pct_img, "color": "#06B6D4"},
        {"name": "Videos", "size_str": fmt_sz(vid_bytes), "percentage": pct_vid, "color": "#EC4899"},
        {"name": "Others", "size_str": fmt_sz(oth_bytes), "percentage": pct_oth, "color": "#8B5CF6"},
    ]

    # (b) By Category
    categories_map = {
        "document": {"label": "Documents", "color": "#3B82F6", "bytes": 0},
        "spreadsheet": {"label": "Spreadsheets", "color": "#10B981", "bytes": 0},
        "presentation": {"label": "Presentations", "color": "#F59E0B", "bytes": 0},
        "code": {"label": "Code & Data", "color": "#8B5CF6", "bytes": 0},
        "archive": {"label": "Archives", "color": "#6366F1", "bytes": 0},
        "image": {"label": "Visual Media", "color": "#06B6D4", "bytes": 0},
        "other": {"label": "Other Files", "color": "#94A3B8", "bytes": 0},
    }
    for f in user_files:
        cat = (f.get("category") or "other").lower()
        if cat not in categories_map:
            cat = "other"
        categories_map[cat]["bytes"] += f.get("file_size", 0)

    storage_breakdown_by_category = []
    for k, v in categories_map.items():
        if v["bytes"] > 0 or live_storage_bytes == 0:
            pct = round((v["bytes"] / tot_b) * 100) if live_storage_bytes > 0 else 0
            storage_breakdown_by_category.append({
                "name": v["label"],
                "size_str": fmt_sz(v["bytes"]),
                "percentage": pct,
                "color": v["color"]
            })
    if not storage_breakdown_by_category:
        storage_breakdown_by_category = storage_breakdown_by_type

    # (c) By File Size Tier
    tier_small = sum(f.get("file_size", 0) for f in user_files if f.get("file_size", 0) < 1024 * 1024)
    tier_med = sum(f.get("file_size", 0) for f in user_files if 1024 * 1024 <= f.get("file_size", 0) < 10 * 1024 * 1024)
    tier_lrg = sum(f.get("file_size", 0) for f in user_files if f.get("file_size", 0) >= 10 * 1024 * 1024)

    storage_breakdown_by_size = [
        {"name": "Small (< 1 MB)", "size_str": fmt_sz(tier_small), "percentage": round((tier_small / tot_b) * 100) if live_storage_bytes else 0, "color": "#10B981"},
        {"name": "Medium (1-10 MB)", "size_str": fmt_sz(tier_med), "percentage": round((tier_med / tot_b) * 100) if live_storage_bytes else 0, "color": "#3B82F6"},
        {"name": "Large (> 10 MB)", "size_str": fmt_sz(tier_lrg), "percentage": round((tier_lrg / tot_b) * 100) if live_storage_bytes else 0, "color": "#F59E0B"},
    ]

    active_storage_breakdown = (
        storage_breakdown_by_category if storage_view == "category"
        else storage_breakdown_by_size if storage_view == "size"
        else storage_breakdown_by_type
    )

    # 3. Dynamic Timeline generation based on date boundaries
    total_range_days = max(1, (end_dt.date() - start_dt.date()).days + 1)
    timeline_days = []
    curr = start_dt
    while curr.date() <= end_dt.date():
        timeline_days.append({
            "date_iso": curr.strftime("%Y-%m-%d"),
            "label": curr.strftime("%b %d")
        })
        curr += timedelta(days=1)

    # Uploads by date
    files_by_day = {}
    for f in user_files:
        c_at = f.get("created_at")
        if c_at:
            day_key = str(c_at)[:10]
            if day_key not in files_by_day:
                files_by_day[day_key] = []
            files_by_day[day_key].append(f)

    upload_reports = []
    for td in timeline_days:
        day_files = files_by_day.get(td["date_iso"], [])
        d_cnt = sum(1 for f in day_files if Path(f.get("name", "")).suffix.lower() in doc_exts)
        i_cnt = sum(1 for f in day_files if Path(f.get("name", "")).suffix.lower() in img_exts)
        v_cnt = sum(1 for f in day_files if Path(f.get("name", "")).suffix.lower() in vid_exts)
        o_cnt = len(day_files) - (d_cnt + i_cnt + v_cnt)
        upload_reports.append({
            "date": td["label"],
            "documents": d_cnt,
            "images": i_cnt,
            "videos": v_cnt,
            "others": max(0, o_cnt)
        })

    # Download analytics by date
    recent_dl_logs = []
    if user_file_ids:
        dl_cursor = mongo_db.activity_logs.find({
            "action": {"$in": ["FILE_DOWNLOAD", "SHARE_FILE_DOWNLOAD", "FOLDER_DOWNLOAD"]},
            "resource_id": {"$in": user_file_ids}
        }).sort("timestamp", -1).limit(500)
        recent_dl_logs = await dl_cursor.to_list(length=500)

    dl_by_day = {}
    for log in recent_dl_logs:
        ts = log.get("timestamp")
        if ts:
            day_key = str(ts)[:10]
            if day_key not in dl_by_day:
                dl_by_day[day_key] = []
            dl_by_day[day_key].append(log)

    download_analytics = []
    for td in timeline_days:
        day_logs = dl_by_day.get(td["date_iso"], [])
        tot_dl = len(day_logs)
        unq_users = len({l.get("username") or l.get("ip_address") for l in day_logs})
        shared_dl = sum(1 for l in day_logs if l.get("action") == "SHARE_FILE_DOWNLOAD")
        download_analytics.append({
            "date": td["label"],
            "total_downloads": tot_dl,
            "unique_users": unq_users,
            "shared_downloads": shared_dl
        })

    # Sharing reports by date
    user_shares = await mongo_db.file_shares.find({"owner_id": current_user.id}).to_list(length=500)
    shares_by_day = {}
    for s in user_shares:
        c_at = s.get("created_at")
        if c_at:
            day_key = str(c_at)[:10]
            if day_key not in shares_by_day:
                shares_by_day[day_key] = []
            shares_by_day[day_key].append(s)

    sharing_reports = []
    for td in timeline_days:
        day_shares = shares_by_day.get(td["date_iso"], [])
        ds = sum(1 for s in day_shares if s.get("permission") == "view")
        ls = sum(1 for s in day_shares if s.get("permission") == "download")
        is_cnt = sum(1 for s in day_shares if s.get("guest_password_hash"))
        sharing_reports.append({
            "date": td["label"],
            "direct_share": ds,
            "link_share": ls,
            "internal_share": is_cnt
        })

    # Recent uploads (actual user files sorted by created_at desc)
    recent_uploads = []
    for uf in sorted(user_files, key=lambda x: x.get("created_at", ""), reverse=True)[:10]:
        ext = Path(uf.get("name", "")).suffix.replace(".", "").upper() or "FILE"
        sz_bytes = uf.get("file_size", 0)
        created_ts = uf.get("created_at")
        dt_str = "Recently"
        if created_ts:
            try:
                dt = datetime.fromisoformat(created_ts.replace("Z", "+00:00"))
                dt_str = dt.strftime("%d %b %Y, %I:%M %p")
            except Exception:
                pass
        recent_uploads.append({
            "name": uf.get("name"),
            "size": fmt_sz(sz_bytes),
            "type": ext,
            "date": dt_str
        })

    # Recent downloads (actual downloads of user's files)
    recent_downloads = []
    for dl in recent_dl_logs[:10]:
        ts = dl.get("timestamp")
        dt_str = "Recently"
        if ts:
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                dt_str = dt.strftime("%d %b %Y, %I:%M %p")
            except Exception:
                pass
        f_match = next((f for f in user_files if str(f["_id"]) == dl.get("resource_id")), None)
        sz_str = fmt_sz(f_match.get("file_size", 0)) if f_match else "N/A"
        raw_user = dl.get("username") or "Guest User"
        is_self = (raw_user == current_user.username)
        display_user = "You (Owner)" if is_self else raw_user

        recent_downloads.append({
            "name": dl.get("resource_name") or "File Asset",
            "downloaded_by": display_user,
            "raw_username": raw_user,
            "is_self": is_self,
            "size": sz_str,
            "date": dt_str
        })

    date_range_str = f"{start_dt.strftime('%b %d, %Y')} - {end_dt.strftime('%b %d, %Y')}"

    return {
        "summary": {
            "total_storage_used": storage_used_str,
            "total_storage_limit": "100 GB",
            "storage_percentage": storage_percentage,
            "storage_change": storage_change,
            "total_uploads": live_file_count,
            "uploads_change": uploads_change,
            "total_downloads": user_downloads_count,
            "downloads_change": downloads_change,
            "total_shares": user_shares_count,
            "shares_change": shares_change
        },
        "storage_breakdown": active_storage_breakdown,
        "storage_breakdown_by_type": storage_breakdown_by_type,
        "storage_breakdown_by_category": storage_breakdown_by_category,
        "storage_breakdown_by_size": storage_breakdown_by_size,
        "upload_reports": upload_reports,
        "download_analytics": download_analytics,
        "sharing_reports": sharing_reports,
        "recent_uploads": recent_uploads,
        "recent_downloads": recent_downloads,
        "date_range": date_range_str,
        "days": total_range_days
    }

