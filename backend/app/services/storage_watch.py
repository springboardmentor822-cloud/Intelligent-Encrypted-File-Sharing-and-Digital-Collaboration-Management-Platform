"""Storage watch: alerts when the platform's storage (1 GB by default) is getting full, and a simple "days until full" forecast."""
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.redis import redis_client
from app.models.postgres import StoredFile, utcnow


async def platform_used(db: AsyncSession) -> int:
    """Bytes of ALL stored files, including files still in the Trash (they still occupy space)."""
    return int((await db.execute(select(func.coalesce(func.sum(StoredFile.size_bytes), 0)))).scalar())


async def forecast(db: AsyncSession, used: int, days: int = 14) -> dict:
    """Average growth over the last `days` days, and how long until the limit is reached at that pace."""
    since = utcnow() - timedelta(days=days)
    grown = int((await db.execute(select(func.coalesce(func.sum(StoredFile.size_bytes), 0)).where(StoredFile.created_at >= since))).scalar())
    per_day = grown / days
    free = max(settings.platform_capacity_bytes - used, 0)
    return {"growth_bytes_per_day": int(per_day), "days_until_full": round(free / per_day) if per_day > 0 and free > 0 else None}


async def check_platform_storage(db: AsyncSession) -> None:
    """Called after every upload. Raises ONE alert per level (warning / critical) and then stays quiet for 6 hours."""
    cap = settings.platform_capacity_bytes
    pct = (await platform_used(db)) / cap * 100
    level = "critical" if pct >= settings.STORAGE_CRITICAL_PERCENT else "warning" if pct >= settings.STORAGE_WARN_PERCENT else None
    if not level:
        return
    if await redis_client.set(f"storagealert:{level}", "1", ex=6 * 3600, nx=True):
        from app.services.audit import create_alert

        await create_alert("storage_threshold", f"Platform storage is {pct:.0f}% full ({settings.STORAGE_LIMIT_MB} MB limit)", level, None, None,
                           {"percent": round(pct, 1), "level": level})
