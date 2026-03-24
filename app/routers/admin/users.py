from __future__ import annotations

import json
import math
import time

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from sqlalchemy import desc, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.achievement import Achievement
from app.models.enums import AchievementStatus, EducationLevel, UserRole, UserStatus
from app.models.season_result import SeasonResult
from app.models.user import Users
from app.repositories.admin.user_repository import UserRepository
from app.routers.admin.admin import get_db, templates
from app.routers.admin.deps import get_current_user, require_auth
from app.security.csrf import validate_csrf
from app.services.admin.resume_service import ResumeService
from app.services.admin.user_service import UserService
from app.utils.access import is_in_zone
from app.utils.points import aggregated_gpa_bonus_expr, calculate_gpa_bonus
from app.utils.search import escape_like

router = APIRouter(
    prefix="/sirius.achievements",
    tags=["admin.users"],
    dependencies=[Depends(require_auth)],
)


def get_service(db: AsyncSession = Depends(get_db)):
    return UserService(UserRepository(db))


async def check_admin_rights(request: Request, db: AsyncSession):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=403, detail="Not authenticated")

    allowed_roles = [UserRole.SUPER_ADMIN, UserRole.MODERATOR]
    if user.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Access denied")
    return user


def _zone_filter_for(current_user):
    if current_user.role == UserRole.MODERATOR and current_user.education_level:
        return current_user.education_level
    return None


def _can_access_target(current_user, target_user) -> bool:
    if current_user.role == UserRole.SUPER_ADMIN:
        return True
    return is_in_zone(current_user, target_user.education_level)


ROLE_HIERARCHY = {
    UserRole.GUEST: 0,
    UserRole.STUDENT: 1,
    UserRole.MODERATOR: 2,
    UserRole.SUPER_ADMIN: 3,
}


@router.get("/api/users/search", response_class=JSONResponse)
async def api_users_search(request: Request, q: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db)):
    current_user = await check_admin_rights(request, db)
    like_term = f"%{escape_like(q)}%"
    stmt = select(Users).filter(
        or_(
            Users.first_name.ilike(like_term),
            Users.last_name.ilike(like_term),
            Users.email.ilike(like_term),
            Users.phone_number.ilike(like_term),
            (Users.first_name + " " + Users.last_name).ilike(like_term),
            (Users.last_name + " " + Users.first_name).ilike(like_term),
        )
    ).limit(5)

    zone_filter = _zone_filter_for(current_user)
    if zone_filter is not None:
        stmt = stmt.filter(Users.education_level == zone_filter)

    users = (await db.execute(stmt)).scalars().all()
    return [{"value": u.email, "text": f"{u.first_name} {u.last_name} ({u.email})"} for u in users]


@router.get("/users", response_class=HTMLResponse, name="admin.users.index")
async def index(
    request: Request,
    page: int = Query(1, ge=1, le=1000),
    query: str = None,
    role: str = None,
    status: str = None,
    education_level: str = None,
    course: str = None,
    sort_by: str = "newest",
    db: AsyncSession = Depends(get_db),
):
    current_user = await check_admin_rights(request, db)

    limit = 10
    offset = (page - 1) * limit

    course_int = int(course) if course and course.isdigit() else None

    stmt = select(Users)

    zone_filter = _zone_filter_for(current_user)
    if zone_filter is not None:
        stmt = stmt.filter(Users.education_level == zone_filter)

    if query:
        like_term = f"%{escape_like(query)}%"
        stmt = stmt.filter(
            or_(
                Users.first_name.ilike(like_term),
                Users.last_name.ilike(like_term),
                Users.email.ilike(like_term),
                Users.phone_number.ilike(like_term),
                (Users.first_name + " " + Users.last_name).ilike(like_term),
                (Users.last_name + " " + Users.first_name).ilike(like_term),
            )
        )
    if role and role != "all":
        stmt = stmt.filter(Users.role == role)
    if status and status != "all":
        stmt = stmt.filter(Users.status == status)
    if education_level and education_level != "all":
        stmt = stmt.filter(Users.education_level == education_level)
    if course_int and course_int != 0:
        stmt = stmt.filter(Users.course == course_int)

    if sort_by == "oldest":
        stmt = stmt.order_by(Users.created_at.asc())
    else:
        stmt = stmt.order_by(Users.created_at.desc())

    total_items = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar()
    users = (await db.execute(stmt.offset(offset).limit(limit))).scalars().all()

    return templates.TemplateResponse(
        "users/index.html",
        {
            "request": request,
            "users": users,
            "page": page,
            "total_pages": max(1, math.ceil(total_items / limit)),
            "query": query,
            "role": role,
            "status": status,
            "education_level": education_level,
            "course": course,
            "sort_by": sort_by,
            "roles": list(UserRole),
            "statuses": list(UserStatus),
            "education_levels": list(EducationLevel),
            "user": current_user,
        },
    )


