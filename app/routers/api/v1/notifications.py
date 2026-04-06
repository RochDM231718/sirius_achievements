from fastapi import APIRouter, Depends
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db
from app.middlewares.api_auth_middleware import auth
from app.models.notification import Notification

from .serializers import serialize_notification

router = APIRouter(prefix='/api/v1/notifications', tags=['api.v1.notifications'])


@router.get('/unread-count')
async def unread_count(current_user=Depends(auth), db: AsyncSession = Depends(get_db)):
    count = (await db.execute(
        select(func.count()).filter(Notification.user_id == current_user.id, Notification.is_read.is_(False))
    )).scalar() or 0

    items = (await db.execute(
        select(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.is_read.asc(), Notification.created_at.desc())
        .limit(5)
    )).scalars().all()

    return {
        'count': int(count),
        'notifications': [serialize_notification(item) for item in items],
    }


@router.post('/mark-read')
async def mark_read(current_user=Depends(auth), db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id)
        .values(is_read=True)
    )
    await db.commit()
    return {'status': 'ok'}
