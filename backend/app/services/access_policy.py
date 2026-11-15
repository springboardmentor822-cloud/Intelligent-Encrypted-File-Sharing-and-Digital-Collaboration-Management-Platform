"""Platform access policy, saved in MongoDB `app_settings`. Right now: must an administrator approve new accounts?"""
from app.db.mongo import mongo_db


async def require_approval() -> bool:
    doc = await mongo_db.app_settings.find_one({"_id": "access"}) or {}
    return bool(doc.get("require_approval", False))


async def set_require_approval(value: bool) -> None:
    await mongo_db.app_settings.update_one({"_id": "access"}, {"$set": {"require_approval": bool(value)}}, upsert=True)
