from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from fastapi import APIRouter, Depends, HTTPException

from app.infrastructure.database import get_db
from app.middlewares.api_auth_middleware import auth
from app.models.achievement import Achievement
from app.models.enums import AchievementStatus, UserRole, UserStatus
from app.models.user import Users
from app.services.points_calculator import calculate_points

from .serializers import serialize_achievement, serialize_user

router = APIRouter(prefix='/api/v1/my-work', tags=['api.v1.my-work'])


async def require_moderator(current_user=Depends(auth)):
    if current_user.role not in {UserRole.MODERATOR, UserRole.SUPER_ADMIN}:
        raise HTTPException(status_code=403, detail='Access denied')
    return current_user


@router.get('')
@router.get('/')
async def my_work_overview(
    current_user=Depends(require_moderator),
    db: AsyncSession = Depends(get_db),
):
    my_users = (
        await db.execute(
            select(Users)
            .filter(Users.reviewed_by_id == current_user.id, Users.status == UserStatus.PENDING)
            .order_by(Users.created_at.desc())
        )
    ).scalars().all()

    my_achievements = (
        await db.execute(
            select(Achievement)
            .options(selectinload(Achievement.user))
            .filter(Achievement.moderator_id == current_user.id, Achievement.status == AchievementStatus.PENDING)
            .order_by(Achievement.created_at.asc())
        )
    ).scalars().all()

    for item in my_achievements:
        if item.level and item.category:
            item.projected_points = calculate_points(
                item.level.value,
                item.category.value,
                item.result.value if item.result else None,
            )
        else:
            item.projected_points = 0

    return {
        'users': [serialize_user(user) for user in my_users],
        'achievements': [serialize_achievement(item) for item in my_achievements],
        'total_users': len(my_users),
        'total_achievements': len(my_achievements),
    }
