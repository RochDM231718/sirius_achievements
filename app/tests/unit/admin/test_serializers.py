from types import SimpleNamespace

from app.routers.api.v1.serializers import serialize_user_public


def test_serialize_user_public_includes_resume_text_without_private_fields():
    user = SimpleNamespace(
        id=7,
        first_name="Roch",
        last_name="DM",
        avatar_path="avatars/roch.png",
        education_level=None,
        course=3,
        study_group="B-31",
        session_gpa="4.8",
        resume_text="Краткая AI-сводка профиля",
        email="private@example.com",
        phone_number="+79990000000",
    )

    result = serialize_user_public(user)

    assert result == {
        "id": 7,
        "first_name": "Roch",
        "last_name": "DM",
        "avatar_path": "avatars/roch.png",
        "education_level": None,
        "course": 3,
        "study_group": "B-31",
        "session_gpa": "4.8",
        "resume_text": "Краткая AI-сводка профиля",
    }
    assert "email" not in result
    assert "phone_number" not in result
