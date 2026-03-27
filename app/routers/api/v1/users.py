from __future__ import annotations

import math
import fitz
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import desc, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.infrastructure.database import get_db
from app.middlewares.api_auth_middleware import auth
from app.models.achievement import Achievement
from app.models.enums import AchievementStatus, EducationLevel, UserRole, UserStatus
from app.models.season_result import SeasonResult
from app.models.user import Users
from app.repositories.admin.user_repository import UserRepository
from app.services.admin.resume_service import ResumeService
from app.utils.access import is_in_zone
from app.utils.points import aggregated_gpa_bonus_expr, calculate_gpa_bonus
from app.utils.search import escape_like

from .serializers import serialize_achievement, serialize_user

router = APIRouter(prefix='/api/v1/users', tags=['api.v1.users'])

ROLE_HIERARCHY = {
    UserRole.GUEST: 0,
    UserRole.STUDENT: 1,
    UserRole.MODERATOR: 2,
    UserRole.SUPER_ADMIN: 3,
}


class UpdateRolePayload(BaseModel):
    role: UserRole
    education_level: str | None = None


class SetGpaPayload(BaseModel):
    gpa: str


async def _check_admin_rights(current_user=Depends(auth)):
    if current_user.role not in {UserRole.SUPER_ADMIN, UserRole.MODERATOR}:
        raise HTTPException(status_code=403, detail='Access denied')
    return current_user


def _zone_filter_for(current_user):
    if current_user.role == UserRole.MODERATOR and current_user.education_level:
        return current_user.education_level
    return None


def _can_access_target(current_user, target_user) -> bool:
    if current_user.role == UserRole.SUPER_ADMIN:
        return True
    return is_in_zone(current_user, getattr(target_user, 'education_level', None))


def _serialize_season_result(item: SeasonResult):
    return {
        'id': item.id,
        'season_name': item.season_name,
        'points': int(item.points or 0),
        'rank': int(item.rank or 0),
        'created_at': item.created_at.isoformat() if item.created_at else None,
    }


def _resolve_education_level(value: str | None):
    if not value or value == 'all':
        return None

    for item in EducationLevel:
        if value in {item.value, item.name}:
            return item

    raise HTTPException(status_code=400, detail='Unknown education level')


def _assert_role_change_allowed(current_user, target_user, new_role: UserRole):
    if current_user.id == target_user.id:
        raise HTTPException(status_code=400, detail='You cannot change your own role.')

    if current_user.role == UserRole.SUPER_ADMIN:
        return

    current_level = ROLE_HIERARCHY.get(current_user.role, 0)
    target_level = ROLE_HIERARCHY.get(target_user.role, 0)
    new_level = ROLE_HIERARCHY.get(new_role, 0)

    if target_level >= current_level or new_level >= current_level:
        raise HTTPException(status_code=403, detail='Insufficient permissions for this role change.')


async def _get_target_user_or_404(db: AsyncSession, user_id: int):
    target_user = await db.get(Users, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail='User not found')
    return target_user


@router.get('/')
async def list_users(
    page: int = Query(default=1, ge=1, le=1000),
    query: str | None = Query(default=None),
    role: str | None = Query(default=None),
    status: str | None = Query(default=None),
    education_level: str | None = Query(default=None),
    course: str | None = Query(default=None),
    sort_by: str = Query(default='newest'),
    current_user=Depends(_check_admin_rights),
    db: AsyncSession = Depends(get_db),
):
    limit = 10
    offset = (page - 1) * limit
    course_int = int(course) if course and str(course).isdigit() else None

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
                (Users.first_name + ' ' + Users.last_name).ilike(like_term),
                (Users.last_name + ' ' + Users.first_name).ilike(like_term),
            )
        )

    if role and role != 'all':
        stmt = stmt.filter(Users.role == role)
    if status and status != 'all':
        stmt = stmt.filter(Users.status == status)
    if education_level and education_level != 'all':
        stmt = stmt.filter(Users.education_level == education_level)
    if course_int and course_int != 0:
        stmt = stmt.filter(Users.course == course_int)

    if sort_by == 'oldest':
        stmt = stmt.order_by(Users.created_at.asc())
    else:
        stmt = stmt.order_by(Users.created_at.desc())

    total_items = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    users = (await db.execute(stmt.offset(offset).limit(limit))).scalars().all()

    return {
        'users': [serialize_user(item) for item in users],
        'page': page,
        'total_pages': max(1, math.ceil(total_items / limit)),
        'roles': [item.value for item in UserRole],
        'statuses': [item.value for item in UserStatus],
        'education_levels': [item.value for item in EducationLevel],
    }


