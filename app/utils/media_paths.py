from __future__ import annotations

import mimetypes
from pathlib import Path


STATIC_ROOT = Path("static").resolve()


def resolve_static_path(relative_path: str) -> Path:
    candidate = (STATIC_ROOT / relative_path).resolve()
    if STATIC_ROOT not in candidate.parents and candidate != STATIC_ROOT:
        raise ValueError("Invalid media path")
    return candidate


def guess_media_type(path: str | Path) -> str:
    media_type, _ = mimetypes.guess_type(str(path))
    return media_type or "application/octet-stream"