@router.get("/users/{id}", response_class=HTMLResponse, name="admin.users.show")
async def show_user(id: int, request: Request, db: AsyncSession = Depends(get_db)):
    current_user = await get_current_user(request, db)
    if not current_user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)

    # Студент пытается открыть чужой профиль → публичный профиль
    if not current_user.is_staff and current_user.id != id:
        return RedirectResponse(url=f"/sirius.achievements/students/{id}", status_code=302)

    # Студент открывает свой профиль → страница настроек
    if not current_user.is_staff and current_user.id == id:
        return RedirectResponse(url="/sirius.achievements/profile", status_code=302)

    # Дальше только стафф
    current_user = await check_admin_rights(request, db)

    target_user_obj = await db.get(Users, id)
    if not target_user_obj:
        raise HTTPException(status_code=404, detail="User not found")
    if not _can_access_target(current_user, target_user_obj):
        raise HTTPException(status_code=403, detail="Access denied")

    achievements_stmt = (
        select(Achievement)
        .filter(Achievement.user_id == id, Achievement.status != AchievementStatus.ARCHIVED)
        .order_by(Achievement.created_at.desc())
    )
    achievements = (await db.execute(achievements_stmt)).scalars().all()

    history_stmt = select(SeasonResult).filter(SeasonResult.user_id == id).order_by(SeasonResult.created_at.desc())
    season_history = (await db.execute(history_stmt)).scalars().all()

    total_docs = len(achievements)
    rank = None
    total_points = calculate_gpa_bonus(target_user_obj.session_gpa)
    gpa_bonus = calculate_gpa_bonus(target_user_obj.session_gpa)

    if target_user_obj.role == UserRole.STUDENT and target_user_obj.status == UserStatus.ACTIVE:
        achievement_points = func.coalesce(func.sum(Achievement.points), 0)
        total_points_expr = (
            achievement_points + aggregated_gpa_bonus_expr(Users.session_gpa)
        ).label("total_points")
        leaderboard_stmt = (
            select(
                Users.id,
                total_points_expr,
            )
            .outerjoin(Achievement, (Users.id == Achievement.user_id) & (Achievement.status == AchievementStatus.APPROVED))
            .filter(Users.role == UserRole.STUDENT, Users.status == UserStatus.ACTIVE)
            .group_by(Users.id)
            .order_by(desc("total_points"))
        )
        results = (await db.execute(leaderboard_stmt)).all()
        for idx, (uid, pts) in enumerate(results, 1):
            if uid == id:
                rank = idx
                total_points = pts
                break

    # Progress chart: approved achievements by month
    chart_query = (
        select(
            func.date_trunc("month", Achievement.created_at).label("m"),
            func.count().label("cnt"),
            func.coalesce(func.sum(Achievement.points), 0).label("pts"),
        )
        .filter(Achievement.user_id == id, Achievement.status == AchievementStatus.APPROVED)
        .group_by(literal_column("m"))
        .order_by(literal_column("m"))
    )
    chart_rows = (await db.execute(chart_query)).all()
    chart_labels = json.dumps([r.m.strftime("%m.%Y") for r in chart_rows]) if chart_rows else "[]"
    chart_counts = json.dumps([r.cnt for r in chart_rows]) if chart_rows else "[]"
    chart_points = json.dumps([int(r.pts) for r in chart_rows]) if chart_rows else "[]"

    return templates.TemplateResponse(
        "users/show.html",
        {
            "request": request,
            "user": current_user,
            "target_user": target_user_obj,
            "achievements": achievements,
            "season_history": season_history,
            "total_docs": total_docs,
            "rank": rank,
            "total_points": total_points,
            "gpa_bonus": gpa_bonus,
            "roles": list(UserRole),
            "education_levels": list(EducationLevel),
            "timestamp": int(time.time()),
            "chart_labels": chart_labels,
            "chart_counts": chart_counts,
            "chart_points": chart_points,
        },
    )


