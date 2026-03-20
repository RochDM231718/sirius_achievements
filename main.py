from __future__ import annotations

import asyncio
import os
import secrets
from contextlib import asynccontextmanager, suppress
from urllib.parse import urlparse

import structlog
from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.infrastructure.database import async_session_maker, engine
from app.infrastructure.logger import setup_logging
from app.middlewares.security_headers import SecurityHeadersMiddleware
from app.middlewares.upload_protection import UploadProtectionMiddleware
from app.routers.admin.admin import public_router as admin_common_router
from app.routers.admin.admin import templates
from app.routers.admin.achievements import router as admin_achievements_router
from app.routers.admin.auth import router as admin_auth_router
from app.routers.admin.dashboard import router as admin_dashboard_router
from app.routers.admin.documents import router as admin_documents_router
from app.routers.admin.leaderboard import router as admin_leaderboard_router
from app.routers.admin.moderation import router as admin_moderation_router
from app.routers.admin.moderation_support import router as admin_moderation_support_router
from app.routers.admin.notifications import router as admin_notifications_router
from app.routers.admin.pages import router as admin_pages_router
from app.routers.admin.profile import router as admin_profile_router
from app.routers.admin.support import router as admin_support_router
from app.routers.admin.users import router as admin_users_router
from app.routers.api.auth import router as api_auth_router
from app.security.csrf import get_csrf_token
from app.services.admin.support_maintenance import process_support_ticket_maintenance

load_dotenv()

setup_logging(
    json_logs=settings.ENV == "production",
    log_level="DEBUG" if settings.DEBUG else "INFO",
)
logger = structlog.get_logger()


async def _support_maintenance_loop():
    while True:
        try:
            async with async_session_maker() as db:
                stats = await process_support_ticket_maintenance(db)
                if stats["closed"] or stats["archived"]:
                    logger.info("support_ticket_maintenance_completed", **stats)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("support_ticket_maintenance_failed", error=str(exc))
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_support_maintenance_loop())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
        await engine.dispose()
        logger.info("Database engine disposed. Graceful shutdown complete.")


app = FastAPI(root_path=os.getenv("ROOT_PATH", ""), lifespan=lifespan)


class CSRFContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        get_csrf_token(request)
        response = await call_next(request)
        return response


app.mount("/static", StaticFiles(directory="static"), name="static")

ENV = os.getenv("ENV", "development")
IS_DEBUG = str(os.getenv("DEBUG", "False")).lower() in ("true", "1", "yes")

if ENV == "production":
    IS_DEBUG = False

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY or SECRET_KEY == "supersecretkey123":
    if ENV == "production":
        raise ValueError("Критическая ошибка: не установлен безопасный SECRET_KEY.")
    logger.warning("SECRET_KEY не установлен, используется временный ключ разработки.")
    SECRET_KEY = secrets.token_urlsafe(32)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(UploadProtectionMiddleware)
app.add_middleware(CSRFContextMiddleware)
app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    https_only=ENV == "production",
    same_site="lax",
    max_age=settings.SESSION_MAX_AGE,
)

ALLOWED_HOSTS = [host.strip() for host in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if host.strip()]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)

app.include_router(admin_common_router)
app.include_router(admin_auth_router)
app.include_router(admin_dashboard_router)
app.include_router(admin_users_router)
app.include_router(admin_profile_router)
app.include_router(admin_achievements_router)
app.include_router(admin_moderation_router)
app.include_router(admin_documents_router)
app.include_router(admin_notifications_router)
app.include_router(admin_leaderboard_router)
app.include_router(admin_pages_router)
app.include_router(admin_support_router)
app.include_router(admin_moderation_support_router)
app.include_router(api_auth_router)


def _origin_allowed(origin: str | None, host_header: str | None) -> bool:
    if not origin:
        return True

    parsed = urlparse(origin)
    origin_host = parsed.hostname
    if not origin_host:
        return False

    allowed_hosts = {item.split(":")[0] for item in ALLOWED_HOSTS}
    if "*" in allowed_hosts or origin_host in allowed_hosts:
        return True

    if host_header:
        request_host = host_header.split(":")[0]
        if origin_host == request_host:
            return True

    return False


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if 300 <= exc.status_code < 400:
        location = exc.headers.get("Location") if exc.headers else None
        if location:
            return RedirectResponse(url=location, status_code=exc.status_code)
    if exc.status_code == 404:
        return templates.TemplateResponse("errors/404.html", {"request": request, "user": None}, status_code=404)
    if exc.status_code == 403:
        return templates.TemplateResponse(
            "errors/403.html",
            {"request": request, "user": None, "detail": exc.detail},
            status_code=403,
        )
    return templates.TemplateResponse(
        "errors/500.html",
        {"request": request, "user": None, "error": exc.detail},
        status_code=exc.status_code,
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("global_error", error=str(exc), exc_info=True)
    return templates.TemplateResponse(
        "errors/500.html",
        {"request": request, "user": None, "error": "Внутренняя ошибка сервера"},
        status_code=500,
    )


@app.get("/health", include_in_schema=False)
async def health_check():
    try:
        async with async_session_maker() as session:
            from sqlalchemy import text

            await session.execute(text("SELECT 1"))
        return JSONResponse({"status": "ok", "database": "connected"})
    except Exception:
        return JSONResponse({"status": "error", "database": "unavailable"}, status_code=503)


@app.websocket("/ws/notifications")
async def ws_notifications(websocket: WebSocket):
    from app.models.enums import UserStatus
    from app.models.user import Users
    from app.services.ws_manager import ws_manager

    if not _origin_allowed(websocket.headers.get("origin"), websocket.headers.get("host")):
        await websocket.close(code=1008)
        return

    session = websocket.session or {}
    user_id = session.get("auth_id")
    session_version = session.get("auth_session_version")
    if not user_id or session_version is None:
        await websocket.close(code=4001)
        return

    async with async_session_maker() as db:
        user = await db.get(Users, int(user_id))
        if (
            not user
            or user.status == UserStatus.REJECTED
            or not user.is_active
            or int(session_version) != int(user.session_version or 0)
        ):
            await websocket.close(code=4001)
            return

    await ws_manager.connect(int(user_id), websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(int(user_id), websocket)


@app.get("/")
async def root(request: Request):
    return RedirectResponse(url=request.url_for("admin.auth.login_page"))


@app.get("/admin")
async def admin_root(request: Request):
    return RedirectResponse(url=request.url_for("admin.dashboard.index"))
