"""Symmetric encryption for support chat messages and attachments.

Uses Fernet (AES-128-CBC + HMAC-SHA256) keyed off SUPPORT_ENCRYPTION_KEY.
If the env var is missing in production, the helpers fall back to plain
text and log a warning so deploys do not silently lose old data; in
production a key MUST be set.
"""
from __future__ import annotations

import base64
import hashlib
import os
from typing import Optional

import structlog
from cryptography.fernet import Fernet, InvalidToken

logger = structlog.get_logger()

ENC_PREFIX = "enc:v1:"  # text marker so we know which rows are encrypted


def _derive_key() -> Optional[bytes]:
    raw = os.getenv("SUPPORT_ENCRYPTION_KEY") or os.getenv("APP_SECRET_KEY")
    if not raw:
        return None
    raw_bytes = raw.encode("utf-8")
    # Fernet wants a 32-byte urlsafe base64 key. Hash whatever is provided
    # so any string of any length works.
    digest = hashlib.sha256(raw_bytes).digest()
    return base64.urlsafe_b64encode(digest)


_KEY = _derive_key()
_FERNET = Fernet(_KEY) if _KEY else None

if _FERNET is None:
    logger.warning(
        "support_encryption_disabled",
        reason="SUPPORT_ENCRYPTION_KEY not set; messages and attachments will be stored in plaintext",
    )


def is_enabled() -> bool:
    return _FERNET is not None


def encrypt_text(value: Optional[str]) -> Optional[str]:
    if not value:
        return value
    if _FERNET is None:
        return value
    token = _FERNET.encrypt(value.encode("utf-8"))
    return ENC_PREFIX + token.decode("ascii")


def decrypt_text(value: Optional[str]) -> Optional[str]:
    if not value:
        return value
    if not value.startswith(ENC_PREFIX):
        return value  # legacy plaintext
    if _FERNET is None:
        # Stored encrypted but key gone — return placeholder to avoid leaking ciphertext
        return ""
    try:
        return _FERNET.decrypt(value[len(ENC_PREFIX) :].encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return ""


def encrypt_bytes(data: bytes) -> bytes:
    if _FERNET is None or not data:
        return data
    return _FERNET.encrypt(data)


def decrypt_bytes(data: bytes) -> bytes:
    if _FERNET is None or not data:
        return data
    try:
        return _FERNET.decrypt(data)
    except InvalidToken:
        # Legacy file written before encryption was enabled — pass through
        return data
