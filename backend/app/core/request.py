from dataclasses import dataclass

from fastapi import Request

from app.core.config import settings


@dataclass
class RequestInfo:
    ip: str
    user_agent: str
    path: str = ""
    method: str = ""


def get_request_info(request: Request) -> RequestInfo:
    ip = request.client.host if request.client else "unknown"
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
    return RequestInfo(
        ip=ip,
        user_agent=request.headers.get("user-agent", "")[:300],
        path=request.url.path,
        method=request.method,
    )
