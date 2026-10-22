from fastapi import HTTPException, status
from app.database import redis_client

async def check_rate_limit(key: str, max_requests: int = 60, window_seconds: int = 60):
    """
    Redis sliding window / counter rate limiter.
    Raises HTTPException(429) if exceeded.
    """
    if not redis_client:
        return True

    try:
        redis_key = f"rate_limit:{key}"
        current = await redis_client.incr(redis_key)
        if current == 1:
            await redis_client.expire(redis_key, window_seconds)
        
        if current > max_requests:
            ttl = await redis_client.ttl(redis_key)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Try again in {ttl if ttl > 0 else window_seconds} seconds."
            )
        return True
    except HTTPException:
        raise
    except Exception as e:
        # Fallback gracefully if Redis is temporarily unreachable
        print(f"[RateLimiter Warning] Redis check skipped: {e}")
        return True
