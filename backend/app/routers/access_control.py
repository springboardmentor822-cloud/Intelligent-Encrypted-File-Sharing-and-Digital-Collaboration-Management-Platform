"""ACCESS CONTROL for administrators: who is let in, and who is kept out. Admin only.

  GET  /admin/access/overview            policy, accounts waiting for approval, blocked IPs, tripwire files
  PUT  /admin/access/policy              "approve new accounts first" on / off
  POST /admin/access/users/{id}/approve  let a waiting account in          .../reject  keep it out
  POST /admin/access/blocked-ips         block an IP address (forever or for N minutes)
  DELETE /admin/access/blocked-ips/{ip}  let an IP address back in
  PUT  /admin/access/tripwires/{file_id} turn a file into a trap (or remove the trap)
"""
import ipaddress

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import client_ip, require_roles
from app.db.mongo import mongo_db
from app.db.postgres import get_db
from app.models.postgres import StoredFile, User
from app.services.access_policy import require_approval, set_require_approval
from app.services.audit import log_event
from app.services.blocklist import block_ip, is_blockable, list_blocks, unblock_ip
from app.services.notifications import notify_user
from app.services.tripwire import set_tripwire, tripwire_ids

router = APIRouter(prefix="/admin/access", tags=["Access control (admin)"])


def _pending_row(u: User) -> dict:
    return {"id": u.id, "name": u.full_name, "email": u.email, "created_at": u.created_at.isoformat()}


@router.get("/overview")
async def overview(_: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    pending = (await db.execute(select(User).where(User.approval_status == "pending").order_by(User.created_at.desc()))).scalars().all()
    decided = [{"action": d["action"], "who": (d.get("details") or {}).get("name"), "by": d.get("user_email"), "at": d["timestamp"].isoformat()}
               async for d in mongo_db.audit_logs.find({"action": {"$in": ["access_approve", "access_reject"]}}).sort("timestamp", -1).limit(10)]
    blocks = await list_blocks()
    traps = await tripwire_ids()
    names = {}
    if traps:
        names = {fid: (n, owner) for fid, n, owner in (await db.execute(select(StoredFile.id, StoredFile.original_name, StoredFile.owner_id).where(StoredFile.id.in_(list(traps))))).all()}
    return {"policy": {"require_approval": await require_approval()}, "pending": [_pending_row(u) for u in pending], "decided": decided,
            "blocked_ips": blocks, "tripwires": [{"file_id": fid, "name": names.get(fid, (t.get("name"), None))[0], "by": t.get("by_email"), "since": t["created_at"].isoformat()} for fid, t in traps.items()],
            "counts": {"pending": len(pending), "blocked": len(blocks), "auto_blocked": sum(1 for b in blocks if b["auto"]), "tripwires": len(traps)}}


class PolicyIn(BaseModel):
    require_approval: bool


@router.put("/policy")
async def set_policy(body: PolicyIn, request: Request, admin: User = Depends(require_roles("admin"))):
    await set_require_approval(body.require_approval)
    await log_event("policy_change", request, user=admin, severity="warning", details={"name": "approve new accounts" if body.require_approval else "open registration", "require_approval": body.require_approval})
    return {"require_approval": body.require_approval}


async def _decide(user_id: str, approve: bool, request: Request, admin: User, db: AsyncSession) -> dict:
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.approval_status != "pending":
        raise HTTPException(400, "This account is not waiting for a decision")
    u.approval_status = "approved" if approve else "rejected"
    await db.commit()
    await log_event("access_approve" if approve else "access_reject", request, user=admin, resource_type="user", resource_id=u.id, details={"name": u.email})
    await notify_user(u.id, u.email, "Your TrustShare account was approved" if approve else "Your TrustShare access request was declined",
                      "You can now log in and start uploading files." if approve else "An administrator declined your request. Contact them if you think this is a mistake.",
                      send_mail=True, ntype="system")
    return {"id": u.id, "approval_status": u.approval_status}


@router.post("/users/{user_id}/approve")
async def approve(user_id: str, request: Request, admin: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    return await _decide(user_id, True, request, admin, db)


@router.post("/users/{user_id}/reject")
async def reject(user_id: str, request: Request, admin: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    return await _decide(user_id, False, request, admin, db)


class BlockIn(BaseModel):
    ip: str = Field(max_length=45)
    reason: str = Field(default="Blocked by an administrator", max_length=200)
    minutes: int | None = Field(default=None, ge=1, le=525600)


@router.post("/blocked-ips")
async def add_block(body: BlockIn, request: Request, admin: User = Depends(require_roles("admin"))):
    try:
        ip = str(ipaddress.ip_address(body.ip.strip()))
    except ValueError:
        raise HTTPException(400, "That is not a valid IP address")
    if ip == client_ip(request):
        raise HTTPException(400, "You cannot block the IP address you are using right now")
    if not is_blockable(ip):
        raise HTTPException(400, "Private and local addresses (this computer, Docker, home or office network) cannot be blocked, so you cannot lock yourself out")
    await block_ip(ip, body.reason, admin.email, minutes=body.minutes)
    await log_event("ip_blocked", request, user=admin, severity="warning", details={"name": ip, "reason": body.reason, "minutes": body.minutes})
    return {"blocked": ip, "minutes": body.minutes}


@router.delete("/blocked-ips/{ip}")
async def remove_block(ip: str, request: Request, admin: User = Depends(require_roles("admin"))):
    if not await unblock_ip(ip):
        raise HTTPException(404, "That IP address is not blocked")
    await log_event("ip_unblocked", request, user=admin, details={"name": ip})
    return {"unblocked": ip}


class TripwireIn(BaseModel):
    on: bool


@router.put("/tripwires/{file_id}")
async def tripwire(file_id: str, body: TripwireIn, request: Request, admin: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    f = await db.get(StoredFile, file_id)
    if not f:
        raise HTTPException(404, "File not found")
    await set_tripwire(f.id, f.original_name, admin.id, admin.email, body.on)
    await log_event("tripwire_set", request, user=admin, resource_type="file", resource_id=f.id, severity="warning", details={"name": f.original_name, "on": body.on})
    return {"file_id": f.id, "tripwire": body.on}
