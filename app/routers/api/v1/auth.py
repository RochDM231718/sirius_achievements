from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.infrastructure.database import get_db
from app.infrastructure.jwt_handler import ALGORITHM, SECRET_KEY
from app.middlewares.api_auth_middleware import auth
from app.models.enums import UserRole
from app.repositories.admin.user_repository import UserRepository
from app.repositories.admin.user_token_repository import UserTokenRepository
from app.schemas.admin.auth import ResetPasswordSchema, UserRegister
from app.services.admin.user_token_service import UserTokenService
from app.services.auth_service import AuthService
from app.utils.rate_limiter import rate_limiter

from .serializers import serialize_user

router = APIRouter(prefix='/api/v1/auth', tags=['api.v1.auth'])


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class RefreshPayload(BaseModel):
    refresh_token: str


class ForgotPasswordPayload(BaseModel):
    email: EmailStr


class FlowTokenPayload(BaseModel):
    flow_token: str


class VerifyCodePayload(FlowTokenPayload):
    code: str


class ResetPasswordPayload(FlowTokenPayload):
    password: str
    password_confirm: str


def _set_authenticated_session(request: Request, user) -> None:
    request.session.clear()
    request.session['auth_id'] = user.id
    request.session['auth_name'] = f'{user.first_name} {user.last_name}'
    request.session['auth_avatar'] = user.avatar_path
    request.session['auth_role'] = user.role.value if hasattr(user.role, 'value') else str(user.role)
    request.session['auth_session_version'] = int(user.session_version or 1)


def get_auth_service(db: AsyncSession = Depends(get_db)):
    user_repo = UserRepository(db)
    token_repo = UserTokenRepository(db)
    token_service = UserTokenService(token_repo)
    return AuthService(user_repo, token_service)


def _create_flow_token(user_id: int, purpose: str, ttl_minutes: int = 30) -> str:
    payload = {
        'sub': str(user_id),
        'purpose': purpose,
        'type': 'flow',
        'exp': datetime.now(UTC) + timedelta(minutes=ttl_minutes),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _parse_flow_token(token: str, expected_purpose: str) -> int:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Недействительный flow token') from exc

    if payload.get('type') != 'flow' or payload.get('purpose') != expected_purpose:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Неверное назначение flow token')

    user_id = payload.get('sub')
    if not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Flow token не содержит пользователя')

    return int(user_id)


async def _get_session_user(request: Request, auth_service: AuthService):
    user_id = request.session.get('auth_id')
    session_version = request.session.get('auth_session_version')
    if not user_id or session_version is None:
        return None

    user = await auth_service.repository.find(int(user_id))
    if not user or not user.is_active or int(session_version) != int(user.session_version or 0):
        request.session.clear()
        return None

    return user


@router.post('/login')
async def login(
    payload: LoginPayload,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
):
    client_ip = request.client.host if request.client else 'unknown'
    rl_key = f'api_login:{client_ip}'

    if await rate_limiter.is_limited(rl_key, settings.API_LOGIN_MAX_ATTEMPTS, settings.API_LOGIN_LOCKOUT_TTL):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail='Слишком много попыток входа. Попробуйте позже.')

    result = await auth_service.api_authenticate(payload.email, payload.password, UserRole.GUEST, client_ip)
    if not result:
        await rate_limiter.increment(rl_key, settings.API_LOGIN_LOCKOUT_TTL)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Неверный email или пароль.')

    await rate_limiter.reset(rl_key)
    user = await auth_service.repository.get_by_email(str(payload.email).strip().lower())
    _set_authenticated_session(request, user)
    return {**result, 'user': serialize_user(user)}


@router.post('/refresh')
async def refresh(
    payload: RefreshPayload,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
):
    client_ip = request.client.host if request.client else 'unknown'
    rl_key = f'api_refresh:{client_ip}'

    if await rate_limiter.is_limited(rl_key, settings.API_REFRESH_MAX_ATTEMPTS, settings.API_REFRESH_LOCKOUT_TTL):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail='Слишком много попыток обновления токена.')

    result = await auth_service.api_refresh_token(payload.refresh_token)
    if not result:
        await rate_limiter.increment(rl_key, settings.API_REFRESH_LOCKOUT_TTL)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Refresh token недействителен.')

    await rate_limiter.reset(rl_key)
    return result


