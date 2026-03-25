from app.models.enums import AchievementLevel, AchievementResult
from app.config import settings


def _build_lookup(enum_cls, mapping: dict) -> dict[str, int]:
    """Build a lookup that accepts both .name ('SCHOOL') and .value ('Школьный')."""
    result = {}
    for member, points in mapping.items():
        result[member.name] = points
        result[member.value] = points
    return result


_LEVEL_POINTS = None
_RESULT_MULTIPLIERS = None


def _get_level_points():
    global _LEVEL_POINTS
    if _LEVEL_POINTS is None:
        _LEVEL_POINTS = _build_lookup(AchievementLevel, {
            AchievementLevel.SCHOOL: settings.POINTS_SCHOOL,
            AchievementLevel.MUNICIPAL: settings.POINTS_MUNICIPAL,
            AchievementLevel.REGIONAL: settings.POINTS_REGIONAL,
            AchievementLevel.FEDERAL: settings.POINTS_FEDERAL,
            AchievementLevel.INTERNATIONAL: settings.POINTS_INTERNATIONAL,
        })
    return _LEVEL_POINTS


def _get_result_multipliers():
    global _RESULT_MULTIPLIERS
    if _RESULT_MULTIPLIERS is None:
        _RESULT_MULTIPLIERS = _build_lookup(AchievementResult, {
            AchievementResult.PARTICIPANT: settings.RESULT_MULTIPLIER_PARTICIPANT,
            AchievementResult.PRIZEWINNER: settings.RESULT_MULTIPLIER_PRIZEWINNER,
            AchievementResult.WINNER: settings.RESULT_MULTIPLIER_WINNER,
        })
    return _RESULT_MULTIPLIERS


def calculate_points(level: str, category: str, result: str | None = None) -> int:
    """Calculate achievement points.

    Formula: points = level_base × (result_multiplier / 100)

    Accepts both DB name format ('REGIONAL') and value format ('Региональный').
    """
    base = _get_level_points().get(level, settings.POINTS_SCHOOL)
    multiplier = _get_result_multipliers().get(result, settings.RESULT_MULTIPLIER_PARTICIPANT)

    return base * multiplier // 100
