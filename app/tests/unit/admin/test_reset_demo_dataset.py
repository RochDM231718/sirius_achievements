from app.models.enums import AchievementCategory, EducationLevel
from app.seeders.reset_demo_dataset import (
    build_active_user_email,
    build_pending_user_email,
    db_achievement_category,
)


def test_build_active_user_email_uses_valid_demo_domain():
    assert build_active_user_email(EducationLevel.COLLEGE, 1) == "college.student001@example.com"
    assert build_active_user_email(EducationLevel.POSTGRADUATE, 12) == "postgraduate.student012@example.com"


def test_build_pending_user_email_uses_valid_demo_domain():
    assert build_pending_user_email(1) == "registration.request01@example.com"
    assert build_pending_user_email(10) == "registration.request10@example.com"


def test_db_achievement_category_uses_enum_name_for_all_categories():
    assert db_achievement_category(AchievementCategory.HACKATHON) == "HACKATHON"
    assert db_achievement_category(AchievementCategory.OTHER) == "OTHER"
