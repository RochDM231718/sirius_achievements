from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import UserRole, UserStatus
from app.models.notification import Notification
from app.models.user import Users
from app.services.ws_manager import ws_manager


def make_notification(*, user_id: int, title: str, message: str, link: str | None = None) -> Notification:
    return Notification(
        user_id=user_id,
        title=title,
        message=message,
        link=link,
        is_read=False,
        created_at=datetime.now(timezone.utc),
    )


def serialize_notification(notification: Notification) -> dict:
    created_at = notification.created_at or datetime.now(timezone.utc)
    return {
        "id": notification.id,
        "title": notification.title,
        "message": notification.message,
        "is_read": bool(notification.is_read),
        "link": notification.link,
        "created_at": created_at.strftime("%H:%M %d.%m"),
    }


async def broadcast_staff_event(
    db: AsyncSession,
    event_type: str,
    payload: dict | None = None,
) -> None:
    stmt = select(Users.id).where(
        Users.role.in_([UserRole.MODERATOR, UserRole.SUPER_ADMIN]),
        Users.status == UserStatus.ACTIVE,
    )
    staff_ids = list((await db.execute(stmt)).scalars().all())
    if not staff_ids:
        return

    await ws_manager.broadcast_to_staff(
        {"type": event_type, "payload": payload or {}},
        staff_ids,
    )
