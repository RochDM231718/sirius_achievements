from app.services.points_calculator import calculate_points
from app.models.enums import AchievementLevel, AchievementCategory


def test_school_level():
    assert calculate_points(AchievementLevel.SCHOOL.value, AchievementCategory.SPORT.value) == 10


def test_municipal_level():
    assert calculate_points(AchievementLevel.MUNICIPAL.value, AchievementCategory.SCIENCE.value) == 20


def test_regional_level():
    assert calculate_points(AchievementLevel.REGIONAL.value, AchievementCategory.ART.value) == 40


def test_federal_level():
    assert calculate_points(AchievementLevel.FEDERAL.value, AchievementCategory.VOLUNTEERING.value) == 75


def test_international_level():
    assert calculate_points(AchievementLevel.INTERNATIONAL.value, AchievementCategory.OTHER.value) == 100


def test_unknown_level_defaults():
    assert calculate_points("unknown", "any") == 10
