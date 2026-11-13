
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import Base, engine
from .migrate import ensure_admin, ensure_schema
from .routers import admin, admin_visit, audit_logs, auth, files, me, my_security, secure, shares
from .activity_monitoring import routes as activity_routes
from .analytics import routes as analytics_routes
from .notifications import routes as notification_routes
from .reports import routes as report_routes
from .security_monitoring import routes as security_routes

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_schema(engine)
    ensure_admin(engine)
    yield


app = FastAPI(
    title="TrustShare API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Admin-Visit",
        "X-Secure-Token",
        "X-Share-Passcode-Token",
    ],
    expose_headers=[
        "X-Share-Passcode",
        "X-Secure-Token",
        "X-Admin-Visit",
        "Content-Disposition",
    ],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")

    if settings.https_enforced:
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )

    return response


for router in (
    auth.router,
    files.router,
    shares.router,
    shares.pub,
    me.router,
    secure.router,
    admin_visit.router,
    admin.router,
    admin.sec,
    # --- Milestone 3 modules ---
    activity_routes.router,
    activity_routes.me_router,
    audit_logs.router,
    notification_routes.router,
    report_routes.router,
    analytics_routes.router,
    security_routes.router,
    my_security.router,
):
    app.include_router(router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
