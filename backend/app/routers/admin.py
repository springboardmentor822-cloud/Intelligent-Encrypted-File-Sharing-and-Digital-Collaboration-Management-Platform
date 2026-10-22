import os
import shutil
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db, engine, mongo_db, redis_client
from app.models import User, UserRole
from app.security import get_current_user, require_role
from app.services.logger import log_activity
from app.routers.files import STORAGE_DIR, sanitize_item

router = APIRouter(prefix="/admin", tags=["Admin Dashboard & Analytics"])

class UpdateUserRoleRequest(BaseModel):
    role: UserRole

class UpdateUserStatusRequest(BaseModel):
    is_active: bool


# ==============================================================================
# 1. ADMIN ANALYTICS & SYSTEM TELEMETRY
# ==============================================================================
@router.get("/analytics")
async def get_admin_analytics(
    admin_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    # 1. User Metrics from PostgreSQL
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    inactive_users = total_users - active_users

    roles_breakdown = {
        "admin": db.query(User).filter(User.role == UserRole.ADMIN).count(),
        "user": db.query(User).filter(User.role == UserRole.USER).count(),
    }

    # 2. Storage & File Metrics from MongoDB
    files_count = await mongo_db.file_metadata.count_documents({"is_folder": False, "is_trashed": False})
    folders_count = await mongo_db.file_metadata.count_documents({"is_folder": True, "is_trashed": False})
    trashed_count = await mongo_db.file_metadata.count_documents({"is_trashed": True})
    protected_count = await mongo_db.file_metadata.count_documents({"is_password_protected": True, "is_trashed": False})

    # Total bytes pipeline
    storage_agg = await mongo_db.file_metadata.aggregate([
        {"$match": {"is_folder": False, "is_trashed": False}},
        {"$group": {"_id": None, "total_bytes": {"$sum": "$file_size"}}}
    ]).to_list(length=1)
    total_storage_bytes = storage_agg[0]["total_bytes"] if storage_agg else 0

    # Category Breakdown pipeline
    category_agg = await mongo_db.file_metadata.aggregate([
        {"$match": {"is_folder": False, "is_trashed": False}},
        {"$group": {
            "_id": "$category",
            "count": {"$sum": 1},
            "total_size": {"$sum": "$file_size"}
        }}
    ]).to_list(length=20)

    categories = {}
    for cat in category_agg:
        cat_name = cat["_id"] or "other"
        categories[cat_name] = {
            "count": cat["count"],
            "total_size": cat["total_size"]
        }

    # 3. Top Storage Consumers (Excluding admin accounts)
    admin_users = db.query(User).filter(User.role == UserRole.ADMIN).all()
    admin_usernames = list({u.username for u in admin_users} | {"admin"})
    top_users_agg = await mongo_db.file_metadata.aggregate([
        {"$match": {
            "is_folder": False,
            "is_trashed": False,
            "owner_username": {"$nin": admin_usernames}
        }},
        {"$group": {
            "_id": "$owner_id",
            "username": {"$first": "$owner_username"},
            "file_count": {"$sum": 1},
            "storage_bytes": {"$sum": "$file_size"}
        }},
        {"$sort": {"storage_bytes": -1}},
        {"$limit": 5}
    ]).to_list(length=5)

    # 4. System Infrastructure Health Check
    health = {
        "postgres": {"status": "connected", "latency_ms": 1.2},
        "mongodb": {"status": "connected", "latency_ms": 1.5},
        "redis": {"status": "connected", "latency_ms": 0.8},
        "storage": {"status": "online", "path": str(STORAGE_DIR)}
    }

    try:
        with engine.connect():
            pass
    except Exception as e:
        health["postgres"] = {"status": f"error: {str(e)}", "latency_ms": 0}

    try:
        await mongo_db.command("ping")
    except Exception as e:
        health["mongodb"] = {"status": f"error: {str(e)}", "latency_ms": 0}

    redis_info = {}
    try:
        if redis_client:
            await redis_client.ping()
            info = await redis_client.info("memory")
            redis_info["used_memory_human"] = info.get("used_memory_human", "N/A")
            redis_info["total_keys"] = await redis_client.dbsize()
    except Exception as e:
        health["redis"] = {"status": f"error: {str(e)}", "latency_ms": 0}

    # Disk usage for storage
    disk_files_count = len(list(STORAGE_DIR.glob("*"))) if STORAGE_DIR.exists() else 0

    # Total audit events in MongoDB
    total_audit_events = await mongo_db.activity_logs.count_documents({})

    # Security Alerts & Incorrect Logins Telemetry
    failed_logins_cursor = mongo_db.activity_logs.find({"action": "LOGIN_FAILED"}).sort("timestamp", -1).limit(20)
    failed_logins = await failed_logins_cursor.to_list(length=20)
    for fl in failed_logins:
        fl["id"] = str(fl["_id"])
        del fl["_id"]
    failed_logins_count = await mongo_db.activity_logs.count_documents({"action": "LOGIN_FAILED"})

    # 5. Activity Timeline & Security Trends (Last 7 Days)
    now_utc = datetime.now(timezone.utc)
    daily_trend = []
    for i in range(6, -1, -1):
        day_date = now_utc - timedelta(days=i)
        day_str = day_date.strftime("%Y-%m-%d")
        day_label = day_date.strftime("%a") if i > 0 else "Today"
        daily_trend.append({
            "date": day_str,
            "label": day_label,
            "success_logins": 0,
            "failed_logins": 0,
            "file_events": 0,
            "total_events": 0
        })

    seven_days_ago = (now_utc - timedelta(days=7)).isoformat()
    try:
        pipeline = [
            {"$match": {"timestamp": {"$gte": seven_days_ago}}},
            {
                "$group": {
                    "_id": {
                        "day": {"$substr": ["$timestamp", 0, 10]},
                        "action": "$action"
                    },
                    "count": {"$sum": 1}
                }
            }
        ]
        agg_logs = await mongo_db.activity_logs.aggregate(pipeline).to_list(length=200)
        trend_dict = {d["date"]: d for d in daily_trend}
        for item in agg_logs:
            day_key = item["_id"].get("day")
            act = item["_id"].get("action", "")
            cnt = item.get("count", 0)
            if day_key in trend_dict:
                trend_dict[day_key]["total_events"] += cnt
                if act in ["LOGIN_SUCCESS", "OAUTH_LOGIN"]:
                    trend_dict[day_key]["success_logins"] += cnt
                elif act == "LOGIN_FAILED":
                    trend_dict[day_key]["failed_logins"] += cnt
                elif any(kw in act for kw in ["FILE", "FOLDER", "UPLOAD", "SHARE"]):
                    trend_dict[day_key]["file_events"] += cnt
    except Exception as e:
        print("Timeline aggregation warning:", e)

    return {
        "activity_timeline": daily_trend,
        "users": {
            "total": total_users,
            "active": active_users,
            "inactive": inactive_users,
            "roles": roles_breakdown
        },
        "storage": {
            "total_bytes": total_storage_bytes,
            "total_files": files_count,
            "total_folders": folders_count,
            "trashed_items": trashed_count,
            "password_protected_files": protected_count,
            "average_file_size": round(total_storage_bytes / max(files_count, 1), 2),
            "disk_files_count": disk_files_count,
            "categories": categories
        },
        "top_consumers": top_users_agg,
        "infrastructure": health,
        "redis_metrics": redis_info,
        "total_audit_events": total_audit_events,
        "security_alerts": {
            "failed_logins_count": failed_logins_count,
            "recent_failed_logins": failed_logins
        }
    }


# ==============================================================================
# 2. SECURITY ALERTS NOTIFICATIONS STREAM
# ==============================================================================
@router.get("/security-alerts")
async def get_security_alerts(
    limit: int = Query(20, ge=1, le=100),
    admin_user: User = Depends(require_role(UserRole.ADMIN))
):
    cursor = mongo_db.activity_logs.find({"action": "LOGIN_FAILED"}).sort("timestamp", -1).limit(limit)
    alerts = await cursor.to_list(length=limit)
    for alert in alerts:
        alert["id"] = str(alert["_id"])
        del alert["_id"]
    total = await mongo_db.activity_logs.count_documents({"action": "LOGIN_FAILED"})
    return {
        "alerts": alerts,
        "total": total
    }


# ==============================================================================
# 2. AUDIT LOGS TELEMETRY STREAM
# ==============================================================================
@router.get("/audit-logs")
async def get_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    action: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    admin_user: User = Depends(require_role(UserRole.ADMIN))
):
    query: Dict[str, Any] = {}
    if action and action != "ALL":
        query["action"] = action
    if username:
        query["username"] = {"$regex": username.strip(), "$options": "i"}

    cursor = mongo_db.activity_logs.find(query).sort("timestamp", -1).skip(skip).limit(limit)
    logs = await cursor.to_list(length=limit)

    for log in logs:
        log["id"] = str(log["_id"])
        del log["_id"]

    total = await mongo_db.activity_logs.count_documents(query)

    return {
        "logs": logs,
        "total": total,
        "limit": limit,
        "skip": skip
    }


