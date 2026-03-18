import os
import structlog
from datetime import datetime
from app.models.support_ticket import SupportTicket
from app.models.support_message import SupportMessage
from app.models.enums import SupportTicketStatus
from app.repositories.admin.support_repository import SupportTicketRepository, SupportMessageRepository
from app.config import settings
from app.utils.file_validator import FileValidator, IMAGE_SIGNATURES

logger = structlog.get_logger()


class SupportService:
    def __init__(self, ticket_repo: SupportTicketRepository, message_repo: SupportMessageRepository):
        self.ticket_repo = ticket_repo
        self.message_repo = message_repo
        self.db = ticket_repo.db
        self._file_validator = FileValidator(
            allowed=IMAGE_SIGNATURES,
            max_size=settings.MAX_SUPPORT_FILE_SIZE,
            upload_dir=settings.UPLOAD_DIR_SUPPORT,
        )

    async def create_ticket(self, user_id: int, subject: str) -> SupportTicket:
        ticket = SupportTicket(
            user_id=user_id,
            subject=subject,
            status=SupportTicketStatus.OPEN
        )
        self.db.add(ticket)
        await self.db.commit()
        await self.db.refresh(ticket)
        return ticket

    async def send_message(self, ticket_id: int, sender_id: int, text: str = None,
                           file=None, is_from_moderator: bool = False) -> SupportMessage:
        file_path = None
        if file and file.filename:
            file_path = await self._file_validator.validate_and_save(file, subdirectory=str(ticket_id))

        if not text and not file_path:
            raise ValueError("Сообщение должно содержать текст или файл")

        message = SupportMessage(
            ticket_id=ticket_id,
            sender_id=sender_id,
            text=text,
            file_path=file_path,
            is_from_moderator=is_from_moderator
        )
        self.db.add(message)

        ticket = await self.ticket_repo.find(ticket_id)
        if ticket:
            ticket.updated_at = datetime.utcnow()
            if is_from_moderator and ticket.status == SupportTicketStatus.OPEN:
                ticket.status = SupportTicketStatus.IN_PROGRESS

        await self.db.commit()
        await self.db.refresh(message)
        return message

    async def close_ticket(self, ticket_id: int):
        ticket = await self.ticket_repo.find(ticket_id)
        if ticket:
            ticket.status = SupportTicketStatus.CLOSED
            await self.db.commit()
        return ticket

    async def reopen_ticket(self, ticket_id: int):
        ticket = await self.ticket_repo.find(ticket_id)
        if ticket:
            ticket.status = SupportTicketStatus.OPEN
            await self.db.commit()
        return ticket
