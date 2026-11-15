"""Reports for the new dashboards.

  GET /reports/file-analytics     -> File Analytics page (any logged-in user; admins see the whole platform)
  GET /reports/my-security        -> the user's "Security" page (what protects THEIR files, live numbers)
  GET /reports/security-dashboard -> ADMIN ONLY Security Dashboard (login monitoring, attacks, events)

The admin route is protected on the SERVER with require_roles("admin"): hiding the menu item in React is
only cosmetic. A normal user calling this URL by hand gets 403 and the attempt is written to the audit log.
"""
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import get_key_manager
from app.core.deps import get_current_user, is_admin, require_roles, role_names
from app.core.validation import ALLOWED, category_for_mime, chart_group
from app.db.mongo import mongo_db
from app.db.postgres import get_db
from app.models.postgres import Favorite, FilePermission, SharedLink, StoredFile, User, utcnow
from app.services.audit import BLOCKED_ACTIONS, UNAUTHORIZED_ACTIONS
from app.services.audit_view import describe

router = APIRouter(prefix="/reports", tags=["Reports"])


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()


def _range(days: int, date_from: str | None, date_to: str | None) -> tuple[datetime, datetime]:
    """Either 'last N days' or a custom from/to (YYYY-MM-DD). Returns UTC datetimes [start, end)."""
    end = datetime.now(timezone.utc)
    if date_from and date_to:
        try:
            start = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
            end = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc) + timedelta(days=1)
        except ValueError:
            raise HTTPException(400, "Dates must look like 2026-10-24")
        if end <= start:
            raise HTTPException(400, "'To' date must be after 'From' date")
        if (end - start).days > 366:
            raise HTTPException(400, "Choose a range of at most one year")
        return start, end
    start = (end - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return start, end


def _days(start: datetime, end: datetime) -> list[str]:
    n = max((end.date() - start.date()).days + 1, 1)
    return [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n)]


def _scope(user: User) -> dict:
    """Admins see everything; a normal user only sees events they caused or events on their own files."""
    return {} if is_admin(user) else {"$or": [{"user_id": user.id}, {"owner_id": user.id}]}


# ====================================================================== FILE ANALYTICS
def _pct_change(now: int | float, before: int | float) -> float | None:
    """+12.0 means "12% more than the previous period". None when there is nothing to compare with."""
    if not before:
        return None
    return round((now - before) / before * 100, 1)


