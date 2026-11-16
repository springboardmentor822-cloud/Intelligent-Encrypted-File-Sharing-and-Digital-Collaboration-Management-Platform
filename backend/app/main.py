import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.session import engine, Base
from app.models import user, file, audit_log
from app.routers import auth_router, files_router, admin_router
from app.activity_monitoring.routes import router as audit_router
from app.notifications.routes import router as notifications_router
from app.reports.routes import router as reports_router
from app.analytics.routes import router as analytics_router
from app.security_monitoring.routes import router as security_router
from app.db.init_audit import seed_initial_audit_logs

logger = logging.getLogger(__name__)


async def periodic_expiry_scanner():
    """
    Milestone 3 Task 3 Step 6: Automated background worker.
    Scans for soon-to-expire share links and dispatches reminders to file owners.
    """
    while True:
        try:
            from app.notifications.service import NotificationService
            reminders = NotificationService.check_and_notify_expiring_links(hours_window=24)
            if reminders > 0:
                logger.info(f"[Background Worker] Dispatched {reminders} share link expiry reminder(s).")
        except Exception as e:
            logger.warning(f"[Background Worker] Expiry scanner check error: {e}")
        # Run check every 30 minutes
        await asyncio.sleep(1800)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_initial_audit_logs()
    
    # Start background expiry scanner
    scanner_task = asyncio.create_task(periodic_expiry_scanner())
    try:
        yield
    finally:
        scanner_task.cancel()



app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Intelligent Encrypted File Sharing and Digital Collaboration Management Platform API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://10.57.238.52:3000",
        "http://10.57.238.52:3001",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(files_router, prefix=settings.API_V1_STR)
app.include_router(admin_router, prefix=settings.API_V1_STR)

# Milestone 3 Routers
app.include_router(audit_router, prefix=settings.API_V1_STR)
app.include_router(audit_router)  # Direct /audit-logs endpoint support
app.include_router(notifications_router, prefix=settings.API_V1_STR)
app.include_router(reports_router, prefix=settings.API_V1_STR)
app.include_router(analytics_router, prefix=settings.API_V1_STR)
app.include_router(security_router, prefix=settings.API_V1_STR)



@app.get("/")
def read_root():
    return {
        "status": "online",
        "app": settings.PROJECT_NAME,
        "version": "1.0.0",
        "docs_url": "/docs",
    }
