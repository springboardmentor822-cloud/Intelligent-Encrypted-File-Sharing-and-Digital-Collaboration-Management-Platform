"""Where is this IP address? Only used for the "Location" column on the Security Dashboard.

Simplified for a student project:
  * private / local addresses are labelled "Local network" (no internet needed)
  * real lookups are OFF by default (GEOIP_ENABLED=false) because they send the IP to a third-party website
  * results are cached in Redis so we do not call the website again and again
Production would use an offline database such as MaxMind GeoLite2 instead.
"""
import ipaddress

import httpx

from app.core.config import settings
from app.db.redis import redis_client


async def lookup_location(ip: str | None) -> str:
    if not ip or ip == "unknown":
        return "Unknown"
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return "Unknown"
    if addr.is_private or addr.is_loopback or addr.is_link_local:
        return "Local network"
    if not settings.GEOIP_ENABLED:
        return "Unknown"
    cached = await redis_client.get(f"geo:{ip}")
    if cached:
        return cached
    location, ttl = "Unknown", 3600  # failed lookups are retried after an hour
    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            data = (await client.get(f"https://ipwho.is/{ip}")).json()
        if data.get("success"):
            location = ", ".join(x for x in (data.get("city"), data.get("country")) if x) or "Unknown"
            ttl = 7 * 86400
    except Exception:  # a failed lookup must never break a login
        pass
    await redis_client.set(f"geo:{ip}", location, ex=ttl)
    return location
