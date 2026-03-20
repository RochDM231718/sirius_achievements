from __future__ import annotations

import math
from urllib.parse import quote

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.enums import UserRole
from app.models.support_ticket import SupportTicket
from app.repositories.admin.support_repository import SupportMessageRepository, SupportTicketRepository
from app.routers.admin.admin import get_db, templates
from app.routers.admin.deps import get_current_user, require_auth
from app.security.csrf import validate_csrf
from app.services.admin.support_service import SupportService
from app.services.ws_manager import ws_manager
from app.utils.access import is_in_zone
from app.utils.notifications import broadcast_staff_event, make_notification, serialize_notification

logger = structlog.get_logger()

router = APIRouter(
    prefix="/sirius.achievements",
    tags=["admin.moderation.support"],
    dependencies=[Depends(require_auth)],
)


def get_support_service(db: AsyncSession = Depends(get_db)):
    ticket_repo = SupportTicketRepository(db)
    message_repo = SupportMessageRepository(db)
    return SupportService(ticket_repo, message_repo)


async def require_moderator(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user or user.role not in [UserRole.MODERATOR, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    return user


def _moderator_zone(user):
    if user.role == UserRole.MODERATOR and user.education_level:
        return user.education_level
    return None


def _can_access_ticket(user, ticket) -> bool:
    return bool(ticket and is_in_zone(user, getattr(getattr(ticket, "user", None), "education_level", None)))


def _can_manage_ticket(user, ticket) -> bool:
    if not _can_access_ticket(user, ticket):
        return False
    if user.role == UserRole.SUPER_ADMIN:
        return True
    if ticket.moderator_id is None:
        return True
    return ticket.moderator_id == user.id


async def _notify_support_user(db: AsyncSession, user_id: int, title: str, message: str, link: str):
    notification = make_notification(user_id=user_id, title=title, message=message, link=link)
    db.add(notification)
    await db.commit()
    await ws_manager.send_to_user(
        user_id,
        {"type": "notification", "notification": serialize_notification(notification)},
    )


@router.get("/moderation/support", response_class=HTMLResponse, name="admin.moderation.support.index")
async def moderation_support_index(
    request: Request,
    page: int = Query(1, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_moderator),
):
    ticket_repo = SupportTicketRepository(db)
    education_level = _moderator_zone(user)
    tickets = await ticket_repo.get_new_tickets(page, education_level=education_level)
    total = await ticket_repo.count_new_tickets(education_level=education_level)
    total_pages = math.ceil(total / settings.SUPPORT_ITEMS_PER_PAGE) if total > 0 else 1

    return templates.TemplateResponse(
        "moderation/support.html",
        {
            "request": request,
            "user": user,
            "tickets": tickets,
            "page": page,
            "total_pages": total_pages,
            "total": total,
        },
    )


@router.get("/moderation/support/chats", response_class=HTMLResponse, name="admin.moderation.support.chats")
async def moderation_support_chats(
    request: Request,
    page: int = Query(1, ge=1, le=1000),
    status: str = "",
    query: str = "",
    sort_by: str = "updated_at",
    sort_order: str = "desc",
    db: AsyncSession = Depends(get_db),
    user=Depends(require_moderator),
):
    ticket_repo = SupportTicketRepository(db)
    filters = {"page": page}
    if status:
        filters["status"] = status
    if query:
        filters["query"] = query

    tickets = await ticket_repo.get_all_tickets(
        filters,
        sort_by,
        sort_order,
        education_level=None,
        assigned_to_id=user.id,
    )
    total = await ticket_repo.count_all_tickets(filters, education_level=None, assigned_to_id=user.id)
    total_pages = math.ceil(total / settings.SUPPORT_ITEMS_PER_PAGE) if total > 0 else 1

    return templates.TemplateResponse(
        "moderation/support_chats.html",
        {
            "request": request,
            "user": user,
            "tickets": tickets,
            "page": page,
            "total_pages": total_pages,
            "total": total,
            "current_status": status,
            "current_query": query,
            "sort_by": sort_by,
            "sort_order": sort_order,
        },
    )


@router.get("/moderation/support/all", response_class=HTMLResponse, name="admin.moderation.support.all")
async def moderation_support_all(
    request: Request,
    page: int = Query(1, ge=1, le=1000),
    status: str = "",
    query: str = "",
    sort_by: str = "created_at",
    sort_order: str = "desc",
    db: AsyncSession = Depends(get_db),
    user=Depends(require_moderator),
):
    ticket_repo = SupportTicketRepository(db)

    filters = {"page": page}
    if status:
        filters["status"] = status
    if query:
        filters["query"] = query

    education_level = _moderator_zone(user)
    tickets = await ticket_repo.get_all_tickets(filters, sort_by, sort_order, education_level=education_level)
    total = await ticket_repo.count_all_tickets(filters, education_level=education_level)
    total_pages = math.ceil(total / settings.SUPPORT_ITEMS_PER_PAGE) if total > 0 else 1

    return templates.TemplateResponse(
        "moderation/support_all.html",
        {
            "request": request,
            "user": user,
            "tickets": tickets,
            "page": page,
            "total_pages": total_pages,
            "total": total,
            "current_status": status,
            "current_query": query,
            "sort_by": sort_by,
            "sort_order": sort_order,
        },
    )


@router.get("/moderation/support/{ticket_id}", response_class=HTMLResponse, name="admin.moderation.support.chat")
async def moderation_support_chat(
    request: Request,
    ticket_id: int,
    back: str = Query("new"),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_moderator),
):
    ticket_repo = SupportTicketRepository(db)
    ticket = await ticket_repo.find_with_messages(ticket_id)

    if not ticket:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    if not _can_access_ticket(user, ticket):
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    if back == "all":
        back_url = "/sirius.achievements/moderation/support/all"
    elif back == "chats":
        back_url = "/sirius.achievements/moderation/support/chats"
    else:
        back_url = "/sirius.achievements/moderation/support"

    return templates.TemplateResponse(
        "moderation/support_chat.html",
        {
            "request": request,
            "user": user,
            "ticket": ticket,
            "back_url": back_url,
            "can_manage_ticket": _can_manage_ticket(user, ticket),
            "can_take_ticket": ticket.moderator_id is None and _can_manage_ticket(user, ticket),
            "is_my_ticket": ticket.moderator_id == user.id,
        },
    )


@router.post(
    "/moderation/support/{ticket_id}/take",
    name="admin.moderation.support.take",
    dependencies=[Depends(validate_csrf)],
)
async def moderation_take_ticket(
    request: Request,
    ticket_id: int,
    back: str = Form("new"),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_moderator),
    service: SupportService = Depends(get_support_service),
):
    ticket_repo = SupportTicketRepository(db)
    ticket = await ticket_repo.find_with_messages(ticket_id)
    if not ticket or not _can_access_ticket(user, ticket):
        raise HTTPException(status_code=404, detail="Обращение не найдено")

    try:
        await service.take_ticket(ticket_id, user.id)
        await _notify_support_user(
            db,
            ticket.user_id,
            "Обращение принято в работу",
            f'Модератор взял в работу обращение "{ticket.subject}".',
            f"/sirius.achievements/support/{ticket_id}",
        )
        await broadcast_staff_event(
            db,
            "support_queue_updated",
            {"ticket_id": ticket_id, "action": "taken"},
        )
    except ValueError as exc:
        if back == "all":
            target_back = "/sirius.achievements/moderation/support/all"
        elif back == "chats":
            target_back = "/sirius.achievements/moderation/support/chats"
        else:
            target_back = "/sirius.achievements/moderation/support"
        return RedirectResponse(
            url=f"{target_back}?toast_msg={quote(str(exc))}&toast_type=error",
            status_code=302,
        )

    return RedirectResponse(
        url=f"/sirius.achievements/moderation/support/{ticket_id}?back=chats&toast_msg={quote('Обращение принято в работу')}&toast_type=success",
        status_code=302,
    )


