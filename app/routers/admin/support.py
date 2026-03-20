from __future__ import annotations

from urllib.parse import quote

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.admin.support_repository import SupportMessageRepository, SupportTicketRepository
from app.routers.admin.admin import get_db, templates
from app.routers.admin.deps import get_current_user, require_active_portal_access
from app.security.csrf import validate_csrf
from app.services.admin.support_service import SupportService
from app.utils.access import is_in_zone
from app.utils.media_paths import guess_media_type, resolve_static_path
from app.utils.notifications import broadcast_staff_event

logger = structlog.get_logger()

router = APIRouter(
    prefix="/sirius.achievements",
    tags=["admin.support"],
    dependencies=[Depends(require_active_portal_access)],
)


def get_support_service(db: AsyncSession = Depends(get_db)):
    ticket_repo = SupportTicketRepository(db)
    message_repo = SupportMessageRepository(db)
    return SupportService(ticket_repo, message_repo)


def _can_access_ticket(user, ticket) -> bool:
    if not user or not ticket:
        return False
    if ticket.user_id == user.id:
        return True
    return is_in_zone(user, getattr(getattr(ticket, "user", None), "education_level", None))


def _inline_file_response(relative_path: str) -> FileResponse:
    try:
        full_path = resolve_static_path(relative_path)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Недопустимый путь к файлу") from exc

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")

    response = FileResponse(path=full_path, media_type=guess_media_type(full_path))
    response.headers["Content-Disposition"] = f'inline; filename="{full_path.name}"'
    return response


@router.get("/support", response_class=HTMLResponse, name="admin.support.index")
async def support_index(
    request: Request,
    view: str = Query("active"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)

    ticket_repo = SupportTicketRepository(db)
    tickets = await ticket_repo.get_by_user(user.id, view=view)

    return templates.TemplateResponse(
        "support/index.html",
        {
            "request": request,
            "user": user,
            "tickets": tickets,
        },
    )


@router.post("/support/create", name="admin.support.create", dependencies=[Depends(validate_csrf)])
async def create_ticket(
    request: Request,
    subject: str = Form(...),
    message: str = Form(...),
    file: UploadFile = File(None),
    db: AsyncSession = Depends(get_db),
    service: SupportService = Depends(get_support_service),
):
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)

    try:
        ticket = await service.create_ticket_with_initial_message(
            user_id=user.id,
            subject=subject,
            text=message,
            file=file if file and file.filename else None,
        )
        await broadcast_staff_event(
            db,
            "support_queue_updated",
            {"ticket_id": ticket.id, "action": "created"},
        )
        return RedirectResponse(
            url=f'/sirius.achievements/support/{ticket.id}?toast_msg={quote("Обращение создано")}&toast_type=success',
            status_code=302,
        )
    except ValueError as exc:
        return RedirectResponse(
            url=f'/sirius.achievements/support?toast_msg={quote(str(exc))}&toast_type=error',
            status_code=302,
        )


@router.get("/support/{ticket_id}", response_class=HTMLResponse, name="admin.support.chat")
async def support_chat(request: Request, ticket_id: int, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)

    ticket_repo = SupportTicketRepository(db)
    ticket = await ticket_repo.find_with_messages(ticket_id)

    if not ticket or ticket.user_id != user.id:
        return RedirectResponse(url="/sirius.achievements/support", status_code=302)

    return templates.TemplateResponse(
        "support/chat.html",
        {
            "request": request,
            "user": user,
            "ticket": ticket,
        },
    )


@router.post("/support/{ticket_id}/send", name="admin.support.send", dependencies=[Depends(validate_csrf)])
async def send_message(
    request: Request,
    ticket_id: int,
    text: str = Form(None),
    file: UploadFile = File(None),
    db: AsyncSession = Depends(get_db),
    service: SupportService = Depends(get_support_service),
):
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)

    ticket_repo = SupportTicketRepository(db)
    ticket = await ticket_repo.find(ticket_id)

    if not ticket or ticket.user_id != user.id:
        return RedirectResponse(url="/sirius.achievements/support", status_code=302)

    try:
        await service.send_message(
            ticket_id=ticket_id,
            sender_id=user.id,
            text=text,
            file=file if file and file.filename else None,
            is_from_moderator=False,
        )
        await broadcast_staff_event(
            db,
            "support_queue_updated",
            {"ticket_id": ticket_id, "action": "student_reply"},
        )
    except ValueError as exc:
        return RedirectResponse(
            url=f'/sirius.achievements/support/{ticket_id}?toast_msg={quote(str(exc))}&toast_type=error',
            status_code=302,
        )

    return RedirectResponse(url=f"/sirius.achievements/support/{ticket_id}", status_code=302)


@router.get("/support/messages/{message_id}/attachment")
async def support_attachment(
    message_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Не авторизован")

    message_repo = SupportMessageRepository(db)
    message = await message_repo.find_with_ticket(message_id)
    if not message or not message.file_path:
        raise HTTPException(status_code=404, detail="Вложение не найдено")
    if not _can_access_ticket(user, message.ticket):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    return _inline_file_response(message.file_path)
