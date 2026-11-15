"""Tripwire files (honeypots): an administrator marks a file as a trap. Nobody has a reason to open it, so ANY access
by someone other than the person who set the trap raises a critical alert at once. This catches snooping and stolen accounts."""
from datetime import datetime, timezone

from app.db.mongo import mongo_db
from app.services.detection import get_rule


async def set_tripwire(file_id: str, file_name: str, by_user_id: str, by_email: str, on: bool) -> None:
    if on:
        await mongo_db.tripwires.update_one({"_id": file_id}, {"$set": {"name": file_name, "by_user_id": by_user_id, "by_email": by_email,
                                                                          "created_at": datetime.now(timezone.utc)}}, upsert=True)
    else:
        await mongo_db.tripwires.delete_one({"_id": file_id})


async def tripwire_ids() -> dict[str, dict]:
    return {d["_id"]: d async for d in mongo_db.tripwires.find({})}


async def check_tripwire(file_id: str, file_name: str, who_user_id: str | None, who_email: str | None, ip: str | None, how: str) -> None:
    """Call this whenever a file is opened or downloaded. Cheap: one lookup by id."""
    trap = await mongo_db.tripwires.find_one({"_id": file_id})
    if not trap or (who_user_id and who_user_id == trap.get("by_user_id")):
        return
    rule = await get_rule("tripwire_touched")
    if not rule["enabled"]:
        return
    from app.services.audit import create_alert   # imported here: audit imports detection, this keeps start-up simple
    from app.services.detection import SEVERITY_TO_DB

    await create_alert("tripwire_touched", f"TRIPWIRE: the trap file '{file_name}' was {how} by {who_email or 'an anonymous link visitor'}",
                       SEVERITY_TO_DB[rule["severity"]], who_user_id, ip, {"file": file_name, "file_id": file_id, "email": who_email, "rule": "tripwire_touched"})