@router.post(
    "/moderation/support/{ticket_id}/send",
    name="admin.moderation.support.send",
    dependencies=[Depends(validate_csrf)],
)
async def moderation_send_message(
    request: Request,
    ticket_id: int,
    text: str = Form(None),
    file: UploadFile = File(None),
    session_duration: str = Form("month"),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_moderator),
    service: SupportService = Depends(get_support_service),
):
    ticket_repo = SupportTicketRepository(db)
    ticket = await ticket_repo.find_with_messages(ticket_id)
    if not _can_access_ticket(user, ticket):
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    if not _can_manage_ticket(user, ticket):
        return RedirectResponse(
            url=f'/sirius.achievements/moderation/support/{ticket_id}?toast_msg={quote("Обращение уже взято другим модератором")}&toast_type=error',
            status_code=302,
        )

    try:
        await service.send_message(
            ticket_id=ticket_id,
            sender_id=user.id,
            text=text,
            file=file if file and file.filename else None,
            is_from_moderator=True,
            session_duration=session_duration,
        )
        await _notify_support_user(
            db,
            ticket.user_id,
            "Новый ответ в поддержке",
            f'Модератор ответил по обращению "{ticket.subject}".',
            f"/sirius.achievements/support/{ticket_id}",
        )
        await broadcast_staff_event(
            db,
            "support_queue_updated",
            {"ticket_id": ticket_id, "action": "moderator_reply"},
        )
    except ValueError as exc:
        return RedirectResponse(
            url=f'/sirius.achievements/moderation/support/{ticket_id}?toast_msg={quote(str(exc))}&toast_type=error',
            status_code=302,
        )

    return RedirectResponse(url=f"/sirius.achievements/moderation/support/{ticket_id}?back=chats", status_code=302)