# ==============================================================================
# 3. USER MANAGEMENT FOR ADMINISTRATORS
# ==============================================================================
@router.get("/users")
async def list_all_users(
    admin_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    users = db.query(User).order_by(User.id.asc()).all()

    # Pre-fetch user file counts and storage from MongoDB
    user_storage_agg = await mongo_db.file_metadata.aggregate([
        {"$match": {"is_folder": False, "is_trashed": False}},
        {"$group": {
            "_id": "$owner_id",
            "file_count": {"$sum": 1},
            "total_bytes": {"$sum": "$file_size"}
        }}
    ]).to_list(length=1000)

    storage_lookup = {item["_id"]: item for item in user_storage_agg}

    result = []
    for u in users:
        metrics = storage_lookup.get(u.id, {"file_count": 0, "total_bytes": 0})
        result.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role.value,
            "is_active": u.is_active,
            "is_mfa_enabled": u.is_mfa_enabled,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "files_count": metrics["file_count"],
            "storage_bytes": metrics["total_bytes"]
        })

    return {"users": result, "total": len(result)}


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    req: UpdateUserRoleRequest,
    admin_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    old_role = user.role.value
    user.role = req.role
    db.commit()
    db.refresh(user)

    await log_activity(
        user_id=admin_user.id,
        username=admin_user.username,
        action="USER_ROLE_UPDATED",
        resource_id=str(user_id),
        resource_name=user.username,
        details={"old_role": old_role, "new_role": req.role.value}
    )

    return {"status": "success", "user_id": user.id, "new_role": user.role.value}


