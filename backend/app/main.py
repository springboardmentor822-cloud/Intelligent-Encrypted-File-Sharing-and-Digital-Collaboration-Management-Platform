
import asyncio
import logging
import os
from contextlib import asynccontextmanager, suppress
from dotenv import load_dotenv
from pathlib import Path
from app.routes_admin import router as admin_router
from app.routes_platform_settings import router as platform_settings_router
from app.routes_key_rotation import router as key_rotation_router
from app.routes_monitoring import router as monitoring_router

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.database import (
    Base,
    mongo_client,
    mysql_engine,
    redis_client,
    test_connections,
)
from app.activity import create_expiry_reminders, ensure_activity_indexes
from app.expiry_reminders import send_file_share_expiry_reminders
from app.models import User, StoredFile, LinkedProvider, Folder, FileShare, GmailCredential, FolderShare, Favorite, PlatformSetting
from app.routes_auth import router as auth_router
from app.routes_files import router as files_router
from app.routes_folders import router as folders_router
from app.routes_recovery import router as recovery_router
from app.routes_security import router as security_router
from app.schema_migrations import (
    ensure_folder_share_email_columns,
    ensure_milestone2_columns,
    ensure_share_expiry_reminder_columns,
)


def _run_expiry_reminder_cycle() -> None:
    from sqlalchemy.orm import Session

    with Session(mysql_engine) as db:
        create_expiry_reminders(db)
        send_file_share_expiry_reminders(db)


async def _expiry_reminder_loop() -> None:
    try:
        interval = max(
            60,
            int(os.getenv("SHARE_EXPIRY_REMINDER_INTERVAL_SECONDS", "60")),
        )
    except ValueError:
        logging.getLogger("trustshare.monitoring").warning(
            "Invalid share expiry reminder interval; using 60 seconds."
        )
        interval = 60
    while True:
        try:
            await asyncio.to_thread(_run_expiry_reminder_cycle)
        except Exception as exc:
            logging.getLogger("trustshare.monitoring").warning(
                "Share expiry reminder cycle unavailable: error=%s",
                type(exc).__name__,
            )
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    test_connections()
    ensure_activity_indexes()
    Base.metadata.create_all(bind=mysql_engine)
    ensure_milestone2_columns()
    ensure_share_expiry_reminder_columns()
    ensure_folder_share_email_columns()
    expiry_reminder_task = asyncio.create_task(_expiry_reminder_loop())

    try:
        yield
    finally:
        expiry_reminder_task.cancel()
        with suppress(asyncio.CancelledError):
            await expiry_reminder_task

        mysql_engine.dispose()
        mongo_client.close()
        redis_client.close()


app = FastAPI(
    title="TrustShare API",
    description="Secure File Sharing Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("JWT_SECRET_KEY"),
    session_cookie="trustshare_session",
    same_site="lax",
    https_only=os.getenv("SESSION_COOKIE_SECURE", "true").strip().lower() == "true",
    max_age=3600,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(files_router)
app.include_router(folders_router)
app.include_router(recovery_router)
app.include_router(security_router)
app.include_router(admin_router)
app.include_router(platform_settings_router)
app.include_router(key_rotation_router)
app.include_router(monitoring_router)

@app.get("/")
def home():
    return {"message": "TrustShare API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}
