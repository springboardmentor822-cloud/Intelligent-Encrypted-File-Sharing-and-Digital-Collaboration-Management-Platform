import os
import io
import uuid
import shutil
import zipfile
from datetime import datetime, timezone
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

from app.database import mongo_db, redis_client
from app.models import User, UserRole
from app.security import get_current_user, hash_password, verify_password
from app.services.logger import log_activity
from app.services.rate_limiter import check_rate_limit

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
    """Strip sensitive fields like password_hash before returning to client"""
    if not doc:
        return {}
    clean = dict(doc)
    if "_id" in clean:
        clean["id"] = str(clean.pop("_id"))
    elif "id" not in clean:
        clean["id"] = str(clean.get("_id", ""))
    clean.pop("password_hash", None)
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
        query["is_password_protected"] = True
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
    items = [sanitize_item(d) for d in docs]

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
        "user_total_files": user_total_files
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
        destination_path = STORAGE_DIR / safe_name

        # Stream copy to disk safely while checking file size limit & quota
        file_size = 0
        with open(destination_path, "wb") as buffer:
            while chunk := await upload.read(1024 * 1024):  # 1MB buffer
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE:
                    buffer.close()
                    if destination_path.exists():
                        destination_path.unlink()
                    raise HTTPException(
                        status_code=400,
                        detail=f"File '{upload.filename}' exceeds maximum allowable size of 500MB."
                    )
                if current_storage + file_size > USER_STORAGE_QUOTA_BYTES:
                    buffer.close()
                    if destination_path.exists():
                        destination_path.unlink()
                    remaining = max(0, USER_STORAGE_QUOTA_BYTES - current_storage)
                    raise HTTPException(
                        status_code=400,
                        detail=f"Upload would exceed your 500 MB quota. Remaining space: {remaining // (1024*1024)} MB."
                    )
                buffer.write(chunk)

        current_storage += file_size
        now = datetime.now(timezone.utc).isoformat()
        file_doc = {
            "_id": file_id,
            "owner_id": current_user.id,
            "owner_username": current_user.username,
            "name": upload.filename,
            "stored_filename": safe_name,
            "file_path": str(destination_path.relative_to(STORAGE_DIR.parent)),
            "file_size": file_size,
            "mime_type": upload.content_type or "application/octet-stream",
            "category": get_file_category(upload.filename),
            "parent_folder_id": parent_folder_id,
            "is_folder": False,
            "is_password_protected": is_protected,
            "password_hash": pwd_hash,
            "is_starred": False,
            "is_trashed": False,
            "downloads_count": 0,
            "created_at": now,
            "updated_at": now
        }

        await mongo_db.file_metadata.insert_one(file_doc)
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
        dest_path = STORAGE_DIR / safe_name

        file_size = 0
        with open(dest_path, "wb") as buffer:
            while chunk := await upload.read(1024 * 1024):
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE:
                    buffer.close()
                    if dest_path.exists():
                        dest_path.unlink()
                    raise HTTPException(
                        status_code=400,
                        detail=f"File '{upload.filename}' exceeds maximum allowable size of 500MB."
                    )
                if current_storage + file_size > USER_STORAGE_QUOTA_BYTES:
                    buffer.close()
                    if dest_path.exists():
                        dest_path.unlink()
                    remaining = max(0, USER_STORAGE_QUOTA_BYTES - current_storage)
                    raise HTTPException(
                        status_code=400,
                        detail=f"Upload would exceed your 500 MB quota. Remaining space: {remaining // (1024*1024)} MB."
                    )
                buffer.write(chunk)

        current_storage += file_size

        now = datetime.now(timezone.utc).isoformat()
        file_doc = {
            "_id": file_id,
            "owner_id": current_user.id,
            "owner_username": current_user.username,
            "name": Path(rel_path).name,
            "stored_filename": safe_name,
            "file_path": str(dest_path.relative_to(STORAGE_DIR.parent)),
            "file_size": file_size,
            "mime_type": upload.content_type or "application/octet-stream",
            "category": get_file_category(upload.filename),
            "parent_folder_id": target_folder_id,
            "is_folder": False,
            "is_password_protected": is_protected,
            "password_hash": pwd_hash,
            "is_starred": False,
            "is_trashed": False,
            "downloads_count": 0,
            "created_at": now,
            "updated_at": now
        }
        await mongo_db.file_metadata.insert_one(file_doc)
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
    current_user: User = Depends(get_current_user)
):
    cursor = mongo_db.activity_logs.find({"user_id": current_user.id}).sort("timestamp", -1).limit(limit)
    logs = await cursor.to_list(length=limit)
    total = await mongo_db.activity_logs.count_documents({"user_id": current_user.id})
    return {"logs": [sanitize_item(l) for l in logs], "total": total}


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
    current_user: User = Depends(get_current_user)
):
    item = await mongo_db.file_metadata.find_one({"_id": item_id, "is_folder": False})
    if not item:
        raise HTTPException(status_code=404, detail="File not found.")

    # Role / Owner check: Admins or verified owners can download
    if item["owner_id"] != current_user.id and current_user.role != UserRole.ADMIN:
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

    # Locate file on disk
    stored_name = item.get("stored_filename")
    disk_path = STORAGE_DIR / stored_name
    if not disk_path.exists():
        raise HTTPException(status_code=404, detail="Physical file not found on storage server.")

    # Increment download counter
    await mongo_db.file_metadata.update_one({"_id": item_id}, {"$inc": {"downloads_count": 1}})

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
                child_file = STORAGE_DIR / stored
                if child_file.exists():
                    archive_name = f"{current_zip_path}/{child['name']}"
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

    await delete_recursively(item_id)

    await log_activity(
        user_id=current_user.id,
        username=current_user.username,
        action="FILE_DELETE_PERMANENT",
        resource_id=item_id,
        resource_name=item["name"]
    )

    return {"status": "success", "message": "Permanently deleted."}
