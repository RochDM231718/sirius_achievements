from __future__ import annotations

from app.models.enums import EducationLevel


AVAILABLE_EDUCATION_LEVELS = [EducationLevel.SPECIALIST.value]

COURSE_MAPPING = {
    EducationLevel.SPECIALIST.value: 2,
}

GROUP_MAPPING = {
    EducationLevel.SPECIALIST.value: {
        1: ["ИОП-ИТ-25/1", "ИОП-ИТ-25/2"],
        2: ["ИОП-ИТ-24/1", "ИОП-ИТ-24/2"],
    },
}


def groups_for(level: str | None, course: int | None = None) -> list[str]:
    if not level:
        return []

    by_course = GROUP_MAPPING.get(level, {})
    if course:
        return by_course.get(int(course), [])

    result: list[str] = []
    for groups in by_course.values():
        result.extend(groups)
    return result