@router.get('/search')
async def search_users(
    q: str = Query(..., min_length=1),
    current_user=Depends(_check_admin_rights),
    db: AsyncSession = Depends(get_db),
):
    like_term = f"%{escape_like(q)}%"
    stmt = select(Users).filter(
        or_(
            Users.first_name.ilike(like_term),
            Users.last_name.ilike(like_term),
            Users.email.ilike(like_term),
            Users.phone_number.ilike(like_term),
            (Users.first_name + ' ' + Users.last_name).ilike(like_term),
            (Users.last_name + ' ' + Users.first_name).ilike(like_term),
        )
    ).limit(5)

    zone_filter = _zone_filter_for(current_user)
    if zone_filter is not None:
        stmt = stmt.filter(Users.education_level == zone_filter)

    users = (await db.execute(stmt)).scalars().all()
    return [{'value': user.email, 'text': f'{user.first_name} {user.last_name} ({user.email})'} for user in users]


@router.get('/{user_id}')
async def get_user_detail(
    user_id: int,
    current_user=Depends(_check_admin_rights),
    db: AsyncSession = Depends(get_db),
):
    target_user = await _get_target_user_or_404(db, user_id)
    if not _can_access_target(current_user, target_user):
        raise HTTPException(status_code=403, detail='Access denied')

    achievements_stmt = (
        select(Achievement)
        .options(selectinload(Achievement.user))
        .filter(Achievement.user_id == user_id, Achievement.status != AchievementStatus.ARCHIVED)
        .order_by(Achievement.created_at.desc())
    )
    achievements = (await db.execute(achievements_stmt)).scalars().all()

    history_stmt = (
        select(SeasonResult)
        .filter(SeasonResult.user_id == user_id)
        .order_by(SeasonResult.created_at.desc())
    )
    season_history = (await db.execute(history_stmt)).scalars().all()

    total_docs = len(achievements)
    rank = None
    total_points = calculate_gpa_bonus(target_user.session_gpa)
    gpa_bonus = calculate_gpa_bonus(target_user.session_gpa)

    if target_user.role == UserRole.STUDENT and target_user.status == UserStatus.ACTIVE:
        achievement_points = func.coalesce(func.sum(Achievement.points), 0)
        total_points_expr = (
            achievement_points + aggregated_gpa_bonus_expr(Users.session_gpa)
        ).label('total_points')
        leaderboard_stmt = (
            select(Users.id, total_points_expr)
            .outerjoin(Achievement, (Users.id == Achievement.user_id) & (Achievement.status == AchievementStatus.APPROVED))
            .filter(Users.role == UserRole.STUDENT, Users.status == UserStatus.ACTIVE)
            .group_by(Users.id)
            .order_by(desc('total_points'))
        )
        results = (await db.execute(leaderboard_stmt)).all()
        for index, row in enumerate(results, 1):
            uid, points = row
            if uid == user_id:
                rank = index
                total_points = int(points or 0)
                break

    chart_query = (
        select(
            func.date_trunc('month', Achievement.created_at).label('bucket'),
            func.count().label('count'),
            func.coalesce(func.sum(Achievement.points), 0).label('points'),
        )
        .filter(Achievement.user_id == user_id, Achievement.status == AchievementStatus.APPROVED)
        .group_by(literal_column('bucket'))
        .order_by(literal_column('bucket'))
    )
    chart_rows = (await db.execute(chart_query)).all()

    return {
        'user': serialize_user(target_user),
        'achievements': [serialize_achievement(item) for item in achievements],
        'season_history': [_serialize_season_result(item) for item in season_history],
        'total_docs': total_docs,
        'rank': rank,
        'total_points': int(total_points or 0),
        'gpa_bonus': int(gpa_bonus or 0),
        'chart_labels': [row.bucket.strftime('%m.%Y') for row in chart_rows] if chart_rows else [],
        'chart_counts': [int(row.count or 0) for row in chart_rows] if chart_rows else [],
        'chart_points': [int(row.points or 0) for row in chart_rows] if chart_rows else [],
        'roles': [item.value for item in UserRole],
        'education_levels': [item.value for item in EducationLevel],
    }


