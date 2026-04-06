from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.config import settings


DEFAULT_SESSION_DURATION = "month"
VALID_SESSION_DURATIONS = {"day", "week", "month", "unlimited"}


def normalize_session_duration(value: str | None) -> str:
    if value in VALID_SESSION_DURATIONS:
        return value
    return DEFAULT_SESSION_DURATION


def calculate_session_expiration(value: str | None, now: datetime | None = None) -> datetime | None:
    duration = normalize_session_duration(value)
    if duration == "unlimited":
        return None

    current_time = now or datetime.now(timezone.utc)
    days = {
        "day": settings.SUPPORT_SESSION_DAY_DAYS,
        "week": settings.SUPPORT_SESSION_WEEK_DAYS,
        "month": settings.SUPPORT_SESSION_MONTH_DAYS,
    }[duration]
    return current_time + timedelta(days=days)
