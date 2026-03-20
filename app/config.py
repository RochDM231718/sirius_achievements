import os
from dotenv import load_dotenv

load_dotenv()


def _env_bool(name: str, default: bool = False) -> bool:
    return str(os.getenv(name, str(default))).strip().lower() in {"true", "1", "yes", "on"}


class Settings:
    # ── Environment ──
    ENV: str = os.getenv("ENV", "development")
    DEBUG: bool = _env_bool("DEBUG", False)

    # ── Database ──
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: str = os.getenv("DB_PORT", "5432")
    DB_NAME: str = os.getenv("DB_NAME", "sirius")
    DB_USERNAME: str = os.getenv("DB_USERNAME", "postgres")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")

    # ── Redis ──
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    # ── Session ──
    SESSION_MAX_AGE: int = int(os.getenv("SESSION_MAX_AGE", "86400"))

    # ── File upload limits (bytes) ──
    MAX_AVATAR_SIZE: int = int(os.getenv("MAX_AVATAR_SIZE", str(2 * 1024 * 1024)))
    MAX_DOC_SIZE: int = int(os.getenv("MAX_DOC_SIZE", str(10 * 1024 * 1024)))
    MAX_SUPPORT_FILE_SIZE: int = int(os.getenv("MAX_SUPPORT_FILE_SIZE", str(5 * 1024 * 1024)))

    # ── Upload directories ──
    UPLOAD_DIR_AVATARS: str = "static/uploads/avatars"
    UPLOAD_DIR_ACHIEVEMENTS: str = "static/uploads/achievements"
    UPLOAD_DIR_SUPPORT: str = "static/uploads/support"

    # ── Rate limiting ──
    LOGIN_MAX_ATTEMPTS: int = int(os.getenv("LOGIN_MAX_ATTEMPTS", "5"))
    LOGIN_LOCKOUT_TTL: int = int(os.getenv("LOGIN_LOCKOUT_TTL", "900"))

    API_LOGIN_MAX_ATTEMPTS: int = int(os.getenv("API_LOGIN_MAX_ATTEMPTS", "10"))
    API_LOGIN_LOCKOUT_TTL: int = int(os.getenv("API_LOGIN_LOCKOUT_TTL", "900"))

    API_REFRESH_MAX_ATTEMPTS: int = int(os.getenv("API_REFRESH_MAX_ATTEMPTS", "20"))
    API_REFRESH_LOCKOUT_TTL: int = int(os.getenv("API_REFRESH_LOCKOUT_TTL", "900"))

    FORGOT_PWD_MAX_ATTEMPTS: int = int(os.getenv("FORGOT_PWD_MAX_ATTEMPTS", "5"))
    FORGOT_PWD_LOCKOUT_TTL: int = int(os.getenv("FORGOT_PWD_LOCKOUT_TTL", "900"))

    OTP_MAX_ATTEMPTS: int = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
    OTP_LOCKOUT_TTL: int = int(os.getenv("OTP_LOCKOUT_TTL", "900"))

    UPLOAD_MAX_PER_HOUR: int = int(os.getenv("UPLOAD_MAX_PER_HOUR", "20"))
    UPLOAD_RATE_TTL: int = int(os.getenv("UPLOAD_RATE_TTL", "3600"))

    # ── Pagination ──
    ITEMS_PER_PAGE: int = int(os.getenv("ITEMS_PER_PAGE", "10"))
    SUPPORT_ITEMS_PER_PAGE: int = int(os.getenv("SUPPORT_ITEMS_PER_PAGE", "20"))
    SUPPORT_SESSION_DEFAULT_DAYS: int = int(os.getenv("SUPPORT_SESSION_DEFAULT_DAYS", "30"))
    SUPPORT_SESSION_DAY_DAYS: int = int(os.getenv("SUPPORT_SESSION_DAY_DAYS", "1"))
    SUPPORT_SESSION_WEEK_DAYS: int = int(os.getenv("SUPPORT_SESSION_WEEK_DAYS", "7"))
    SUPPORT_SESSION_MONTH_DAYS: int = int(os.getenv("SUPPORT_SESSION_MONTH_DAYS", "30"))
    SUPPORT_ARCHIVE_AFTER_DAYS: int = int(os.getenv("SUPPORT_ARCHIVE_AFTER_DAYS", "90"))

    # ── Points per achievement level ──
    POINTS_SCHOOL: int = int(os.getenv("POINTS_SCHOOL", "10"))
    POINTS_MUNICIPAL: int = int(os.getenv("POINTS_MUNICIPAL", "20"))
    POINTS_REGIONAL: int = int(os.getenv("POINTS_REGIONAL", "40"))
    POINTS_FEDERAL: int = int(os.getenv("POINTS_FEDERAL", "75"))
    POINTS_INTERNATIONAL: int = int(os.getenv("POINTS_INTERNATIONAL", "100"))

    # ── Mail ──
    MAIL_HOST: str = os.getenv("MAIL_HOST", "smtp.yandex.ru")
    MAIL_PORT: int = int(os.getenv("MAIL_PORT", "465"))
    MAIL_USERNAME: str = os.getenv("MAIL_USERNAME", "")
    MAIL_PASSWORD: str = os.getenv("MAIL_PASSWORD", "")
    MAIL_FROM: str = os.getenv("MAIL_FROM", os.getenv("MAIL_USERNAME", ""))

    # ── Yandex GPT ──
    YANDEX_API_KEY: str = os.getenv("YANDEX_API_KEY", "")
    YANDEX_FOLDER_ID: str = os.getenv("YANDEX_FOLDER_ID", "")
    RESUME_EXTERNAL_AI_ENABLED: bool = _env_bool("RESUME_EXTERNAL_AI_ENABLED", False)
    RESUME_OCR_MODEL_DOWNLOAD_ENABLED: bool = _env_bool("RESUME_OCR_MODEL_DOWNLOAD_ENABLED", False)


settings = Settings()
