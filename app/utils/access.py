from app.models.enums import UserRole


def is_staff_role(role) -> bool:
    value = role.value if hasattr(role, "value") else str(role)
    return value in {UserRole.MODERATOR.value, UserRole.SUPER_ADMIN.value}


def is_in_zone(staff_user, target_education_level) -> bool:
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
    return staff_value == target_value
