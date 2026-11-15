"""TrustShare API entry point."""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text

from app.core.config import settings
from app.core.deps import client_ip
from app.core.version import APP_VERSION, BUILD_NAME
from app.db.redis import redis_client
from app.services.blocklist import is_blocked, sync_blocklist
from app.services.bootstrap import ensure_admin
from app.db.mongo import check_mongo
from app.db.postgres import Base, SessionLocal, check_postgres, engine
from app.db.redis import check_redis
from app.models import postgres as pg_models  # noqa: F401  (registers the tables)
from app.models.mongo import ensure_indexes
from app.routers import access_control, admin, analytics, auth, files, folders, activity, audit_logs, notification_admin, notifications, report_center, reports, security_monitoring, storage_analytics, share
from app.services.reminders import reminder_loop

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("trustshare")


async def init_postgres() -> None:
    """Create tables and the 3 roles. (Simple approach for a student project; production uses Alembic migrations.)"""
    for attempt in range(1, 11):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            break
        except Exception as exc:
            logger.warning("Waiting for PostgreSQL (%s/10): %s", attempt, type(exc).__name__)
            await asyncio.sleep(3)
    else:
        raise RuntimeError("PostgreSQL is not reachable")
    # create_all() never changes a table that already exists, so new columns are added here.
    # "IF NOT EXISTS" makes this safe to run on every start. (Production would use Alembic migrations.)
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_files_deleted_at ON files (deleted_at)"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status VARCHAR(10) NOT NULL DEFAULT 'approved'"))
    async with SessionLocal() as db:
        existing = {r for (r,) in (await db.execute(select(pg_models.Role.name))).all()}
        for name in ("admin", "user", "guest"):
            if name not in existing:
                db.add(pg_models.Role(name=name))
        await db.commit()
        await ensure_admin(db)     # the administrator account is guaranteed to exist


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_postgres()
    try:
        await ensure_indexes()
    except Exception as exc:
        logger.warning("MongoDB indexes not created: %s", type(exc).__name__)
    try:
        await sync_blocklist()     # put saved IP blocks back into Redis after a restart
    except Exception as exc:
        logger.warning("Could not restore the IP block list: %s", type(exc).__name__)
    task = asyncio.create_task(reminder_loop())
    yield
    task.cancel()


app = FastAPI(title="TrustShare API", version=APP_VERSION, lifespan=lifespan)

@app.middleware("http")
async def block_denied_ips(request: Request, call_next):
    """Access control: an IP address the administrator blocked gets 403 on every request."""
    ip = client_ip(request)
    try:
        blocked = await is_blocked(ip)
    except Exception:       # if Redis is down, do not take the whole site down with it
        blocked = False
    if blocked:
        from app.services.audit import log_event

        if await redis_client.set(f"blockedlog:{ip}", "1", ex=60, nx=True):     # log once a minute per IP, not every request
            await log_event("blocked_request", request, result="failure", severity="warning", details={"reason": "ip_blocked"})
        return JSONResponse({"detail": "Your IP address has been blocked by an administrator."}, status_code=403)
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


for r in (auth.router, folders.router, files.router, share.router, analytics.router, admin.router,
          notifications.router, notification_admin.router, reports.router, audit_logs.router, activity.router, security_monitoring.router, report_center.router, storage_analytics.router,
          access_control.router):
    app.include_router(r)


@app.get("/")
async def root():
    return {"message": "TrustShare API is running", "version": APP_VERSION, "build": BUILD_NAME}


@app.get("/health")
async def health():
    results = {}
    for name, check in {"postgres": check_postgres, "mongodb": check_mongo, "redis": check_redis}.items():
        try:
            await check()
            results[name] = "ok"
        except Exception as e:
            results[name] = f"error: {type(e).__name__}"
    healthy = all(v == "ok" for v in results.values())
    return {"status": "healthy" if healthy else "unhealthy", "services": results}
