import smtplib
import ssl
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import structlog
from fastapi import BackgroundTasks
from jinja2 import Environment, FileSystemLoader
from sqlalchemy import func, select

from app.config import settings
from app.infrastructure.jwt_handler import create_access_token, create_refresh_token, verify_token
from app.models.enums import UserRole, UserStatus, UserTokenType
from app.models.user import Users
from app.schemas.admin.auth import UserRegister
from app.schemas.admin.user_tokens import UserTokenCreate
from app.services.admin.user_token_service import UserTokenService
from app.utils.password import hash_password, verify_password as _verify_password
from app.utils.rate_limiter import rate_limiter

logger = structlog.get_logger()
_email_env = Environment(loader=FileSystemLoader("templates"), autoescape=True)


class UserBlockedException(Exception):
    def __init__(self, message="Слишком много попыток. Аккаунт временно заблокирован"):
        self.message = message
        super().__init__(self.message)


class AuthService:
    def __init__(self, repository, user_token_service: UserTokenService):
        self.repository = repository
        self.db = repository.db
        self.user_token_service = user_token_service

    @staticmethod
    def _next_version(current_value: int | None) -> int:
        return int(current_value or 0) + 1

    def _api_token_payload(self, user: Users) -> dict:
        return {
            "sub": str(user.id),
            "role": user.role.value,
            "av": int(user.api_access_version or 1),
            "rv": int(user.api_refresh_version or 1),
        }

    def _build_api_tokens(self, user: Users) -> dict:
        token_data = self._api_token_payload(user)
        access_token = create_access_token(
            {
                "sub": token_data["sub"],
                "role": token_data["role"],
                "av": token_data["av"],
            }
        )
        refresh_token = create_refresh_token(
            {
                "sub": token_data["sub"],
                "role": token_data["role"],
                "rv": token_data["rv"],
            }
        )
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
            },
        }

    async def revoke_all_auth_state(self, user: Users):
        user.session_version = self._next_version(user.session_version)
        user.api_access_version = self._next_version(user.api_access_version)
        user.api_refresh_version = self._next_version(user.api_refresh_version)
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def authenticate(self, email: str, password: str, role: str = None, ip: str = "unknown"):
        email = email.strip().lower()
        rl_key = f"login_attempts:{ip}:{email}"

        attempt_count = int(await rate_limiter.increment(rl_key, settings.LOGIN_LOCKOUT_TTL))
        if attempt_count > settings.LOGIN_MAX_ATTEMPTS:
            raise UserBlockedException("Слишком много попыток. Повторите через 15 мин.")

        user = await self.repository.get_by_email(email)
        if not user:
            hash_password(password)
            logger.warning("Login failed: user not found", email=email)
            return None

        if user.status == UserStatus.REJECTED:
            logger.warning("Login failed: user rejected", email=email)
            return None

        if not self.verify_password(password, user.hashed_password):
            logger.warning("Login failed: wrong password", email=email)
            return None

        await rate_limiter.reset(rl_key)

        logger.info("User logged in", user_id=user.id, email=user.email)
        return user

    async def register_user(self, data: UserRegister) -> Users | None:
        data.email = data.email.strip().lower()
        stmt = select(Users).where(func.lower(Users.email) == data.email)
        result = await self.db.execute(stmt)
        existing_user = result.scalars().first()
        if existing_user and existing_user.status == UserStatus.DELETED:
            await self._release_deleted_email(existing_user, data.email)
        elif existing_user:
            # Return None on duplicate to avoid user enumeration.
            # Caller should always respond with the same generic success.
            logger.info("Registration attempt for existing email", email=data.email)
            return None

        hashed_pw = hash_password(data.password)

        new_user = Users(
            first_name=data.first_name,
            last_name=data.last_name,
            email=data.email,
            education_level=data.education_level,
            course=data.course,
            study_group=data.group,
            hashed_password=hashed_pw,
            role=UserRole.GUEST,
            status=UserStatus.PENDING,
            is_active=False,
        )

        self.db.add(new_user)
        await self.db.commit()
        await self.db.refresh(new_user)

        logger.info("New user registered", email=data.email)
        return new_user

    async def _release_deleted_email(self, user: Users, original_email: str) -> None:
        timestamp = int(datetime.now(timezone.utc).timestamp())
        user.email = f"deleted+{user.id}+{timestamp}-{original_email}"
        user.api_access_version = self._next_version(user.api_access_version)
        user.api_refresh_version = self._next_version(user.api_refresh_version)
        self.db.add(user)
        await self.db.flush()

    async def api_authenticate(self, email: str, password: str, role: str = "User", ip: str = "unknown"):
        user = await self.authenticate(email, password, role, ip)
        if not user or not user.is_active or user.status == UserStatus.REJECTED:
            return None

        return self._build_api_tokens(user)

    async def api_refresh_token(self, refresh_token: str):
        payload = verify_token(refresh_token, refresh=True)
        if not payload or payload.get("type") != "refresh":
            return None

        user_id = payload.get("sub")
        refresh_version = payload.get("rv")
        if not user_id or refresh_version is None:
            return None

        stmt = select(Users).filter(Users.id == int(user_id))
        result = await self.db.execute(stmt)
        user = result.scalars().first()

        if not user or user.status == UserStatus.REJECTED or not user.is_active:
            logger.warning("Attempt to refresh token for inactive/blocked user", user_id=user_id)
            return None

        if int(refresh_version) != int(user.api_refresh_version or 0):
            logger.warning("Rejected rotated refresh token", user_id=user_id)
            return None

        user.api_refresh_version = self._next_version(user.api_refresh_version)
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)

        result = self._build_api_tokens(user)
        return {
            "access_token": result["access_token"],
            "refresh_token": result["refresh_token"],
            "token_type": result["token_type"],
        }

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return _verify_password(plain_password, hashed_password)

    @staticmethod
    def _sanitize_email(email: str) -> str:
        sanitized = email.strip().replace("\r", "").replace("\n", "").replace("\0", "")
        if sanitized != email.strip():
            raise ValueError("Invalid email address")
        return sanitized

    def _send_mail_task(self, to_email: str, subject: str, body_text: str, body_html: str):
        to_email = self._sanitize_email(to_email)
        smtp_host = settings.MAIL_HOST
        smtp_port = settings.MAIL_PORT
        smtp_user = settings.MAIL_USERNAME
        smtp_pass = settings.MAIL_PASSWORD
        mail_from = settings.MAIL_FROM or smtp_user

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = mail_from
        msg["To"] = to_email

        msg.attach(MIMEText(body_text, "plain"))
        msg.attach(MIMEText(body_html, "html"))

        try:
            if smtp_port == 465:
                server = smtplib.SMTP_SSL(smtp_host, smtp_port)
            else:
                server = smtplib.SMTP(smtp_host, smtp_port)
                server.starttls()

            server.login(smtp_user, smtp_pass)
            server.sendmail(mail_from, to_email, msg.as_string())
            server.quit()

            logger.info("Email sent successfully", smtp_host=smtp_host, to=to_email)

        except Exception as exc:
            logger.error("Failed to send email via SMTP", error=str(exc))

    def _maybe_log_dev_mail_code(self, *, flow: str, email: str, code: str):
        if settings.ENV == "production" or not settings.MAIL_DEV_LOG_CODES:
            return

        logger.warning(
            "Development mail code fallback",
            flow=flow,
            email=email,
            code=code,
        )

    async def forgot_password(self, email: str, background_tasks: BackgroundTasks = None):
        _GENERIC_MSG = "Если аккаунт существует, код будет отправлен"
        email = email.strip().lower()
        user = await self.repository.get_by_email(email)
        if not user:
            return True, _GENERIC_MSG, 60, None

        retry_after = await self.user_token_service.get_time_until_next_retry(user.id)
        if retry_after > 0:
            return False, f"Повторная отправка возможна через {retry_after} сек.", retry_after, user.id

        user_token = await self.user_token_service.create(
            UserTokenCreate(user_id=user.id, type=UserTokenType.RESET_PASSWORD)
        )
        self._maybe_log_dev_mail_code(flow="reset_password", email=user.email, code=user_token.token)

        subject = "Разовый код"
        ctx = {"email": user.email, "code": user_token.token}
        text_content = _email_env.get_template("emails/reset_password.txt").render(ctx)
        html_content = _email_env.get_template("emails/reset_password.html").render(ctx)

        if background_tasks:
            background_tasks.add_task(
                self._send_mail_task,
                to_email=user.email,
                subject=subject,
                body_text=text_content,
                body_html=html_content,
            )
        else:
            self._send_mail_task(user.email, subject, text_content, html_content)

        return True, _GENERIC_MSG, 60, user.id

    async def send_email_verification(self, user: Users, background_tasks: BackgroundTasks = None):
        retry_after = await self.user_token_service.get_time_until_next_retry_by_type(
            user.id, UserTokenType.VERIFY_EMAIL
        )
        if retry_after > 0:
            return False, f"Повторная отправка возможна через {retry_after} сек.", retry_after

        user_token = await self.user_token_service.create(
            UserTokenCreate(user_id=user.id, type=UserTokenType.VERIFY_EMAIL)
        )
        self._maybe_log_dev_mail_code(flow="verify_email", email=user.email, code=user_token.token)

        subject = "Подтверждение email"
        ctx = {"first_name": user.first_name, "code": user_token.token}
        text_content = _email_env.get_template("emails/verify_email.txt").render(ctx)
        html_content = _email_env.get_template("emails/verify_email.html").render(ctx)

        if background_tasks:
            background_tasks.add_task(
                self._send_mail_task,
                to_email=user.email,
                subject=subject,
                body_text=text_content,
                body_html=html_content,
            )
        else:
            self._send_mail_task(user.email, subject, text_content, html_content)

        return True, "Код отправлен", 60

    async def verify_email_code(self, user_id: int, code: str) -> bool:
        stmt = select(Users).where(Users.id == user_id)
        result = await self.db.execute(stmt)
        user = result.scalars().first()
        if not user:
            raise Exception("Пользователь не найден")

        await self.user_token_service.consume_verify_email_token(user_id, code)

        user.is_active = True
        self.db.add(user)
        await self.db.commit()

        return True

    async def verify_code_only(self, user_id: int | None, code: str) -> bool:
        if not user_id:
            raise Exception("Неверный код подтверждения")

        user = await self.repository.find(user_id)
        if not user:
            raise Exception("Пользователь не найден")

        await self.user_token_service.consume_reset_password_token(user.id, code)
        return True

    async def reset_password_final(self, user_id: int | None, new_password: str):
        if not user_id:
            raise Exception("Пользователь не найден")

        user = await self.repository.find(user_id)
        if not user:
            raise Exception("Пользователь не найден")

        user.hashed_password = hash_password(new_password)
        user.session_version = self._next_version(user.session_version)
        user.api_access_version = self._next_version(user.api_access_version)
        user.api_refresh_version = self._next_version(user.api_refresh_version)
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user
