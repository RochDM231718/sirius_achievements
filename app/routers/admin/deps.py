from fastapi import Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import Users
from app.models.enums import UserRole, UserStatus
from app.infrastructure.database import async_session_maker
import structlog

logger = structlog.get_logger()

_STAFF_ROLES = {UserRole.MODERATOR, UserRole.SUPER_ADMIN}


def _redirect_to_login(request: Request):
    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        raise HTTPException(status_code=401, detail="Unauthorized")
    raise HTTPException(status_code=302, headers={"Location": "/sirius.achievements/login"})


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
    """Guard dependency: redirects unauthenticated users to login.
    Also verifies the user has a staff role (MODERATOR or SUPER_ADMIN).
    """
    auth_id = request.session.get("auth_id")
    auth_session_version = request.session.get("auth_session_version")
    if not auth_id or auth_session_version is None:
        _redirect_to_login(request)

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
            _redirect_to_login(request)

        if user.role not in _STAFF_ROLES:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
