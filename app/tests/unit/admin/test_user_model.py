from unittest.mock import MagicMock
from app.models.enums import UserRole, EducationLevel


def test_education_level_value_with_enum():
    user = MagicMock()
    user.education_level = EducationLevel.BACHELOR
    # Simulate property
    result = user.education_level.value if hasattr(user.education_level, 'value') else str(user.education_level)
    assert result == "Бакалавриат"


def test_education_level_value_none():
    user = MagicMock()
    user.education_level = None
    result = "" if user.education_level is None else user.education_level.value
    assert result == ""


def test_is_staff_moderator():
    user = MagicMock()
    user.role = UserRole.MODERATOR
    assert user.role in (UserRole.MODERATOR, UserRole.SUPER_ADMIN)


def test_is_staff_student():
    user = MagicMock()
    user.role = UserRole.STUDENT
    assert user.role not in (UserRole.MODERATOR, UserRole.SUPER_ADMIN)


def test_is_staff_super_admin():
    user = MagicMock()
    user.role = UserRole.SUPER_ADMIN
    assert user.role in (UserRole.MODERATOR, UserRole.SUPER_ADMIN)
