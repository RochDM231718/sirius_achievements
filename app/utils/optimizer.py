"""
File optimization helpers.

All functions are synchronous (CPU-bound) and should be called via
``asyncio.to_thread`` or run inline before MinIO upload.
"""
from __future__ import annotations

import io
import structlog

logger = structlog.get_logger()

_MAX_DIM = 1920        # px — max side for images
_JPEG_QUALITY = 85
_WEBP_QUALITY = 85


def optimize_image(data: bytes, ext: str) -> bytes:
    """Re-encode image with Pillow. Returns original bytes on failure."""
    try:
        from PIL import Image  # type: ignore

        img = Image.open(io.BytesIO(data))

        # Convert palette / alpha to RGB for JPEG
        if ext in ("jpg", "jpeg") and img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")

        # Downscale if either dimension exceeds limit
        w, h = img.size
        if max(w, h) > _MAX_DIM:
            scale = _MAX_DIM / max(w, h)
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

        buf = io.BytesIO()
        fmt_map = {"jpg": "JPEG", "jpeg": "JPEG", "png": "PNG", "webp": "WEBP", "gif": "GIF"}
        fmt = fmt_map.get(ext)
        if not fmt:
            return data  # unknown format — pass through

        kwargs: dict = {"format": fmt, "optimize": True}
        if fmt == "JPEG":
            kwargs["quality"] = _JPEG_QUALITY
        elif fmt == "WEBP":
            kwargs["quality"] = _WEBP_QUALITY

        img.save(buf, **kwargs)
        optimized = buf.getvalue()

        if len(optimized) < len(data):
            logger.debug("image_optimized", ext=ext, before=len(data), after=len(optimized))
            return optimized
        return data

    except Exception as exc:
        logger.warning("image_optimization_failed", ext=ext, error=str(exc))
        return data


def optimize_pdf(data: bytes) -> bytes:
    """Re-compress PDF with PyMuPDF (garbage collection + deflate)."""
    try:
        import fitz  # type: ignore  # PyMuPDF

        doc = fitz.open(stream=data, filetype="pdf")
        buf = io.BytesIO()
        doc.save(buf, deflate=True, garbage=4, clean=True)
        doc.close()
        optimized = buf.getvalue()

        if len(optimized) < len(data):
            logger.debug("pdf_optimized", before=len(data), after=len(optimized))
            return optimized
        return data

    except Exception as exc:
        logger.warning("pdf_optimization_failed", error=str(exc))
        return data


def optimize(data: bytes, ext: str) -> bytes:
    """Dispatch to the correct optimizer based on file extension."""
    if ext in ("jpg", "jpeg", "png", "webp", "gif"):
        return optimize_image(data, ext)
    if ext == "pdf":
        return optimize_pdf(data)
    return data  # DOCX / PPTX / XLSX / DOC — pass through unchanged
