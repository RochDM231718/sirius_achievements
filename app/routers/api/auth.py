from fastapi import HTTPException, status, Form, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.enums import UserRole
from app.routers.api.api import public_router as router, translation_manager
from app.services.auth_service import AuthService, UserBlockedException
from app.infrastructure.database import get_db
from app.repositories.admin.user_repository import UserRepository
from app.repositories.admin.user_token_repository import UserTokenRepository
from app.services.admin.user_token_service import UserTokenService
from app.config import settings
from app.utils.rate_limiter import rate_limiter


def get_auth_service(db: AsyncSession = Depends(get_db)):
    user_repo = UserRepository(db)
    token_repo = UserTokenRepository(db)
    token_service = UserTokenService(token_repo)
    return AuthService(user_repo, token_service)


@router.post("/login", name='api.auth.authentication')
async def login(request: Request, email: str = Form(...), password: str = Form(...), auth_service: AuthService = Depends(get_auth_service)):
    client_ip = request.client.host if request.client else "unknown"
    rl_key = f"api_login:{client_ip}"

    attempt_count = int(await rate_limiter.increment(rl_key, settings.API_LOGIN_LOCKOUT_TTL))
    if attempt_count > settings.API_LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again in 15 minutes."
        )

    try:
        result = await auth_service.api_authenticate(email, password, UserRole.GUEST)
    except UserBlockedException as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many login attempts. Try again in 15 minutes.") from exc
    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=translation_manager.gettext('api.auth.invalid_credentials')
        )

    await rate_limiter.reset(rl_key)
    return result


@router.post("/refresh", name='api.auth.refresh')
async def refresh(request: Request, refresh_token: str = Form(...), auth_service: AuthService = Depends(get_auth_service)):
    client_ip = request.client.host if request.client else "unknown"
    rl_key = f"api_refresh:{client_ip}"

    attempt_count = int(await rate_limiter.increment(rl_key, settings.API_REFRESH_LOCKOUT_TTL))
    if attempt_count > settings.API_REFRESH_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many refresh attempts. Try again later."
        )

    result = await auth_service.api_refresh_token(refresh_token)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=translation_manager.gettext('api.auth.invalid_refresh_token')
        )

    await rate_limiter.reset(rl_key)
    return result