@router.post('/{user_id}/role')
async def update_user_role(
    user_id: int,
    payload: UpdateRolePayload,
    current_user=Depends(_check_admin_rights),
    db: AsyncSession = Depends(get_db),
):
    target_user = await _get_target_user_or_404(db, user_id)
    if not _can_access_target(current_user, target_user):
        raise HTTPException(status_code=403, detail='Access denied')

    _assert_role_change_allowed(current_user, target_user, payload.role)

    update_data: dict[str, object | None] = {'role': payload.role}
    if payload.role == UserRole.MODERATOR:
        update_data['education_level'] = _resolve_education_level(payload.education_level)
    elif payload.role == UserRole.SUPER_ADMIN:
        update_data['education_level'] = None

    repository = UserRepository(db)
    updated_user = await repository.update(user_id, update_data)
    return {'success': True, 'user': serialize_user(updated_user)}


@router.delete('/{user_id}')
async def delete_user(
    user_id: int,
    current_user=Depends(_check_admin_rights),
    db: AsyncSession = Depends(get_db),
):
    target_user = await _get_target_user_or_404(db, user_id)
    if current_user.id == target_user.id:
        raise HTTPException(status_code=400, detail='You cannot delete yourself.')
    if not _can_access_target(current_user, target_user):
        raise HTTPException(status_code=403, detail='Access denied')

    if current_user.role != UserRole.SUPER_ADMIN:
        current_level = ROLE_HIERARCHY.get(current_user.role, 0)
        target_level = ROLE_HIERARCHY.get(target_user.role, 0)
        if target_level >= current_level:
            raise HTTPException(status_code=403, detail='Insufficient permissions for deletion.')

    repository = UserRepository(db)
    await repository.delete(user_id)
    return {'success': True}


@router.get('/{user_id}/generate-resume')
async def get_resume_state(
    user_id: int,
    current_user=Depends(auth),
    db: AsyncSession = Depends(get_db),
):
    target_user = await _get_target_user_or_404(db, user_id)
    if current_user.id != user_id:
        if not current_user.is_staff or not _can_access_target(current_user, target_user):
            raise HTTPException(status_code=403, detail='Access denied')

    service = ResumeService(db)
    check = await service.can_generate(user_id)
    return {
        'resume': target_user.resume_text or '',
        'can_generate': bool(check['allowed']),
        'reason': check.get('reason'),
    }


@router.post('/{user_id}/generate-resume')
async def generate_resume(
    user_id: int,
    current_user=Depends(auth),
    db: AsyncSession = Depends(get_db),
):
    target_user = await _get_target_user_or_404(db, user_id)
    if current_user.id != user_id:
        if not current_user.is_staff or not _can_access_target(current_user, target_user):
            raise HTTPException(status_code=403, detail='Access denied')

    service = ResumeService(db)
    result = await service.generate_resume(user_id, force_regenerate=True, bypass_check=current_user.is_staff)
    if not result['success']:
        check = await service.can_generate(user_id)
        raise HTTPException(
            status_code=429,
            detail=result['error'] or check.get('reason') or 'Resume generation is unavailable.',
        )

    refreshed_user = await _get_target_user_or_404(db, user_id)
    check = await service.can_generate(user_id)
    return {
        'resume': result['resume'],
        'can_generate': bool(check['allowed']),
        'reason': check.get('reason'),
        'user': serialize_user(refreshed_user),
    }