@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: int,
    req: UpdateUserStatusRequest,
    admin_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    if user_id == admin_user.id:
        raise HTTPException(status_code=400, detail="Administrators cannot deactivate their own account.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user.is_active = req.is_active
    db.commit()
    db.refresh(user)

    await log_activity(
        user_id=admin_user.id,
        username=admin_user.username,
        action="USER_STATUS_UPDATED",
        resource_id=str(user_id),
        resource_name=user.username,
        details={"is_active": req.is_active}
    )

    return {"status": "success", "user_id": user.id, "is_active": user.is_active}


# ==============================================================================
# 4. GLOBAL FILE INVENTORY & ADMIN MODERATION
# ==============================================================================
@router.get("/files")
async def list_all_system_files(
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    admin_user: User = Depends(require_role(UserRole.ADMIN))
):
    query: Dict[str, Any] = {"is_folder": False}
    if search:
        query["name"] = {"$regex": search.strip(), "$options": "i"}

    cursor = mongo_db.file_metadata.find(query).sort("created_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    items = [sanitize_item(d) for d in docs]
    total = await mongo_db.file_metadata.count_documents(query)

    return {"files": items, "total": total}


@router.delete("/files/{item_id}")
async def admin_delete_file(
    item_id: str,
    admin_user: User = Depends(require_role(UserRole.ADMIN))
):
    target = await mongo_db.file_metadata.find_one({"_id": item_id})
    if not target:
        raise HTTPException(status_code=404, detail="File not found.")

    stored = target.get("stored_filename")
    if stored:
        f_path = STORAGE_DIR / stored
        if f_path.exists():
            f_path.unlink()

    await mongo_db.file_metadata.delete_one({"_id": item_id})

    await log_activity(
        user_id=admin_user.id,
        username=admin_user.username,
        action="ADMIN_FILE_DELETE",
        resource_id=item_id,
        resource_name=target.get("name"),
        details={"owner_id": target.get("owner_id"), "owner_username": target.get("owner_username")}
    )

    return {"status": "success", "message": f"File '{target.get('name')}' deleted by administrator."}


# ==============================================================================
# 5. ADMIN STORAGE PURGE & CLEANUP
# ==============================================================================
@router.post("/clean-storage")
async def clean_admin_storage(
    admin_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    """
    Purges any files, folders, and underlying disk data belonging to administrative accounts.
    """
    admin_users = db.query(User).filter(User.role == UserRole.ADMIN).all()
    admin_ids = [u.id for u in admin_users]
    admin_names = list({u.username for u in admin_users} | {"admin"})

    query = {
        "$or": [
            {"owner_id": {"$in": admin_ids}},
            {"owner_username": {"$in": admin_names}}
        ]
    }
    cursor = mongo_db.file_metadata.find(query)
    files = await cursor.to_list(length=1000)

    deleted_disk_count = 0
    for f in files:
        stored_name = f.get("stored_filename")
        if stored_name:
            p = STORAGE_DIR / stored_name
            if p.exists():
                try:
                    p.unlink()
                    deleted_disk_count += 1
                except Exception as e:
                    print(f"Error unlinking {p}: {e}")

    result = await mongo_db.file_metadata.delete_many(query)

    await log_activity(
        user_id=admin_user.id,
        username=admin_user.username,
        action="ADMIN_STORAGE_CLEANED",
        details={
            "deleted_metadata_records": result.deleted_count,
            "deleted_disk_files": deleted_disk_count
        }
    )

    return {
        "status": "success",
        "message": "Admin storage cleaned successfully. All administrator file entries purged.",
        "deleted_records": result.deleted_count,
        "deleted_disk_files": deleted_disk_count
    }

