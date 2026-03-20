from fastapi import Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import Users
from app.models.enums import UserRole, UserStatus
from app.infrastructure.database import async_session_maker
import structlog

logger = structlog.get_logger()


def _is_ajax(request: Request) -> bool:
    return request.headers.get("x-requested-with") == "XMLHttpRequest"


def _reject_unauthorized(request: Request):
    if _is_ajax(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    raise HTTPException(status_code=302, headers={"Location": "/sirius.achievements/login"})


def _reject_pending_portal_access(request: Request):
    if _is_ajax(request):
        raise HTTPException(status_code=403, detail="Account pending moderation")
    raise HTTPException(status_code=302, headers={"Location": "/sirius.achievements/dashboard"})


def _has_active_portal_access(user: Users) -> bool:
    if user.role in (UserRole.MODERATOR, UserRole.SUPER_ADMIN):
        return True
    return user.role == UserRole.STUDENT and user.status == UserStatus.ACTIVE


async def get_current_user(request: Request, db: AsyncSession):
    user_id = request.session.get("auth_id")
    session_version = request.session.get("auth_session_version")
    if not user_id:
        return None

    try:
        query = select(Users).where(Users.id == user_id)
        result = await db.execute(query)
        user = result.scalars().first()

        if (
            not user
            or user.status == UserStatus.REJECTED
            or not user.is_active
            or session_version is None
            or int(session_version) != int(user.session_version or 0)
        ):
            request.session.clear()
            return None

        return user
    except Exception as e:
        logger.error("Auth error in deps.py", error=str(e))
        return None


async def require_auth(request: Request):
    """Guard dependency: redirects unauthenticated users to login."""
    auth_id = request.session.get("auth_id")
    auth_session_version = request.session.get("auth_session_version")
    if not auth_id or auth_session_version is None:
        _reject_unauthorized(request)

    async with async_session_maker() as db:
        query = select(Users).where(Users.id == auth_id)
        result = await db.execute(query)
        user = result.scalars().first()

        if (
            not user
            or user.status == UserStatus.REJECTED
            or not user.is_active
            or int(auth_session_version) != int(user.session_version or 0)
        ):
            request.session.clear()
            _reject_unauthorized(request)


async def require_active_portal_access(request: Request):
    """Guard dependency for sections available only to active students or staff."""
    auth_id = request.session.get("auth_id")
    auth_session_version = request.session.get("auth_session_version")
    if not auth_id or auth_session_version is None:
        _reject_unauthorized(request)

    async with async_session_maker() as db:
        query = select(Users).where(Users.id == auth_id)
        result = await db.execute(query)
        user = result.scalars().first()

        if (
            not user
            or user.status == UserStatus.REJECTED
            or not user.is_active
            or int(auth_session_version) != int(user.session_version or 0)
        ):
            request.session.clear()
            _reject_unauthorized(request)

        if not _has_active_portal_access(user):
            _reject_pending_portal_access(request)
