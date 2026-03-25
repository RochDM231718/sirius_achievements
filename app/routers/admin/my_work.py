from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.achievement import Achievement
from app.models.enums import AchievementStatus, UserRole, UserStatus
from app.models.user import Users
from app.routers.admin.admin import get_db, templates
from app.routers.admin.deps import require_auth
from app.security.csrf import validate_csrf
from app.services.points_calculator import calculate_points
from app.utils.access import is_in_zone

router = APIRouter(
    prefix="/sirius.achievements",
    tags=["admin.my_work"],
    dependencies=[Depends(require_auth)],
)


async def _get_moderator(request: Request, db: AsyncSession) -> Users:
    user = await db.get(Users, request.session.get("auth_id"))
    if not user or user.role not in (UserRole.MODERATOR, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Access denied")
    return user


# ── My Users page ─────────────────────────────────────────────────

@router.get("/my-work/users", response_class=HTMLResponse, name="admin.my_work.users")
async def my_work_users(request: Request, db: AsyncSession = Depends(get_db)):
    user = await _get_moderator(request, db)

    my_users = (await db.execute(
        select(Users)
        .filter(Users.reviewed_by_id == user.id, Users.status == UserStatus.PENDING)
        .order_by(Users.created_at.desc())
    )).scalars().all()

    return templates.TemplateResponse("my_work/users.html", {
        "request": request,
        "user": user,
        "users": my_users,
        "total": len(my_users),
    })


# ── My Achievements page ─────────────────────────────────────────

@router.get("/my-work/achievements", response_class=HTMLResponse, name="admin.my_work.achievements")
async def my_work_achievements(request: Request, db: AsyncSession = Depends(get_db)):
    user = await _get_moderator(request, db)

    my_achievements = (await db.execute(
        select(Achievement)
        .options(selectinload(Achievement.user))
        .filter(Achievement.moderator_id == user.id, Achievement.status == AchievementStatus.PENDING)
        .order_by(Achievement.created_at.asc())
    )).scalars().all()

    for item in my_achievements:
        if item.level and item.category:
            item.projected_points = calculate_points(
                item.level.value, item.category.value,
                item.result.value if item.result else None,
            )
        else:
            item.projected_points = 0

    return templates.TemplateResponse("my_work/achievements.html", {
        "request": request,
        "user": user,
        "achievements": my_achievements,
        "total": len(my_achievements),
    })


# ── Redirect /my-work to /my-work/users ──────────────────────────

@router.get("/my-work", response_class=HTMLResponse, name="admin.my_work.index")
async def my_work_index(request: Request):
    return RedirectResponse(url="/sirius.achievements/my-work/users", status_code=302)


# ── Take / release achievements ───────────────────────────────────

@router.post("/moderation/achievements/{id}/take", name="admin.moderation.achievements.take", dependencies=[Depends(validate_csrf)])
async def take_achievement(id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await _get_moderator(request, db)
    ach = await db.get(Achievement, id)
    if not ach or ach.status != AchievementStatus.PENDING:
        return _redirect_back(request, "Документ не найден или уже обработан", "error")
    if ach.moderator_id and ach.moderator_id != user.id:
        return _redirect_back(request, "Документ уже взят другим модератором", "error")
    ach.moderator_id = user.id
    await db.commit()
    return _redirect_back(request, "Документ взят в работу", "success")


@router.post("/moderation/achievements/{id}/release", name="admin.moderation.achievements.release", dependencies=[Depends(validate_csrf)])
async def release_achievement(id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await _get_moderator(request, db)
    ach = await db.get(Achievement, id)
    if not ach or (ach.moderator_id != user.id and user.role != UserRole.SUPER_ADMIN):
        return _redirect_back(request, "Нет доступа", "error")
    ach.moderator_id = None
    await db.commit()
    return _redirect_back(request, "Документ снят с модерации", "success")


# ── Take / release users ──────────────────────────────────────────

@router.post("/moderation/users/{id}/take", name="admin.moderation.users.take", dependencies=[Depends(validate_csrf)])
async def take_user(id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await _get_moderator(request, db)
    target = await db.get(Users, id)
    if not target or target.status != UserStatus.PENDING:
        return _redirect_back(request, "Пользователь не найден или уже обработан", "error")
    if target.reviewed_by_id and target.reviewed_by_id != user.id:
        return _redirect_back(request, "Пользователь уже взят другим модератором", "error")
    target.reviewed_by_id = user.id
    await db.commit()
    return _redirect_back(request, "Пользователь взят в работу", "success")


@router.post("/moderation/users/{id}/release", name="admin.moderation.users.release", dependencies=[Depends(validate_csrf)])
async def release_user(id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await _get_moderator(request, db)
    target = await db.get(Users, id)
    if not target or (target.reviewed_by_id != user.id and user.role != UserRole.SUPER_ADMIN):
        return _redirect_back(request, "Нет доступа", "error")
    target.reviewed_by_id = None
    await db.commit()
    return _redirect_back(request, "Пользователь снят с модерации", "success")


def _redirect_back(request: Request, msg: str, toast_type: str):
    referer = request.headers.get("referer", "/sirius.achievements/my-work/users")
    sep = "&" if "?" in referer else "?"
    return RedirectResponse(url=f"{referer}{sep}toast_msg={msg}&toast_type={toast_type}", status_code=302)
