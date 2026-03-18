from fastapi import APIRouter, Request, Depends, Query, Form
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, update
from sqlalchemy.orm import selectinload
import csv
import io

from app.security.csrf import validate_csrf
from app.routers.admin.admin import guard_router, templates, get_db
from app.models.user import Users
from app.models.achievement import Achievement
from app.models.season_result import SeasonResult
from app.models.enums import UserRole, UserStatus, AchievementStatus, EducationLevel

router = guard_router


@router.get('/leaderboard', response_class=HTMLResponse, name='admin.leaderboard.index')
async def index(
        request: Request,
        education_level: str = Query(None),
        course: int = Query(None),
        db: AsyncSession = Depends(get_db)
):
    user_id = request.session.get('auth_id')
    user = await db.get(Users, user_id)

    if not user.is_staff:
        education_level = user.education_level_value or 'all'
        course = user.course if user.course else 0
    else:
        if not education_level:
            education_level = 'all'
        if course is None:
            course = 0

    stmt = (
        select(
            Users,
            func.coalesce(func.sum(Achievement.points), 0).label("total_points"),
            func.count(Achievement.id).label("achievements_count")
        )
        .outerjoin(Achievement, (Users.id == Achievement.user_id) & (Achievement.status == AchievementStatus.APPROVED))
        .filter(Users.role == UserRole.STUDENT, Users.status == UserStatus.ACTIVE)
    )

    if education_level != 'all':
        stmt = stmt.filter(Users.education_level == education_level)
    if course != 0:
        stmt = stmt.filter(Users.course == course)

    stmt = stmt.group_by(Users.id).order_by(desc("total_points"), desc("achievements_count"))

    result = await db.execute(stmt)
    leaderboard = result.all()

    my_rank = 0
    my_points = 0
    for idx, (u, pts, cnt) in enumerate(leaderboard, 1):
        if u.id == user_id:
            my_rank = idx
            my_points = pts
            break

    return templates.TemplateResponse('leaderboard/index.html', {
        'request': request,
        'leaderboard': leaderboard,
        'user': user,
        'my_rank': my_rank,
        'my_points': my_points,
        'current_education_level': education_level,
        'current_course': course,
        'education_levels': list(EducationLevel)
    })


@router.get('/leaderboard/export', name='admin.leaderboard.export')
async def export_leaderboard(request: Request, db: AsyncSession = Depends(get_db)):
    user = await db.get(Users, request.session.get('auth_id'))
    if not user.is_staff:
        return RedirectResponse(url='/sirius.achievements/leaderboard')

    stmt = (
        select(
            Users,
            func.coalesce(func.sum(Achievement.points), 0).label("total_points"),
            func.count(Achievement.id).label("achievements_count")
        )
        .outerjoin(Achievement, (Users.id == Achievement.user_id) & (Achievement.status == AchievementStatus.APPROVED))
        .filter(Users.role == UserRole.STUDENT, Users.status == UserStatus.ACTIVE)
    )

    if user.role == UserRole.MODERATOR and user.education_level:
        stmt = stmt.filter(Users.education_level == user.education_level_value)

    stmt = stmt.group_by(Users.id).order_by(desc("total_points"))

    result = await db.execute(stmt)
    leaderboard = result.all()

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow(['Место', 'Имя', 'Фамилия', 'Email', 'Уровень обучения', 'Курс', 'Сумма баллов', 'Документов'])

    for idx, (u, pts, cnt) in enumerate(leaderboard, 1):
        ed_val = u.education_level_value
        course_str = f"{u.course} курс" if u.course else ''
        writer.writerow([idx, u.first_name, u.last_name, u.email, ed_val, course_str, int(pts), cnt])

    output.seek(0)
    return Response(
        content='\ufeff' + output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leaderboard_export.csv"}
    )


