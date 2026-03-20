import secrets
import time

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.enums import EducationLevel
from app.repositories.admin.user_repository import UserRepository
from app.repositories.admin.user_token_repository import UserTokenRepository
from app.routers.admin.admin import get_db, templates
from app.routers.admin.deps import get_current_user
from app.schemas.admin.auth import ResetPasswordSchema, UserRegister
from app.security.csrf import validate_csrf
from app.services.admin.user_token_service import UserTokenService
from app.services.auth_service import AuthService, UserBlockedException
from app.utils.rate_limiter import rate_limiter

logger = structlog.get_logger()

router = APIRouter(prefix="/sirius.achievements", tags=["Auth"])


def get_service(db: AsyncSession = Depends(get_db)):
    user_repo = UserRepository(db)
    token_repo = UserTokenRepository(db)
    token_service = UserTokenService(token_repo)
    return AuthService(user_repo, token_service)


def _set_authenticated_session(request: Request, user):
    request.session.clear()
    request.session["auth_id"] = user.id
    request.session["auth_name"] = f"{user.first_name} {user.last_name}"
    request.session["auth_avatar"] = user.avatar_path
    request.session["auth_role"] = user.role.value if hasattr(user.role, "value") else str(user.role)
    request.session["auth_session_version"] = int(user.session_version or 1)


@router.get("/login", response_class=HTMLResponse, name="admin.auth.login_page")
async def login_page(request: Request):
    if request.session.get("auth_id"):
        return RedirectResponse(url=request.url_for("admin.dashboard.index"), status_code=302)
    return templates.TemplateResponse("auth/sign-in.html", {"request": request})


@router.post("/login", name="admin.auth.login", dependencies=[Depends(validate_csrf)])
async def login(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    service: AuthService = Depends(get_service),
):
    try:
        client_ip = request.client.host if request.client else "unknown"
        user = await service.authenticate(email, password, ip=client_ip)

        if not user:
            return templates.TemplateResponse(
                "auth/sign-in.html",
                {
                    "request": request,
                    "error_msg": "Неверный email или пароль",
                    "form_data": {"email": email},
                },
            )

        if not user.is_active:
            request.session.clear()
            request.session["verify_email_user_id"] = user.id
            request.session["verify_email_address"] = user.email
            request.session["verify_email_needs_resend"] = True
            return RedirectResponse(url=request.url_for("admin.auth.verify_email_page"), status_code=302)

        _set_authenticated_session(request, user)
        return RedirectResponse(url=request.url_for("admin.dashboard.index"), status_code=302)

    except UserBlockedException as exc:
        return templates.TemplateResponse(
            "auth/sign-in.html",
            {
                "request": request,
                "error_msg": str(exc),
                "form_data": {"email": email},
            },
        )


@router.post("/logout", name="admin.auth.logout", dependencies=[Depends(validate_csrf)])
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
    service: AuthService = Depends(get_service),
):
    user = await get_current_user(request, db)
    if user:
        await service.revoke_all_auth_state(user)
    request.session.clear()
    return RedirectResponse(url=request.url_for("admin.auth.login_page"), status_code=302)


@router.get("/register", response_class=HTMLResponse, name="admin.auth.register_page")
async def register_page(request: Request):
    if request.session.get("auth_id"):
        return RedirectResponse(url=request.url_for("admin.dashboard.index"), status_code=302)
    return templates.TemplateResponse(
        "auth/register.html",
        {
            "request": request,
            "education_levels": list(EducationLevel),
        },
    )


