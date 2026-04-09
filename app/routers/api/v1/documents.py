from __future__ import annotations

import io

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.infrastructure.database import get_db
from app.middlewares.api_auth_middleware import auth
from app.models.achievement import Achievement
from app.models.enums import AchievementCategory, AchievementLevel, AchievementStatus, UserRole
from app.models.user import Users
from app.repositories.admin.achievement_repository import AchievementRepository
from app.services.admin.achievement_service import AchievementService
from app.utils.access import is_in_zone
from app.utils.media_paths import guess_media_type, resolve_static_path
from app.utils import storage
from app.utils.search import escape_like

from .serializers import serialize_achievement

router = APIRouter(prefix='/api/v1/documents', tags=['api.v1.documents'])


async def _check_admin_rights(current_user=Depends(auth)):
    if current_user.role not in {UserRole.SUPER_ADMIN, UserRole.MODERATOR}:
        raise HTTPException(status_code=403, detail='Access denied')
    return current_user


def _document_zone_filter(user):
    if user.role == UserRole.MODERATOR and user.education_level:
        return user.education_level
    return None


def _can_access_document(user, document: Achievement) -> bool:
    if not user or not document:
        return False
    if document.user_id == user.id:
        return True
    return is_in_zone(user, getattr(getattr(document, 'user', None), 'education_level', None))


async def _get_document(db: AsyncSession, document_id: int) -> Achievement | None:
    stmt = select(Achievement).options(selectinload(Achievement.user)).where(Achievement.id == document_id)
    result = await db.execute(stmt)
    return result.scalars().first()


async def _file_response(relative_path: str, inline: bool) -> FileResponse | StreamingResponse:
    if storage.is_minio_path(relative_path):
        key = storage.extract_key(relative_path)
        try:
            data = await storage.download(key)
        except Exception as exc:
            raise HTTPException(status_code=404, detail='File not found') from exc

        filename = key.rsplit('/', 1)[-1]
        media_type = guess_media_type(filename) if not inline else guess_media_type(filename)
        disposition = 'inline' if inline else 'attachment'
        headers = {'Content-Disposition': f'{disposition}; filename="{filename}"'}
        if not inline:
            media_type = 'application/octet-stream'
        return StreamingResponse(io.BytesIO(data), media_type=media_type, headers=headers)

    # Legacy: serve from local filesystem
    try:
        full_path = resolve_static_path(relative_path)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail='Invalid file path') from exc

    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail='File not found')

    response = FileResponse(path=full_path, media_type=guess_media_type(full_path))
    disposition = 'inline' if inline else 'attachment'
    response.headers['Content-Disposition'] = f'{disposition}; filename="{full_path.name}"'
    if not inline:
        response.headers['Content-Type'] = 'application/octet-stream'
    return response


@router.get('')
@router.get('/')
async def list_documents(
    query: str = '',
    status: str = '',
    category: str = '',
    level: str = '',
    sort_by: str = 'newest',
    current_user=Depends(_check_admin_rights),
    db: AsyncSession = Depends(get_db),
):
    repo = AchievementRepository(db)
    achievements = await repo.get_all_with_filters(
        search=query,
        status=status,
        category=category,
        level=level,
        sort_by=sort_by,
        owner_education_level=_document_zone_filter(current_user),
    )

    return {
        'achievements': [serialize_achievement(item) for item in achievements],
        'total': len(achievements),
        'statuses': [item.value for item in AchievementStatus],
        'categories': [item.value for item in AchievementCategory],
        'levels': [item.value for item in AchievementLevel],
    }


@router.get('/search')
async def search_documents(
    q: str = Query(..., min_length=1),
    current_user=Depends(_check_admin_rights),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Achievement)
        .join(Users, Achievement.user_id == Users.id)
        .filter(
            or_(
                Achievement.title.ilike(f"%{escape_like(q)}%"),
                Achievement.description.ilike(f"%{escape_like(q)}%"),
            )
        )
        .limit(5)
    )

    education_level = _document_zone_filter(current_user)
    if education_level is not None:
        stmt = stmt.filter(Users.education_level == education_level)

    result = await db.execute(stmt)
    return [{'value': item.title, 'text': item.title} for item in result.scalars().all()]


@router.get('/{document_id}/preview')
async def preview_document(
    document_id: int,
    current_user=Depends(auth),
    db: AsyncSession = Depends(get_db),
):
    document = await _get_document(db, document_id)
    if not document or not document.file_path:
        raise HTTPException(status_code=404, detail='Document not found')
    if not _can_access_document(current_user, document):
        raise HTTPException(status_code=403, detail='Access denied')

    return await _file_response(document.file_path, inline=True)


@router.get('/{document_id}/download')
async def download_document(
    document_id: int,
    current_user=Depends(auth),
    db: AsyncSession = Depends(get_db),
):
    document = await _get_document(db, document_id)
    if not document or not document.file_path:
        raise HTTPException(status_code=404, detail='Document not found')
    if not _can_access_document(current_user, document):
        raise HTTPException(status_code=403, detail='Access denied')

    return await _file_response(document.file_path, inline=False)


@router.delete('/{document_id}')
async def delete_document(
    document_id: int,
    current_user=Depends(_check_admin_rights),
    db: AsyncSession = Depends(get_db),
):
    document = await _get_document(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail='Document not found')
    if not _can_access_document(current_user, document):
        raise HTTPException(status_code=403, detail='Access denied')

    repo = AchievementRepository(db)
    service = AchievementService(repo)

    try:
        await service.delete(
            document_id,
            current_user.id,
            current_user.role,
            actor_education_level=getattr(current_user, 'education_level', None),
            target_education_level=getattr(getattr(document, 'user', None), 'education_level', None),
        )
    except ValueError as exc:
        raise HTTPException(status_code=403, detail='Удаление документа недоступно.') from exc

    return {'success': True}