@router.post('/leaderboard/end-season', name='admin.leaderboard.end_season', dependencies=[Depends(validate_csrf)])
async def end_season(
        request: Request,
        season_name: str = Form(...),
        db: AsyncSession = Depends(get_db)
):
    user = await db.get(Users, request.session.get('auth_id'))
    if user.role != UserRole.SUPER_ADMIN:
        return RedirectResponse(url="/sirius.achievements/leaderboard?toast_msg=Только супер-админ может завершать сезон&toast_type=error", status_code=302)

    stmt = (
        select(Users.id, func.coalesce(func.sum(Achievement.points), 0).label("total_points"))
        .join(Achievement, (Users.id == Achievement.user_id) & (Achievement.status == AchievementStatus.APPROVED))
        .filter(Users.role == UserRole.STUDENT, Users.status == UserStatus.ACTIVE)
        .group_by(Users.id)
        .order_by(desc("total_points"))
    )
    result = await db.execute(stmt)
    leaderboard = result.all()

    for idx, (uid, pts) in enumerate(leaderboard, 1):
        if pts > 0:
            history = SeasonResult(user_id=uid, season_name=season_name, points=int(pts), rank=idx)
            db.add(history)

    update_stmt = (
        update(Achievement)
        .where(Achievement.status == AchievementStatus.APPROVED)
        .values(status=AchievementStatus.ARCHIVED)
    )
    await db.execute(update_stmt)
    await db.commit()

    return RedirectResponse(url="/sirius.achievements/leaderboard?toast_msg=Сезон успешно завершен! Рейтинг обнулен.&toast_type=success", status_code=302)


def _period_filter(period: str | None):
    """Return a datetime cutoff based on period string."""
    from datetime import datetime, timedelta, timezone
    if period == 'day':
        return datetime.now(timezone.utc) - timedelta(days=1)
    elif period == 'week':
        return datetime.now(timezone.utc) - timedelta(weeks=1)
    elif period == 'month':
        return datetime.now(timezone.utc) - timedelta(days=30)
    return None