@router.post("/register", name="admin.auth.register", dependencies=[Depends(validate_csrf)])
async def register(
    request: Request,
    background_tasks: BackgroundTasks,
    first_name: str = Form(...),
    last_name: str = Form(...),
    email: str = Form(...),
    education_level: EducationLevel = Form(...),
    course: int = Form(...),
    password: str = Form(...),
    password_confirm: str = Form(...),
    service: AuthService = Depends(get_service),
):
    form_data = {
        "first_name": first_name,
        "last_name": last_name,
        "email": email,
        "education_level": education_level.value,
        "course": course,
    }

    if password != password_confirm:
        return templates.TemplateResponse(
            "auth/register.html",
            {
                "request": request,
                "error_msg": "Пароли не совпадают",
                "form_data": form_data,
                "education_levels": list(EducationLevel),
            },
        )

    try:
        user_data = UserRegister(
            first_name=first_name,
            last_name=last_name,
            email=email,
            education_level=education_level,
            course=course,
            password=password,
            password_confirm=password_confirm,
        )

        user = await service.register_user(user_data)
        await service.send_email_verification(user, background_tasks)

        request.session.clear()
        request.session["verify_email_user_id"] = user.id
        request.session["verify_email_address"] = user.email
        request.session["verify_email_retry_at"] = int(time.time()) + 60

        return RedirectResponse(url=request.url_for("admin.auth.verify_email_page"), status_code=302)
    except Exception as exc:
        return templates.TemplateResponse(
            "auth/register.html",
            {
                "request": request,
                "error_msg": str(exc),
                "form_data": form_data,
                "education_levels": list(EducationLevel),
            },
        )


@router.get("/forgot-password", response_class=HTMLResponse, name="admin.auth.forgot_password_page")
async def forgot_password_page(request: Request):
    return templates.TemplateResponse("auth/forgot-password.html", {"request": request})


@router.post("/forgot-password", name="admin.auth.forgot_password", dependencies=[Depends(validate_csrf)])
async def forgot_password(
    request: Request,
    background_tasks: BackgroundTasks,
    email: str = Form(...),
    service: AuthService = Depends(get_service),
):
    client_ip = request.client.host if request.client else "unknown"
    rl_key = f"forgot_pwd:{client_ip}"
    if await rate_limiter.is_limited(rl_key, settings.FORGOT_PWD_MAX_ATTEMPTS, settings.FORGOT_PWD_LOCKOUT_TTL):
        return templates.TemplateResponse(
            "auth/forgot-password.html",
            {
                "request": request,
                "error_msg": "Слишком много запросов. Попробуйте через 15 минут.",
            },
        )
    await rate_limiter.increment(rl_key, settings.FORGOT_PWD_LOCKOUT_TTL)

    success, msg, retry_after, user_id = await service.forgot_password(email, background_tasks)

    if not success:
        return templates.TemplateResponse("auth/forgot-password.html", {"request": request, "error_msg": msg})

    request.session["reset_email"] = email.strip().lower()
    request.session["reset_user_id"] = user_id
    request.session["reset_flow_id"] = secrets.token_urlsafe(16)
    request.session["retry_at"] = int(time.time()) + retry_after
    request.session.pop("code_verified", None)

    return RedirectResponse(url=request.url_for("admin.auth.verify_code_page"), status_code=302)


@router.get("/verify-code", response_class=HTMLResponse, name="admin.auth.verify_code_page")
async def verify_code_page(request: Request):
    email = request.session.get("reset_email")
    flow_id = request.session.get("reset_flow_id")
    if not email or not flow_id:
        return RedirectResponse(url=request.url_for("admin.auth.forgot_password_page"), status_code=302)

    retry_at = request.session.get("retry_at", 0)
    seconds_left = max(0, retry_at - int(time.time()))

    return templates.TemplateResponse(
        "auth/verify-code.html",
        {
            "request": request,
            "email": email,
            "seconds_left": seconds_left,
        },
    )


@router.post("/resend-code", name="admin.auth.resend_code", dependencies=[Depends(validate_csrf)])
async def resend_code(
    request: Request,
    background_tasks: BackgroundTasks,
    service: AuthService = Depends(get_service),
):
    email = request.session.get("reset_email")
    if not email:
        return RedirectResponse(url=request.url_for("admin.auth.forgot_password_page"), status_code=302)

    success, _, retry_after, user_id = await service.forgot_password(email, background_tasks)

    if success:
        request.session["retry_at"] = int(time.time()) + retry_after
        request.session["reset_user_id"] = user_id
        request.session["reset_flow_id"] = secrets.token_urlsafe(16)
        request.session.pop("code_verified", None)

    return RedirectResponse(url=request.url_for("admin.auth.verify_code_page"), status_code=302)


