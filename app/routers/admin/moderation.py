from __future__ import annotations

import math

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.achievement import Achievement
from app.models.enums import AchievementStatus, UserRole, UserStatus
from app.models.user import Users
from app.repositories.admin.achievement_repository import AchievementRepository
from app.repositories.admin.user_repository import UserRepository
from app.routers.admin.admin import get_db, templates
from app.routers.admin.deps import require_auth
from app.security.csrf import validate_csrf
from app.services.admin.achievement_service import AchievementService
from app.services.admin.user_service import UserService
from app.services.audit_service import log_action
from app.services.points_calculator import calculate_points
from app.services.ws_manager import ws_manager
from app.utils.access import is_in_zone
from app.utils.notifications import make_notification, serialize_notification

router = APIRouter(
    prefix="/sirius.achievements",
    tags=["admin.moderation"],
    dependencies=[Depends(require_auth)],
)


def get_user_service(db: AsyncSession = Depends(get_db)):
    return UserService(UserRepository(db))


def get_achievement_service(db: AsyncSession = Depends(get_db)):
    return AchievementService(AchievementRepository(db))


async def check_moderator(request: Request, db: AsyncSession):
    user_id = request.session.get("auth_id")
    if not user_id:
        raise HTTPException(status_code=403, detail="Not authenticated")

    user = await db.get(Users, user_id)
    if not user:
        raise HTTPException(status_code=403, detail="User not found")
    if user.role not in [UserRole.MODERATOR, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")

    return user


@router.get("/moderation/users", response_class=HTMLResponse, name="admin.moderation.users")
async def pending_users(request: Request, db: AsyncSession = Depends(get_db)):
    user = await check_moderator(request, db)

    stmt = select(Users).filter(Users.status == UserStatus.PENDING)
    if user.role == UserRole.MODERATOR and user.education_level:
        stmt = stmt.filter(Users.education_level == user.education_level)

    stmt = stmt.order_by(Users.id.desc())
    users = (await db.execute(stmt)).scalars().all()

    return templates.TemplateResponse(
        "moderation/users.html",
        {
            "request": request,
            "users": users,
            "total_count": len(users),
            "user": user,
            "current_user": user,
        },
    )


@router.post("/moderation/users/{id}/approve", name="admin.moderation.users.approve", dependencies=[Depends(validate_csrf)])
async def approve_user(
    id: int,
    request: Request,
    service: UserService = Depends(get_user_service),
    db: AsyncSession = Depends(get_db),
):
    current_user = await check_moderator(request, db)
    target_user = await db.get(Users, id)

    if not target_user or not is_in_zone(current_user, target_user.education_level):
        return RedirectResponse(
            url=request.url_for("admin.moderation.users").include_query_params(
                toast_msg="У вас нет доступа к этому потоку",
                toast_type="error",
            ),
            status_code=302,
        )

    await service.repository.update(id, {"status": UserStatus.ACTIVE, "role": UserRole.STUDENT})
    await log_action(
        db,
        current_user.id,
        "user.approve",
        "user",
        id,
        ip_address=request.client.host if request.client else None,
    )
    return RedirectResponse(
        url=request.url_for("admin.moderation.users").include_query_params(
            toast_msg="Пользователь одобрен",
            toast_type="success",
        ),
        status_code=302,
    )


@router.post("/moderation/users/{id}/reject", name="admin.moderation.users.reject", dependencies=[Depends(validate_csrf)])
async def reject_user(
    id: int,
    request: Request,
    service: UserService = Depends(get_user_service),
    db: AsyncSession = Depends(get_db),
):
    current_user = await check_moderator(request, db)
    target_user = await db.get(Users, id)

    if not target_user or not is_in_zone(current_user, target_user.education_level):
        return RedirectResponse(
            url=request.url_for("admin.moderation.users").include_query_params(
                toast_msg="У вас нет доступа к этому потоку",
                toast_type="error",
            ),
            status_code=302,
        )

    await service.repository.update(id, {"status": UserStatus.REJECTED})
    await log_action(
        db,
        current_user.id,
        "user.reject",
        "user",
        id,
        ip_address=request.client.host if request.client else None,
    )
    return RedirectResponse(
        url=request.url_for("admin.moderation.users").include_query_params(
            toast_msg="Пользователь отклонен",
            toast_type="success",
        ),
        status_code=302,
    )


@router.get("/moderation/achievements", response_class=HTMLResponse, name="admin.moderation.achievements")
async def achievements_list(request: Request, page: int = Query(1, ge=1, le=1000), db: AsyncSession = Depends(get_db)):
    user = await check_moderator(request, db)

    limit = settings.ITEMS_PER_PAGE
    offset = (page - 1) * limit

    stmt = (
        select(Achievement)
        .join(Users, Achievement.user_id == Users.id)
        .options(selectinload(Achievement.user))
        .filter(Achievement.status == AchievementStatus.PENDING)
    )

    if user.role == UserRole.MODERATOR and user.education_level:
        stmt = stmt.filter(Users.education_level == user.education_level)

    stmt = stmt.order_by(Achievement.created_at.asc())

    total_pending = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    achievements = (await db.execute(stmt.offset(offset).limit(limit))).scalars().all()

    for item in achievements:
        if item.level and item.category:
            item.projected_points = calculate_points(item.level.value, item.category.value)
        else:
            item.projected_points = 0

    return templates.TemplateResponse(
        "moderation/achievements.html",
        {
            "request": request,
            "achievements": achievements,
            "total_pending": total_pending,
            "stats": {"pending": total_pending, "approved": 0},
            "page": page,
            "total_pages": math.ceil(total_pending / limit) if total_pending > 0 else 1,
            "user": user,
        },
    )


@router.post("/moderation/achievements/{id}", name="admin.moderation.achievements.update", dependencies=[Depends(validate_csrf)])
async def update_achievement_status(
    id: int,
    request: Request,
    status: str = Form(...),
    rejection_reason: str = Form(None),
    db: AsyncSession = Depends(get_db),
):
    current_user = await check_moderator(request, db)

    stmt = select(Achievement).options(selectinload(Achievement.user)).where(Achievement.id == id).with_for_update()
    achievement = (await db.execute(stmt)).scalars().first()

    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found")
    if not is_in_zone(current_user, achievement.user.education_level):
        return RedirectResponse(
            url=request.url_for("admin.moderation.achievements").include_query_params(
                toast_msg="Вы не можете проверять чужой поток",
                toast_type="error",
            ),
            status_code=302,
        )
    if achievement.status != AchievementStatus.PENDING:
        return RedirectResponse(
            url=request.url_for("admin.moderation.achievements").include_query_params(
                toast_msg="Документ уже был обработан другим модератором",
                toast_type="error",
            ),
            status_code=302,
        )

    allowed_statuses = {
        "approved": AchievementStatus.APPROVED,
        "rejected": AchievementStatus.REJECTED,
        "revision": AchievementStatus.REVISION,
    }
    new_status = allowed_statuses.get(status)
    if not new_status:
        return RedirectResponse(
            url=request.url_for("admin.moderation.achievements").include_query_params(
                toast_msg="Недопустимый статус",
                toast_type="error",
            ),
            status_code=302,
        )

    achievement.status = new_status
    notif_message = f"Статус документа '{achievement.title}' обновлен."

    if new_status == AchievementStatus.REJECTED:
        achievement.rejection_reason = rejection_reason
        achievement.points = 0
        notif_message = f"Окончательный отказ по документу '{achievement.title}'. Причина: {rejection_reason}"
    elif new_status == AchievementStatus.REVISION:
        achievement.rejection_reason = rejection_reason
        achievement.points = 0
        notif_message = f"Документ '{achievement.title}' отправлен на доработку. Примечание: {rejection_reason}"
    elif new_status == AchievementStatus.APPROVED:
        points = calculate_points(achievement.level.value, achievement.category.value)
        achievement.points = points
        achievement.rejection_reason = None
        notif_message = f"Документ '{achievement.title}' одобрен. Начислено {points} баллов."

    notification = make_notification(
        user_id=achievement.user_id,
        title="Статус заявки обновлен",
        message=notif_message,
        link="/sirius.achievements/achievements",
    )
    db.add(notification)

    await log_action(
        db,
        current_user.id,
        f"achievement.{status}",
        "achievement",
        id,
        details=rejection_reason,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    await ws_manager.send_to_user(
        achievement.user_id,
        {"type": "notification", "notification": serialize_notification(notification)},
    )

    return RedirectResponse(
        url=request.url_for("admin.moderation.achievements").include_query_params(
            toast_msg="Решение сохранено",
            toast_type="success",
        ),
        status_code=302,
    )


@router.post("/moderation/achievements/batch", name="admin.moderation.achievements.batch", dependencies=[Depends(validate_csrf)])
async def batch_update_achievements(request: Request, db: AsyncSession = Depends(get_db)):
    current_user = await check_moderator(request, db)
    form = await request.form()

    ids_raw = form.get("ids", "")
    action = form.get("action", "")

    if not ids_raw or not action:
        return RedirectResponse(
            url=request.url_for("admin.moderation.achievements").include_query_params(
                toast_msg="Не выбраны документы или действие",
                toast_type="error",
            ),
            status_code=302,
        )

    allowed_actions = {
        "approved": AchievementStatus.APPROVED,
        "rejected": AchievementStatus.REJECTED,
    }
    new_status = allowed_actions.get(action)
    if not new_status:
        return RedirectResponse(
            url=request.url_for("admin.moderation.achievements").include_query_params(
                toast_msg="Недопустимое действие",
                toast_type="error",
            ),
            status_code=302,
        )

    try:
        ids = [int(x.strip()) for x in ids_raw.split(",") if x.strip().isdigit()]
    except ValueError:
        ids = []

    if not ids:
        return RedirectResponse(
            url=request.url_for("admin.moderation.achievements").include_query_params(
                toast_msg="Не выбраны документы",
                toast_type="error",
            ),
            status_code=302,
        )

    processed = 0
    notifications_to_send = []
    for ach_id in ids:
        stmt = select(Achievement).options(selectinload(Achievement.user)).where(Achievement.id == ach_id).with_for_update()
        ach = (await db.execute(stmt)).scalars().first()

        if not ach or ach.status != AchievementStatus.PENDING:
            continue
        if not is_in_zone(current_user, ach.user.education_level):
            continue

        ach.status = new_status
        if new_status == AchievementStatus.APPROVED:
            points = calculate_points(ach.level.value, ach.category.value)
            ach.points = points
            ach.rejection_reason = None
            msg = f"Документ '{ach.title}' одобрен. Начислено {points} баллов."
        else:
            ach.points = 0
            msg = f"Окончательный отказ по документу '{ach.title}'."

        notification = make_notification(
            user_id=ach.user_id,
            title="Статус заявки обновлен",
            message=msg,
            link="/sirius.achievements/achievements",
        )
        db.add(notification)
        notifications_to_send.append((ach.user_id, notification))

        await log_action(
            db,
            current_user.id,
            f"achievement.batch_{action}",
            "achievement",
            ach_id,
            ip_address=request.client.host if request.client else None,
        )
        processed += 1

    await db.commit()

    for user_id, notification in notifications_to_send:
        await ws_manager.send_to_user(
            user_id,
            {"type": "notification", "notification": serialize_notification(notification)},
        )

    return RedirectResponse(
        url=request.url_for("admin.moderation.achievements").include_query_params(
            toast_msg=f"Обработано документов: {processed}",
            toast_type="success",
        ),
        status_code=302,
    )
