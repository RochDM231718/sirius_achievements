from app.models.enums import UserRole


def _split_csv(value) -> set[str]:
    if not value:
        return set()
    if isinstance(value, (list, tuple, set)):
        return {str(item).strip() for item in value if str(item).strip()}
    return {item.strip() for item in str(value).split(",") if item.strip()}


def is_staff_role(role) -> bool:
    value = role.value if hasattr(role, "value") else str(role)
    return value in {UserRole.MODERATOR.value, UserRole.SUPER_ADMIN.value}


def is_in_zone(staff_user, target_education_level, target_course=None, target_group=None) -> bool:
    if not staff_user or not is_staff_role(getattr(staff_user, "role", "")):
        return False

    if staff_user.role == UserRole.SUPER_ADMIN:
        return True

    moderator_level = getattr(staff_user, "education_level", None)
    if moderator_level is None:
        return True

    if target_education_level is None:
        return False

    staff_value = moderator_level.value if hasattr(moderator_level, "value") else str(moderator_level)
    target_value = (
        target_education_level.value
        if hasattr(target_education_level, "value")
        else str(target_education_level)
    )
    if staff_value != target_value:
        return False

    allowed_courses = _split_csv(getattr(staff_user, "moderator_courses", None))
    if allowed_courses and str(target_course or "") not in allowed_courses:
        return False

    allowed_groups = _split_csv(getattr(staff_user, "moderator_groups", None))
    if allowed_groups and str(target_group or "") not in allowed_groups:
        return False

    return True
