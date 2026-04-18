from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.admin.resume_service import ResumeService


class _ScalarResult:
    def __init__(self, items):
        self._items = items

    def all(self):
        return self._items


class _ExecuteResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return _ScalarResult(self._items)


@pytest.mark.asyncio
async def test_generate_resume_refreshes_user_after_commit(monkeypatch):
    user = SimpleNamespace(
        id=1364,
        first_name="Roch",
        last_name="DM",
        resume_text=None,
        resume_generated_at=None,
        education_level=None,
        course=None,
    )
    achievement = SimpleNamespace(
        title="First Place",
        category=None,
        level=None,
        description="Won a regional competition",
        points=50,
        created_at=None,
        file_path="",
    )
    db = SimpleNamespace(
        get=AsyncMock(return_value=user),
        execute=AsyncMock(return_value=_ExecuteResult([achievement])),
        commit=AsyncMock(),
        refresh=AsyncMock(),
        rollback=AsyncMock(),
    )
    service = ResumeService(db)

    monkeypatch.setattr(service, "_is_external_ai_configured", lambda: False)
    monkeypatch.setattr(service, "_generate_local_resume", lambda student_name, user_obj, docs_data: "Generated resume")

    result = await service.generate_resume(user.id, force_regenerate=True, bypass_check=True)

    assert result == {"success": True, "resume": "Generated resume"}
    db.commit.assert_awaited_once()
    db.refresh.assert_awaited_once_with(user)
    db.rollback.assert_not_awaited()
    assert user.resume_text == "Generated resume"
    assert user.resume_generated_at is not None
