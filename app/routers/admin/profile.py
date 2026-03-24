import json

from fastapi import APIRouter, Request, Depends, Form, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.context import CryptContext

from app.models.achievement import Achievement
from app.models.enums import AchievementStatus, UserRole
from app.security.csrf import validate_csrf
from app.routers.admin.admin import templates, get_db
from app.services.admin.user_service import UserService
from app.services.admin.resume_service import ResumeService
from app.repositories.admin.user_repository import UserRepository
from app.routers.admin.deps import get_current_user, require_auth
from app.schemas.admin.auth import ResetPasswordSchema

router = APIRouter(
    prefix="/sirius.achievements",
    tags=["admin.profile"],
    dependencies=[Depends(require_auth)],
)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_service(db: AsyncSession = Depends(get_db)):
    return UserService(UserRepository(db))


@router.get("/profile", response_class=HTMLResponse, name="admin.profile.index")
async def index(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)

    resume_service = ResumeService(db)
    check = await resume_service.can_generate(user.id)

    # Progress chart: approved achievements by month
    chart_query = (
        select(
            func.date_trunc("month", Achievement.created_at).label("m"),
            func.count().label("cnt"),
            func.coalesce(func.sum(Achievement.points), 0).label("pts"),
        )
        .filter(Achievement.user_id == user.id, Achievement.status == AchievementStatus.APPROVED)
        .group_by("m")
        .order_by("m")
    )
    chart_rows = (await db.execute(chart_query)).all()
    chart_labels = json.dumps([r.m.strftime("%m.%Y") for r in chart_rows]) if chart_rows else "[]"
    chart_counts = json.dumps([r.cnt for r in chart_rows]) if chart_rows else "[]"
    chart_points = json.dumps([int(r.pts) for r in chart_rows]) if chart_rows else "[]"

    # User's uploaded documents
    docs_query = (
        select(Achievement)
        .filter(Achievement.user_id == user.id)
        .order_by(Achievement.created_at.desc())
    )
    my_docs = (await db.execute(docs_query)).scalars().all()

    return templates.TemplateResponse(
        "profile/index.html",
        {
            "request": request,
            "user": user,
            "can_generate": check["allowed"],
            "generate_reason": check.get("reason", ""),
            "chart_labels": chart_labels,
            "chart_counts": chart_counts,
            "chart_points": chart_points,
            "my_docs": my_docs,
        },
    )


@router.post("/profile/update", name="admin.profile.update", dependencies=[Depends(validate_csrf)])
async def update_profile(
    request: Request,
    first_name: str = Form(...),
    last_name: str = Form(...),
    phone_number: str = Form(None),
    avatar: UploadFile = None,
    service: UserService = Depends(get_service),
    db: AsyncSession = Depends(get_db),
):
    current_user = await get_current_user(request, db)
    if not current_user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)

    update_data = {
        "first_name": first_name,
        "last_name": last_name,
        "phone_number": phone_number,
    }

    if avatar and avatar.filename:
        try:
            path = await service.save_avatar(current_user.id, avatar)
            update_data["avatar_path"] = path
            request.session["auth_avatar"] = path
        except ValueError as exc:
            return templates.TemplateResponse(
                "profile/index.html",
                {
                    "request": request,
                    "user": current_user,
                    "error_msg": str(exc),
                    "active_tab": "profile",
                },
            )

    await service.repository.update(current_user.id, update_data)
    request.session["auth_name"] = f"{first_name} {last_name}"

    url = request.url_for("admin.profile.index").include_query_params(
        toast_msg="Профиль обновлен",
        toast_type="success",
    )
    return RedirectResponse(url=url, status_code=302)


@router.post("/profile/password", name="admin.profile.password", dependencies=[Depends(validate_csrf)])
async def change_password(
    request: Request,
    current_password: str = Form(...),
    new_password: str = Form(...),
    confirm_password: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)

    try:
        ResetPasswordSchema(password=new_password, password_confirm=confirm_password)
    except Exception as exc:
        error_messages = []
        if hasattr(exc, "errors"):
            for err in exc.errors():
                error_messages.append(err.get("msg", str(err)))
        else:
            error_messages.append(str(exc))
        return templates.TemplateResponse(
            "profile/index.html",
            {
                "request": request,
                "user": user,
                "error_msg": "; ".join(error_messages),
                "active_tab": "security",
            },
        )

    if not pwd_context.verify(current_password, user.hashed_password):
        return templates.TemplateResponse(
            "profile/index.html",
            {
                "request": request,
                "user": user,
                "error_msg": "Неверный текущий пароль",
                "active_tab": "security",
            },
        )

    user.hashed_password = pwd_context.hash(new_password)
    user.session_version = int(user.session_version or 0) + 1
    user.api_access_version = int(user.api_access_version or 0) + 1
    user.api_refresh_version = int(user.api_refresh_version or 0) + 1
    await db.commit()
    request.session.clear()

    url = request.url_for("admin.auth.login_page").include_query_params(
        toast_msg="Пароль изменен. Войдите снова.",
        toast_type="success",
    )
    return RedirectResponse(url=url, status_code=302)