@router.post('/register')
async def register(
    payload: UserRegister,
    background_tasks: BackgroundTasks,
    auth_service: AuthService = Depends(get_auth_service),
):
    try:
        user = await auth_service.register_user(payload)
        success, message, retry_after = await auth_service.send_email_verification(user, background_tasks)
        return {
            'success': True,
            'message': message,
            'retry_after': retry_after if success else 0,
            'flow_token': _create_flow_token(user.id, 'verify_email', ttl_minutes=24 * 60),
            'user': serialize_user(user),
        }
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post('/forgot-password')
async def forgot_password(
    payload: ForgotPasswordPayload,
    background_tasks: BackgroundTasks,
    auth_service: AuthService = Depends(get_auth_service),
):
    success, message, retry_after, user_id = await auth_service.forgot_password(str(payload.email), background_tasks)
    flow_token = _create_flow_token(user_id, 'reset_password', ttl_minutes=30) if user_id else None
    return {
        'success': success,
        'message': message,
        'retry_after': retry_after,
        'flow_token': flow_token,
    }


@router.post('/verify-code')
async def verify_code(
    payload: VerifyCodePayload,
    auth_service: AuthService = Depends(get_auth_service),
):
    user_id = _parse_flow_token(payload.flow_token, 'reset_password')
    try:
        await auth_service.verify_code_only(user_id, payload.code)
        return {
            'verified': True,
            'verified_token': _create_flow_token(user_id, 'reset_password_verified', ttl_minutes=30),
        }
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post('/resend-code')
async def resend_code(
    payload: FlowTokenPayload,
    background_tasks: BackgroundTasks,
    auth_service: AuthService = Depends(get_auth_service),
):
    user_id = _parse_flow_token(payload.flow_token, 'reset_password')
    user = await auth_service.repository.find(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Пользователь не найден.')

    success, message, retry_after, _ = await auth_service.forgot_password(user.email, background_tasks)
    return {
        'success': success,
        'message': message,
        'retry_after': retry_after,
        'flow_token': _create_flow_token(user_id, 'reset_password', ttl_minutes=30),
    }


@router.post('/reset-password')
async def reset_password(
    payload: ResetPasswordPayload,
    auth_service: AuthService = Depends(get_auth_service),
):
    user_id = _parse_flow_token(payload.flow_token, 'reset_password_verified')
    try:
        ResetPasswordSchema(password=payload.password, password_confirm=payload.password_confirm)
        await auth_service.reset_password_final(user_id, payload.password)
        return {'success': True}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post('/verify-email')
async def verify_email(
    request: Request,
    payload: VerifyCodePayload,
    auth_service: AuthService = Depends(get_auth_service),
):
    user_id = _parse_flow_token(payload.flow_token, 'verify_email')
    try:
        await auth_service.verify_email_code(user_id, payload.code)
        user = await auth_service.repository.find(user_id)
        _set_authenticated_session(request, user)
        result = auth_service._build_api_tokens(user)
        return {**result, 'user': serialize_user(user)}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post('/resend-verify-email')
async def resend_verify_email(
    payload: FlowTokenPayload,
    background_tasks: BackgroundTasks,
    auth_service: AuthService = Depends(get_auth_service),
):
    user_id = _parse_flow_token(payload.flow_token, 'verify_email')
    user = await auth_service.repository.find(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Пользователь не найден.')

    success, message, retry_after = await auth_service.send_email_verification(user, background_tasks)
    return {
        'success': success,
        'message': message,
        'retry_after': retry_after,
        'flow_token': _create_flow_token(user_id, 'verify_email', ttl_minutes=24 * 60),
    }


@router.get('/me')
async def me(current_user=Depends(auth)):
    return {'user': serialize_user(current_user)}


@router.get('/session')
async def session_login(
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
):
    user = await _get_session_user(request, auth_service)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Нет активной серверной сессии.')

    result = auth_service._build_api_tokens(user)
    return {**result, 'user': serialize_user(user)}


@router.post('/logout')
async def logout(
    request: Request,
    current_user=Depends(auth),
    auth_service: AuthService = Depends(get_auth_service),
):
    await auth_service.revoke_all_auth_state(current_user)
    request.session.clear()
    return {'success': True}
