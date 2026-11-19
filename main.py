import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models # Ensure all models are registered on Base.metadata

from config import settings
from middleware.request_id import RequestIdMiddleware
from middleware.security_headers import SecurityHeadersMiddleware

# Import modular domain routers
from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.files import router as files_router
from routers.shares import router as shares_router
from routers.audit import router as audit_router
from routers.notifications import router as notifications_router
from routers.analytics import router as analytics_router
from routers.admin import router as admin_router
from routers.security import router as security_router
from routers.crypto import router as crypto_router

# Initialize all database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.PROJECT_VERSION,
    description="Enterprise Zero-Trust Intelligent Cloud File Security and Sharing Platform. Built by Likitha Manchikanti."
)

# Custom Security & Tracing Middlewares
app.add_middleware(RequestIdMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

# Strict CORS configuration supporting any local development port
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all domain routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(files_router)
app.include_router(shares_router)
app.include_router(audit_router)
app.include_router(notifications_router)
app.include_router(analytics_router)
app.include_router(admin_router)
app.include_router(security_router)
app.include_router(crypto_router)

@app.get("/", tags=["System"])
def root():
    return {
        "platform": "TrustShare 2.0 Enterprise",
        "developer": "Likitha Manchikanti",
        "security_standard": "NIST SP 800-38D (AES-256-GCM Envelope Encryption)",
        "authentication": "Argon2id + Secure HttpOnly Sessions",
        "rbac_enforcement": "Strict Backend Authorization Guards (USER / ADMIN)",
        "audit_ledger": "Tamper-Evident SHA-256 Hash Chain",
        "status": "OPERATIONAL"
    }
