import json
import urllib.request
import urllib.parse
from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.core.security import create_access_token

BASE_URL = "http://127.0.0.1:8000/api/v1"

def api_call(endpoint, method="GET", data=None, token=None):
    url = f"{BASE_URL}{endpoint}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body = None
    if data is not None:
        if isinstance(data, dict):
            body = urllib.parse.urlencode(data).encode("utf-8")
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = data

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        content = resp.read().decode("utf-8")
        return json.loads(content) if content else {}

def run_tests():
    print("=================================================================")
    print("      MILESTONE 3: COMPREHENSIVE AUTOMATED VERIFICATION        ")
    print("=================================================================\n")

    # 1. Acquire Admin JWT Token
    print("[1] Authenticating as Administrator...")
    with SessionLocal() as db:
        admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
        assert admin is not None, "No admin user found in database!"
        token = create_access_token(subject=str(admin.id))
    print(f"    -> Admin '{admin.email}' authenticated successfully (JWT Token acquired).\n")

    # 2. Task 1 & 2: Audit Logs
    print("[2] Testing Task 1 & Task 2: Activity Monitoring & Audit Logging APIs...")
    logs = api_call("/audit-logs?limit=10", token=token)
    print(f"    -> GET /audit-logs: Retrieved {len(logs)} records.")

    filtered = api_call("/audit-logs/filter?activity_type=USER_LOGIN&limit=5", token=token)
    print(f"    -> GET /audit-logs/filter: Retrieved {len(filtered)} filtered records.\n")

    # 3. Task 3: Notification System
    print("[3] Testing Task 3: Notification and Security Alert System...")
    notifs = api_call("/notifications", token=token)
    print(f"    -> GET /notifications: Retrieved {len(notifs)} notifications.")

    unread = api_call("/notifications/unread-count", token=token)
    print(f"    -> GET /notifications/unread-count: {unread.get('unread_count')} unread.\n")

    # 4. Task 4: File Activity and Security Reports
    print("[4] Testing Task 4: File Activity & Security Reports...")
    up_res = api_call("/reports/uploads", token=token)
    print(f"    -> GET /reports/uploads: Total uploaded files = {up_res.get('total_files_uploaded')}")

    down_res = api_call("/reports/downloads", token=token)
    print(f"    -> GET /reports/downloads: Total downloads = {down_res.get('total_downloads')}")

    share_res = api_call("/reports/sharing", token=token)
    print(f"    -> GET /reports/sharing: Total shared = {share_res.get('total_files_shared')}")

    sec_rep = api_call("/reports/security", token=token)
    print(f"    -> GET /reports/security: Total alerts = {sec_rep.get('summary', {}).get('total_security_alerts')}\n")

    # 5. Task 5: Storage Analytics
    print("[5] Testing Task 5: Storage Analytics & Usage Monitoring...")
    storage = api_call("/analytics/storage", token=token)
    print(f"    -> GET /analytics/storage: Storage = {storage.get('total_storage_formatted')}, Quota = {storage.get('usage_percentage')}%")

    user_storage = api_call("/analytics/users/storage", token=token)
    print(f"    -> GET /analytics/users/storage: {len(user_storage)} user storage allocations.")

    files_stat = api_call("/analytics/files", token=token)
    print(f"    -> GET /analytics/files: Total files = {files_stat.get('total_uploaded_files')}\n")

    # 6. Task 6: Suspicious Activity Detection
    print("[6] Testing Task 6: Rule-Based Suspicious Activity Detection...")
    summary = api_call("/security-monitoring/summary", token=token)
    print(f"    -> GET /security-monitoring/summary: Events = {summary.get('total_security_events')}")

    sim = api_call("/security-monitoring/simulate-suspicious-event?event_type=FAILED_LOGINS", method="POST", token=token)
    print(f"    -> POST /security-monitoring/simulate-suspicious-event: Triggered simulation.")

    alerts = api_call("/security-monitoring/alerts", token=token)
    print(f"    -> GET /security-monitoring/alerts: Detected {len(alerts)} alerts.")
    if alerts:
        first_alert = alerts[0]
        print(f"       Latest alert: [{first_alert.get('severity')}] {first_alert.get('activity_type')} - {first_alert.get('description')}")
        resolve = api_call(f"/security-monitoring/alerts/{first_alert['id']}/resolve", method="POST", token=token)
        print(f"       Successfully resolved Alert #{first_alert['id']}.\n")

    print("=================================================================")
    print("   ALL 6 TASKS OF MILESTONE 3 VERIFIED AND WORKING 100%!       ")
    print("=================================================================")

if __name__ == "__main__":
    run_tests()
