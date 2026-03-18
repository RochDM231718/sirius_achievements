import os
import redis.asyncio as aioredis

_redis_client = None


def get_redis():
    global _redis_client
    if _redis_client is None:
        from app.config import settings
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


class RateLimiter:
    def __init__(self, redis=None):
        self.redis = redis or get_redis()

    async def is_limited(self, key: str, max_attempts: int, ttl: int) -> bool:
        attempts = await self.redis.get(key)
        return attempts is not None and int(attempts) >= max_attempts

    async def increment(self, key: str, ttl: int):
        await self.redis.incr(key)
        if await self.redis.ttl(key) == -1:
            await self.redis.expire(key, ttl)

    async def reset(self, key: str):
        await self.redis.delete(key)

    async def remaining(self, key: str, max_attempts: int) -> int:
        attempts = await self.redis.get(key)
        if not attempts:
            return max_attempts
        return max(0, max_attempts - int(attempts))


rate_limiter = RateLimiter()
