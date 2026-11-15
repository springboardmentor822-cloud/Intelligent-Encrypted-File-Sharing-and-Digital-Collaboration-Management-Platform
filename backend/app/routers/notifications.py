"""Notification APIs for the bell icon and the "Notifications" history page (Milestone 3, Task 3, step 8)."""
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.db.mongo import mongo_db
from app.models.postgres import User
from app.services.notifications import NOTIFICATION_TYPES, get_prefs

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _out(d: dict) -> dict:
    return {"id": str(d["_id"]), "title": d["title"], "message": d["message"], "read": d["read"], "type": d.get("type", "system"),
            "link": d.get("link"), "email_status": d.get("email_status"), "created_at": d["created_at"].isoformat()}


def _oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except InvalidId:
        raise HTTPException(404, "Notification not found")


@router.get("")
async def list_notifications(user: User = Depends(get_current_user)):
    """The 30 newest (used by the bell dropdown) plus the unread counter."""
    items = [_out(d) async for d in mongo_db.notifications.find({"user_id": user.id}).sort("created_at", -1).limit(30)]
    unread = await mongo_db.notifications.count_documents({"user_id": user.id, "read": False})
    return {"items": items, "unread": unread}


@router.get("/history")
async def notification_history(type: str | None = None, unread_only: bool = False, q: str | None = None,
                               page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                               user: User = Depends(get_current_user)):
    """The full history, newest first, with filters and pages."""
    flt: dict = {"user_id": user.id}
    if type in NOTIFICATION_TYPES:
        flt["type"] = type
    if unread_only:
        flt["read"] = False
    if q:
        flt["$or"] = [{"title": {"$regex": q, "$options": "i"}}, {"message": {"$regex": q, "$options": "i"}}]
    total = await mongo_db.notifications.count_documents(flt)
    cursor = mongo_db.notifications.find(flt).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    by_type = {r["_id"] or "system": r["n"] async for r in mongo_db.notifications.aggregate(
        [{"$match": {"user_id": user.id}}, {"$group": {"_id": "$type", "n": {"$sum": 1}}}])}
    return {"items": [_out(d) async for d in cursor], "total": total, "page": page, "page_size": page_size,
            "unread": await mongo_db.notifications.count_documents({"user_id": user.id, "read": False}), "by_type": by_type}


@router.post("/read-all")
async def read_all(user: User = Depends(get_current_user)):
    await mongo_db.notifications.update_many({"user_id": user.id, "read": False}, {"$set": {"read": True}})
    return {"message": "ok"}


@router.post("/{notification_id}/read")
async def mark_read(notification_id: str, user: User = Depends(get_current_user)):
    res = await mongo_db.notifications.update_one({"_id": _oid(notification_id), "user_id": user.id}, {"$set": {"read": True}})
    if not res.matched_count:
        raise HTTPException(404, "Notification not found")
    return {"read": True}


@router.delete("/{notification_id}")
async def delete_notification(notification_id: str, user: User = Depends(get_current_user)):
    res = await mongo_db.notifications.delete_one({"_id": _oid(notification_id), "user_id": user.id})
    if not res.deleted_count:
        raise HTTPException(404, "Notification not found")
    return {"deleted": True}


class PrefsIn(BaseModel):
    email_enabled: bool


@router.get("/preferences")
async def get_preferences(user: User = Depends(get_current_user)):
    return await get_prefs(user.id)


@router.put("/preferences")
async def set_preferences(body: PrefsIn, user: User = Depends(get_current_user)):
    await mongo_db.notification_prefs.update_one({"_id": user.id}, {"$set": {"email_enabled": body.email_enabled}}, upsert=True)
    return {"email_enabled": body.email_enabled}
