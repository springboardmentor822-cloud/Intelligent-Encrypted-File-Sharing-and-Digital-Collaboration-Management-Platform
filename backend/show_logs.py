import asyncio
from app.db.mongo import mongo_db


async def display_logs():
    if mongo_db is None:
        print("MongoDB is not connected. Check MONGODB_URL in .env")
        return

    print("\n" + "=" * 50)
    print("       MONGODB ATLAS ACTIVITY AUDIT TRAIL")
    print("=" * 50)

    # 1. Fetch latest activity logs
    cursor = mongo_db["activity_logs"].find().sort("timestamp", -1).limit(10)
    logs = await cursor.to_list(10)
    
    if not logs:
        print("No activity logs found yet.")
    else:
        for log in logs:
            time_str = log.get("timestamp")
            user_id = log.get("user_id")
            email = log.get("user_email")
            action = log.get("action")
            details = log.get("details", {})
            print(f"[{time_str}] | User {user_id} ({email}) -> {action}")
            if details:
                print(f"   Details: {details}")

    print("\n" + "=" * 50)
    print("       MONGODB ATLAS FILE METADATA")
    print("=" * 50)

    # 2. Fetch latest file metadata documents
    files = await mongo_db["file_metadata"].find().sort("created_at", -1).limit(5).to_list(5)
    if not files:
        print("No file metadata documents found yet.")
    else:
        for f in files:
            print(f"- File: {f.get('original_filename')}")
            print(f"  Disk Name: {f.get('filename')}")
            print(f"  Size: {f.get('file_size')} bytes | Type: {f.get('content_type')}")
            print(f"  Owner: {f.get('owner_email')} (User ID {f.get('owner_id')})")
    print("=" * 50 + "\n")


if __name__ == "__main__":
    asyncio.run(display_logs())
