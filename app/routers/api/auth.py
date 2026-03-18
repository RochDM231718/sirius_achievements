from fastapi import HTTPException, status, Form, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
import os
import redis.asyncio as aioredis
from app.models.enums import UserRole
from app.routers.api.api import public_router as router, translation_manager
from app.services.auth_service import AuthService
from app.infrastructure.database import get_db
from app.repositories.admin.user_repository import UserRepository
from app.repositories.admin.user_token_repository import UserTokenRepository
from app.services.admin.user_token_service import UserTokenService

redis_client = aioredis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True)

def get_auth_service(db: AsyncSession = Depends(get_db)):
    user_repo = UserRepository(db)
    token_repo = UserTokenRepository(db)
    token_service = UserTokenService(token_repo)
    return AuthService(user_repo, token_service)

@router.post("/login", name='api.auth.authentication')
async def login(request: Request, email: str = Form(...), password: str = Form(...), auth_service: AuthService = Depends(get_auth_service)):
    client_ip = request.client.host if request.client else "unknown"
    rl_key = f"api_login:{client_ip}"
    attempts = await redis_client.get(rl_key)
    if attempts and int(attempts) >= 10:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again in 15 minutes."
        )
    result = await auth_service.api_authenticate(email, password, UserRole.GUEST)
    if not result:
        await redis_client.incr(rl_key)
        if await redis_client.ttl(rl_key) == -1:
            await redis_client.expire(rl_key, 900)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=translation_manager.gettext('api.auth.invalid_credentials')
        )
    await redis_client.delete(rl_key)
    return result

@router.post("/refresh",  name='api.auth.refresh')
async def refresh(request: Request, refresh_token: str = Form(...), auth_service: AuthService = Depends(get_auth_service)):
    client_ip = request.client.host if request.client else "unknown"
    rl_key = f"api_refresh:{client_ip}"
    attempts = await redis_client.get(rl_key)
    if attempts and int(attempts) >= 20:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many refresh attempts. Try again later."
        )
    result = await auth_service.api_refresh_token(refresh_token)
    if not result:
        await redis_client.incr(rl_key)
        if await redis_client.ttl(rl_key) == -1:
            await redis_client.expire(rl_key, 900)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=translation_manager.gettext('api.auth.invalid_refresh_token')
        )
    return result