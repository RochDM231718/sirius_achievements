from __future__ import annotations

from sqlalchemy import Float, Integer, case, cast, func


def calculate_gpa_bonus(gpa: float | str | None) -> int:
    if gpa in (None, ""):
        return 0

    try:
        gpa_value = float(str(gpa).replace(",", "."))
    except (TypeError, ValueError):
        return 0

    if gpa_value < 3.0:
        return 0
    if gpa_value < 4.0:
        return int((gpa_value - 3.0) * 15)
    if gpa_value < 4.5:
        return 15 + int((gpa_value - 4.0) * 20)
    return 25 + int((gpa_value - 4.5) * 10)


def gpa_bonus_expr(session_gpa_column):
    gpa_text = func.nullif(session_gpa_column, "")
    gpa_value = cast(gpa_text, Float)

    return case(
        (gpa_text.is_(None), 0),
        (gpa_value < 3.0, 0),
        (gpa_value < 4.0, cast(func.floor((gpa_value - 3.0) * 15), Integer)),
        (gpa_value < 4.5, 15 + cast(func.floor((gpa_value - 4.0) * 20), Integer)),
        else_=25 + cast(func.floor((gpa_value - 4.5) * 10), Integer),
    )


def aggregated_gpa_bonus_expr(session_gpa_column, *, include_bonus: bool = True):
    if not include_bonus:
        return 0
    return func.max(gpa_bonus_expr(session_gpa_column))
