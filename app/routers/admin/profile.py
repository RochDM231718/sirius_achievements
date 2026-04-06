import json
import re
import secrets
import time

from fastapi import APIRouter, BackgroundTasks, Request, Depends, Form, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.utils.password import hash_password

_PHONE_RE = re.compile(r'^[\d\s\+\-\(\)]{0,20}$')

from app.config import settings
from app.models.achievement import Achievement
from app.models.enums import AchievementStatus, UserRole
from app.security.csrf import validate_csrf
from app.routers.admin.admin import templates, get_db
from app.services.admin.user_service import UserService
from app.services.admin.resume_service import ResumeService
from app.services.auth_service import AuthService
from app.repositories.admin.user_repository import UserRepository
from app.routers.admin.deps import get_current_user, require_auth
from app.schemas.admin.auth import ResetPasswordSchema
from app.utils.points import calculate_gpa_bonus
from app.utils.rate_limiter import rate_limiter

router = APIRouter(
    prefix="/sirius.achievements",
    tags=["admin.profile"],
    dependencies=[Depends(require_auth)],
)


def get_service(db: AsyncSession = Depends(get_db)):
    return UserService(UserRepository(db))


@router.get("/profile", response_class=HTMLResponse, name="admin.profile.index")
async def index(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)

    resume_service = ResumeService(db)
    check = await resume_service.can_generate(user.id)

    # ── Chart: unified timeline with 3 metrics ──
    # 1) Approved achievements by month (points + count)
    approved_query = (
        select(
            func.date_trunc("month", Achievement.created_at).label("m"),
            func.count().label("cnt"),
            func.coalesce(func.sum(Achievement.points), 0).label("pts"),
        )
        .filter(Achievement.user_id == user.id, Achievement.status == AchievementStatus.APPROVED)
        .group_by("m")
        .order_by("m")
    )
    approved_rows = (await db.execute(approved_query)).all()

    # 2) All uploads by month
    uploads_query = (
        select(
            func.date_trunc("month", Achievement.created_at).label("m"),
            func.count().label("cnt"),
        )
        .filter(Achievement.user_id == user.id)
        .group_by("m")
        .order_by("m")
    )
    upload_rows = (await db.execute(uploads_query)).all()

    # Merge into single sorted timeline
    all_months: dict[str, dict] = {}
    for r in approved_rows:
        key = r.m.strftime("%m.%Y")
        all_months.setdefault(key, {"pts": 0, "approved": 0, "uploads": 0, "sort": r.m})
        all_months[key]["pts"] = int(r.pts)
        all_months[key]["approved"] = r.cnt
    for r in upload_rows:
        key = r.m.strftime("%m.%Y")
        all_months.setdefault(key, {"pts": 0, "approved": 0, "uploads": 0, "sort": r.m})
        all_months[key]["uploads"] = r.cnt

    sorted_months = sorted(all_months.items(), key=lambda x: x[1]["sort"])
    chart_labels = json.dumps([m[0] for m in sorted_months])
    chart_points = json.dumps([m[1]["pts"] for m in sorted_months])
    chart_uploads = json.dumps([m[1]["uploads"] for m in sorted_months])
    # Cumulative points
    cumulative = []
    running = 0
    for m in sorted_months:
        running += m[1]["pts"]
        cumulative.append(running)
    chart_cumulative = json.dumps(cumulative)

    has_chart_data = len(sorted_months) > 0
    gpa_bonus = calculate_gpa_bonus(user.session_gpa)

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
            "chart_points": chart_points,
            "chart_uploads": chart_uploads,
            "chart_cumulative": chart_cumulative,
            "has_chart_data": has_chart_data,
            "my_docs": my_docs,
            "gpa_bonus": gpa_bonus,
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

    if phone_number and not _PHONE_RE.match(phone_number):
        return templates.TemplateResponse(
            "profile/index.html",
            {
                "request": request,
                "user": current_user,
                "error_msg": "Неверный формат телефона. Допустимы только цифры, +, -, (, ), пробелы.",
                "active_tab": "profile",
            },
        )

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


def _get_auth_service(db: AsyncSession = Depends(get_db)):
    from app.repositories.admin.user_token_repository import UserTokenRepository
    from app.services.admin.user_token_service import UserTokenService
    user_repo = UserRepository(db)
    token_repo = UserTokenRepository(db)
    token_service = UserTokenService(token_repo)
    return AuthService(user_repo, token_service)


@router.post("/profile/password/send-code", name="admin.profile.password.send_code", dependencies=[Depends(validate_csrf)])
async def password_send_code(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    auth_service: AuthService = Depends(_get_auth_service),
):
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)

    success, msg, retry_after, _ = await auth_service.forgot_password(user.email, background_tasks)

    if not success:
        url = request.url_for("admin.profile.index").include_query_params(
            toast_msg=msg, toast_type="error", active_tab="security",
        )
        return RedirectResponse(url=url, status_code=302)

    request.session["pwd_change_user_id"] = user.id
    request.session["pwd_change_flow_id"] = secrets.token_urlsafe(16)
    request.session["pwd_change_retry_at"] = int(time.time()) + retry_after
    request.session.pop("pwd_change_verified", None)

    return RedirectResponse(url=request.url_for("admin.profile.password.verify_page"), status_code=302)