@router.post("/verify-code", name="admin.auth.verify_code", dependencies=[Depends(validate_csrf)])
async def verify_code(
    request: Request,
    code: str = Form(...),
    service: AuthService = Depends(get_service),
):
    email = request.session.get("reset_email")
    flow_id = request.session.get("reset_flow_id")
    user_id = request.session.get("reset_user_id")
    retry_at = request.session.get("retry_at", 0)
    seconds_left = max(0, retry_at - int(time.time()))

    if not email or not flow_id:
        return RedirectResponse(url=request.url_for("admin.auth.forgot_password_page"), status_code=302)

    rl_key = f"otp_attempts:{flow_id}"
    if await rate_limiter.is_limited(rl_key, settings.OTP_MAX_ATTEMPTS, settings.OTP_LOCKOUT_TTL):
        return templates.TemplateResponse(
            "auth/verify-code.html",
            {
                "request": request,
                "email": email,
                "error_msg": "Слишком много попыток. Запросите новый код через 15 минут.",
                "seconds_left": seconds_left,
            },
        )

    try:
        await service.verify_code_only(user_id, code)
        await rate_limiter.reset(rl_key)
        request.session["code_verified"] = True
        return RedirectResponse(url=request.url_for("admin.auth.reset_password_page"), status_code=302)

    except Exception:
        await rate_limiter.increment(rl_key, settings.OTP_LOCKOUT_TTL)
        remaining = await rate_limiter.remaining(rl_key, settings.OTP_MAX_ATTEMPTS)
        error_msg = "Неверный код. Попробуйте еще раз."
        if remaining <= 2:
            error_msg = f"Неверный код. Осталось попыток: {remaining}."

        return templates.TemplateResponse(
            "auth/verify-code.html",
            {
                "request": request,
                "email": email,
                "error_msg": error_msg,
                "seconds_left": seconds_left,
            },
        )


@router.get("/reset-password", response_class=HTMLResponse, name="admin.auth.reset_password_page")
async def reset_password_page(request: Request):
    if not request.session.get("code_verified") or not request.session.get("reset_user_id"):
        return RedirectResponse(url=request.url_for("admin.auth.forgot_password_page"), status_code=302)

    return templates.TemplateResponse("auth/reset-password.html", {"request": request})


@router.post("/reset-password", name="admin.auth.reset_password", dependencies=[Depends(validate_csrf)])
async def reset_password(
    request: Request,
    password: str = Form(...),
    password_confirm: str = Form(...),
    service: AuthService = Depends(get_service),
):
    user_id = request.session.get("reset_user_id")
    if not user_id or not request.session.get("code_verified"):
        return RedirectResponse(url=request.url_for("admin.auth.forgot_password_page"), status_code=302)

    try:
        ResetPasswordSchema(password=password, password_confirm=password_confirm)
    except Exception as exc:
        error_messages = []
        if hasattr(exc, "errors"):
            for err in exc.errors():
                error_messages.append(err.get("msg", str(err)))
        else:
            error_messages.append(str(exc))
        return templates.TemplateResponse(
            "auth/reset-password.html",
            {
                "request": request,
                "error_msg": "; ".join(error_messages),
            },
        )

    try:
        await service.reset_password_final(user_id, password)
        request.session.clear()
        return templates.TemplateResponse(
            "auth/sign-in.html",
            {
                "request": request,
                "success_msg": "Пароль успешно изменен. Войдите в систему.",
            },
        )
    except Exception as exc:
        logger.error("Password reset failed", error=str(exc))
        return templates.TemplateResponse(
            "auth/reset-password.html",
            {
                "request": request,
                "error_msg": "Произошла ошибка при смене пароля",
            },
        )