@router.get("/file-analytics")
async def file_analytics(
    days: int = Query(30, ge=1, le=366),
    date_from: str | None = None,
    date_to: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    start, end = _range(days, date_from, date_to)
    prev_start, prev_end = start - (end - start), start      # the period just before, same length
    audit = mongo_db.audit_logs
    scope = _scope(user)
    base = {"timestamp": {"$gte": start, "$lt": end}, "result": "success", **scope}
    labels = _days(start, end)
    everyone = is_admin(user)

    # ---- storage now (not date-filtered): detailed types for the Storage page, 4 groups for the donut
    q = select(StoredFile.mime_type, func.count(), func.coalesce(func.sum(StoredFile.size_bytes), 0)).where(
        StoredFile.deleted_at.is_(None))
    if not everyone:
        q = q.where(StoredFile.owner_id == user.id)
    by_type: dict[str, dict] = {}
    by_group: dict[str, dict] = {g: {"type": g, "files": 0, "bytes": 0} for g in ("documents", "images", "videos", "others")}
    for mime, count, size in (await db.execute(q.group_by(StoredFile.mime_type))).all():
        cat = category_for_mime(mime)
        item = by_type.setdefault(cat, {"type": cat, "files": 0, "bytes": 0})
        item["files"] += count
        item["bytes"] += int(size)
        grp = by_group[chart_group(mime)]
        grp["files"] += count
        grp["bytes"] += int(size)
    used = sum(t["bytes"] for t in by_type.values())
    capacity = settings.platform_capacity_bytes if everyone else settings.quota_bytes
    before_q = select(func.coalesce(func.sum(StoredFile.size_bytes), 0)).where(StoredFile.deleted_at.is_(None), StoredFile.created_at < start)
    trash_q = select(func.count(), func.coalesce(func.sum(StoredFile.size_bytes), 0)).where(StoredFile.deleted_at.is_not(None))
    if not everyone:
        before_q = before_q.where(StoredFile.owner_id == user.id)
        trash_q = trash_q.where(StoredFile.owner_id == user.id)
    used_before = int((await db.execute(before_q)).scalar())
    trash_files, trash_bytes = (await db.execute(trash_q)).one()

    # ---- one pass over the audit events of this period (uploads, downloads, shares, internal access)
    GROUPS = ("documents", "images", "videos", "others")
    ext_group = {ext: chart_group(mime) for ext, mime in ALLOWED.items()}
    up = {d: {g: 0 for g in GROUPS} for d in labels}
    dl = {d: {"total": 0, "shared": 0, "users": set()} for d in labels}
    sh = {d: {"direct": 0, "link": 0, "internal": 0} for d in labels}
    file_dl: dict[str, int] = {}
    all_users: set[str] = set()
    async for d in audit.find({**base, "action": {"$in": ["upload", "download", "share_download", "share_link_create", "permission_grant", "view"]}},
                              {"timestamp": 1, "action": 1, "user_id": 1, "owner_id": 1, "ip": 1, "resource_id": 1, "details.name": 1}):
        day = d["timestamp"].strftime("%Y-%m-%d")
        if day not in up:
            continue
        act = d["action"]
        if act == "upload":
            name = (d.get("details") or {}).get("name") or ""
            up[day][ext_group.get(name.rsplit(".", 1)[-1].lower(), "others") if "." in name else "others"] += 1
        elif act in ("download", "share_download"):
            who = d.get("user_id") or f"ip:{d.get('ip')}"  # link visitors have no account, so we count IPs
            dl[day]["total"] += 1
            dl[day]["users"].add(who)
            all_users.add(who)
            if act == "share_download":
                dl[day]["shared"] += 1
            if d.get("resource_id"):
                file_dl[d["resource_id"]] = file_dl.get(d["resource_id"], 0) + 1
        elif act == "share_link_create":
            sh[day]["link"] += 1
        elif act == "permission_grant":
            sh[day]["direct"] += 1
        if act in ("view", "download") and d.get("owner_id") and d.get("user_id") != d.get("owner_id"):
            sh[day]["internal"] += 1  # a platform user opened someone else's file

    upload_series = [{"day": d, **up[d]} for d in labels]
    download_series = [{"day": d, "total": dl[d]["total"], "unique": len(dl[d]["users"]), "shared": dl[d]["shared"]} for d in labels]
    share_series = [{"day": d, **sh[d]} for d in labels]
    total_uploads = sum(sum(v.values()) for v in up.values())
    total_downloads = sum(v["total"] for v in dl.values())
    shared_downloads = sum(v["shared"] for v in dl.values())
    total_shares = sum(v["link"] + v["direct"] for v in sh.values())

    # ---- the previous period, for the "vs last period" arrows on the cards
    pb = {"timestamp": {"$gte": prev_start, "$lt": prev_end}, "result": "success", **scope}
    prev_uploads = await audit.count_documents({**pb, "action": "upload"})
    prev_downloads = await audit.count_documents({**pb, "action": {"$in": ["download", "share_download"]}})
    prev_shares = await audit.count_documents({**pb, "action": {"$in": ["share_link_create", "permission_grant"]}})

    # ---- top downloaded files
    top_ids = sorted(file_dl, key=file_dl.get, reverse=True)[:5]
    names = {}
    if top_ids:
        names = {fid: (n, m) for fid, n, m in (await db.execute(
            select(StoredFile.id, StoredFile.original_name, StoredFile.mime_type).where(StoredFile.id.in_(top_ids)))).all()}
    top_files = [{"name": names[i][0], "category": category_for_mime(names[i][1]), "downloads": file_dl[i]} for i in top_ids if i in names]

    # ---- recent uploads and downloads
    fq = select(StoredFile, User.email).join(User, User.id == StoredFile.owner_id).where(
        StoredFile.deleted_at.is_(None), StoredFile.created_at >= start, StoredFile.created_at < end)
    if not everyone:
        fq = fq.where(StoredFile.owner_id == user.id)
    recent_uploads = [{"id": f.id, "name": f.original_name, "size_bytes": f.size_bytes, "category": category_for_mime(f.mime_type),
                       "owner_email": email, "uploaded_at": _iso(f.created_at)}
                      for f, email in (await db.execute(fq.order_by(StoredFile.created_at.desc()).limit(5))).all()]
    recent_downloads = []
    async for d in audit.find({**base, "action": {"$in": ["download", "share_download"]}}).sort("timestamp", -1).limit(5):
        recent_downloads.append({"name": (d.get("details") or {}).get("name"), "user_email": d.get("user_email"),
                                 "via": "share link" if d["action"] == "share_download" else "account",
                                 "ip": d.get("ip"), "downloaded_at": _iso(d["timestamp"]), "file_id": d.get("resource_id")})
    ids = [r["file_id"] for r in recent_downloads if r["file_id"]]
    meta = {}
    if ids:
        meta = {fid: (sz, mime) for fid, sz, mime in (await db.execute(
            select(StoredFile.id, StoredFile.size_bytes, StoredFile.mime_type).where(StoredFile.id.in_(ids)))).all()}
    for r in recent_downloads:
        sz, mime = meta.get(r.pop("file_id"), (None, "application/octet-stream"))
        r["size_bytes"] = sz
        r["category"] = category_for_mime(mime)

    return {
        "range": {"from": labels[0], "to": labels[-1], "days": len(labels), "scope": "platform" if everyone else "mine"},
        "cards": {"storage_used_bytes": used, "storage_capacity_bytes": capacity, "total_files": sum(t["files"] for t in by_type.values()),
                  "total_uploads": total_uploads, "total_downloads": total_downloads, "total_shares": total_shares},
        "deltas": {"storage": _pct_change(used, used_before), "uploads": _pct_change(total_uploads, prev_uploads),
                   "downloads": _pct_change(total_downloads, prev_downloads), "shares": _pct_change(total_shares, prev_shares)},
        "storage": {"used_bytes": used, "capacity_bytes": capacity, "free_bytes": max(capacity - used, 0),
                    "by_type": sorted(by_type.values(), key=lambda t: -t["bytes"]),
                    "by_group": list(by_group.values()),
                    "trash_files": trash_files, "trash_bytes": int(trash_bytes)},
        "uploads": {"groups": list(GROUPS), "series": upload_series, "total": total_uploads},
        "downloads": {"total": total_downloads, "unique_users": len(all_users), "shared_link": shared_downloads,
                      "direct": total_downloads - shared_downloads, "series": download_series, "top_files": top_files},
        "sharing": {"series": share_series, "link": sum(v["link"] for v in sh.values()), "direct": sum(v["direct"] for v in sh.values()),
                    "internal": sum(v["internal"] for v in sh.values())},
        "recent_uploads": recent_uploads, "recent_downloads": recent_downloads,
    }


# ====================================================================== USER SECURITY PAGE
@router.get("/my-security")
async def my_security(request: Request, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Live status of each protection that applies to THIS user. The React page turns it into 10 cards."""
    km = get_key_manager()
    files = (await db.execute(select(StoredFile.kek_version, func.count()).where(
        StoredFile.owner_id == user.id).group_by(StoredFile.kek_version))).all()
    by_version = {v: c for v, c in files}
    link_rows = (await db.execute(select(SharedLink).where(SharedLink.created_by == user.id))).scalars().all()
    now = utcnow()
    active = [l for l in link_rows if not l.revoked and l.expires_at > now and
              (l.max_downloads is None or l.download_count < l.max_downloads)]
    soonest = min((l.expires_at for l in active), default=None)
    day30 = datetime.now(timezone.utc) - timedelta(days=30)
    audit = mongo_db.audit_logs
    my_downloads = await audit.count_documents({"user_id": user.id, "action": "download", "result": "success", "timestamp": {"$gte": day30}})
    downloads_of_mine = await audit.count_documents({"owner_id": user.id, "action": {"$in": ["download", "share_download"]},
                                                     "result": "success", "timestamp": {"$gte": day30}})
    my_events = await audit.count_documents({"$or": [{"user_id": user.id}, {"owner_id": user.id}]})
    my_failed = await audit.count_documents({"user_id": user.id, "result": "failure", "timestamp": {"$gte": day30}})
    last = await audit.find_one({"user_id": user.id, "action": "login", "result": "success"}, sort=[("timestamp", -1)])
    forwarded = request.headers.get("x-forwarded-proto", request.url.scheme)
    return {
        "encryption": {"algorithm": "AES-256-GCM", "files_encrypted": sum(by_version.values()), "unique_keys": sum(by_version.values()),
                       "key_versions": by_version},
        "transport": {"https": forwarded == "https", "scheme": forwarded, "environment": settings.ENVIRONMENT},
        "jwt": {"access_minutes": settings.ACCESS_TOKEN_MINUTES, "refresh_days": settings.REFRESH_TOKEN_DAYS, "algorithm": settings.JWT_ALGORITHM,
                "mfa_enabled": user.mfa_enabled},
        "oauth2": {"password_flow": True, "google_enabled": bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)},
        "rbac": {"roles": role_names(user), "is_admin": is_admin(user),
                 "can_upload": any(r in role_names(user) for r in ("admin", "user"))},
        "links": {"active": len(active), "total": len(link_rows), "revoked": sum(1 for l in link_rows if l.revoked),
                  "next_expiry": _iso(soonest)},
        "downloads": {"by_me_30d": my_downloads, "of_my_files_30d": downloads_of_mine},
        "audit": {"events": my_events, "failed_30d": my_failed, "last_login": _iso(last["timestamp"]) if last else None,
                  "last_login_ip": last.get("ip") if last else None},
        "tokens": {"link_token_bits": 256, "stored_as": "SHA-256 hash only"},
        "key_rotation": {"current_version": km.current, "files_on_current": by_version.get(km.current, 0),
                         "files_on_older": sum(c for v, c in by_version.items() if v != km.current)},
    }


# ====================================================================== ADMIN SECURITY DASHBOARD
# The six groups shown in the "Security Events" donut
EVENT_GROUP = {"repeated_failed_login": "Multiple Login Attempts", "suspicious_ip": "Suspicious IP Access",
               "unauthorized_link_access": "Unauthorized Access", "repeated_failed_download": "Unauthorized Access",
               "policy_violation": "Policy Violations", "file_threat": "Malware / File Threat",
               "admin_access_denied": "Unauthorized Access", "admin_account_targeted": "Multiple Login Attempts",
               "unknown_account_login": "Multiple Login Attempts", "admin_new_ip": "Suspicious IP Access"}
EVENT_GROUP_ORDER = ["Multiple Login Attempts", "Suspicious IP Access", "Unauthorized Access", "Policy Violations",
                     "Malware / File Threat", "Others"]


async def _window_counts(start: datetime, end: datetime) -> dict:
    """The five headline numbers for one period (called for this period AND the one before it)."""
    audit = mongo_db.audit_logs
    win = {"timestamp": {"$gte": start, "$lt": end}}
    total = await audit.count_documents({**win, "action": "login"})
    failed = await audit.count_documents({**win, "action": "login", "result": "failure"})
    unauthorized = await audit.count_documents({**win, "result": "failure", "action": {"$in": UNAUTHORIZED_ACTIONS}})
    blocked = await audit.count_documents({"$and": [win, {"$or": [{"action": {"$in": BLOCKED_ACTIONS}},
                                                                  {"action": "login", "details.reason": "account_locked"}]}]})
    events = await mongo_db.security_alerts.count_documents({"created_at": {"$gte": start, "$lt": end}})
    return {"total_logins": total, "failed_logins": failed, "successful_logins": total - failed,
            "unauthorized_attempts": unauthorized, "blocked_requests": blocked, "security_events": events}

@router.get("/security-dashboard")
async def security_dashboard(
    days: int = Query(14, ge=1, le=90),
    date_from: str | None = None,
    date_to: str | None = None,
    _: User = Depends(require_roles("admin")),   # <-- the real lock. Normal users get 403.
):
    start, end = _range(days, date_from, date_to)
    audit = mongo_db.audit_logs
    win = {"timestamp": {"$gte": start, "$lt": end}}
    labels = _days(start, end)
    now_counts = await _window_counts(start, end)
    before_counts = await _window_counts(start - (end - start), start)
    deltas = {k: _pct_change(now_counts[k], before_counts[k]) for k in now_counts}
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    logins_today = await audit.count_documents({"action": "login", "timestamp": {"$gte": today}})

    # ---- login monitoring
    logins = {d: {"success": 0, "failure": 0} for d in labels}
    async for r in audit.aggregate([
        {"$match": {**win, "action": "login"}},
        {"$group": {"_id": {"day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}, "result": "$result"},
                    "count": {"$sum": 1}}}]):
        if r["_id"]["day"] in logins:
            logins[r["_id"]["day"]][r["_id"]["result"]] = r["count"]
    login_series = [{"day": d, **logins[d]} for d in labels]
    ok = sum(v["success"] for v in logins.values())
    bad = sum(v["failure"] for v in logins.values())

    # ---- unauthorized + blocked attempts per day
    unauth_q = {**win, "result": "failure", "action": {"$in": UNAUTHORIZED_ACTIONS}}
    blocked_q = {"$and": [win, {"$or": [{"action": {"$in": BLOCKED_ACTIONS}},
                                        {"action": "login", "details.reason": "account_locked"}]}]}
    access = {d: {"unauthorized": 0, "blocked": 0} for d in labels}
    for key, q in (("unauthorized", unauth_q), ("blocked", blocked_q)):
        async for r in audit.aggregate([{"$match": q}, {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}, "count": {"$sum": 1}}}]):
            if r["_id"] in access:
                access[r["_id"]][key] = r["count"]
    access_series = [{"day": d, **access[d]} for d in labels]
    unauthorized_total = sum(v["unauthorized"] for v in access.values())
    blocked_total = sum(v["blocked"] for v in access.values())

    # ---- security events (alerts raised by the monitor), grouped by kind
    alert_win = {"created_at": {"$gte": start, "$lt": end}}
    kinds: dict[str, int] = {}
    groups = {g: 0 for g in EVENT_GROUP_ORDER}
    async for r in mongo_db.security_alerts.aggregate([{"$match": alert_win}, {"$group": {"_id": "$type", "count": {"$sum": 1}}}]):
        kinds[r["_id"]] = r["count"]
        groups[EVENT_GROUP.get(r["_id"], "Others")] += r["count"]
    events_total = sum(kinds.values())
    open_alerts = await mongo_db.security_alerts.count_documents({"resolved": False})
    severity = {"info": 0, "warning": 0, "critical": 0}
    async for r in audit.aggregate([{"$match": win}, {"$group": {"_id": "$severity", "count": {"$sum": 1}}}]):
        severity[r["_id"]] = r["count"]
    audit_total = await audit.count_documents(win)

    # ---- recent login activity (names + email + IP + status + location + time)
    recent_logins = []
    async for d in audit.find({"action": "login"}).sort("timestamp", -1).limit(12):
        recent_logins.append({"id": str(d["_id"]), "user_email": d.get("user_email"), "ip": d.get("ip"), "status": d["result"],
                              "location": d.get("location") or "Unknown", "reason": (d.get("details") or {}).get("reason"),
                              "timestamp": _iso(d["timestamp"])})
    emails = [r["user_email"] for r in recent_logins if r["user_email"]]
    if emails:
        from app.db.postgres import SessionLocal
        async with SessionLocal() as db:
            names = {e: n for e, n in (await db.execute(select(User.email, User.full_name).where(User.email.in_(emails)))).all()}
        for r in recent_logins:
            r["user_name"] = names.get(r["user_email"])

    # ---- recent security events (alerts) + riskiest IPs
    recent_events = []
    async for d in mongo_db.security_alerts.find({}).sort("created_at", -1).limit(10):
        recent_events.append({"id": str(d["_id"]), "type": d["type"], "description": d["message"], "severity": d["severity"],
                              "ip": d.get("ip"), "details": d.get("details") or {}, "resolved": d.get("resolved", False),
                              "created_at": _iso(d["created_at"])})
    top_ips = [{"ip": r["_id"], "attempts": r["count"], "last_seen": _iso(r["last"])} async for r in audit.aggregate([
        {"$match": {**win, "result": "failure", "ip": {"$ne": None}}},
        {"$group": {"_id": "$ip", "count": {"$sum": 1}, "last": {"$max": "$timestamp"}}},
        {"$sort": {"count": -1}}, {"$limit": 6}])]

    return {
        "range": {"from": labels[0], "to": labels[-1], "days": len(labels)},
        "metrics": {"total_logins": ok + bad, "successful_logins": ok, "failed_logins": bad,
                    "unauthorized_attempts": unauthorized_total, "blocked_requests": blocked_total,
                    "security_events": events_total, "open_alerts": open_alerts, "audit_records": audit_total,
                    "logins_today": logins_today,
                    "success_rate": round(ok / (ok + bad) * 100, 1) if ok + bad else None,
                    "failure_rate": round(bad / (ok + bad) * 100, 1) if ok + bad else None},
        "deltas": deltas,
        "event_groups": [{"name": g, "count": groups[g], "pct": round(groups[g] / events_total * 100) if events_total else 0}
                         for g in EVENT_GROUP_ORDER],
        "login_series": login_series, "access_series": access_series,
        "event_kinds": [{"type": k, "count": v} for k, v in sorted(kinds.items(), key=lambda kv: -kv[1])],
        "severity": severity, "recent_logins": recent_logins, "recent_events": recent_events, "top_ips": top_ips,
    }


# ====================================================================== THREAT MONITOR (admin only)
# A separate dashboard inside the Security Dashboard: who is trying to get in, and what the automatic triggers did.
LOGIN_REASON = {"bad_credentials": "Wrong password", "bad_otp": "Wrong 2FA code", "account_locked": "Account locked",
                "account_disabled": "Disabled account", "oauth_bad_state": "Forged Google callback",
                "oauth_mfa_required": "2FA required"}
THREAT_ALERT_TYPES = ["admin_access_denied", "admin_account_targeted", "unknown_account_login", "admin_new_ip",
                      "suspicious_ip", "repeated_failed_login"]


def ip_risk(attempts: int, accounts: int) -> str:
    """Simple, explainable rule: many failures, or many different accounts tried, from one IP."""
    if attempts >= settings.ALERT_FAILED_THRESHOLD * 2 or accounts >= settings.ALERT_SUSPICIOUS_IP_ACCOUNTS:
        return "high"
    if attempts >= settings.ALERT_FAILED_THRESHOLD:
        return "medium"
    return "low"


@router.get("/threat-monitor")
async def threat_monitor(
    days: int = Query(7, ge=1, le=90),
    date_from: str | None = None,
    date_to: str | None = None,
    _: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    from app.db.redis import redis_client
    from app.routers.auth import MAX_LOGIN_FAILS
    from app.services.geo import lookup_location

    start, end = _range(days, date_from, date_to)
    audit = mongo_db.audit_logs
    win = {"timestamp": {"$gte": start, "$lt": end}}
    labels = _days(start, end)
    failed_login = {**win, "action": "login", "result": "failure"}
    denied_admin = {**win, "action": "admin_access", "result": "failure"}

    # ---- per-day timeline of the three kinds of hostile activity
    timeline = {d: {"admin_denied": 0, "failed_logins": 0, "unknown_accounts": 0} for d in labels}
    async for r in audit.find({"$or": [denied_admin, failed_login]}, {"timestamp": 1, "action": 1, "details.account_exists": 1}):
        day = r["timestamp"].strftime("%Y-%m-%d")
        if day not in timeline:
            continue
        if r["action"] == "admin_access":
            timeline[day]["admin_denied"] += 1
        else:
            timeline[day]["failed_logins"] += 1
            if (r.get("details") or {}).get("account_exists") is False:
                timeline[day]["unknown_accounts"] += 1
    series = [{"day": d, **timeline[d]} for d in labels]

    # ---- 1) non-admin users who tried to enter admin areas, grouped by person
    intruders = []
    async for g in audit.aggregate([
        {"$match": denied_admin},
        {"$group": {"_id": "$user_email", "attempts": {"$sum": 1}, "last": {"$max": "$timestamp"}, "first": {"$min": "$timestamp"},
                    "ips": {"$addToSet": "$ip"}, "paths": {"$addToSet": "$details.path"}, "user_id": {"$first": "$user_id"}}},
        {"$sort": {"attempts": -1}}, {"$limit": 10}]):
        intruders.append({"email": g["_id"], "attempts": g["attempts"], "last_attempt": _iso(g["last"]), "first_attempt": _iso(g["first"]),
                          "ips": [i for i in g["ips"] if i][:3], "paths": [p for p in g["paths"] if p][:3]})
    recent_admin_attempts = [{"id": str(d["_id"]), "email": d.get("user_email"), "ip": d.get("ip"),
                              "path": (d.get("details") or {}).get("path"), "timestamp": _iso(d["timestamp"])}
                             async for d in audit.find(denied_admin).sort("timestamp", -1).limit(10)]
    admin_attempts_total = await audit.count_documents(denied_admin)

    # ---- 2) login attempts: who is being targeted, and from where
    targeted = []
    async for g in audit.aggregate([
        {"$match": {**failed_login, "user_email": {"$ne": None}}},
        {"$group": {"_id": "$user_email", "attempts": {"$sum": 1}, "ips": {"$addToSet": "$ip"}, "last": {"$max": "$timestamp"},
                    "first": {"$min": "$timestamp"}, "exists": {"$max": "$details.account_exists"}, "reasons": {"$addToSet": "$details.reason"}}},
        {"$sort": {"attempts": -1}}, {"$limit": 10}]):
        targeted.append({"email": g["_id"], "attempts": g["attempts"], "distinct_ips": len([i for i in g["ips"] if i]),
                         "last_attempt": _iso(g["last"]), "first_attempt": _iso(g["first"]),
                         "reasons": [LOGIN_REASON.get(r, r) for r in g["reasons"] if r]})
    by_ip = []
    async for g in audit.aggregate([
        {"$match": {**failed_login, "ip": {"$ne": None}}},
        {"$group": {"_id": "$ip", "attempts": {"$sum": 1}, "emails": {"$addToSet": "$user_email"}, "last": {"$max": "$timestamp"},
                    "first": {"$min": "$timestamp"}}},
        {"$sort": {"attempts": -1}}, {"$limit": 8}]):
        accounts = len([e for e in g["emails"] if e])
        by_ip.append({"ip": g["_id"], "attempts": g["attempts"], "accounts_tried": accounts, "last_seen": _iso(g["last"]),
                      "first_seen": _iso(g["first"]), "risk": ip_risk(g["attempts"], accounts), "location": await lookup_location(g["_id"])})

    # ---- enrich e-mails with what the database knows (does the account exist? is it an admin? is it disabled?)
    emails = {t["email"] for t in targeted} | {i["email"] for i in intruders if i["email"]}
    feed_docs = [d async for d in audit.find({**win, "action": "login"}).sort("timestamp", -1).limit(25)]
    emails |= {d.get("user_email") for d in feed_docs if d.get("user_email")}
    known: dict[str, User] = {}
    if emails:
        known = {u.email: u for u in (await db.execute(select(User).where(User.email.in_(emails)))).scalars().all()}

    def who(email: str | None) -> dict:
        u = known.get(email or "")
        return {"known": u is not None, "name": u.full_name if u else None, "is_admin": bool(u and is_admin(u)),
                "disabled": bool(u and not u.is_active), "roles": role_names(u) if u else []}

    locked_now = 0
    for t in targeted:
        t.update(who(t["email"]))
        t["locked"] = int(await redis_client.get(f"loginfail:{t['email']}") or 0) >= MAX_LOGIN_FAILS
        locked_now += 1 if t["locked"] else 0
    for i in intruders:
        i.update(who(i["email"]))

    feed = []
    for d in feed_docs:
        info = who(d.get("user_email"))
        reason = (d.get("details") or {}).get("reason")
        status = "success" if d["result"] == "success" else "locked" if reason == "account_locked" else "failed"
        feed.append({"id": str(d["_id"]), "email": d.get("user_email"), "ip": d.get("ip"), "location": d.get("location") or "Unknown",
                     "status": status, "reason": LOGIN_REASON.get(reason, reason), "timestamp": _iso(d["timestamp"]),
                     "provider": (d.get("details") or {}).get("provider", "password"), **info,
                     "unknown_account": (d["result"] == "failure" and not info["known"])})

    # ---- the trigger rules and how often each one fired
    fired: dict[str, int] = {}
    async for r in mongo_db.security_alerts.aggregate([{"$match": {"created_at": {"$gte": start, "$lt": end}}},
                                                       {"$group": {"_id": "$type", "n": {"$sum": 1}}}]):
        fired[r["_id"]] = r["n"]
    rules = [
        {"id": "admin_access_denied", "name": "Non-admin enters an admin area", "severity": "critical",
         "when": "A signed-in user without the admin role calls an admin page or admin API",
         "then": "Critical alert + notification to every admin (one per user per 5 minutes)"},
        {"id": "admin_account_targeted", "name": "Administrator account under attack", "severity": "critical",
         "when": f"{settings.ADMIN_FAIL_THRESHOLD} failed logins on an admin account within 10 minutes", "then": "Critical alert + notification"},
        {"id": "repeated_failed_login", "name": "Repeated failed logins from one IP", "severity": "critical",
         "when": f"{settings.ALERT_FAILED_THRESHOLD} failed logins from the same IP within 10 minutes", "then": "Critical alert + notification"},
        {"id": "suspicious_ip", "name": "One IP tries many accounts", "severity": "critical",
         "when": f"Failed logins on {settings.ALERT_SUSPICIOUS_IP_ACCOUNTS} different accounts from one IP within 10 minutes", "then": "Critical alert + notification"},
        {"id": "unknown_account_login", "name": "Login attempts for accounts that do not exist", "severity": "warning",
         "when": f"{settings.UNKNOWN_ACCOUNT_THRESHOLD} different unknown e-mails tried from one IP within 10 minutes", "then": "Warning alert + notification"},
        {"id": "admin_new_ip", "name": "Administrator signs in from a new IP", "severity": "warning",
         "when": "An admin login succeeds from an IP address never used before by that admin", "then": "Warning alert + notification"},
    ]
    for r in rules:
        r["fired"] = fired.get(r["id"], 0)

    recent_alerts = [{"id": str(d["_id"]), "type": d["type"], "severity": d["severity"], "message": d["message"], "ip": d.get("ip"),
                      "resolved": d.get("resolved", False), "created_at": _iso(d["created_at"])}
                     async for d in mongo_db.security_alerts.find({"type": {"$in": THREAT_ALERT_TYPES}}).sort("created_at", -1).limit(10)]
    open_threats = await mongo_db.security_alerts.count_documents({"type": {"$in": THREAT_ALERT_TYPES}, "resolved": False})
    failed_total = await audit.count_documents(failed_login)
    unknown_total = await audit.count_documents({**failed_login, "details.account_exists": False})

    return {
        "range": {"from": labels[0], "to": labels[-1], "days": len(labels)},
        "metrics": {"admin_attempts": admin_attempts_total, "intruders": len(intruders), "failed_logins": failed_total,
                    "unknown_attempts": unknown_total, "locked_now": locked_now, "open_threats": open_threats},
        "series": series, "intruders": intruders, "recent_admin_attempts": recent_admin_attempts,
        "login_feed": feed, "targeted_accounts": targeted, "attacker_ips": by_ip, "rules": rules, "recent_alerts": recent_alerts,
    }


@router.get("/threat-feed")
async def threat_feed(since: str, _: User = Depends(require_roles("admin"))):
    """Polled every few seconds by the admin panel: returns alerts raised AFTER `since` so a pop-up can be shown."""
    try:
        t = datetime.fromisoformat(since.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, "since must be an ISO date-time")
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    alerts = [{"id": str(d["_id"]), "type": d["type"], "severity": d["severity"], "message": d["message"], "ip": d.get("ip"),
               "created_at": _iso(d["created_at"])}
              async for d in mongo_db.security_alerts.find({"created_at": {"$gt": t}}).sort("created_at", 1).limit(10)]
    return {"alerts": alerts, "server_time": datetime.now(timezone.utc).isoformat()}


@router.post("/threat-test")
async def send_test_alert(request: Request, admin: User = Depends(require_roles("admin"))):
    """Fires one harmless sample alert: it must appear in the bell, as a pop-up and in the alert list.
    If it does, the notification pipeline works and any missing real alert has another cause."""
    from app.core.deps import client_ip
    from app.services.audit import create_alert

    await create_alert("admin_access_denied", "TEST ALERT: this is a simulated intrusion sent by " + admin.email, "warning",
                       admin.id, client_ip(request), {"test": True, "email": admin.email})
    return {"sent": True}


# ====================================================================== ACTIVITY HEATMAP (dashboards)
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


@router.get("/activity-heatmap")
async def activity_heatmap(days: int = Query(14, ge=1, le=60), tz: str = "UTC", user: User = Depends(get_current_user)):
    """How busy is the vault at each hour of each weekday? 7 rows (Mon..Sun) x 24 columns (0..23).
    Users see their own activity; admins see the whole platform. `tz` = the browser's time zone, e.g. Asia/Kolkata."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    match = {"timestamp": {"$gte": since}, **_scope(user)}
    zone = tz if re.fullmatch(r"[A-Za-z_]+(/[A-Za-z0-9_+\-]+){0,2}", tz) else "UTC"

    async def count(zone_name: str) -> list[dict]:
        pipeline = [{"$match": match}, {"$group": {
            "_id": {"dow": {"$dayOfWeek": {"date": "$timestamp", "timezone": zone_name}},
                    "hour": {"$hour": {"date": "$timestamp", "timezone": zone_name}}}, "n": {"$sum": 1}}}]
        return [r async for r in mongo_db.audit_logs.aggregate(pipeline)]

    try:
        rows = await count(zone)
    except Exception:  # unknown time zone name: fall back to UTC instead of failing the dashboard
        zone, rows = "UTC", await count("UTC")
    matrix = [[0] * 24 for _ in range(7)]
    for r in rows:
        matrix[(r["_id"]["dow"] + 5) % 7][r["_id"]["hour"]] += r["n"]   # Mongo: 1 = Sunday  ->  our row 0 = Monday
    peak, peak_n = None, 0
    for di, row in enumerate(matrix):
        for h, n in enumerate(row):
            if n > peak_n:
                peak, peak_n = {"day": DAY_NAMES[di], "hour": h, "count": n}, n
    return {"matrix": matrix, "max": peak_n, "total": sum(map(sum, matrix)), "peak": peak, "tz": zone, "days": days,
            "day_names": DAY_NAMES}


# ====================================================================== MY SECURITY DASHBOARD (every user)
@router.get("/my-security-dashboard")
async def my_security_dashboard(
    days: int = Query(30, ge=1, le=366),
    date_from: str | None = None,
    date_to: str | None = None,
    user: User = Depends(get_current_user),
):
    """The same idea as the admin Security Dashboard, but only about ONE account: my logins, what was denied to me,
    attempts by other people on my files, and security events about me. Nothing about other users is shown."""
    start, end = _range(days, date_from, date_to)
    audit = mongo_db.audit_logs
    labels = _days(start, end)
    mine = {"user_id": user.id}
    on_my_files = {"owner_id": user.id, "user_id": {"$ne": user.id}, "result": "failure"}   # someone else was denied access to MY file

    async def counts(s_: datetime, e_: datetime) -> dict:
        win = {"timestamp": {"$gte": s_, "$lt": e_}}
        total = await audit.count_documents({**win, **mine, "action": "login"})
        failed = await audit.count_documents({**win, **mine, "action": "login", "result": "failure"})
        return {"total_logins": total, "failed_logins": failed, "successful_logins": total - failed,
                "unauthorized_attempts": await audit.count_documents({**win, **mine, "result": "failure", "action": {"$in": UNAUTHORIZED_ACTIONS}}),
                "attempts_on_my_files": await audit.count_documents({**win, **on_my_files}),
                "security_events": await mongo_db.security_alerts.count_documents({"created_at": {"$gte": s_, "$lt": e_}, "user_id": user.id})}

    now_c = await counts(start, end)
    before_c = await counts(start - (end - start), start)
    deltas = {k: _pct_change(now_c[k], before_c[k]) for k in now_c}
    win = {"timestamp": {"$gte": start, "$lt": end}}

    logins = {d: {"success": 0, "failure": 0} for d in labels}
    async for r in audit.aggregate([{"$match": {**win, **mine, "action": "login"}}, {"$group": {
            "_id": {"day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}, "result": "$result"}, "n": {"$sum": 1}}}]):
        if r["_id"]["day"] in logins:
            logins[r["_id"]["day"]][r["_id"]["result"]] = r["n"]
    access = {d: {"denied": 0, "on_my_files": 0} for d in labels}
    for key, q in (("denied", {**mine, "result": "failure", "action": {"$in": UNAUTHORIZED_ACTIONS}}), ("on_my_files", on_my_files)):
        async for r in audit.aggregate([{"$match": {**win, **q}}, {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}, "n": {"$sum": 1}}}]):
            if r["_id"] in access:
                access[r["_id"]][key] = r["n"]

    recent_logins = [{"id": str(d["_id"]), "status": d["result"], "ip": d.get("ip"), "location": d.get("location") or "Unknown",
                      "reason": (d.get("details") or {}).get("reason"), "method": (d.get("details") or {}).get("provider", "password"),
                      "timestamp": _iso(d["timestamp"])} async for d in audit.find({**mine, "action": "login"}).sort("timestamp", -1).limit(8)]
    events = [{"id": str(d["_id"]), "kind": "attempt on your file" if d.get("user_id") != user.id else "denied to you", "description": describe(d),
               "ip": d.get("ip"), "timestamp": _iso(d["timestamp"]), "severity": d.get("severity", "warning")}
              async for d in audit.find({"$or": [{**mine, "result": "failure"}, on_my_files]}).sort("timestamp", -1).limit(8)]
    alerts = [{"id": str(d["_id"]), "type": d["type"], "message": d["message"], "severity": d["severity"], "ip": d.get("ip"),
               "resolved": d.get("resolved", False), "created_at": _iso(d["created_at"])}
              async for d in mongo_db.security_alerts.find({"user_id": user.id}).sort("created_at", -1).limit(5)]
    last_ok = await audit.find_one({**mine, "action": "login", "result": "success"}, sort=[("timestamp", -1)])
    total = now_c["total_logins"]
    return {
        "range": {"from": labels[0], "to": labels[-1], "days": len(labels)},
        "metrics": {**now_c, "success_rate": round(now_c["successful_logins"] / total * 100, 1) if total else None,
                    "failure_rate": round(now_c["failed_logins"] / total * 100, 1) if total else None,
                    "last_login": _iso(last_ok["timestamp"]) if last_ok else None, "last_ip": last_ok.get("ip") if last_ok else None},
        "deltas": deltas,
        "login_series": [{"day": d, **logins[d]} for d in labels],
        "access_series": [{"day": d, **access[d]} for d in labels],
        "recent_logins": recent_logins, "recent_events": events, "alerts": alerts,
    }
