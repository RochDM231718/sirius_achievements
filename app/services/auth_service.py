import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from jinja2 import Environment, FileSystemLoader
from sqlalchemy import select, func
from fastapi import BackgroundTasks
from passlib.context import CryptContext
from app.models.enums import UserTokenType, UserRole, UserStatus
from app.models.user import Users
from app.schemas.admin.user_tokens import UserTokenCreate
from app.schemas.admin.auth import UserRegister
from app.services.admin.user_token_service import UserTokenService
from app.infrastructure.jwt_handler import create_access_token, create_refresh_token, verify_token
from app.config import settings
from app.utils.rate_limiter import rate_limiter
import structlog

logger = structlog.get_logger()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
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

    async def authenticate(self, email: str, password: str, role: str = None, ip: str = "unknown"):
        email = email.strip().lower()
        rl_key = f"login_attempts:{ip}:{email}"

        if await rate_limiter.is_limited(rl_key, settings.LOGIN_MAX_ATTEMPTS, settings.LOGIN_LOCKOUT_TTL):
            raise UserBlockedException("Слишком много попыток. Повторите через 15 мин.")

        user = await self.repository.get_by_email(email)
        if not user:
            pwd_context.hash(password)
            logger.warning("Login failed: user not found", email=email)
            await self._record_failed_attempt(rl_key)
            return None

        if user.status == UserStatus.REJECTED:
            logger.warning("Login failed: user rejected", email=email)
            return None

        if not self.verify_password(password, user.hashed_password):
            logger.warning("Login failed: wrong password", email=email)
            await self._record_failed_attempt(rl_key)
            return None

        await rate_limiter.reset(rl_key)

        logger.info("User logged in", user_id=user.id, email=user.email)
        return user

    async def _record_failed_attempt(self, key: str):
        await rate_limiter.increment(key, settings.LOGIN_LOCKOUT_TTL)

    async def register_user(self, data: UserRegister) -> Users:
        data.email = data.email.strip().lower()
        stmt = select(Users).where(func.lower(Users.email) == data.email)
        result = await self.db.execute(stmt)
        if result.scalars().first():
            raise Exception("Пользователь с таким email уже существует")

        hashed_pw = pwd_context.hash(data.password)

        new_user = Users(
            first_name=data.first_name,
            last_name=data.last_name,
            email=data.email,
            education_level=data.education_level,
            course=data.course,
            hashed_password=hashed_pw,
            role=UserRole.GUEST,
            status=UserStatus.PENDING,
            is_active=False
        )

        self.db.add(new_user)
        await self.db.commit()
        await self.db.refresh(new_user)

        logger.info("New user registered", email=data.email)
        return new_user

    async def api_authenticate(self, email: str, password: str, role: str = "User", ip: str = "unknown"):
        user = await self.authenticate(email, password, role, ip)
        if not user:
            return None

        token_data = {"sub": str(user.id), "role": user.role.value}
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name
            }
        }

    async def api_refresh_token(self, refresh_token: str):
        payload = verify_token(refresh_token, refresh=True)
        if not payload or payload.get('type') != "refresh":
            return None

        user_id = payload.get("sub")
        stmt = select(Users).filter(Users.id == int(user_id))
        result = await self.db.execute(stmt)
        user = result.scalars().first()

        if not user or user.status == UserStatus.REJECTED or not user.is_active:
            logger.warning("Attempt to refresh token for inactive/blocked user", user_id=user_id)
            return None

        token_data = {"sub": str(user.id), "role": user.role.value}
        new_access = create_access_token(token_data)

        return {
            "access_token": new_access,
            "token_type": "bearer"
        }

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return pwd_context.verify(plain_password, hashed_password)

    @staticmethod
    def _sanitize_email(email: str) -> str:
        sanitized = email.strip().replace('\r', '').replace('\n', '').replace('\0', '')
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

        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = mail_from
        msg['To'] = to_email

        part1 = MIMEText(body_text, 'plain')
        part2 = MIMEText(body_html, 'html')
        msg.attach(part1)
        msg.attach(part2)

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

        except Exception as e:
            logger.error("Failed to send email via SMTP", error=str(e))

    async def forgot_password(self, email: str, background_tasks: BackgroundTasks = None):
        email = email.strip().lower()
        user = await self.repository.get_by_email(email)
        if not user:
            return True, "Код отправлен (если аккаунт существует)", 60

        retry_after = await self.user_token_service.get_time_until_next_retry(user.id)
        if retry_after > 0:
            return False, f"Повторная отправка возможна через {retry_after} сек.", retry_after

        token_data = UserTokenCreate(
            user_id=user.id,
            type=UserTokenType.RESET_PASSWORD
        )
        user_token = await self.user_token_service.create(token_data)
        code = user_token.token

        subject = "Разовый код"
        ctx = {"email": user.email, "code": code}
        text_content = _email_env.get_template("emails/reset_password.txt").render(ctx)
        html_content = _email_env.get_template("emails/reset_password.html").render(ctx)

        if background_tasks:
            background_tasks.add_task(self._send_mail_task, to_email=user.email, subject=subject,
                                      body_text=text_content, body_html=html_content)
        else:
            self._send_mail_task(user.email, subject, text_content, html_content)

        return True, "Код успешно отправлен", 60

    async def send_email_verification(self, user: Users, background_tasks: BackgroundTasks = None):
        retry_after = await self.user_token_service.get_time_until_next_retry_by_type(
            user.id, UserTokenType.VERIFY_EMAIL
        )
        if retry_after > 0:
            return False, f"Повторная отправка возможна через {retry_after} сек.", retry_after

        token_data = UserTokenCreate(
            user_id=user.id,
            type=UserTokenType.VERIFY_EMAIL
        )
        user_token = await self.user_token_service.create(token_data)
        code = user_token.token

        subject = "Подтверждение email"
        ctx = {"first_name": user.first_name, "code": code}
        text_content = _email_env.get_template("emails/verify_email.txt").render(ctx)
        html_content = _email_env.get_template("emails/verify_email.html").render(ctx)

        if background_tasks:
            background_tasks.add_task(self._send_mail_task, to_email=user.email, subject=subject,
                                      body_text=text_content, body_html=html_content)
        else:
            self._send_mail_task(user.email, subject, text_content, html_content)

        return True, "Код отправлен", 60

    async def verify_email_code(self, user_id: int, code: str) -> bool:
        user_token = await self.user_token_service.getVerifyEmailToken(code)

        if user_token.user_id != user_id:
            raise Exception("Неверный код подтверждения")

        stmt = select(Users).where(Users.id == user_id)
        result = await self.db.execute(stmt)
        user = result.scalars().first()
        if not user:
            raise Exception("Пользователь не найден")

        user.is_active = True
        self.db.add(user)
        await self.db.commit()

        return True

    async def verify_code_only(self, email: str, code: str) -> bool:
        user = await self.repository.get_by_email(email)
        if not user:
            raise Exception("Пользователь не найден")

        user_token = await self.user_token_service.getResetPasswordToken(code)

        if user_token.user_id != user.id:
            raise Exception("Неверный код подтверждения")

        return True

    async def reset_password_final(self, email: str, new_password: str):
        user = await self.repository.get_by_email(email)
        if not user:
            raise Exception("Пользователь не найден")

        user.hashed_password = pwd_context.hash(new_password)
        self.db.add(user)
        await self.db.commit()
        return user