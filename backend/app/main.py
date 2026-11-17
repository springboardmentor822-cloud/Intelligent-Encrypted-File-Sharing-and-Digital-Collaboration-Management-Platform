"""TrustShare Milestone 3 API. SQLite keeps the integration demo self-contained."""
import os
import smtplib
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .security_monitoring.detection import detect

DB_PATH = Path(os.getenv("TRUSTSHARE_DB", Path(__file__).resolve().parents[1] / "trustshare.db"))
app = FastAPI(title="TrustShare Milestone 3 API", version="1.0.0", description="Activity, audit, notifications, reports, analytics, and security monitoring.")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("TRUSTSHARE_ORIGINS", "http://localhost:5173").split(","), allow_methods=["*"], allow_headers=["*"])

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def initialize():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS activities (
          id TEXT PRIMARY KEY, user_id TEXT, username TEXT, activity_type TEXT NOT NULL,
          file_id TEXT, file_name TEXT, description TEXT NOT NULL, status TEXT NOT NULL,
          ip_address TEXT, timestamp TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_activities_type_time ON activities(activity_type,timestamp);
        CREATE INDEX IF NOT EXISTS idx_activities_user_time ON activities(user_id,timestamp);
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY, user_id TEXT, username TEXT, activity_type TEXT NOT NULL,
          file_id TEXT, file_name TEXT, description TEXT NOT NULL, status TEXT NOT NULL,
          ip_address TEXT, timestamp TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp);
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
          type TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS security_events (
          id TEXT PRIMARY KEY, user_id TEXT, username TEXT, activity_type TEXT NOT NULL,
          description TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
          ip_address TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, owner_name TEXT NOT NULL,
          size_bytes INTEGER NOT NULL, mime_type TEXT NOT NULL, uploaded_at TEXT NOT NULL,
          shared INTEGER NOT NULL DEFAULT 0, downloads INTEGER NOT NULL DEFAULT 0
        );
        """)
        if conn.execute("SELECT COUNT(*) FROM activities").fetchone()[0] == 0:
            seed_demo(conn)

def seed_demo(conn):
    users = [("u-olivia", "Olivia Rhye"), ("u-phoenix", "Phoenix Baker"), ("u-lana", "Lana Steiner"), ("u-candice", "Candice Wu"), ("u-marcus", "Marcus Chen")]
    now = datetime.now(timezone.utc)
    files = [
        ("f-001", "Q4-financial-report.pdf", "u-olivia", "Olivia Rhye", 18_400_000, "application/pdf", 0, 42),
        ("f-002", "brand-guidelines.fig", "u-lana", "Lana Steiner", 6_200_000, "application/figma", 1, 38),
        ("f-003", "product-roadmap.docx", "u-candice", "Candice Wu", 2_100_000, "application/docx", 1, 27),
        ("f-004", "launch-assets.zip", "u-phoenix", "Phoenix Baker", 68_369_000_000, "application/zip", 1, 62),
        ("f-005", "team-photo.png", "u-marcus", "Marcus Chen", 4_300_000, "image/png", 0, 11),
    ]
    for i, (fid, name, uid, username, size, mime, shared, downloads) in enumerate(files):
        conn.execute("INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?)", (fid, name, uid, username, size, mime, (now-timedelta(days=i+1)).isoformat(), shared, downloads))
    sample = [
        ("u-olivia", "Olivia Rhye", "upload", "f-001", "Uploaded a file", "success", "10.0.0.12", 2),
        ("u-phoenix", "Phoenix Baker", "share", "f-004", "Shared a file with Marcus Chen", "success", "10.0.0.18", 8),
        ("u-lana", "Lana Steiner", "download", "f-002", "Downloaded brand-guidelines.fig", "success", "10.0.0.24", 16),
        ("u-demo", "Demi Wilkinson", "login_failed", None, "Failed login attempt", "failed", "185.14.22.8", 24),
        ("u-candice", "Candice Wu", "link_created", "f-003", "Created a sharing link", "success", "10.0.0.31", 41),
        ("u-marcus", "Marcus Chen", "access", "f-004", "Accessed launch-assets.zip", "success", "10.0.0.42", 60),
    ]
    for uid, username, kind, fid, desc, status, ip, mins in sample:
        f = conn.execute("SELECT name FROM files WHERE id=?", (fid,)).fetchone() if fid else None
        item = (str(uuid.uuid4()), uid, username, kind, fid, f[0] if f else None, desc, status, ip, (now-timedelta(minutes=mins)).isoformat())
        conn.execute("INSERT INTO activities VALUES(?,?,?,?,?,?,?,?,?,?)", item)
        conn.execute("INSERT INTO audit_logs VALUES(?,?,?,?,?,?,?,?,?,?)", item)
    for i, (title, message, kind) in enumerate([
        ("Multiple failed login attempts", "5 attempts detected for Demi Wilkinson from 185.14.22.8", "security"),
        ("Your link expires tomorrow", "Q4-financial-report.pdf sharing link expires in 24 hours", "reminder"),
        ("Phoenix shared a file with you", "Phoenix Baker shared launch-assets.zip", "sharing"),
    ]):
        conn.execute("INSERT INTO notifications VALUES(?,?,?,?,?,?,?)", (f"n-demo-{i}", "u-olivia", title, message, kind, 0 if i != 2 else 1, (now-timedelta(minutes=24+i*30)).isoformat()))
    conn.execute("INSERT INTO security_events VALUES(?,?,?,?,?,?,?,?,?)", ("se-demo-1", "u-demo", "Demi Wilkinson", "login_failed", "5 failed login attempts within 10 minutes", "high", "open", "185.14.22.8", (now-timedelta(minutes=24)).isoformat()))

@app.on_event("startup")
def startup(): initialize()

def require_admin(x_admin_token: str | None = Header(default=None)):
    expected = os.getenv("TRUSTSHARE_ADMIN_TOKEN")
    if expected and x_admin_token != expected:
        raise HTTPException(status_code=403, detail="Administrator access required")

class ActivityIn(BaseModel):
    user_id: str | None = None
    username: str | None = None
    activity_type: str = Field(min_length=2, max_length=80)
    file_id: str | None = None
    file_name: str | None = None
    recipient_user_id: str | None = None
    description: str = Field(min_length=2, max_length=500)
    status: str = Field(default="success", pattern="^(success|failed|blocked)$")
    ip_address: str | None = None

@app.get("/health")
def health(): return {"status": "ok", "database": "sqlite", "milestone": 3}

def insert_notification(conn, user_id, title, message, kind):
    conn.execute("INSERT INTO notifications VALUES(?,?,?,?,?,?,?)", (str(uuid.uuid4()), user_id, title, message, kind, 0, now_iso()))
    recipient = os.getenv(f"TRUSTSHARE_EMAIL_{str(user_id).upper().replace('-', '_')}")
    if recipient and os.getenv("SMTP_HOST"):
        mail = EmailMessage(); mail["Subject"] = title; mail["From"] = os.getenv("SMTP_FROM", "trustshare@localhost"); mail["To"] = recipient; mail.set_content(message)
        with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.getenv("SMTP_PORT", "587")), timeout=5) as smtp:
            if os.getenv("SMTP_USER"):
                smtp.starttls(); smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
            smtp.send_message(mail)

@app.post("/activities", status_code=201)
def record_activity(payload: ActivityIn):
    event = payload.model_dump()
    event["timestamp"] = now_iso(); event["id"] = str(uuid.uuid4())
    with db() as conn:
        conn.execute("INSERT INTO activities VALUES(?,?,?,?,?,?,?,?,?,?)", (event["id"], event["user_id"], event["username"], event["activity_type"], event["file_id"], event["file_name"], event["description"], event["status"], event["ip_address"], event["timestamp"]))
        conn.execute("INSERT INTO audit_logs VALUES(?,?,?,?,?,?,?,?,?,?)", (event["id"], event["user_id"], event["username"], event["activity_type"], event["file_id"], event["file_name"], event["description"], event["status"], event["ip_address"], event["timestamp"]))
        if event["activity_type"] == "download" and event["file_id"]:
            conn.execute("UPDATE files SET downloads=downloads+1 WHERE id=?", (event["file_id"],))
            owner = conn.execute("SELECT owner_id,owner_name,name FROM files WHERE id=?", (event["file_id"],)).fetchone()
            if owner and owner[0] != event["user_id"]:
                insert_notification(conn, owner[0], "File downloaded", f"{event['username'] or 'A user'} downloaded {owner[2]}", "download")
        if event["activity_type"] == "share" and event["file_id"]:
            file = conn.execute("SELECT name FROM files WHERE id=?", (event["file_id"],)).fetchone()
            if file and event["recipient_user_id"]:
                insert_notification(conn, event["recipient_user_id"], "A file was shared with you", f"{event['username'] or 'A teammate'} shared {file[0]} with you", "sharing")
        alerts = detect(conn, event)
        for alert in alerts:
            conn.execute("INSERT INTO security_events VALUES(?,?,?,?,?,?,?,?,?)", (str(uuid.uuid4()), event["user_id"], event["username"], event["activity_type"], f"Rule {alert['rule']} triggered ({alert['count']} events)", alert["severity"], "open", event["ip_address"], event["timestamp"]))
            insert_notification(conn, "admin", "Suspicious activity detected", f"{alert['rule']} · {event['username'] or event['user_id'] or 'Unknown user'}", "security")
    return {"activity_id": event["id"], "timestamp": event["timestamp"], "alerts": alerts}

def rows(sql, args=()):
    with db() as conn: return [dict(r) for r in conn.execute(sql, args).fetchall()]

@app.get("/activities", dependencies=[Depends(require_admin)])
def activities(user_id: str | None = None, activity_type: str | None = None, status: str | None = None, start: str | None = None, end: str | None = None, limit: int = Query(100, ge=1, le=500)):
    where=[]; args=[]
    for col,val in [("user_id",user_id),("activity_type",activity_type),("status",status)]:
        if val: where.append(f"{col}=?"); args.append(val)
    for col,val,op in [("timestamp",start,">="),("timestamp",end,"<=")]:
        if val: where.append(f"{col}{op}?"); args.append(val)
    return rows("SELECT * FROM activities"+(" WHERE "+" AND ".join(where) if where else "")+" ORDER BY timestamp DESC LIMIT ?", (*args,limit))

@app.get("/audit-logs", dependencies=[Depends(require_admin)])
def audit_logs(user_id: str | None = None, file_id: str | None = None, activity_type: str | None = None, status: str | None = None, start: str | None = None, end: str | None = None, limit: int = Query(100, ge=1, le=500)):
    where=[]; args=[]
    for col,val in [("user_id",user_id),("file_id",file_id),("activity_type",activity_type),("status",status)]:
        if val: where.append(f"{col}=?"); args.append(val)
    for col,val,op in [("timestamp",start,">="),("timestamp",end,"<=")]:
        if val: where.append(f"{col}{op}?"); args.append(val)
    return rows("SELECT * FROM audit_logs"+(" WHERE "+" AND ".join(where) if where else "")+" ORDER BY timestamp DESC LIMIT ?", (*args,limit))

@app.get("/audit-logs/user/{user_id}", dependencies=[Depends(require_admin)])
def audit_user(user_id: str): return rows("SELECT * FROM audit_logs WHERE user_id=? ORDER BY timestamp DESC",(user_id,))

@app.get("/audit-logs/file/{file_id}", dependencies=[Depends(require_admin)])
def audit_file(file_id: str): return rows("SELECT * FROM audit_logs WHERE file_id=? ORDER BY timestamp DESC",(file_id,))

@app.get("/notifications")
def notifications(user_id: str = "u-olivia", unread_only: bool = False):
    return rows("SELECT * FROM notifications WHERE user_id=?"+(" AND is_read=0" if unread_only else "")+" ORDER BY created_at DESC",(user_id,))

@app.patch("/notifications/{notification_id}/read")
def mark_read(notification_id: str, user_id: str = "u-olivia"):
    with db() as conn:
        cur=conn.execute("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?",(notification_id,user_id))
        if cur.rowcount == 0: raise HTTPException(404,"Notification not found")
    return {"id":notification_id,"is_read":True}

@app.get("/security/events", dependencies=[Depends(require_admin)])
def security_events(severity: str | None=None, event_type: str | None=None, status: str | None=None, user_id: str | None=None):
    where=[]; args=[]
    for col,val in [("severity",severity),("activity_type",event_type),("status",status),("user_id",user_id)]:
        if val: where.append(f"{col}=?"); args.append(val)
    return rows("SELECT * FROM security_events"+(" WHERE "+" AND ".join(where) if where else "")+" ORDER BY created_at DESC",args)

@app.patch("/security/events/{event_id}/resolve", dependencies=[Depends(require_admin)])
def resolve_event(event_id: str):
    with db() as conn:
        cur=conn.execute("UPDATE security_events SET status='resolved' WHERE id=?",(event_id,))
        if not cur.rowcount: raise HTTPException(404,"Security event not found")
    return {"id":event_id,"status":"resolved"}

@app.get("/reports/activity", dependencies=[Depends(require_admin)])
def report_activity(user_id: str | None=None, activity_type: str | None=None, start: str | None=None, end: str | None=None):
    events=activities(user_id,activity_type,None,start,end,500)
    counts={}
    for e in events:
        key=e["activity_type"]; counts.setdefault(key,{"activity_type":key,"total":0,"failed":0}); counts[key]["total"]+=1; counts[key]["failed"]+=int(e["status"]!="success")
    return {"total_events":len(events),"by_activity":list(counts.values()),"events":events}

@app.get("/reports/security", dependencies=[Depends(require_admin)])
def report_security(start: str | None=None, end: str | None=None):
    where=[]; args=[]
    for col,val,op in [("created_at",start,">="),("created_at",end,"<=")]:
        if val: where.append(f"{col}{op}?"); args.append(val)
    events=rows("SELECT * FROM security_events"+(" WHERE "+" AND ".join(where) if where else "")+" ORDER BY created_at DESC",args)
    return {"total_events":len(events),"by_severity":{level:sum(1 for e in events if e["severity"]==level) for level in ("low","medium","high")},"events":events}

@app.get("/analytics/storage", dependencies=[Depends(require_admin)])
def storage_analytics():
    with db() as conn:
        row=conn.execute("SELECT COUNT(*),COALESCE(SUM(size_bytes),0) FROM files").fetchone()
    return {"total_files":row[0],"total_bytes":row[1],"total_gb":round(row[1]/1_000_000_000,3),"capacity_gb":100,"used_percent":round(row[1]/1_000_000_000,3)}

@app.get("/analytics/users/storage", dependencies=[Depends(require_admin)])
def user_storage(): return rows("SELECT owner_id AS user_id,owner_name AS username,COUNT(*) AS file_count,SUM(size_bytes) AS bytes FROM files GROUP BY owner_id,owner_name ORDER BY bytes DESC")

@app.get("/analytics/files", dependencies=[Depends(require_admin)])
def file_stats():
    with db() as conn:
        totals=conn.execute("SELECT COUNT(*),COALESCE(SUM(shared),0) FROM files").fetchone()
        popular=[dict(r) for r in conn.execute("SELECT id,name,downloads FROM files ORDER BY downloads DESC LIMIT 5")]
        daily=[dict(r) for r in conn.execute("SELECT substr(uploaded_at,1,10) AS date,COUNT(*) AS uploads FROM files GROUP BY date ORDER BY date")]
    return {"total_files":totals[0],"shared_files":totals[1],"popular_files":popular,"uploads_by_date":daily}

@app.get("/analytics/downloads", dependencies=[Depends(require_admin)])
def download_stats():
    with db() as conn:
        total=conn.execute("SELECT COALESCE(SUM(downloads),0) FROM files").fetchone()[0]
    return {"total_downloads":total,"failed_downloads":len(rows("SELECT id FROM activities WHERE activity_type='download' AND status!='success'")),"most_downloaded":rows("SELECT id,name,downloads FROM files ORDER BY downloads DESC LIMIT 5")}

@app.get("/analytics/sharing", dependencies=[Depends(require_admin)])
def sharing_stats():
    with db() as conn:
        total,shared=conn.execute("SELECT COUNT(*),COALESCE(SUM(shared),0) FROM files").fetchone()
    event_counts={r["activity_type"]:r["count"] for r in rows("SELECT activity_type,COUNT(*) AS count FROM activities WHERE activity_type IN ('link_expired','link_revoked') GROUP BY activity_type")}
    return {"total_files":total,"shared_files":shared,"active_links":shared,"expired_links":event_counts.get("link_expired",0),"revoked_links":event_counts.get("link_revoked",0)}
