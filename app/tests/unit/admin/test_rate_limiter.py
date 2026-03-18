import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock
from app.utils.rate_limiter import RateLimiter


@pytest.fixture
def mock_redis():
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.incr = AsyncMock()
    redis.ttl = AsyncMock(return_value=-1)
    redis.expire = AsyncMock()
    redis.delete = AsyncMock()
    return redis


@pytest.fixture
def limiter(mock_redis):
    return RateLimiter(redis=mock_redis)


@pytest.mark.asyncio
async def test_not_limited_initially(limiter):
    assert await limiter.is_limited("key", 5, 900) is False


@pytest.mark.asyncio
async def test_limited_when_exceeded(limiter, mock_redis):
    mock_redis.get.return_value = "5"
    assert await limiter.is_limited("key", 5, 900) is True


@pytest.mark.asyncio
async def test_not_limited_below_threshold(limiter, mock_redis):
    mock_redis.get.return_value = "3"
    assert await limiter.is_limited("key", 5, 900) is False


@pytest.mark.asyncio
async def test_increment_sets_ttl(limiter, mock_redis):
    await limiter.increment("key", 900)
    mock_redis.incr.assert_called_once_with("key")
    mock_redis.ttl.assert_called_once_with("key")
    mock_redis.expire.assert_called_once_with("key", 900)


@pytest.mark.asyncio
async def test_increment_no_expire_if_ttl_exists(limiter, mock_redis):
    mock_redis.ttl.return_value = 500
    await limiter.increment("key", 900)
    mock_redis.incr.assert_called_once()
    mock_redis.expire.assert_not_called()


@pytest.mark.asyncio
async def test_reset(limiter, mock_redis):
    await limiter.reset("key")
    mock_redis.delete.assert_called_once_with("key")


@pytest.mark.asyncio
async def test_remaining(limiter, mock_redis):
    mock_redis.get.return_value = "3"
    assert await limiter.remaining("key", 5) == 2


@pytest.mark.asyncio
async def test_remaining_no_attempts(limiter, mock_redis):
    mock_redis.get.return_value = None
    assert await limiter.remaining("key", 5) == 5
