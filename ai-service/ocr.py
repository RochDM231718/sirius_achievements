from __future__ import annotations

import logging
import os
import re
import tempfile
from pathlib import Path

import fitz

try:
    import easyocr

    _EASYOCR_AVAILABLE = True
except ImportError:
    easyocr = None  # type: ignore[assignment]
    _EASYOCR_AVAILABLE = False

log = logging.getLogger("ocr")

_ocr_reader = None
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
OCR_TEXT_LIMIT = 6000


def sanitize_text(value: str | None, max_length: int | None = None) -> str:
    if not value:
        return ""

    cleaned = value.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = _CONTROL_CHARS_RE.sub("", cleaned)
    cleaned = "\n".join(line.rstrip() for line in cleaned.split("\n"))
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()

    if max_length and len(cleaned) > max_length:
        shortened = cleaned[:max_length].rstrip()
        last_space = shortened.rfind(" ")
        if last_space > max_length * 0.7:
            shortened = shortened[:last_space].rstrip()
        cleaned = shortened

    return cleaned


def get_ocr_reader():
    global _ocr_reader

    if not _EASYOCR_AVAILABLE:
        return None
    if _ocr_reader is not None:
        return _ocr_reader

    model_dir = os.getenv("EASYOCR_MODEL_DIR", "/app/easyocr_models")
    download_enabled = os.getenv("RESUME_OCR_MODEL_DOWNLOAD_ENABLED", "false").lower() == "true"

    try:
        _ocr_reader = easyocr.Reader(
            ["ru", "en"],
            gpu=False,
            model_storage_directory=model_dir,
            download_enabled=download_enabled,
            verbose=False,
        )
        log.info("EasyOCR initialized, model_dir=%s", model_dir)
    except Exception as exc:
        log.warning("EasyOCR init failed (%s), retrying offline", exc)
        try:
            _ocr_reader = easyocr.Reader(
                ["ru", "en"],
                gpu=False,
                model_storage_directory=model_dir,
                download_enabled=False,
                verbose=False,
            )
            log.info("EasyOCR initialized (offline mode)")
        except Exception as offline_exc:
            log.error("EasyOCR init completely failed: %s", offline_exc)
            _ocr_reader = None

    return _ocr_reader


def extract_text_from_pdf(filepath: str) -> str:
    text_chunks: list[str] = []

    with fitz.open(filepath) as document:
        for page in document:
            page_text = sanitize_text(page.get_text())
            if page_text:
                text_chunks.append(page_text)
                continue

            reader = get_ocr_reader()
            if reader is None:
                continue

            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            image_bytes = pixmap.tobytes("png")
            ocr_results = reader.readtext(image_bytes, detail=0, paragraph=True)
            ocr_text = sanitize_text("\n".join(ocr_results))
            if ocr_text:
                text_chunks.append(ocr_text)

    return sanitize_text("\n".join(text_chunks), max_length=OCR_TEXT_LIMIT)


def extract_text_from_image(filepath: str) -> str:
    reader = get_ocr_reader()
    if reader is None:
        return ""

    ocr_results = reader.readtext(filepath, detail=0, paragraph=True)
    return sanitize_text("\n".join(ocr_results), max_length=OCR_TEXT_LIMIT)


def run_ocr(file_bytes: bytes, filename: str = "file.jpg") -> str:
    extension = Path(filename).suffix.lower()
    suffix = extension if extension else ".tmp"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        if extension == ".pdf":
            return extract_text_from_pdf(tmp_path)
        else:
            return extract_text_from_image(tmp_path)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
