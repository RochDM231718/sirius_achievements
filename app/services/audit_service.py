from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog
import structlog

logger = structlog.get_logger()


async def log_action(
    db: AsyncSession,
    user_id: int | None,
    action: str,
    target_type: str = None,
    target_id: int = None,
    details: str = None,
    ip_address: str = None,
):
    entry = AuditLog(
        user_id=user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details,
        ip_address=ip_address,
    )
    db.add(entry)
    logger.info("audit", action=action, user_id=user_id, target_type=target_type, target_id=target_id)
