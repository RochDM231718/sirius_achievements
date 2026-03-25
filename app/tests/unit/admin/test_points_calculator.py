from app.services.points_calculator import calculate_points
from app.models.enums import AchievementLevel, AchievementCategory, AchievementResult


# ── Winner (1.0x) — full base points ──

def test_school_winner():
    assert calculate_points("SCHOOL", "SPORT", "WINNER") == 10


def test_municipal_winner():
    assert calculate_points("MUNICIPAL", "SCIENCE", "WINNER") == 20


def test_regional_winner():
    assert calculate_points("REGIONAL", "ART", "WINNER") == 40


def test_federal_winner():
    assert calculate_points("FEDERAL", "VOLUNTEERING", "WINNER") == 75


def test_international_winner():
    assert calculate_points("INTERNATIONAL", "OTHER", "WINNER") == 100


# ── Prizewinner (0.75x) ──

def test_school_prizewinner():
    assert calculate_points("SCHOOL", "SPORT", "PRIZEWINNER") == 7


def test_federal_prizewinner():
    assert calculate_points("FEDERAL", "SCIENCE", "PRIZEWINNER") == 56


def test_international_prizewinner():
    assert calculate_points("INTERNATIONAL", "OTHER", "PRIZEWINNER") == 75


# ── Participant (0.5x) ──

def test_school_participant():
    assert calculate_points("SCHOOL", "SPORT", "PARTICIPANT") == 5


def test_federal_participant():
    assert calculate_points("FEDERAL", "VOLUNTEERING", "PARTICIPANT") == 37


def test_international_participant():
    assert calculate_points("INTERNATIONAL", "OTHER", "PARTICIPANT") == 50


# ── No result defaults to participant (0.5x) ──

def test_no_result_defaults_to_participant():
    assert calculate_points("REGIONAL", "ART") == 20
    assert calculate_points("REGIONAL", "ART", None) == 20


# ── Russian value format also works ──

def test_russian_level_values():
    assert calculate_points("Региональный", "Искусство", "Победитель") == 40
    assert calculate_points("Федеральный", "Наука", "Призёр") == 56


# ── Unknown level defaults to school base ──

def test_unknown_level_defaults():
    assert calculate_points("unknown", "any", "WINNER") == 10
    assert calculate_points("unknown", "any") == 5