@router.get('/reports/moderation', name='admin.reports.moderation')
async def export_moderation_report(
    request: Request,
    period: str = Query(None),
    education_level: str = Query(None),
    course: int = Query(None),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(Users, request.session.get('auth_id'))
    if not user.is_staff:
        return RedirectResponse(url='/sirius.achievements/dashboard')

    from app.models.achievement import Achievement

    stmt = (
        select(Achievement)
        .options(selectinload(Achievement.user))
        .filter(Achievement.status == AchievementStatus.PENDING)
        .order_by(Achievement.created_at.asc())
    )

    cutoff = _period_filter(period)
    if cutoff:
        stmt = stmt.filter(Achievement.created_at >= cutoff)

    if education_level and education_level != 'all':
        stmt = stmt.join(Users, Achievement.user_id == Users.id).filter(Users.education_level == education_level)
    if course and course != 0:
        if education_level and education_level != 'all':
            stmt = stmt.filter(Users.course == course)
        else:
            stmt = stmt.join(Users, Achievement.user_id == Users.id).filter(Users.course == course)

    result = await db.execute(stmt)
    docs = result.scalars().unique().all()

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow(['ID', 'Студент', 'Email', 'Уровень обучения', 'Курс', 'Название', 'Категория', 'Уровень', 'Дата загрузки'])

    for d in docs:
        cat = d.category.value if hasattr(d.category, 'value') else str(d.category)
        lvl = d.level.value if hasattr(d.level, 'value') else str(d.level)
        date = d.created_at.strftime('%d.%m.%Y %H:%M') if d.created_at else ''
        ed_lvl = d.user.education_level_value if d.user else ''
        course_str = f"{d.user.course} курс" if d.user and d.user.course else ''
        writer.writerow([d.id, f"{d.user.first_name} {d.user.last_name}", d.user.email, ed_lvl, course_str, d.title, cat, lvl, date])

    output.seek(0)
    return Response(
        content='\ufeff' + output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=moderation_queue.csv"}
    )


@router.get('/reports/categories', name='admin.reports.categories')
async def export_categories_report(
    request: Request,
    period: str = Query(None),
    education_level: str = Query(None),
    course: int = Query(None),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(Users, request.session.get('auth_id'))
    if not user.is_staff:
        return RedirectResponse(url='/sirius.achievements/dashboard')

    from app.models.achievement import Achievement

    stmt = select(
        Achievement.category,
        Achievement.level,
        func.count().label('total'),
        func.count().filter(Achievement.status == AchievementStatus.APPROVED).label('approved'),
        func.coalesce(func.sum(Achievement.points), 0).label('total_points')
    )

    cutoff = _period_filter(period)
    if cutoff:
        stmt = stmt.filter(Achievement.created_at >= cutoff)

    if education_level and education_level != 'all':
        stmt = stmt.join(Users, Achievement.user_id == Users.id).filter(Users.education_level == education_level)
    if course and course != 0:
        if not (education_level and education_level != 'all'):
            stmt = stmt.join(Users, Achievement.user_id == Users.id)
        stmt = stmt.filter(Users.course == course)

    stmt = stmt.group_by(Achievement.category, Achievement.level).order_by(Achievement.category, Achievement.level)

    result = await db.execute(stmt)
    rows = result.all()

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow(['Категория', 'Уровень', 'Всего документов', 'Одобрено', 'Сумма баллов'])

    for r in rows:
        cat = r.category.value if hasattr(r.category, 'value') else str(r.category)
        lvl = r.level.value if hasattr(r.level, 'value') else str(r.level)
        writer.writerow([cat, lvl, r.total, r.approved, int(r.total_points)])

    output.seek(0)
    return Response(
        content='\ufeff' + output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=categories_report.csv"}
    )


@router.get('/reports/leaderboard', name='admin.reports.leaderboard')
async def export_leaderboard_report(
    request: Request,
    period: str = Query(None),
    education_level: str = Query(None),
    course: int = Query(None),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(Users, request.session.get('auth_id'))
    if not user.is_staff:
        return RedirectResponse(url='/sirius.achievements/dashboard')

    achievement_filter = (Achievement.status == AchievementStatus.APPROVED)
    cutoff = _period_filter(period)
    if cutoff:
        achievement_filter = achievement_filter & (Achievement.created_at >= cutoff)

    stmt = (
        select(
            Users,
            func.coalesce(func.sum(Achievement.points), 0).label("total_points"),
            func.count(Achievement.id).label("achievements_count")
        )
        .outerjoin(Achievement, (Users.id == Achievement.user_id) & achievement_filter)
        .filter(Users.role == UserRole.STUDENT, Users.status == UserStatus.ACTIVE)
    )

    if education_level and education_level != 'all':
        stmt = stmt.filter(Users.education_level == education_level)
    if course and course != 0:
        stmt = stmt.filter(Users.course == course)

    stmt = stmt.group_by(Users.id).order_by(desc("total_points"))

    result = await db.execute(stmt)
    leaderboard = result.all()

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow(['Место', 'Имя', 'Фамилия', 'Email', 'Уровень обучения', 'Курс', 'Сумма баллов', 'Документов'])

    for idx, (u, pts, cnt) in enumerate(leaderboard, 1):
        ed_val = u.education_level_value
        course_str = f"{u.course} курс" if u.course else ''
        writer.writerow([idx, u.first_name, u.last_name, u.email, ed_val, course_str, int(pts), cnt])

    output.seek(0)
    return Response(
        content='\ufeff' + output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leaderboard_export.csv"}
    )


@router.get('/reports/users', name='admin.reports.users')
async def export_users_report(
    request: Request,
    education_level: str = Query(None),
    course: int = Query(None),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(Users, request.session.get('auth_id'))
    if user.role != UserRole.SUPER_ADMIN:
        return RedirectResponse(url='/sirius.achievements/dashboard')

    stmt = select(Users).filter(Users.role == UserRole.STUDENT).order_by(Users.created_at.desc())

    if education_level and education_level != 'all':
        stmt = stmt.filter(Users.education_level == education_level)
    if course and course != 0:
        stmt = stmt.filter(Users.course == course)

    result = await db.execute(stmt)
    users = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow(['ID', 'Имя', 'Фамилия', 'Email', 'Уровень обучения', 'Курс', 'Статус', 'Дата регистрации'])

    for u in users:
        status_val = u.status.value if hasattr(u.status, 'value') else str(u.status)
        date = u.created_at.strftime('%d.%m.%Y') if u.created_at else ''
        writer.writerow([u.id, u.first_name, u.last_name, u.email, u.education_level_value, u.course or '', status_val, date])

    output.seek(0)
    return Response(
        content='\ufeff' + output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users_report.csv"}
    )