@router.get("/profile/password/verify", response_class=HTMLResponse, name="admin.profile.password.verify_page")
async def password_verify_page(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)
    if not request.session.get("pwd_change_flow_id"):
        return RedirectResponse(url="/sirius.achievements/profile?active_tab=security", status_code=302)

    retry_at = request.session.get("pwd_change_retry_at", 0)
    seconds_left = max(0, retry_at - int(time.time()))

    return templates.TemplateResponse("profile/verify_password_code.html", {
        "request": request,
        "user": user,
        "email": user.email,
        "seconds_left": seconds_left,
    })


@router.post("/profile/password/verify", name="admin.profile.password.verify", dependencies=[Depends(validate_csrf)])
async def password_verify_code(
    request: Request,
    code: str = Form(...),
    db: AsyncSession = Depends(get_db),
    auth_service: AuthService = Depends(_get_auth_service),
):
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)

    flow_id = request.session.get("pwd_change_flow_id")
    if not flow_id:
        return RedirectResponse(url="/sirius.achievements/profile?active_tab=security", status_code=302)

    retry_at = request.session.get("pwd_change_retry_at", 0)
    seconds_left = max(0, retry_at - int(time.time()))

    rl_key = f"pwd_change_otp:{flow_id}"
    attempt_count = int(await rate_limiter.increment(rl_key, settings.OTP_LOCKOUT_TTL))
    if attempt_count > settings.OTP_MAX_ATTEMPTS:
        return templates.TemplateResponse("profile/verify_password_code.html", {
            "request": request, "user": user, "email": user.email,
            "error_msg": "Слишком много попыток. Запросите новый код.",
            "seconds_left": seconds_left,
        })

    try:
        await auth_service.verify_code_only(user.id, code)
        await rate_limiter.reset(rl_key)
        request.session["pwd_change_verified"] = True
        return RedirectResponse(url=request.url_for("admin.profile.password.reset_page"), status_code=302)
    except Exception:
        remaining = max(0, settings.OTP_MAX_ATTEMPTS - attempt_count)
        error_msg = "Неверный код." if remaining > 2 else f"Неверный код. Осталось попыток: {remaining}."
        return templates.TemplateResponse("profile/verify_password_code.html", {
            "request": request, "user": user, "email": user.email,
            "error_msg": error_msg, "seconds_left": seconds_left,
        })


@router.post("/profile/password/resend", name="admin.profile.password.resend", dependencies=[Depends(validate_csrf)])
async def password_resend_code(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    auth_service: AuthService = Depends(_get_auth_service),
):
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)

    success, _, retry_after, _ = await auth_service.forgot_password(user.email, background_tasks)
    if success:
        request.session["pwd_change_retry_at"] = int(time.time()) + retry_after
        request.session["pwd_change_flow_id"] = secrets.token_urlsafe(16)
        request.session.pop("pwd_change_verified", None)

    return RedirectResponse(url=request.url_for("admin.profile.password.verify_page"), status_code=302)


@router.get("/profile/password/reset", response_class=HTMLResponse, name="admin.profile.password.reset_page")
async def password_reset_page(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)
    if not request.session.get("pwd_change_verified"):
        return RedirectResponse(url="/sirius.achievements/profile?active_tab=security", status_code=302)

    return templates.TemplateResponse("profile/change_password.html", {
        "request": request, "user": user,
    })


@router.post("/profile/password", name="admin.profile.password", dependencies=[Depends(validate_csrf)])
async def change_password(
    request: Request,
    new_password: str = Form(...),
    confirm_password: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    user = await get_current_user(request, db)
    if not user:
        return RedirectResponse(url="/sirius.achievements/login", status_code=302)
    if not request.session.get("pwd_change_verified"):
        return RedirectResponse(url="/sirius.achievements/profile?active_tab=security", status_code=302)

    try:
        ResetPasswordSchema(password=new_password, password_confirm=confirm_password)
    except Exception as exc:
        error_messages = []
        if hasattr(exc, "errors"):
            for err in exc.errors():
                error_messages.append(err.get("msg", str(err)))
        else:
            error_messages.append(str(exc))
        return templates.TemplateResponse("profile/change_password.html", {
            "request": request, "user": user,
            "error_msg": "; ".join(error_messages),
        })

    user.hashed_password = hash_password(new_password)
    user.session_version = int(user.session_version or 0) + 1
    user.api_access_version = int(user.api_access_version or 0) + 1
    user.api_refresh_version = int(user.api_refresh_version or 0) + 1
    await db.commit()

    request.session.pop("pwd_change_verified", None)
    request.session.pop("pwd_change_flow_id", None)
    request.session.clear()

    url = request.url_for("admin.auth.login_page").include_query_params(
        toast_msg="Пароль изменен. Войдите снова.",
        toast_type="success",
    )
    return RedirectResponse(url=url, status_code=302)
