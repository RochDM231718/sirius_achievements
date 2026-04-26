from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import structlog
from PIL import Image, ImageOps
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.enums import SupportTicketStatus
from app.repositories.admin.support_repository import SupportTicketRepository
from app.services.ws_manager import ws_manager
from app.utils.media_paths import STATIC_ROOT, resolve_static_path
from app.utils.notifications import broadcast_staff_event, make_notification, serialize_notification

logger = structlog.get_logger()

SUPPORT_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def _optimized_support_image(relative_path: str) -> tuple[str, Path] | None:
    suffix = Path(relative_path).suffix.lower()
    if suffix not in SUPPORT_IMAGE_EXTENSIONS or not relative_path.startswith("uploads/support/"):
        return None

    source_path = resolve_static_path(relative_path)
    if not source_path.exists():
        return None

    target_path = source_path.with_suffix(".archived.webp")
    try:
        with Image.open(source_path) as image:
            image = ImageOps.exif_transpose(image)
            has_alpha = "A" in image.getbands()
            encoded = image.convert("RGBA" if has_alpha else "RGB")
            encoded.save(target_path, "WEBP", quality=82, method=6)
    except Exception as exc:
        if target_path.exists():
            target_path.unlink(missing_ok=True)
        logger.warning("support_archive_image_optimization_failed", path=relative_path, error=str(exc))
        return None

    try:
        if target_path.stat().st_size >= source_path.stat().st_size:
            target_path.unlink(missing_ok=True)
            return None
    except OSError:
        target_path.unlink(missing_ok=True)
        return None

    return target_path.relative_to(STATIC_ROOT).as_posix(), source_path


async def process_support_ticket_maintenance(db: AsyncSession) -> dict[str, int]:
    ticket_repo = SupportTicketRepository(db)
    now = datetime.now(timezone.utc)

    expired_tickets = await ticket_repo.get_expired_active_tickets(now)
    auto_close_notifications = []
    for ticket in expired_tickets:
        ticket.status = SupportTicketStatus.CLOSED
        ticket.closed_at = now
        ticket.session_expires_at = None
        ticket.updated_at = now
        notification = make_notification(
            user_id=ticket.user_id,
            title="Обращение закрыто автоматически",
            message=f'Обращение "{ticket.subject}" закрыто по истечении срока сессии.',
            link=f"/sirius.achievements/support/{ticket.id}",
        )
        db.add(notification)
        auto_close_notifications.append(notification)

    if expired_tickets:
        await db.commit()
        for notification in auto_close_notifications:
            await ws_manager.send_to_user(
                notification.user_id,
                {"type": "notification", "notification": serialize_notification(notification)},
            )
        await broadcast_staff_event(
            db,
            "support_queue_updated",
            {
                "action": "maintenance",
                "closed": len(expired_tickets),
            },
        )

    return {"closed": len(expired_tickets), "archived": 0}
