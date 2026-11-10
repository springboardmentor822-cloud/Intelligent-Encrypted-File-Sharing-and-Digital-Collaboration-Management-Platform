import sys
import asyncio
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx
from app.main import app
from app.models import User, UserRole
from app.security import create_access_token, hash_password
from app.database import SessionLocal

async def test_rbac_and_endpoints():
    db = SessionLocal()
    try:
        # Ensure test admin user exists
        admin_user = db.query(User).filter(User.username == "test_admin_dash").first()
        if not admin_user:
            admin_user = User(
                username="test_admin_dash",
                email="admin_dash@trustshare.local",
                hashed_password=hash_password("AdminPass123!"),
                role=UserRole.ADMIN,
                is_active=True
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            
        # Ensure test regular user exists
        reg_user = db.query(User).filter(User.username == "test_reg_dash").first()
        if not reg_user:
            reg_user = User(
                username="test_reg_dash",
                email="reg_dash@trustshare.local",
                hashed_password=hash_password("UserPass123!"),
                role=UserRole.USER,
                is_active=True
            )
            db.add(reg_user)
            db.commit()
            db.refresh(reg_user)

        admin_token = create_access_token({"sub": str(admin_user.id), "username": admin_user.username, "role": "admin"})
        reg_token = create_access_token({"sub": str(reg_user.id), "username": reg_user.username, "role": "user"})

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            print("\n--- TEST 1: REGULAR USER CALLS ADMIN SECURITY DASHBOARD (RBAC CHECK) ---")
            res = await client.get("/admin/security-dashboard", headers={"Authorization": f"Bearer {reg_token}"})
            print(f"Status Code: {res.status_code}")
            assert res.status_code == 403, f"Expected 403 Forbidden for standard user, got {res.status_code}"
            print("[PASS] RBAC enforced! Standard user received 403 Forbidden as required.")

            print("\n--- TEST 2: ADMIN CALLS ADMIN SECURITY DASHBOARD ---")
            res_admin = await client.get("/admin/security-dashboard", headers={"Authorization": f"Bearer {admin_token}"})
            print(f"Status Code: {res_admin.status_code}")
            assert res_admin.status_code == 200, f"Expected 200 OK for admin, got {res_admin.status_code}"
            data = res_admin.json()
            assert "metrics" in data
            assert data["metrics"]["total_logins"] >= 2942
            assert "login_activity" in data
            assert "access_attempts" in data
            assert "security_events_distribution" in data
            assert len(data["recent_login_activity"]) >= 5
            assert len(data["recent_security_events"]) >= 5
            print("[PASS] Admin Security Dashboard returned complete telemetry data successfully!")

            print("\n--- TEST 3: REGULAR USER CALLS FILE ANALYTICS ---")
            res_analytics = await client.get("/files/analytics", headers={"Authorization": f"Bearer {reg_token}"})
            print(f"Status Code: {res_analytics.status_code}")
            assert res_analytics.status_code == 200, f"Expected 200 OK, got {res_analytics.status_code}"
            adata = res_analytics.json()
            assert "summary" in adata
            assert "storage_breakdown" in adata
            assert "upload_reports" in adata
            assert "download_analytics" in adata
            assert "sharing_reports" in adata
            assert len(adata["recent_uploads"]) >= 5
            assert len(adata["recent_downloads"]) >= 5
            print("[PASS] User File Analytics returned complete analytics datasets!")

            print("\n=======================================================")
            print("ALL BACKEND RBAC & TELEMETRY SPECS VERIFIED SUCCESSFULLY!")
            print("=======================================================")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(test_rbac_and_endpoints())

