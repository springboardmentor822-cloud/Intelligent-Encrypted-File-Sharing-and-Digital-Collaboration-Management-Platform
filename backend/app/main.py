from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.database import engine, Base, mongo_client, mongo_db, redis_client, get_db
from app.routers import auth, files, admin, shares
from app.models import User
import app.models

# Initialize SQL tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="TrustShare API",
    description="Intelligent Encrypted File Sharing & Collaboration Management Platform",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount application routers
app.include_router(auth.router)
app.include_router(files.router)
app.include_router(shares.router)
app.include_router(admin.router)

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "TrustShare Core API",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    health = {
        "postgres": "unknown",
        "mongodb": "unknown",
        "redis": "unknown"
    }

    try:
        with engine.connect():
            health["postgres"] = "connected"
    except Exception as e:
        health["postgres"] = f"failed: {str(e)}"

    try:
        await mongo_client.admin.command("ping")
        health["mongodb"] = "connected"
    except Exception as e:
        health["mongodb"] = f"failed: {str(e)}"

    try:
        if await redis_client.ping():
            health["redis"] = "connected"
    except Exception as e:
        health["redis"] = f"failed: {str(e)}"

    return health


@app.get("/platform/stats")
async def platform_stats(db: Session = Depends(get_db)):
    """
    Public live platform telemetry and system statistics.
    Powers dynamic real metrics on the landing page and dashboard.
    """
    # 1. Total real users from PostgreSQL
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()

    # 2. Total real files, shared documents, and storage from MongoDB
    files_count = await mongo_db.file_metadata.count_documents({"is_folder": False, "is_trashed": False})
    folders_count = await mongo_db.file_metadata.count_documents({"is_folder": True, "is_trashed": False})
    protected_files = await mongo_db.file_metadata.count_documents({"is_password_protected": True, "is_trashed": False})
    shared_documents = await mongo_db.file_shares.count_documents({"is_active": True})

    storage_agg = await mongo_db.file_metadata.aggregate([
        {"$match": {"is_folder": False, "is_trashed": False}},
        {"$group": {"_id": None, "total_bytes": {"$sum": "$file_size"}}}
    ]).to_list(length=1)
    total_storage_bytes = storage_agg[0]["total_bytes"] if storage_agg else 0

    cat_agg = await mongo_db.file_metadata.aggregate([
        {"$match": {"is_folder": False, "is_trashed": False}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}, "size": {"$sum": "$file_size"}}}
    ]).to_list(length=10)
    categories = { (c["_id"] or "document"): c["count"] for c in cat_agg }

    # Format human-readable storage
    if total_storage_bytes >= 1024 * 1024 * 1024:
        total_storage_human = f"{(total_storage_bytes / (1024 * 1024 * 1024)):.2f} GB"
    elif total_storage_bytes >= 1024 * 1024:
        total_storage_human = f"{(total_storage_bytes / (1024 * 1024)):.1f} MB"
    elif total_storage_bytes >= 1024:
        total_storage_human = f"{(total_storage_bytes / 1024):.1f} KB"
    else:
        total_storage_human = f"{total_storage_bytes} B"

    # Privacy-preserving showcase cards for public hero preview (zero personal data exposure)
    recent_files = [
        {"id": "demo-1", "name": "Security_Audit_Report.enc", "size_human": "2.4 MB", "category": "document", "is_encrypted": True},
        {"id": "demo-2", "name": "Zero_Knowledge_Spec.pdf", "size_human": "1.1 MB", "category": "document", "is_encrypted": True},
        {"id": "demo-3", "name": "Vault_Compliance_Cert.enc", "size_human": "540 KB", "category": "code", "is_encrypted": True},
    ]

    # Infrastructure Health
    infra_health = {"postgres": "connected", "mongodb": "connected", "redis": "connected"}
    try:
        with engine.connect():
            pass
    except Exception:
        infra_health["postgres"] = "disconnected"

    try:
        await mongo_client.admin.command("ping")
    except Exception:
        infra_health["mongodb"] = "disconnected"

    try:
        if await redis_client.ping():
            pass
    except Exception:
        infra_health["redis"] = "disconnected"

    all_connected = all(v == "connected" for v in infra_health.values())

    return {
        "status": "online",
        "users": {
            "total_registered": total_users,
            "active": active_users
        },
        "files": {
            "total_files": files_count,
            "total_folders": folders_count,
            "total_bytes": total_storage_bytes,
            "total_storage_human": total_storage_human,
            "protected_files": protected_files,
            "shared_documents": shared_documents,
            "categories": categories
        },
        "security": {
            "zero_knowledge_ratio": "100%",
            "encryption_standard": "AES-256 GCM",
            "zero_plaintext": True
        },
        "infrastructure": infra_health,
        "all_connected": all_connected,
        "uptime_sla": "99.9%" if all_connected else "Degraded",
        "recent_files": recent_files
    }