@router.get("/users/{id}/generate-resume")
async def generate_user_resume(id: int, request: Request, db: AsyncSession = Depends(get_db)):
    current_user = await get_current_user(request, db)
    if not current_user:
        return JSONResponse({"error": "Нет прав"}, status_code=403)

    target_user = await db.get(Users, id)
    if not target_user:
        return JSONResponse({"error": "Пользователь не найден"}, status_code=404)

    if current_user.id != id:
        if not current_user.is_staff or not _can_access_target(current_user, target_user):
            return JSONResponse({"error": "Нет прав"}, status_code=403)

    service = ResumeService(db)
    check = await service.can_generate(id)

    return JSONResponse(
        content={
            "resume": target_user.resume_text or "",
            "can_generate": check["allowed"],
            "reason": check.get("reason"),
        }
    )


@router.post("/users/{id}/role", name="admin.users.update_role", dependencies=[Depends(validate_csrf)])
async def update_user_role(
    id: int,
    request: Request,
    role: UserRole = Form(...),
    education_level: str = Form(None),
    service: UserService = Depends(get_service),
    db: AsyncSession = Depends(get_db),
):
    current_user = await check_admin_rights(request, db)

    if id == current_user.id:
        return RedirectResponse(
            url=f"/sirius.achievements/users/{id}?toast_msg=Нельзя изменить роль самому себе&toast_type=error",
            status_code=302,
        )

    target_user = await db.get(Users, id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != UserRole.SUPER_ADMIN and not _can_access_target(current_user, target_user):
        return RedirectResponse(
            url=f"/sirius.achievements/users/{id}?toast_msg=Недостаточно прав&toast_type=error",
            status_code=302,
        )

    if current_user.role != UserRole.SUPER_ADMIN:
        current_level = ROLE_HIERARCHY.get(current_user.role, 0)
        target_level = ROLE_HIERARCHY.get(target_user.role, 0)
        new_role_level = ROLE_HIERARCHY.get(role, 0)

        if target_level >= current_level or new_role_level >= current_level:
            return RedirectResponse(
                url=f"/sirius.achievements/users/{id}?toast_msg=У вас недостаточно прав для этого действия&toast_type=error",
                status_code=302,
            )

    update_data = {"role": role}

    if role == UserRole.MODERATOR:
        if education_level and education_level != "all":
            update_data["education_level"] = education_level
        else:
            update_data["education_level"] = None
    elif role == UserRole.SUPER_ADMIN:
        update_data["education_level"] = None

    await service.repository.update(id, update_data)

    return RedirectResponse(
        url=f"/sirius.achievements/users/{id}?toast_msg=Роль и права обновлены&toast_type=success",
        status_code=302,
    )


@router.post("/users/{id}/delete", name="admin.users.delete", dependencies=[Depends(validate_csrf)])
async def delete_user(
    id: int,
    request: Request,
    service: UserService = Depends(get_service),
    db: AsyncSession = Depends(get_db),
):
    current_user = await check_admin_rights(request, db)

    if id == current_user.id:
        return RedirectResponse(
            url=f"/sirius.achievements/users/{id}?toast_msg=Нельзя удалить самого себя&toast_type=error",
            status_code=302,
        )

    target_user = await db.get(Users, id)
    if target_user:
        if current_user.role != UserRole.SUPER_ADMIN and not _can_access_target(current_user, target_user):
            return RedirectResponse(
                url=f"/sirius.achievements/users/{id}?toast_msg=Недостаточно прав&toast_type=error",
                status_code=302,
            )

        current_level = ROLE_HIERARCHY.get(current_user.role, 0)
        target_level = ROLE_HIERARCHY.get(target_user.role, 0)

        if current_user.role != UserRole.SUPER_ADMIN and target_level >= current_level:
            return RedirectResponse(
                url=f"/sirius.achievements/users/{id}?toast_msg=Недостаточно прав для удаления этого пользователя&toast_type=error",
                status_code=302,
            )

    await service.repository.delete(id)
    return RedirectResponse(
        url="/sirius.achievements/users?toast_msg=Пользователь удален&toast_type=success",
        status_code=302,
    )


@router.post("/users/{id}/generate-resume", dependencies=[Depends(validate_csrf)])
async def api_generate_resume(id: int, request: Request, db: AsyncSession = Depends(get_db)):
    current_user = await get_current_user(request, db)
    if not current_user:
        return JSONResponse({"error": "Нет прав"}, status_code=403)

    target_user = await db.get(Users, id)
    if not target_user:
        return JSONResponse({"error": "Пользователь не найден"}, status_code=404)

    if current_user.id != id:
        if not current_user.is_staff or not _can_access_target(current_user, target_user):
            return JSONResponse({"error": "Нет прав"}, status_code=403)

    service = ResumeService(db)
    result = await service.generate_resume(id, force_regenerate=True, bypass_check=current_user.is_staff)

    if not result["success"]:
        check = await service.can_generate(id)
        return JSONResponse(
            {
                "error": result["error"],
                "resume": result.get("resume", ""),
                "can_generate": check["allowed"],
                "reason": check.get("reason"),
            },
            status_code=429,
        )

    check = await service.can_generate(id)
    return JSONResponse(
        {
            "resume": result["resume"],
            "can_generate": check["allowed"],
            "reason": check.get("reason"),
        }
    )


@router.get("/users/{id}/export-pdf", name="admin.users.export_pdf")
async def export_user_pdf(id: int, request: Request, db: AsyncSession = Depends(get_db)):
    current_user = await get_current_user(request, db)
    if not current_user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)

    target_user = await db.get(Users, id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Allow self-export or staff access
    if current_user.id != id:
        if not current_user.is_staff or not _can_access_target(current_user, target_user):
            raise HTTPException(status_code=403, detail="Access denied")

    achievements_stmt = (
        select(Achievement)
        .filter(Achievement.user_id == id, Achievement.status == AchievementStatus.APPROVED)
        .order_by(Achievement.created_at.desc())
    )
    achievements = (await db.execute(achievements_stmt)).scalars().all()
    total_points = sum(a.points or 0 for a in achievements)

    import fitz  # PyMuPDF

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4

    y = 50
    # Title
    page.insert_text((50, y), "Sirius.Achievements", fontsize=18, fontname="helv", color=(0.3, 0.27, 0.95))
    y += 30
    page.insert_text((50, y), "Отчёт по студенту", fontsize=14, fontname="helv", color=(0.2, 0.2, 0.2))
    y += 35

    # User info
    page.insert_text((50, y), f"ФИО: {target_user.first_name} {target_user.last_name}", fontsize=11, fontname="helv")
    y += 18
    page.insert_text((50, y), f"Email: {target_user.email}", fontsize=10, fontname="helv", color=(0.4, 0.4, 0.4))
    y += 18
    edu = target_user.education_level.value if target_user.education_level else "Не указано"
    course = f", {target_user.course} курс" if target_user.course else ""
    page.insert_text((50, y), f"Образование: {edu}{course}", fontsize=10, fontname="helv", color=(0.4, 0.4, 0.4))
    y += 18
    page.insert_text((50, y), f"Баллов: {total_points}  |  Документов: {len(achievements)}", fontsize=10, fontname="helv", color=(0.4, 0.4, 0.4))
    y += 30

    # Divider
    page.draw_line((50, y), (545, y), color=(0.85, 0.85, 0.85), width=0.5)
    y += 20

    # Achievements table header
    page.insert_text((50, y), "Одобренные достижения", fontsize=12, fontname="helv", color=(0.2, 0.2, 0.2))
    y += 22

    if achievements:
        # Table header
        page.insert_text((50, y), "#", fontsize=9, fontname="helv", color=(0.5, 0.5, 0.5))
        page.insert_text((70, y), "Название", fontsize=9, fontname="helv", color=(0.5, 0.5, 0.5))
        page.insert_text((300, y), "Категория", fontsize=9, fontname="helv", color=(0.5, 0.5, 0.5))
        page.insert_text((420, y), "Уровень", fontsize=9, fontname="helv", color=(0.5, 0.5, 0.5))
        page.insert_text((510, y), "Баллы", fontsize=9, fontname="helv", color=(0.5, 0.5, 0.5))
        y += 5
        page.draw_line((50, y), (545, y), color=(0.9, 0.9, 0.9), width=0.3)
        y += 12

        for i, a in enumerate(achievements, 1):
            if y > 780:
                page = doc.new_page(width=595, height=842)
                y = 50
            title = (a.title or "—")[:35]
            cat = a.category.value if a.category else "—"
            lvl = a.level.value if a.level else "—"
            page.insert_text((50, y), str(i), fontsize=9, fontname="helv")
            page.insert_text((70, y), title, fontsize=9, fontname="helv")
            page.insert_text((300, y), cat, fontsize=9, fontname="helv")
            page.insert_text((420, y), lvl, fontsize=9, fontname="helv")
            page.insert_text((510, y), str(a.points or 0), fontsize=9, fontname="helv")
            y += 16
    else:
        page.insert_text((50, y), "Нет одобренных достижений", fontsize=10, fontname="helv", color=(0.6, 0.6, 0.6))
        y += 20

    # Resume
    if target_user.resume_text:
        y += 15
        if y > 700:
            page = doc.new_page(width=595, height=842)
            y = 50
        page.draw_line((50, y), (545, y), color=(0.85, 0.85, 0.85), width=0.5)
        y += 20
        page.insert_text((50, y), "AI-сводка профиля", fontsize=12, fontname="helv", color=(0.2, 0.2, 0.2))
        y += 20
        # Wrap resume text
        for line in target_user.resume_text.split("\n"):
            if y > 800:
                page = doc.new_page(width=595, height=842)
                y = 50
            # Truncate long lines
            while len(line) > 80:
                page.insert_text((50, y), line[:80], fontsize=9, fontname="helv", color=(0.3, 0.3, 0.3))
                y += 14
                line = line[80:]
                if y > 800:
                    page = doc.new_page(width=595, height=842)
                    y = 50
            page.insert_text((50, y), line, fontsize=9, fontname="helv", color=(0.3, 0.3, 0.3))
            y += 14

    pdf_bytes = doc.tobytes()
    doc.close()

    filename = f"report_{target_user.last_name}_{target_user.first_name}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/users/{id}/set-gpa", name="admin.users.set_gpa", dependencies=[Depends(validate_csrf)])
async def set_gpa(
    id: int,
    request: Request,
    gpa: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    current_user = await check_admin_rights(request, db)
    target_user = await db.get(Users, id)
    if not target_user:
        return RedirectResponse(url="/sirius.achievements/users?toast_msg=Пользователь не найден&toast_type=error", status_code=302)

    try:
        gpa_val = float(gpa.replace(",", "."))
    except ValueError:
        return RedirectResponse(
            url=f"/sirius.achievements/users/{id}?toast_msg=Некорректная оценка&toast_type=error",
            status_code=302,
        )

    if gpa_val < 2.0 or gpa_val > 5.0:
        return RedirectResponse(
            url=f"/sirius.achievements/users/{id}?toast_msg=Оценка должна быть от 2.0 до 5.0&toast_type=error",
            status_code=302,
        )

    bonus = calculate_gpa_bonus(gpa_val)

    target_user.session_gpa = f"{gpa_val:.1f}"
    await db.commit()

    return RedirectResponse(
        url=f"/sirius.achievements/users/{id}?toast_msg=Средний балл {gpa_val:.1f} сохранён (+{bonus} бонус)&toast_type=success",
        status_code=302,
    )