@router.get("/verify-email", response_class=HTMLResponse, name="admin.auth.verify_email_page")
async def verify_email_page(
    request: Request,
    background_tasks: BackgroundTasks,
    service: AuthService = Depends(get_service),
):
    user_id = request.session.get("verify_email_user_id")
    email = request.session.get("verify_email_address")
    if not user_id or not email:
        return RedirectResponse(url=request.url_for("admin.auth.register_page"), status_code=302)

    info_msg = None
    if request.session.pop("verify_email_needs_resend", None):
        user_repo = UserRepository(service.db)
        user = await user_repo.find(user_id)
        if user:
            success, _, retry_after = await service.send_email_verification(user, background_tasks)
            if success:
                request.session["verify_email_retry_at"] = int(time.time()) + retry_after
                info_msg = "Код подтверждения отправлен на вашу почту"

    retry_at = request.session.get("verify_email_retry_at", 0)
    seconds_left = max(0, retry_at - int(time.time()))

    return templates.TemplateResponse(
        "auth/verify-email-registration.html",
        {
            "request": request,
            "email": email,
            "seconds_left": seconds_left,
            "info_msg": info_msg,
        },
    )


@router.post("/verify-email", name="admin.auth.verify_email", dependencies=[Depends(validate_csrf)])
async def verify_email(
    request: Request,
    code: str = Form(...),
    service: AuthService = Depends(get_service),
):
    user_id = request.session.get("verify_email_user_id")
    email = request.session.get("verify_email_address")
    retry_at = request.session.get("verify_email_retry_at", 0)
    seconds_left = max(0, retry_at - int(time.time()))

    if not user_id or not email:
        return RedirectResponse(url=request.url_for("admin.auth.register_page"), status_code=302)

    rl_key = f"verify_email_attempts:{user_id}"
    if await rate_limiter.is_limited(rl_key, settings.OTP_MAX_ATTEMPTS, settings.OTP_LOCKOUT_TTL):
        return templates.TemplateResponse(
            "auth/verify-email-registration.html",
            {
                "request": request,
                "email": email,
                "error_msg": "Слишком много попыток. Запросите новый код.",
                "seconds_left": seconds_left,
            },
        )

    try:
        await service.verify_email_code(user_id, code)
        await rate_limiter.reset(rl_key)

        user_repo = UserRepository(service.db)
        user = await user_repo.find(user_id)
        _set_authenticated_session(request, user)

        return RedirectResponse(url=request.url_for("admin.dashboard.index"), status_code=302)

    except Exception:
        await rate_limiter.increment(rl_key, settings.OTP_LOCKOUT_TTL)
        remaining = await rate_limiter.remaining(rl_key, settings.OTP_MAX_ATTEMPTS)
        error_msg = "Неверный код. Попробуйте еще раз."
        if remaining <= 2:
            error_msg = f"Неверный код. Осталось попыток: {remaining}."

        return templates.TemplateResponse(
            "auth/verify-email-registration.html",
            {
                "request": request,
                "email": email,
                "error_msg": error_msg,
                "seconds_left": seconds_left,
            },
        )


@router.post("/resend-verify-email", name="admin.auth.resend_verify_email", dependencies=[Depends(validate_csrf)])
async def resend_verify_email(
    request: Request,
    background_tasks: BackgroundTasks,
    service: AuthService = Depends(get_service),
):
    user_id = request.session.get("verify_email_user_id")
    email = request.session.get("verify_email_address")
    if not user_id or not email:
        return RedirectResponse(url=request.url_for("admin.auth.register_page"), status_code=302)

    user_repo = UserRepository(service.db)
    user = await user_repo.find(user_id)

    if user:
        success, _, retry_after = await service.send_email_verification(user, background_tasks)
        if success:
            request.session["verify_email_retry_at"] = int(time.time()) + retry_after

    return RedirectResponse(url=request.url_for("admin.auth.verify_email_page"), status_code=302)
