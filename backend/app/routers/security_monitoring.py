"""Security monitoring (Milestone 3, Task 6): security events, alerts, detection rules and a test-scenario runner. Admin only.

  GET  /security/summary            numbers for the Security Monitoring cards
  GET  /security/events             alerts with filters (user, type, severity, date range, status) + pages
  PATCH /security/events/{id}       resolve / re-open an alert, with a note
  GET  /security/rules              the detection rules (threshold, time window, severity, on/off)
  PUT  /security/rules/{id}         change a rule        POST /security/rules/{id}/reset   back to the default
  POST /security/simulate           create fake activity that SHOULD trigger a rule (to test detection safely)
"""
import random
import re
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.core.deps import require_roles
from app.db.mongo import mongo_db
from app.models.postgres import User
from app.services.audit import BLOCKED_ACTIONS, UNAUTHORIZED_ACTIONS, log_event
from app.services.audit_view import parse_day
from app.services.detection import SEVERITY_FROM_DB, SEVERITY_TO_DB, get_rules, reset_rule, save_rule

router = APIRouter(prefix="/security", tags=["Security monitoring (admin)"])


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()


def _event(d: dict) -> dict:
    return {"alert_id": str(d["_id"]), "type": d["type"], "severity": SEVERITY_FROM_DB.get(d["severity"], "medium"), "message": d["message"],
            "user_id": d.get("user_id"), "user_email": (d.get("details") or {}).get("email"), "ip": d.get("ip"), "details": d.get("details") or {},
            "status": "resolved" if d.get("resolved") else "open", "resolution_note": d.get("resolution_note"),
            "resolved_at": _iso(d.get("resolved_at")), "created_at": _iso(d["created_at"]), "simulated": bool((d.get("details") or {}).get("simulated"))}


def _alert_filter(user=None, type=None, severity=None, status=None, date_from=None, date_to=None, days=None) -> dict:
    clauses: list[dict] = []
    if user:
        rx = {"$regex": re.escape(user), "$options": "i"}
        clauses.append({"$or": [{"user_id": user}, {"details.email": rx}, {"ip": user}]})
    if type:
        clauses.append({"type": type})
    if severity in SEVERITY_TO_DB:
        clauses.append({"severity": SEVERITY_TO_DB[severity]})
    if status in ("open", "resolved"):
        clauses.append({"resolved": status == "resolved"})
    start, end = parse_day(date_from), parse_day(date_to, end=True)
    if not start and days:
        start = datetime.now(timezone.utc) - timedelta(days=days)
    if start or end:
        clauses.append({"created_at": {**({"$gte": start} if start else {}), **({"$lt": end} if end else {})}})
    return {"$and": clauses} if clauses else {}


