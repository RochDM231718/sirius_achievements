import os
import redis.asyncio as aioredis

_redis_client = None

# Lua script for atomic check-and-increment:
# Returns current count AFTER increment. Sets TTL only on first creation.
_INCR_LUA = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
"""


def get_redis():
    global _redis_client
    if _redis_client is None:
        from app.config import settings
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


class RateLimiter:
    def __init__(self, redis=None):
        self.redis = redis or get_redis()
        self._incr_script = self.redis.register_script(_INCR_LUA)

    async def is_limited(self, key: str, max_attempts: int, ttl: int) -> bool:
        attempts = await self.redis.get(key)
        return attempts is not None and int(attempts) >= max_attempts

    async def increment(self, key: str, ttl: int) -> int:
        return await self._incr_script(keys=[key], args=[ttl])

    async def check_and_increment(self, key: str, max_attempts: int, ttl: int) -> bool:
        """Atomically check limit and increment. Returns True if blocked."""
        count = await self._incr_script(keys=[key], args=[ttl])
        return int(count) > max_attempts

    async def reset(self, key: str):
        await self.redis.delete(key)

    async def remaining(self, key: str, max_attempts: int) -> int:
        attempts = await self.redis.get(key)
        if not attempts:
            return max_attempts
        return max(0, max_attempts - int(attempts))


rate_limiter = RateLimiter()
