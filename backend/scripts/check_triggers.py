"""Offline check of the detection rules (no Docker, no database):   python scripts/check_triggers.py
It runs the REAL code of app/services/audit.py and app/services/detection.py against a tiny fake Redis and fake MongoDB,
and shows which security alerts each scenario would raise."""
import asyncio
import os
import sys
import types
from unittest.mock import AsyncMock, MagicMock

HERE = os.path.dirname(__file__)


class FakeRedis:                       # just enough of Redis for the rules
    def __init__(s): s.d, s.sets = {}, {}
    async def get(s, k): return s.d.get(k)
    async def set(s, k, v, ex=None, nx=False):
        if nx and k in s.d: return None
        s.d[k] = v; return True
    async def incr(s, k): s.d[k] = int(s.d.get(k, 0)) + 1; return s.d[k]
    async def expire(s, k, t): return True
    async def sadd(s, k, v): s.sets.setdefault(k, set()).add(v)
    async def scard(s, k): return len(s.sets.get(k, ()))
    async def sismember(s, k, v): return v in s.sets.get(k, ())


class EmptyCursor:                     # find() with nothing saved: the default rules apply
    def __aiter__(s): return s
    async def __anext__(s): raise StopAsyncIteration


def mod(name, **attrs):
    m = types.ModuleType(name); m.__dict__.update(attrs); sys.modules[name] = m; return m


for pkg in ["app", "app.core", "app.db", "app.models", "app.services"]: mod(pkg)
mod("fastapi", Request=object); sys.modules["sqlalchemy"] = MagicMock()
mod("app.core.config", settings=types.SimpleNamespace(ADMIN_FAIL_THRESHOLD=3, UNKNOWN_ACCOUNT_THRESHOLD=3, ALERT_FAILED_THRESHOLD=5, ALERT_SUSPICIOUS_IP_ACCOUNTS=3, ALERT_DOWNLOAD_BURST=20))
mod("app.core.deps", client_ip=lambda r: "1.1.1.1")
mongo = MagicMock(); mongo.detection_rules.find = lambda q: EmptyCursor(); mongo.audit_logs.insert_one = AsyncMock()
mod("app.db.mongo", mongo_db=mongo); mod("app.db.redis", redis_client=FakeRedis()); mod("app.db.postgres", SessionLocal=MagicMock())
mod("app.models.mongo", AuditLogDoc=MagicMock(), SecurityAlertDoc=MagicMock()); mod("app.models.postgres", Role=1, User=1, UserRole=1)
mod("app.services.geo", lookup_location=AsyncMock(return_value="Local network")); mod("app.services.notifications", notify_admins=AsyncMock())
blocked = []
async def _block_ip(ip, reason, by, minutes=None, auto=False): blocked.append((ip, minutes, auto))
mod("app.services.blocklist", block_ip=_block_ip, is_blockable=lambda ip: not ip.startswith(("10.", "192.168.", "127.", "172.16.")))

def load(path, name):
    m = types.ModuleType(name); m.__dict__["__name__"] = name
    sys.modules[name] = m
    exec(compile(open(os.path.join(HERE, "..", "app", "services", path)).read(), path, "exec"), m.__dict__)
    return m

detection = load("detection.py", "app.services.detection")
audit = load("audit.py", "app.services.audit")
fired = []
async def fake_alert(t, msg, sev="warning", uid=None, ip=None, details=None): fired.append((t, sev))
audit.create_alert = fake_alert
async def fake_is_admin(email): return email == "admin@trustshare.com"
audit.is_admin_email = fake_is_admin


def doc(action, result, email=None, uid=None, ip="9.9.9.9", **details): return {"action": action, "result": result, "user_email": email, "user_id": uid, "ip": ip, "details": details}
async def run(*docs):
    for d in docs: await audit._evaluate(d)
def types_fired(): return [t for t, _ in fired]


