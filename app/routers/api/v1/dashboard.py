from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, literal_column, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db
from app.middlewares.api_auth_middleware import auth
from app.models.achievement import Achievement
from app.models.enums import AchievementStatus, UserRole, UserStatus
from app.models.user import Users
from app.utils.points import aggregated_gpa_bonus_expr, calculate_gpa_bonus

from .serializers import serialize_achievement

router = APIRouter(prefix='/api/v1/dashboard', tags=['api.v1.dashboard'])


def _apply_student_stream_scope(stmt, user: Users):
    if user.education_level is not None:
        stmt = stmt.filter(Users.education_level == user.education_level)
    if user.course:
        stmt = stmt.filter(Users.course == user.course)
    if user.study_group:
        stmt = stmt.filter(Users.study_group == user.study_group)
    return stmt


@router.get('/')
async def dashboard(
    period: str = Query(default='all'),
    current_user=Depends(auth),
    db: AsyncSession = Depends(get_db),
):
    user = current_user

    if user.status == UserStatus.PENDING and not user.is_staff:
        return {'pending_review': True}

    now = datetime.now()
    start_date = datetime(2020, 1, 1)
    date_trunc = 'month'
    date_fmt = '%m.%Y'

    if period == 'day':
        start_date = now - timedelta(days=1)
        date_trunc = 'hour'
        date_fmt = '%H:00'
    elif period == 'week':
        start_date = now - timedelta(weeks=1)
        date_trunc = 'day'
        date_fmt = '%d.%m'
    elif period == 'month':
        start_date = now - timedelta(days=30)
        date_trunc = 'day'
        date_fmt = '%d.%m'

    include_gpa_bonus = period == 'all'

    if user.is_staff:
        new_users_count = (await db.execute(
            select(func.count()).filter(Users.role == UserRole.STUDENT, Users.created_at >= start_date)
        )).scalar() or 0

        ach_stats = (await db.execute(
            select(
                func.count().filter(Achievement.status == AchievementStatus.PENDING, Achievement.created_at >= start_date).label('pending'),
                func.count().filter(Achievement.status == AchievementStatus.APPROVED, Achievement.updated_at >= start_date).label('approved'),
                func.count().filter(Achievement.created_at >= start_date).label('total'),
            )
        )).first()

        points_expr = (
            func.coalesce(func.sum(Achievement.points), 0)
            + aggregated_gpa_bonus_expr(Users.session_gpa, include_bonus=include_gpa_bonus)
        )
        top_students_stmt = (
            select(Users, points_expr.label('points'))
            .outerjoin(
                Achievement,
                (Users.id == Achievement.user_id)
                & (Achievement.status == AchievementStatus.APPROVED)
                & (Achievement.updated_at >= start_date),
            )
            .filter(Users.role == UserRole.STUDENT, Users.status == UserStatus.ACTIVE)
            .group_by(Users.id)
            .having(points_expr > 0)
            .order_by(desc('points'))
            .limit(5)
        )
        top_students_rows = (await db.execute(top_students_stmt)).all()

        recent_stmt = (
            select(Achievement)
            .options(selectinload(Achievement.user))
            .join(Users, Achievement.user_id == Users.id)
            .filter(Achievement.created_at >= start_date)
            .order_by(Achievement.created_at.desc())
            .limit(5)
        )
        recent_achievements = (await db.execute(recent_stmt)).scalars().all()

        chart_rows = (await db.execute(
            select(
                func.date_trunc(date_trunc, Achievement.created_at).label('bucket'),
                func.count().label('cnt'),
            )
            .filter(Achievement.created_at >= start_date)
            .group_by(literal_column('bucket'))
            .order_by(literal_column('bucket'))
        )).all()

        cohorts_rows = (await db.execute(
            select(
                Users.education_level,
                func.count(Achievement.id).label('count'),
                func.count()
                .filter(Achievement.status == AchievementStatus.PENDING)
                .label('pending'),
            )
            .join(Achievement, Users.id == Achievement.user_id)
            .filter(Achievement.created_at >= start_date, Users.education_level.isnot(None))
            .group_by(Users.education_level)
            .order_by(desc('count'))
        )).all()

        return {
            'new_users_count': int(new_users_count),
            'pending_achievements': int(ach_stats.pending or 0),
            'approved_achievements': int(ach_stats.approved or 0),
            'total_achievements': int(ach_stats.total or 0),
            'top_students': [
                {
                    'id': row[0].id,
                    'first_name': row[0].first_name,
                    'last_name': row[0].last_name,
                    'education_level': row[0].education_level_value,
                    'points': int(row[1] or 0),
                }
                for row in top_students_rows
            ],
            'recent_achievements': [serialize_achievement(item) for item in recent_achievements],
            'chart_data': {
                'labels': [row.bucket.strftime(date_fmt) for row in chart_rows] if chart_rows else [],
                'counts': [int(row.cnt or 0) for row in chart_rows] if chart_rows else [],
            },
            'cohorts': [
                {
                    'education_level': row.education_level.value if hasattr(row.education_level, 'value') else str(row.education_level),
                    'count': int(row.count or 0),
                    'total': int(row.count or 0),
                    'pending': int(row.pending or 0),
                    'approved': max(int(row.count or 0) - int(row.pending or 0), 0),
                }
                for row in cohorts_rows
            ],
        }

    achievement_points = (await db.execute(
        select(func.coalesce(func.sum(Achievement.points), 0)).filter(
            Achievement.user_id == user.id,
            Achievement.status == AchievementStatus.APPROVED,
            Achievement.updated_at >= start_date,
        )
    )).scalar() or 0
    gpa_bonus = calculate_gpa_bonus(user.session_gpa) if include_gpa_bonus else 0
    my_points = int(achievement_points) + int(gpa_bonus)

    doc_stats = (await db.execute(
        select(
            func.count().filter(Achievement.user_id == user.id, Achievement.created_at >= start_date).label('total'),
            func.count().filter(Achievement.user_id == user.id, Achievement.status == AchievementStatus.PENDING, Achievement.created_at >= start_date).label('pending'),
            func.count().filter(Achievement.user_id == user.id, Achievement.status == AchievementStatus.APPROVED, Achievement.updated_at >= start_date).label('approved'),
            func.count().filter(Achievement.user_id == user.id, Achievement.status == AchievementStatus.REJECTED, Achievement.updated_at >= start_date).label('rejected'),
        )
    )).first()

    total_points_expr = (
        func.coalesce(func.sum(Achievement.points), 0)
        + aggregated_gpa_bonus_expr(Users.session_gpa, include_bonus=include_gpa_bonus)
    ).label('total_points')
    subquery_points = (
        select(Users.id.label('user_id'), total_points_expr)
        .outerjoin(
            Achievement,
            (Users.id == Achievement.user_id)
            & (Achievement.status == AchievementStatus.APPROVED)
            & (Achievement.updated_at >= start_date),
        )
        .filter(Users.role == UserRole.STUDENT, Users.status == UserStatus.ACTIVE)
    )
    subquery_points = _apply_student_stream_scope(subquery_points, user)
    subquery_points = (
        subquery_points
        .group_by(Users.id)
        .subquery()
    )

    my_rank = 0
    if my_points > 0:
        better_than_me = (await db.execute(
            select(func.count()).filter(subquery_points.c.total_points > my_points)
        )).scalar() or 0
        my_rank = int(better_than_me) + 1

    recent_docs = (await db.execute(
        select(Achievement)
        .filter(Achievement.user_id == user.id, Achievement.created_at >= start_date)
        .order_by(Achievement.created_at.desc())
        .limit(5)
    )).scalars().all()

    category_rows = (await db.execute(
        select(Achievement.category, func.sum(Achievement.points))
        .filter(
            Achievement.user_id == user.id,
            Achievement.status == AchievementStatus.APPROVED,
            Achievement.updated_at >= start_date,
        )
        .group_by(Achievement.category)
    )).all()

    category_breakdown = [
        {
            'category': row[0].value if hasattr(row[0], 'value') else row[0],
            'points': int(row[1] or 0),
        }
        for row in category_rows if row[0]
    ]
    if gpa_bonus > 0:
        category_breakdown.append({'category': 'GPA bonus', 'points': int(gpa_bonus)})

    return {
        'my_points': my_points,
        'gpa_bonus': int(gpa_bonus),
        'my_docs': int(doc_stats.total or 0),
        'my_rank': my_rank,
        'my_recent_docs': [serialize_achievement(item) for item in recent_docs],
        'category_breakdown': category_breakdown,
        'pending_achievements': int(doc_stats.pending or 0),
        'approved_achievements': int(doc_stats.approved or 0),
        'rejected_achievements': int(doc_stats.rejected or 0),
    }




