from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.infrastructure.database import get_db
from app.models.achievement import Achievement
from app.models.user import Users
from app.repositories.admin.achievement_repository import AchievementRepository
from app.routers.admin.admin import templates
from app.routers.admin.deps import get_current_user, require_auth
from app.security.csrf import validate_csrf
from app.services.admin.achievement_service import AchievementService
from app.utils.access import is_in_zone
from app.utils.media_paths import guess_media_type, resolve_static_path
from app.utils.search import escape_like

router = APIRouter(
    prefix="/sirius.achievements/documents",
    tags=["admin.documents"],
    dependencies=[Depends(require_auth)],
)


def _document_zone_filter(user):
    if user.role.value == "MODERATOR" and user.education_level:
        return user.education_level
    return None


def _can_access_document(user, document: Achievement) -> bool:
    if not user or not document:
        return False
    if document.user_id == user.id:
        return True
    return is_in_zone(user, getattr(getattr(document, "user", None), "education_level", None))


async def _get_document(db: AsyncSession, document_id: int) -> Achievement | None:
    stmt = select(Achievement).options(selectinload(Achievement.user)).where(Achievement.id == document_id)
    result = await db.execute(stmt)
    return result.scalars().first()


def _file_response(relative_path: str, inline: bool) -> FileResponse:
    try:
        full_path = resolve_static_path(relative_path)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Недопустимый путь к файлу") from exc

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Файл физически отсутствует на сервере")

    response = FileResponse(path=full_path, media_type=guess_media_type(full_path))
    disposition = "inline" if inline else "attachment"
    response.headers["Content-Disposition"] = f'{disposition}; filename="{full_path.name}"'
    if not inline:
        response.headers["Content-Type"] = "application/octet-stream"
    return response


@router.get("/search", response_class=JSONResponse)
async def api_documents_search(
    request: Request,
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Не авторизован")
    if not user.is_staff:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

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

    education_level = _document_zone_filter(user)
    if education_level is not None:
        stmt = stmt.filter(Users.education_level == education_level)

    result = await db.execute(stmt)
    return [{"value": document.title, "text": document.title} for document in result.scalars().all()]


@router.get("/", response_class=HTMLResponse)
async def index(
    request: Request,
    query: str = "",
    status: str = "",
    category: str = "",
    level: str = "",
    sort_by: str = "newest",
    db: AsyncSession = Depends(get_db),
):
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse(url="/")
    if not user.is_staff:
        return RedirectResponse(url="/sirius.achievements/dashboard")

    repo = AchievementRepository(db)
    achievements = await repo.get_all_with_filters(
        search=query,
        status=status,
        category=category,
        level=level,
        sort_by=sort_by,
        owner_education_level=_document_zone_filter(user),
    )

    return templates.TemplateResponse(
        "documents/index.html",
        {
            "request": request,
            "user": user,
            "achievements": achievements,
            "query": query,
            "status": status,
            "category": category,
            "level": level,
            "sort_by": sort_by,
            "statuses": repo.model.status.type.enums if hasattr(repo.model, "status") else [],
            "categories": repo.model.category.type.enums if hasattr(repo.model, "category") else [],
            "levels": repo.model.level.type.enums if hasattr(repo.model, "level") else [],
        },
    )


@router.post("/{id}/delete")
async def delete(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _=Depends(validate_csrf),
):
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse(url="/", status_code=303)

    document = await _get_document(db, id)
    if not document:
        return RedirectResponse(
            url=f"/sirius.achievements/documents?toast_msg={quote('Документ не найден')}&toast_type=error",
            status_code=303,
        )
    if not _can_access_document(user, document):
        return RedirectResponse(
            url=f"/sirius.achievements/documents?toast_msg={quote('Недостаточно прав')}&toast_type=error",
            status_code=303,
        )

    repo = AchievementRepository(db)
    service = AchievementService(repo)

    try:
        await service.delete(
            id,
            user.id,
            user.role,
            actor_education_level=getattr(user, "education_level", None),
            target_education_level=getattr(getattr(document, "user", None), "education_level", None),
        )
        return RedirectResponse(
            url=f"/sirius.achievements/documents?toast_msg={quote('Документ удален')}&toast_type=success",
            status_code=303,
        )
    except Exception as exc:
        return RedirectResponse(
            url=f'/sirius.achievements/documents?toast_msg={quote("Ошибка: " + str(exc))}&toast_type=error',
            status_code=303,
        )


@router.get("/{id}/preview")
async def preview_document(id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Не авторизован")

    document = await _get_document(db, id)
    if not document or not document.file_path:
        raise HTTPException(status_code=404, detail="Документ не найден")
    if not _can_access_document(user, document):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    return _file_response(document.file_path, inline=True)


@router.get("/{id}/download")
async def download_document(id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Не авторизован")

    document = await _get_document(db, id)
    if not document or not document.file_path:
        raise HTTPException(status_code=404, detail="Документ не найден")
    if not _can_access_document(user, document):
        raise HTTPException(status_code=403, detail="Недостаточно прав для скачивания")

    return _file_response(document.file_path, inline=False)