async def main():
    # 1) failed logins: alert exactly at the 5th failure
    await run(*[doc("login", "failure", "bob@x.com", "u1", ip="1.0.0.1", reason="bad_credentials", account_exists=True) for _ in range(4)]); assert fired == []
    await run(doc("login", "failure", "bob@x.com", "u1", ip="1.0.0.1", reason="bad_credentials", account_exists=True)); assert types_fired() == ["repeated_failed_login"], fired
    assert fired[0][1] == "critical"        # rule severity "high" is stored as "critical"
    # 2) unauthorized file access: 5 denied downloads
    fired.clear(); await run(*[doc("download", "failure", "eve@x.com", "u2", ip="2.0.0.2", reason="forbidden") for _ in range(5)]); assert types_fired() == ["repeated_failed_download"], fired
    # 3) excessive downloads: 20 in the window by one user
    fired.clear(); await run(*[doc("download", "success", "dan@x.com", "u3", ip="3.0.0.3") for _ in range(20)]); assert types_fired() == ["download_burst"], fired
    # 4) expired link: 3 attempts ->  alert;  revoked link: 3 attempts -> alert (separate rules)
    fired.clear(); await run(*[doc("share_access", "failure", ip="4.0.0.4", reason="expired") for _ in range(3)]); assert types_fired() == ["expired_link_access"], fired
    fired.clear(); await run(*[doc("share_access", "failure", ip="5.0.0.5", reason="revoked") for _ in range(3)]); assert types_fired() == ["revoked_link_access"], fired
    # 5) guessed link tokens
    fired.clear(); await run(*[doc("share_access", "failure", ip="6.0.0.6", reason="unknown_token") for _ in range(5)]); assert types_fired() == ["unauthorized_link_access"], fired
    # 6) non-admin in an admin area: one alert per user per window
    fired.clear(); await run(*[doc("admin_access", "failure", "bob@x.com", "u1", path="/admin") for _ in range(3)]); assert types_fired() == ["admin_access_denied"], fired
    # 7) admin account attacked / unknown accounts / many accounts from one IP
    fired.clear(); await run(*[doc("login", "failure", "admin@trustshare.com", "a1", ip="7.0.0.7", reason="bad_credentials", account_exists=True) for _ in range(3)]); assert "admin_account_targeted" in types_fired(), fired
    fired.clear(); await run(*[doc("login", "failure", f"ghost{i}@x.com", None, ip="8.0.0.8", reason="bad_credentials", account_exists=False) for i in range(3)])
    assert set(types_fired()) == {"suspicious_ip", "unknown_account_login"}, fired
    # 8) admin signs in from a new IP (the first IP is silent)
    fired.clear(); await run(doc("login", "success", "admin@trustshare.com", "a1", ip="10.0.0.1")); assert fired == []
    await run(doc("login", "success", "admin@trustshare.com", "a1", ip="10.0.0.2")); assert types_fired() == ["admin_new_ip"], fired
    # 9) a rule can be switched off, and a threshold can be changed
    rules = await detection.get_rules(); rules["failed_login"]["enabled"] = False
    fired.clear(); await run(*[doc("login", "failure", "zed@x.com", "u9", ip="11.0.0.1", reason="bad_credentials", account_exists=True) for _ in range(6)]); assert "repeated_failed_login" not in types_fired(), fired
    rules["failed_login"].update(enabled=True, threshold=2)
    fired.clear(); await run(*[doc("login", "failure", "yan@x.com", "u8", ip="12.0.0.1", reason="bad_credentials", account_exists=True) for _ in range(2)]); assert types_fired() == ["repeated_failed_login"], fired
    # 10) dangerous upload
    fired.clear(); await run(doc("upload", "failure", "bob@x.com", "u1", ip="13.0.0.1", reason="Executable program disguised as a document", category="file_threat")); assert types_fired() == ["file_threat"], fired
    # 11) AUTO-BLOCK: a rule with auto_block shuts the attacking IP out (but never a private address)
    rules["failed_login"].update(enabled=True, threshold=3, auto_block=True, block_minutes=15)
    fired.clear(); blocked.clear()
    await run(*[doc("login", "failure", "mal@x.com", "u7", ip="203.0.113.50", reason="bad_credentials", account_exists=True) for _ in range(3)])
    assert blocked == [("203.0.113.50", 15, True)], blocked
    blocked.clear(); await run(*[doc("login", "failure", "mal@x.com", "u7", ip="192.168.1.5", reason="bad_credentials", account_exists=True) for _ in range(3)])
    assert blocked == [], blocked                      # your own network is protected
    print("ALL DETECTION RULES BEHAVE CORRECTLY (11 scenarios, incl. auto-block)")


asyncio.run(main())
