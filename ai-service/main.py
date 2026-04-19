from __future__ import annotations

import logging

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from ocr import run_ocr

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ai_service")

app = FastAPI(title="AI OCR Service")

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/ocr")
async def ocr_endpoint(file: UploadFile = File(...)) -> JSONResponse:
    filename = file.filename or "file.jpg"
    from pathlib import Path

    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        text = run_ocr(file_bytes, filename=filename)
    except Exception:
        log.exception("OCR failed for file %s", filename)
        raise HTTPException(status_code=500, detail="OCR processing failed")

    return JSONResponse({"text": text})
