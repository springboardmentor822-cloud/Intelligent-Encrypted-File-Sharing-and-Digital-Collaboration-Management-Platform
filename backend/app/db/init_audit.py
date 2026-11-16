from datetime import datetime, timezone, timedelta
from app.db.session import SessionLocal
from app.models.audit_log import AuditLog
from app.models.user import User

def seed_initial_audit_logs():
    db = SessionLocal()
    try:
        count = db.query(AuditLog).count()
        if count > 0:
            return

        now = datetime.now(timezone.utc)
        users = db.query(User).all()

        initial_logs = [
            AuditLog(
                user_id=1,
                user_email="sanjith@example.com",
                action="USER_REGISTER",
                details={"role": "user", "ip": "127.0.0.1"},
                timestamp=now - timedelta(days=5),
            ),
            AuditLog(
                user_id=2,
                user_email="san@gmail.com",
                action="USER_REGISTER",
                details={"role": "user", "ip": "127.0.0.1"},
                timestamp=now - timedelta(days=3),
            ),
            AuditLog(
                user_id=3,
                user_email="ad@gmail.com",
                action="USER_REGISTER",
                details={"role": "admin", "ip": "127.0.0.1"},
                timestamp=now - timedelta(days=2),
            ),
            AuditLog(
                user_id=3,
                user_email="ad@gmail.com",
                action="USER_LOGIN",
                details={"status": "Success", "ip": "127.0.0.1", "location": "Admin Station"},
                timestamp=now - timedelta(hours=6),
            ),
            AuditLog(
                user_id=1,
                user_email="sanjith@example.com",
                action="USER_LOGIN",
                details={"status": "Success", "ip": "127.0.0.1", "location": "Client Network"},
                timestamp=now - timedelta(hours=4),
            ),
            AuditLog(
                user_id=0,
                user_email="suspicious.login@external.net",
                action="USER_LOGIN_FAILED",
                details={"reason": "Invalid credentials", "ip": "198.51.100.24", "location": "External Network"},
                timestamp=now - timedelta(hours=3),
            ),
            AuditLog(
                user_id=3,
                user_email="ad@gmail.com",
                action="FILE_UPLOAD_FAILED",
                details={"reason": "Admin privilege restriction", "filename": "policy_test.pdf", "ip": "127.0.0.1"},
                timestamp=now - timedelta(hours=2),
            ),
            AuditLog(
                user_id=2,
                user_email="san@gmail.com",
                action="UNAUTHORIZED_ACCESS",
                details={"reason": "Unauthorized file download attempt", "file_id": 99, "ip": "127.0.0.1"},
                timestamp=now - timedelta(hours=1),
            ),
            AuditLog(
                user_id=3,
                user_email="ad@gmail.com",
                action="USER_LOGIN",
                details={"status": "Success", "ip": "127.0.0.1", "location": "Admin Station"},
                timestamp=now - timedelta(minutes=15),
            ),
        ]

        db.add_all(initial_logs)
        db.commit()
        print("Initialized baseline audit logs successfully.")
    except Exception as e:
        db.rollback()
        print(f"Audit log init warning: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_initial_audit_logs()
