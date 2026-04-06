from datetime import datetime, timedelta, timezone
import sys
import types

sys.modules.setdefault("dotenv", types.SimpleNamespace(load_dotenv=lambda *args, **kwargs: None))

from app.utils.support_sessions import (
    DEFAULT_SESSION_DURATION,
    calculate_session_expiration,
    normalize_session_duration,
)


def test_normalize_session_duration_uses_default_for_unknown_values():
    assert normalize_session_duration(None) == DEFAULT_SESSION_DURATION
    assert normalize_session_duration("unexpected") == DEFAULT_SESSION_DURATION


def test_calculate_session_expiration_handles_unlimited():
    assert calculate_session_expiration("unlimited") is None


def test_calculate_session_expiration_uses_30_day_month_default():
    now = datetime(2026, 3, 19, 12, 0, tzinfo=timezone.utc)
    expires_at = calculate_session_expiration("month", now=now)
    assert expires_at == now + timedelta(days=30)
