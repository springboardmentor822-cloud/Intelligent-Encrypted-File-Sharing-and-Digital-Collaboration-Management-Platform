"""IP block list: the administrator decides which IP addresses are NOT let in (Access Control).

* The list is saved in MongoDB (`blocked_ips`) so it survives restarts and can be shown in the admin panel.
* A copy lives in Redis as `blocked:<ip>` keys (with a timer for temporary blocks) so that checking EVERY request stays fast.
* A block can be manual (an admin clicked "Block") or automatic (a detection rule with "auto-block" fired).
Private / local addresses (your own computer, Docker, Wi-Fi) can never be blocked, so you cannot lock yourself out.
"""
import ipaddress
from datetime import datetime, timedelta, timezone

from app.db.mongo import mongo_db
from app.db.redis import redis_client

# addresses that are never blocked: this computer, home / office networks, Docker
PROTECTED = [ipaddress.ip_network(n) for n in ("127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "::1/128", "fc00::/7", "fe80::/10")]


def is_blockable(ip: str | None) -> bool:
    try:
        addr = ipaddress.ip_address(ip or "")
    except ValueError:
        return False
    return not any(addr in net for net in PROTECTED) and not addr.is_unspecified


async def is_blocked(ip: str | None) -> bool:
    return bool(ip) and bool(await redis_client.exists(f"blocked:{ip}"))


async def block_ip(ip: str, reason: str, by: str, minutes: int | None = None, auto: bool = False) -> dict:
    """minutes=None blocks until an admin removes it."""
    expires = datetime.now(timezone.utc) + timedelta(minutes=minutes) if minutes else None
    doc = {"_id": ip, "reason": reason[:200], "by": by, "auto": auto, "created_at": datetime.now(timezone.utc), "expires_at": expires}
    await mongo_db.blocked_ips.replace_one({"_id": ip}, doc, upsert=True)
    if minutes:
        await redis_client.set(f"blocked:{ip}", "1", ex=minutes * 60)
    else:
        await redis_client.set(f"blocked:{ip}", "1")
    return doc


async def unblock_ip(ip: str) -> bool:
    await redis_client.delete(f"blocked:{ip}")
    res = await mongo_db.blocked_ips.delete_one({"_id": ip})
    return bool(res.deleted_count)


async def list_blocks() -> list[dict]:
    """Current blocks. Expired temporary blocks are cleaned out here."""
    now = datetime.now(timezone.utc)
    rows = []
    async for d in mongo_db.blocked_ips.find({}).sort("created_at", -1):
        exp = d.get("expires_at")
        exp_aware = exp.replace(tzinfo=timezone.utc) if exp is not None and exp.tzinfo is None else exp
        if exp_aware is not None and exp_aware <= now:
            await mongo_db.blocked_ips.delete_one({"_id": d["_id"]})
            continue
        created = d["created_at"]
        rows.append({"ip": d["_id"], "reason": d.get("reason"), "by": d.get("by"), "auto": d.get("auto", False),
                     "created_at": (created.replace(tzinfo=timezone.utc) if created.tzinfo is None else created).isoformat(),
                     "expires_at": exp_aware.isoformat() if exp_aware else None})
    return rows


async def sync_blocklist() -> int:
    """After a restart Redis may be empty: put every still-valid block back."""
    n = 0
    for b in await list_blocks():
        if b["expires_at"]:
            left = int((datetime.fromisoformat(b["expires_at"]) - datetime.now(timezone.utc)).total_seconds())
            if left > 0:
                await redis_client.set(f"blocked:{b['ip']}", "1", ex=left)
                n += 1
        else:
            await redis_client.set(f"blocked:{b['ip']}", "1")
            n += 1
    return n