@router.post(
    "/moderation/support/{ticket_id}/close",
    name="admin.moderation.support.close",
    dependencies=[Depends(validate_csrf)],
)
async def moderation_close_ticket(
    request: Request,
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_moderator),
    service: SupportService = Depends(get_support_service),
):
    ticket = await db.get(SupportTicket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Обращение не найдено")

    full_ticket = await SupportTicketRepository(db).find_with_messages(ticket_id)
    if not _can_access_ticket(user, full_ticket):
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    if not _can_manage_ticket(user, full_ticket):
        return RedirectResponse(
            url=f'/sirius.achievements/moderation/support/{ticket_id}?toast_msg={quote("Обращение уже взято другим модератором")}&toast_type=error',
            status_code=302,
        )

    try:
        await service.close_ticket(ticket_id)
        await _notify_support_user(
            db,
            ticket.user_id,
            "Обращение закрыто",
            f'Модератор закрыл обращение "{ticket.subject}".',
            f"/sirius.achievements/support/{ticket_id}",
        )
        await broadcast_staff_event(
            db,
            "support_queue_updated",
            {"ticket_id": ticket_id, "action": "closed"},
        )
    except ValueError as exc:
        return RedirectResponse(
            url=f'/sirius.achievements/moderation/support/{ticket_id}?toast_msg={quote(str(exc))}&toast_type=error',
            status_code=302,
        )

    return RedirectResponse(
        url=f'/sirius.achievements/moderation/support/{ticket_id}?back=chats&toast_msg={quote("Обращение закрыто")}&toast_type=success',
        status_code=302,
    )


@router.post(
    "/moderation/support/{ticket_id}/reopen",
    name="admin.moderation.support.reopen",
    dependencies=[Depends(validate_csrf)],
)
async def moderation_reopen_ticket(
    request: Request,
    ticket_id: int,
    session_duration: str = Form("month"),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_moderator),
    service: SupportService = Depends(get_support_service),
):
    ticket = await db.get(SupportTicket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Обращение не найдено")

    full_ticket = await SupportTicketRepository(db).find_with_messages(ticket_id)
    if not _can_access_ticket(user, full_ticket):
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    if not _can_manage_ticket(user, full_ticket):
        return RedirectResponse(
            url=f'/sirius.achievements/moderation/support/{ticket_id}?toast_msg={quote("Обращение уже взято другим модератором")}&toast_type=error',
            status_code=302,
        )

    try:
        await service.reopen_ticket(ticket_id, session_duration=session_duration)
        await _notify_support_user(
            db,
            ticket.user_id,
            "Обращение открыто снова",
            f'Модератор переоткрыл обращение "{ticket.subject}".',
            f"/sirius.achievements/support/{ticket_id}",
        )
        await broadcast_staff_event(
            db,
            "support_queue_updated",
            {"ticket_id": ticket_id, "action": "reopened"},
        )
    except ValueError as exc:
        return RedirectResponse(
            url=f'/sirius.achievements/moderation/support/{ticket_id}?toast_msg={quote(str(exc))}&toast_type=error',
            status_code=302,
        )

    return RedirectResponse(
        url=f'/sirius.achievements/moderation/support/{ticket_id}?back=chats&toast_msg={quote("Обращение открыто")}&toast_type=success',
        status_code=302,
    )
