from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, asc, desc
from sqlalchemy.orm import selectinload
from typing import Optional
from app.routers.admin.admin import templates, get_db
from app.models.achievement import Achievement
from app.models.user import Users
from app.models.enums import UserRole, AchievementStatus
from app.services.admin.achievement_service import AchievementService
from app.repositories.admin.achievement_repository import AchievementRepository
from app.infrastructure.tranaslations import TranslationManager
from app.security.csrf import validate_csrf
from app.routers.admin.deps import require_auth
from app.utils.search import escape_like
from app.utils.access import is_in_zone

router = APIRouter(
    prefix="/sirius.achievements",
    tags=["admin.pages"],
    dependencies=[Depends(require_auth)],
)


def get_achievement_service(db: AsyncSession = Depends(get_db)):
    return AchievementService(AchievementRepository(db))


async def check_access(request: Request, db: AsyncSession):
    user_id = request.session.get('auth_id')
    if not user_id:
        raise HTTPException(status_code=403, detail="Not authenticated")

    user = await db.get(Users, user_id)

    if not user:
        raise HTTPException(status_code=403, detail="User not found")

    if user.role not in [UserRole.MODERATOR, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")

    return user


def _zone_filter_for(current_user):
    if current_user.role == UserRole.MODERATOR and current_user.education_level:
        return current_user.education_level
    return None


def _can_access_document(current_user, document: Achievement) -> bool:
    if current_user.role == UserRole.SUPER_ADMIN:
        return True
    if not document.user:
        return False
    return is_in_zone(current_user, document.user.education_level)


@router.get('/pages/search', response_class=JSONResponse, name='admin.pages.search_api')
async def search_documents(request: Request, query: str, status: Optional[str] = None,
                           db: AsyncSession = Depends(get_db)):
    current_user = await check_access(request, db)

    if not query: return []

    stmt = select(Achievement).options(selectinload(Achievement.user)).join(Users, Achievement.user_id == Users.id)
    zone_filter = _zone_filter_for(current_user)
    if zone_filter is not None:
        stmt = stmt.filter(Users.education_level == zone_filter)

    like_term = f"%{escape_like(query)}%"
    stmt = stmt.filter(or_(
        Achievement.title.ilike(like_term),
        Achievement.description.ilike(like_term),
        Users.first_name.ilike(like_term),
        Users.last_name.ilike(like_term),
        Users.email.ilike(like_term),
        (Users.first_name + " " + Users.last_name).ilike(like_term),
    ))
    if status: stmt = stmt.filter(Achievement.status == status)
    stmt = stmt.limit(10)

    result = await db.execute(stmt)
    documents = result.scalars().all()

    return [{"id": doc.user_id, "title": doc.title, "user": f"{doc.user.first_name} {doc.user.last_name}",
             "status": doc.status.value} for doc in documents]


@router.get('/pages', response_class=HTMLResponse, name="admin.pages.index")
async def index(request: Request, query: Optional[str] = "", status: Optional[str] = None,
                sort: Optional[str] = "created_at", order: Optional[str] = "desc", db: AsyncSession = Depends(get_db)):
    current_user = await check_access(request, db)

    stmt = select(Achievement).options(selectinload(Achievement.user)).join(Users, Achievement.user_id == Users.id)
    zone_filter = _zone_filter_for(current_user)
    if zone_filter is not None:
        stmt = stmt.filter(Users.education_level == zone_filter)

    if query:
        like_term = f"%{escape_like(query)}%"
        stmt = stmt.filter(or_(
            Achievement.title.ilike(like_term),
            Achievement.description.ilike(like_term),
            Users.first_name.ilike(like_term),
            Users.last_name.ilike(like_term),
            Users.email.ilike(like_term),
            (Users.first_name + " " + Users.last_name).ilike(like_term),
        ))
    if status: stmt = stmt.filter(Achievement.status == status)

    allowed_sort_fields = {'created_at', 'updated_at', 'title', 'status', 'category', 'level'}
    if sort in allowed_sort_fields and hasattr(Achievement, sort):
        field = getattr(Achievement, sort)
        stmt = stmt.order_by(asc(field) if order == 'asc' else desc(field))
    else:
        stmt = stmt.order_by(desc(Achievement.created_at))

    stmt = stmt.limit(50)

    result = await db.execute(stmt)
    documents = result.scalars().all()

    count_stmt = select(func.count()).select_from(Achievement).join(Users, Achievement.user_id == Users.id)
    if zone_filter is not None:
        count_stmt = count_stmt.filter(Users.education_level == zone_filter)
    if query:
        like_term = f"%{escape_like(query)}%"
        count_stmt = count_stmt.filter(or_(
            Achievement.title.ilike(like_term),
            Achievement.description.ilike(like_term),
            Users.first_name.ilike(like_term),
            Users.last_name.ilike(like_term),
            Users.email.ilike(like_term),
            (Users.first_name + " " + Users.last_name).ilike(like_term),
        ))
    if status: count_stmt = count_stmt.filter(Achievement.status == status)

    res_count = await db.execute(count_stmt)
    total_count = res_count.scalar()

    return templates.TemplateResponse('pages/index.html', {'request': request, 'query': query, 'documents': documents,
                                                           'total_count': total_count, 'selected_status': status,
                                                           'statuses': list(AchievementStatus), 'current_sort': sort,
                                                           'current_order': order})


@router.post('/pages/{id}/delete', name='admin.pages.delete', dependencies=[Depends(validate_csrf)])
async def delete_document(
        id: int,
        request: Request,
        service: AchievementService = Depends(get_achievement_service),
        db: AsyncSession = Depends(get_db)
):
    current_user = await check_access(request, db)
    document = await db.scalar(
        select(Achievement)
        .options(selectinload(Achievement.user))
        .where(Achievement.id == id)
    )
    if not document or not _can_access_document(current_user, document):
        raise HTTPException(status_code=404, detail="Document not found")

    await service.delete(
        id,
        current_user.id,
        current_user.role,
        actor_education_level=current_user.education_level,
        target_education_level=document.user.education_level if document.user else None,
    )

    locale = request.session.get('locale', 'en')
    translator = TranslationManager()
    url = request.url_for('admin.pages.index').include_query_params(
        toast_msg=translator.gettext("admin.toast.deleted", locale=locale), toast_type="success")
    return RedirectResponse(url=url, status_code=302)
