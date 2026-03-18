from app.models.enums import AchievementLevel
from app.config import settings


def calculate_points(level: str, category: str) -> int:
    level_points = {
        AchievementLevel.SCHOOL.value: settings.POINTS_SCHOOL,
        AchievementLevel.MUNICIPAL.value: settings.POINTS_MUNICIPAL,
        AchievementLevel.REGIONAL.value: settings.POINTS_REGIONAL,
        AchievementLevel.FEDERAL.value: settings.POINTS_FEDERAL,
        AchievementLevel.INTERNATIONAL.value: settings.POINTS_INTERNATIONAL,
    }

    return level_points.get(level, settings.POINTS_SCHOOL)
