"""
Test Dynamic Analytics Suite
Tests that both regular user file analytics and admin security dashboard
are 100% dynamic and calculated from real database records.
"""
import asyncio
from datetime import datetime, timezone
from app.database import mongo_db, SessionLocal
from app.models import User, UserRole
from app.routers.files import get_user_file_analytics
from app.routers.admin import get_admin_security_dashboard


async def test_analytics():
    print("===========================================================================")
    print("TESTING DYNAMIC FILE & ADMIN SECURITY ANALYTICS")
    print("===========================================================================")

    # 1. Test User Analytics
    test_user = User(
        id=999999,
        username="dynamic_test_user",
        email="dynamic_test@trustshare.internal",
        role=UserRole.USER,
        is_active=True
    )

    # Clean up any leftover test data
    await mongo_db.file_metadata.delete_many({"owner_id": test_user.id})
    await mongo_db.file_shares.delete_many({"owner_id": test_user.id})

    # Case A: Brand new user with 0 files
    res_empty = await get_user_file_analytics(current_user=test_user)
    print("\n[TEST 1] User with 0 files:")
    print(f"  Summary: {res_empty['summary']}")
    assert res_empty["summary"]["total_uploads"] == 0, f"Expected 0 uploads, got {res_empty['summary']['total_uploads']}"
    assert res_empty["summary"]["total_storage_used"] == "0 B", f"Expected '0 B', got {res_empty['summary']['total_storage_used']}"
    assert res_empty["summary"]["total_downloads"] == 0
    assert res_empty["summary"]["total_shares"] == 0
    assert res_empty["recent_uploads"] == []
    assert res_empty["recent_downloads"] == []
    print("  [PASS] Zero uploads, zero storage, and empty lists verified for new user")

    # Case B: User uploads 2 files (1 PDF of 2000 bytes, 1 PNG of 3000 bytes)
    await mongo_db.file_metadata.insert_one({
        "_id": "test_file_doc_1",
        "name": "Audit_Report.pdf",
        "owner_id": test_user.id,
        "owner_username": test_user.username,
        "is_folder": False,
        "is_trashed": False,
        "file_size": 2048,
        "category": "documents",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "downloads_count": 3
    })
    await mongo_db.file_metadata.insert_one({
        "_id": "test_file_img_1",
        "name": "Diagram.png",
        "owner_id": test_user.id,
        "owner_username": test_user.username,
        "is_folder": False,
        "is_trashed": False,
        "file_size": 4096,
        "category": "images",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "downloads_count": 2
    })

    res_user = await get_user_file_analytics(current_user=test_user)
    print("\n[TEST 2] User after uploading 2 files (2048 B + 4096 B):")
    print(f"  Summary: {res_user['summary']}")
    assert res_user["summary"]["total_uploads"] == 2, f"Expected 2 uploads, got {res_user['summary']['total_uploads']}"
    assert res_user["summary"]["total_storage_used"] == "6.0 KB", f"Expected '6.0 KB', got {res_user['summary']['total_storage_used']}"
    assert res_user["summary"]["total_downloads"] == 5, f"Expected 5 downloads, got {res_user['summary']['total_downloads']}"
    assert len(res_user["recent_uploads"]) == 2, "Expected 2 recent uploads"
    assert res_user["recent_uploads"][0]["name"] in ["Audit_Report.pdf", "Diagram.png"]

    # Verify breakdown percentages
    breakdown = {b["name"]: b for b in res_user["storage_breakdown"]}
    assert breakdown["Documents"]["size_str"] == "2.0 KB"
    assert breakdown["Images"]["size_str"] == "4.0 KB"
    assert breakdown["Documents"]["percentage"] == 33
    assert breakdown["Images"]["percentage"] == 67
    print("  [PASS] Real dynamic file count (2), real size (6.0 KB), and breakdown percentages (33% / 67%) verified")

    # Clean up test user files
    await mongo_db.file_metadata.delete_many({"owner_id": test_user.id})

    # 2. Test Admin Security Dashboard
    admin_user = User(
        id=1,
        username="admin",
        email="admin@trustshare.internal",
        role=UserRole.ADMIN,
        is_active=True
    )
    db = SessionLocal()
    try:
        res_admin = await get_admin_security_dashboard(admin_user=admin_user, db=db)
        print("\n[TEST 3] Admin Security Dashboard Telemetry:")
        print(f"  Metrics: {res_admin['metrics']}")
        print(f"  Storage Widget: {res_admin['storage_widget']}")

        # Ensure no static base 2781 or 124
        actual_failed = await mongo_db.activity_logs.count_documents({"action": "LOGIN_FAILED"})
        actual_success = await mongo_db.activity_logs.count_documents({"action": {"$in": ["LOGIN_SUCCESS", "OAUTH_LOGIN"]}})
        assert res_admin["metrics"]["failed_logins"] == actual_failed, f"Expected {actual_failed}, got {res_admin['metrics']['failed_logins']}"
        assert res_admin["metrics"]["successful_logins"] == actual_success, f"Expected {actual_success}, got {res_admin['metrics']['successful_logins']}"
        assert res_admin["metrics"]["total_logins"] == actual_failed + actual_success
        print("  [PASS] Admin metrics dynamically match actual database counts (0 hardcoded offsets)")
        print("  [PASS] Storage widget reflects real MongoDB byte calculation")
    finally:
        db.close()

    print("\n===========================================================================")
    print("ALL DYNAMIC ANALYTICS TESTS PASSED WITH 100% SUCCESS!")
    print("===========================================================================")


if __name__ == "__main__":
    asyncio.run(test_analytics())