@router.get("/summary")
async def summary(days: int = Query(7, ge=1, le=90), date_from: str | None = None, date_to: str | None = None, _: User = Depends(require_roles("admin"))):
    flt = _alert_filter(days=days, date_from=date_from, date_to=date_to)
    audit_win = {"timestamp": flt["$and"][0]["created_at"]} if flt else {}
    alerts, audit = mongo_db.security_alerts, mongo_db.audit_logs
    by_sev = {"low": 0, "medium": 0, "high": 0}
    async for r in alerts.aggregate([{"$match": flt}, {"$group": {"_id": "$severity", "n": {"$sum": 1}}}] if flt else [{"$group": {"_id": "$severity", "n": {"$sum": 1}}}]):
        by_sev[SEVERITY_FROM_DB.get(r["_id"], "medium")] += r["n"]
    by_type = [{"type": r["_id"], "count": r["n"]} async for r in alerts.aggregate(
        ([{"$match": flt}] if flt else []) + [{"$group": {"_id": "$type", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}])]

    def cnt(extra: dict) -> dict:
        return {"$and": [audit_win, extra]} if audit_win else extra
    link_fail = {"action": "share_access", "result": "failure"}
    recent = [_event(d) async for d in alerts.find(flt or {}).sort("created_at", -1).limit(8)]
    return {
        "total_events": await alerts.count_documents(flt or {}), "open": await alerts.count_documents({"$and": [flt, {"resolved": False}]} if flt else {"resolved": False}),
        "failed_logins": await audit.count_documents(cnt({"action": "login", "result": "failure"})),
        "unauthorized_attempts": await audit.count_documents(cnt({"result": "failure", "action": {"$in": UNAUTHORIZED_ACTIONS}})),
        "blocked_requests": await audit.count_documents(cnt({"action": {"$in": BLOCKED_ACTIONS}})),
        "suspicious_downloads": await alerts.count_documents({"$and": [flt, {"type": {"$in": ["download_burst", "repeated_failed_download"]}}]} if flt else {"type": {"$in": ["download_burst", "repeated_failed_download"]}}),
        "expired_link_attempts": await audit.count_documents(cnt({**link_fail, "details.reason": "expired"})),
        "revoked_link_attempts": await audit.count_documents(cnt({**link_fail, "details.reason": "revoked"})),
        "by_severity": by_sev, "by_type": by_type, "recent": recent,
    }


@router.get("/events")
async def events(user: str | None = None, type: str | None = None, severity: str | None = None, status: str | None = None,
                 date_from: str | None = None, date_to: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                 _: User = Depends(require_roles("admin"))):
    flt = _alert_filter(user, type, severity, status, date_from, date_to)
    total = await mongo_db.security_alerts.count_documents(flt)
    cursor = mongo_db.security_alerts.find(flt).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    types = await mongo_db.security_alerts.distinct("type")
    return {"items": [_event(d) async for d in cursor], "total": total, "page": page, "page_size": page_size, "types": sorted(types)}


class EventUpdate(BaseModel):
    resolved: bool = True
    note: str | None = Field(default=None, max_length=300)


@router.patch("/events/{alert_id}")
async def update_event(alert_id: str, body: EventUpdate, request: Request, admin: User = Depends(require_roles("admin"))):
    try:
        oid = ObjectId(alert_id)
    except Exception:
        raise HTTPException(400, "Invalid alert id")
    change = {"resolved": body.resolved, "resolved_at": datetime.now(timezone.utc) if body.resolved else None, "resolved_by": admin.email if body.resolved else None,
              "resolution_note": body.note if body.resolved else None}
    res = await mongo_db.security_alerts.update_one({"_id": oid}, {"$set": change})
    if not res.matched_count:
        raise HTTPException(404, "Alert not found")
    await log_event("security_alert_update", request, user=admin, details={"alert_id": alert_id, "resolved": body.resolved})
    return {"alert_id": alert_id, "status": "resolved" if body.resolved else "open"}


# ---------------------------------------------------------------- detection rules
@router.get("/rules")
async def list_rules(_: User = Depends(require_roles("admin"))):
    rules = await get_rules(force=True)
    counts = {r["_id"]: r["n"] async for r in mongo_db.security_alerts.aggregate([{"$group": {"_id": "$details.rule", "n": {"$sum": 1}}}])}
    return [{**r, "fired": counts.get(r["id"], 0)} for r in rules.values()]


class RuleUpdate(BaseModel):
    enabled: bool | None = None
    threshold: int | None = Field(default=None, ge=1, le=1000)
    window_seconds: int | None = Field(default=None, ge=0, le=86400)
    severity: str | None = Field(default=None, pattern="^(low|medium|high)$")
    auto_block: bool | None = None
    block_minutes: int | None = Field(default=None, ge=1, le=10080)


@router.put("/rules/{rule_id}")
async def update_rule(rule_id: str, body: RuleUpdate, request: Request, admin: User = Depends(require_roles("admin"))):
    try:
        rule = await save_rule(rule_id, body.model_dump(exclude_none=True))
    except KeyError:
        raise HTTPException(404, "Unknown rule")
    await log_event("detection_rule_change", request, user=admin, details={"rule": rule_id, **body.model_dump(exclude_none=True)})
    return rule


@router.post("/rules/{rule_id}/reset")
async def reset(rule_id: str, request: Request, admin: User = Depends(require_roles("admin"))):
    try:
        rule = await reset_rule(rule_id) if rule_id in await get_rules() else None
    except KeyError:
        rule = None
    if rule is None:
        raise HTTPException(404, "Unknown rule")
    await log_event("detection_rule_change", request, user=admin, details={"rule": rule_id, "reset": True})
    return rule


# ---------------------------------------------------------------- test scenarios (Milestone 3, Task 6, step 8)
SCENARIOS = {
    "failed_logins": ("failed_login", "Enter an incorrect password repeatedly"),
    "unauthorized_access": ("unauthorized_access", "Try accessing a file without permission"),
    "excessive_downloads": ("excessive_downloads", "Download files repeatedly"),
    "expired_link": ("expired_link_access", "Try accessing an expired sharing link"),
    "revoked_link": ("revoked_link_access", "Try accessing a revoked sharing link"),
    "unknown_accounts": ("unknown_accounts", "Guess usernames that do not exist"),
}


class SimulateIn(BaseModel):
    scenario: str


@router.get("/scenarios")
async def scenarios(_: User = Depends(require_roles("admin"))):
    return [{"id": k, "rule": v[0], "label": v[1]} for k, v in SCENARIOS.items()]


@router.post("/simulate")
async def simulate(body: SimulateIn, request: Request, admin: User = Depends(require_roles("admin"))):
    """Writes the activity records a real attacker would cause, through the SAME detection code. The records come from a
    documentation IP address (203.0.113.x) and are marked [SIMULATED] so they can be told apart. Nothing real is touched."""
    if body.scenario not in SCENARIOS:
        raise HTTPException(404, "Unknown scenario")
    rule_id = SCENARIOS[body.scenario][0]
    rule = (await get_rules())[rule_id]
    if not rule["enabled"]:
        raise HTTPException(400, f"The rule '{rule['name']}' is switched off. Turn it on first.")
    ip = f"203.0.113.{random.randint(2, 250)}"
    n = rule["threshold"]
    sim = {"simulated": True}
    for i in range(n):
        if body.scenario == "failed_logins":
            await log_event("login", None, user_email="simulated.victim@example.com", result="failure", ip=ip, details={"reason": "bad_credentials", "account_exists": True, **sim})
        elif body.scenario == "unauthorized_access":
            await log_event("download", None, user_email="simulated.user@example.com", result="failure", ip=ip, resource_type="file", details={"reason": "forbidden", "name": "Confidential.pdf", **sim})
        elif body.scenario == "excessive_downloads":
            await log_event("share_download", None, ip=ip, resource_type="file", details={"name": "Salary_Report.xlsx", **sim})
        elif body.scenario in ("expired_link", "revoked_link"):
            await log_event("share_access", None, result="failure", ip=ip, resource_type="share_link", details={"reason": "expired" if body.scenario == "expired_link" else "revoked", **sim})
        elif body.scenario == "unknown_accounts":
            await log_event("login", None, user_email=f"ghost{i}.{random.randint(100, 999)}@example.com", result="failure", ip=ip, details={"reason": "bad_credentials", "account_exists": False, **sim})
    await log_event("security_alert_update", request, user=admin, details={"scenario": body.scenario, "events": n, "simulated": True})
    return {"scenario": body.scenario, "events_created": n, "ip": ip, "expected_alert": rule["alert_type"], "rule": rule["name"]}
