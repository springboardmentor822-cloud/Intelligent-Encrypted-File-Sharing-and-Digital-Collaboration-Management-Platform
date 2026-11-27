import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app.api import (admin, analytics, analytics_admin, audit, auth, files, folders, notification_admin, notifications,
                     public, reports, security, security_monitoring, shares)
from app.core.config import settings
from app.core.mongo import init_indexes
from app.core.redis_client import get_redis
from app.core.request import RequestInfo
from app.services import bootstrap, key_service, scheduler, storage_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("trustshare")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_for_runtime()
    key_service.get_key_provider()  # fail fast on a missing/invalid master key
    for name, fn in (("MongoDB indexes", init_indexes), ("storage", storage_service.ensure_bucket)):
        try:
            fn()
        except Exception:  # noqa: BLE001
            log.exception("Startup step failed: %s", name)
    bootstrap.seed()
    scheduler.start()
    yield
    scheduler.stop()


app = FastAPI(
    title="TrustShare API",
    version="1.1.0",
    description="Secure file sharing with AES-256-GCM envelope encryption, RBAC, expiring share links, audit logging, "
                "reports, storage analytics and suspicious-activity detection.",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if settings.is_production:
        response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    return response


def _hit_global_limit(ip: str) -> bool:
    r = get_redis()
    key = f"rl:global:{ip}"
    n = r.incr(key)
    if n == 1:
        r.expire(key, 60)
    return n > 600


@app.middleware("http")
async def global_rate_limit(request: Request, call_next):
    if request.url.path != "/health" and request.method != "OPTIONS":
        ip = request.client.host if request.client else "unknown"
        if settings.trust_proxy_headers and request.headers.get("x-forwarded-for"):
            ip = request.headers["x-forwarded-for"].split(",")[0].strip()
        try:
            limited = await run_in_threadpool(_hit_global_limit, ip)
        except Exception:  # noqa: BLE001 - never take the API down because the limiter failed
            limited = False
        if limited:
            from app.services import audit_service
            audit_service.log_access_attempt("blocked", "global rate limit exceeded",
                                             RequestInfo(ip, request.headers.get("user-agent", ""), request.url.path, request.method))
            return JSONResponse({"detail": "Too many requests. Please slow down."}, status_code=429, headers={"Retry-After": "60"})
    return await call_next(request)


# CORS is added last so it is the outermost middleware (even 429 responses carry CORS headers).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Disposition"],
)


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    """Return a readable JSON error. Without this the browser shows a generic 'network error',
    because Starlette sends its 500 response outside the CORS middleware."""
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    detail = ("Something went wrong on the server." if settings.is_production
              else f"Server error: {type(exc).__name__}: {str(exc)[:300]}")
    origin = request.headers.get("origin")
    headers = {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if origin in settings.cors_origin_list else {}
    return JSONResponse({"detail": detail}, status_code=500, headers=headers)


PREFIX = "/api/v1"
for module in (auth, files, folders, shares, public, notifications, analytics, security, admin,
               audit, reports, security_monitoring, analytics_admin, notification_admin):
    app.include_router(module.router, prefix=PREFIX)


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok", "service": "trustshare-api"}