@router.post('/{user_id}/set-gpa')
async def set_gpa(
    user_id: int,
    payload: SetGpaPayload,
    current_user=Depends(_check_admin_rights),
    db: AsyncSession = Depends(get_db),
):
    target_user = await _get_target_user_or_404(db, user_id)
    if not _can_access_target(current_user, target_user):
        raise HTTPException(status_code=403, detail='Access denied')

    try:
        gpa_value = float(str(payload.gpa).replace(',', '.'))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='Invalid GPA value.') from exc

    if gpa_value < 2.0 or gpa_value > 5.0:
        raise HTTPException(status_code=400, detail='GPA must be between 2.0 and 5.0.')

    target_user.session_gpa = f'{gpa_value:.1f}'
    await db.commit()
    await db.refresh(target_user)

    return {
        'success': True,
        'gpa': target_user.session_gpa,
        'bonus': calculate_gpa_bonus(target_user.session_gpa),
        'user': serialize_user(target_user),
    }


@router.get('/{user_id}/export-pdf')
async def export_user_pdf(
    user_id: int,
    current_user=Depends(auth),
    db: AsyncSession = Depends(get_db),
):
    target_user = await _get_target_user_or_404(db, user_id)
    if current_user.id != user_id:
        if not current_user.is_staff or not _can_access_target(current_user, target_user):
            raise HTTPException(status_code=403, detail='Access denied')

    achievements_stmt = (
        select(Achievement)
        .options(selectinload(Achievement.user))
        .filter(Achievement.user_id == user_id, Achievement.status == AchievementStatus.APPROVED)
        .order_by(Achievement.created_at.desc())
    )
    achievements = (await db.execute(achievements_stmt)).scalars().all()
    total_points = sum(int(item.points or 0) for item in achievements)

    document = fitz.open()
    page = document.new_page(width=595, height=842)
    y = 52

    def write_line(text: str, size: int = 11, color=(0.2, 0.2, 0.2)):
        nonlocal page, y
        if y > 800:
            page = document.new_page(width=595, height=842)
            y = 52
        page.insert_text((48, y), text, fontsize=size, fontname='helv', color=color)
        y += size + 8

    write_line('Sirius.Achievements', size=18, color=(0.35, 0.3, 0.92))
    write_line('Student report', size=14)
    y += 8
    write_line(f'Name: {target_user.first_name} {target_user.last_name}')
    write_line(f'Email: {target_user.email}', size=10, color=(0.4, 0.4, 0.4))
    write_line(f'Education: {target_user.education_level.value if target_user.education_level else "-"}', size=10, color=(0.4, 0.4, 0.4))
    write_line(f'Course: {target_user.course or "-"} | Group: {target_user.study_group or "-"}', size=10, color=(0.4, 0.4, 0.4))
    write_line(f'Approved achievements: {len(achievements)} | Total points: {total_points}', size=10, color=(0.4, 0.4, 0.4))
    y += 8
    write_line('Approved achievements', size=12)

    if achievements:
        for index, item in enumerate(achievements, 1):
            title = (item.title or '-').replace('\n', ' ').strip()
            if len(title) > 60:
                title = title[:57] + '...'
            line = f'{index}. {title} | {item.category.value if item.category else "-"} | {item.level.value if item.level else "-"} | {int(item.points or 0)} pts'
            write_line(line, size=9, color=(0.28, 0.28, 0.28))
    else:
        write_line('No approved achievements yet.', size=10, color=(0.45, 0.45, 0.45))

    if target_user.resume_text:
        y += 10
        write_line('Generated resume', size=12)
        for raw_line in target_user.resume_text.splitlines():
            line = raw_line.strip()
            if not line:
                y += 6
                continue
            while len(line) > 88:
                chunk = line[:88]
                write_line(chunk, size=9, color=(0.3, 0.3, 0.3))
                line = line[88:]
            write_line(line, size=9, color=(0.3, 0.3, 0.3))

    pdf_bytes = document.tobytes()
    document.close()
    filename = f'report_{target_user.last_name}_{target_user.first_name}.pdf'
    return Response(
        content=pdf_bytes,
        media_type='application/pdf',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )

