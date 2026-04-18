from __future__ import annotations

import asyncio
import logging
import os
import re
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import fitz
import httpx
from sqlalchemy import func as sql_func, select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    import easyocr

    _EASYOCR_AVAILABLE = True
except ImportError:
    easyocr = None  # type: ignore[assignment]
    _EASYOCR_AVAILABLE = False

from app.config import settings
from app.models.achievement import Achievement
from app.models.enums import AchievementLevel, AchievementStatus
from app.models.user import Users
from app.utils import storage
from app.utils.media_paths import resolve_static_path

log = logging.getLogger("resume_service")

_ocr_reader = None
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
SUPPORTED_OCR_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
OCR_TEXT_LIMIT = 6000
PROMPT_TEXT_LIMIT = 20000
RESUME_TEXT_LIMIT = 12000

LEVEL_ORDER = {
    AchievementLevel.INTERNATIONAL.value: 5,
    AchievementLevel.FEDERAL.value: 4,
    AchievementLevel.REGIONAL.value: 3,
    AchievementLevel.MUNICIPAL.value: 2,
    AchievementLevel.SCHOOL.value: 1,
}


def sanitize_resume_text(value: str | None, max_length: int | None = None) -> str:
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


def _enum_value(value: object | None, default: str) -> str:
    if value is None:
        return default
    return value.value if hasattr(value, "value") else str(value)


def get_ocr_reader():
    global _ocr_reader

    if not _EASYOCR_AVAILABLE:
        return None
    if _ocr_reader is not None:
        return _ocr_reader

    model_dir = os.getenv("EASYOCR_MODEL_DIR", "/app/easyocr_models")
    download_enabled = settings.RESUME_OCR_MODEL_DOWNLOAD_ENABLED

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
            page_text = sanitize_resume_text(page.get_text())
            if page_text:
                text_chunks.append(page_text)
                continue

            reader = get_ocr_reader()
            if reader is None:
                continue

            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            image_bytes = pixmap.tobytes("png")
            ocr_results = reader.readtext(image_bytes, detail=0, paragraph=True)
            ocr_text = sanitize_resume_text("\n".join(ocr_results))
            if ocr_text:
                text_chunks.append(ocr_text)

    return sanitize_resume_text("\n".join(text_chunks), max_length=OCR_TEXT_LIMIT)


def extract_text_from_image(filepath: str) -> str:
    reader = get_ocr_reader()
    if reader is None:
        return ""

    ocr_results = reader.readtext(filepath, detail=0, paragraph=True)
    return sanitize_resume_text("\n".join(ocr_results), max_length=OCR_TEXT_LIMIT)


class ResumeService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def can_generate(self, user_id: int) -> dict:
        user = await self.db.get(Users, user_id)
        if not user:
            return {"allowed": False, "reason": "Пользователь не найден."}

        count_stmt = select(sql_func.count()).select_from(Achievement).filter(
            Achievement.user_id == user_id,
            Achievement.status == AchievementStatus.APPROVED,
        )
        approved_count = (await self.db.execute(count_stmt)).scalar() or 0

        if approved_count == 0:
            return {"allowed": False, "reason": "Нет подтверждённых достижений."}

        if not user.resume_generated_at:
            return {"allowed": True, "reason": None}

        new_stmt = select(sql_func.count()).select_from(Achievement).filter(
            Achievement.user_id == user_id,
            Achievement.status == AchievementStatus.APPROVED,
            Achievement.updated_at > user.resume_generated_at,
        )
        new_count = (await self.db.execute(new_stmt)).scalar() or 0

        if new_count == 0:
            return {
                "allowed": False,
                "reason": "Нет новых подтверждённых документов с момента последней генерации.",
            }

        return {"allowed": True, "reason": None}

    async def generate_resume(
        self,
        user_id: int,
        force_regenerate: bool = False,
        bypass_check: bool = False,
    ) -> dict:
        try:
            user = await self.db.get(Users, user_id)
            if not user:
                return {"success": False, "error": "Пользователь не найден.", "status_code": 404}

            if user.resume_text and not force_regenerate:
                return {
                    "success": True,
                    "resume": sanitize_resume_text(user.resume_text, max_length=RESUME_TEXT_LIMIT),
                }

            if not bypass_check:
                check = await self.can_generate(user_id)
                if not check["allowed"]:
                    return {"success": False, "error": check["reason"], "status_code": 429}

            stmt = (
                select(Achievement)
                .filter(
                    Achievement.user_id == user_id,
                    Achievement.status == AchievementStatus.APPROVED,
                )
                .order_by(Achievement.created_at.desc())
            )
            achievements = (await self.db.execute(stmt)).scalars().all()

            if not achievements:
                return {
                    "success": False,
                    "error": "Нет подтверждённых достижений для генерации.",
                    "status_code": 429,
                }

            student_name = sanitize_resume_text(
                f"{user.first_name or ''} {user.last_name or ''}".strip(),
                max_length=200,
            ) or "Пользователь"

            loop = asyncio.get_running_loop()
            docs_data: list[dict[str, object]] = []

            for achievement in achievements:
                document_data = self._build_document_data(achievement)
                file_path = document_data.get("file_path")
                if isinstance(file_path, str) and file_path:
                    document_data["ocr_text"] = await self._extract_ocr_text(file_path, loop)
                docs_data.append(document_data)

            resume_result: str | None = None
            if self._is_external_ai_configured():
                combined_text = self._build_combined_text(student_name, docs_data)
                if combined_text:
                    resume_result = await self._call_yandex_gpt(combined_text, student_name)

            if not resume_result:
                resume_result = self._generate_local_resume(student_name, user, docs_data)

            resume_result = sanitize_resume_text(resume_result, max_length=RESUME_TEXT_LIMIT)
            if not resume_result:
                return {
                    "success": False,
                    "error": "Не удалось собрать текст резюме по документам.",
                    "status_code": 500,
                }

            user.resume_text = resume_result
            user.resume_generated_at = datetime.now(timezone.utc)
            await self.db.commit()
            await self.db.refresh(user)

            return {"success": True, "resume": resume_result}
        except Exception:
            await self.db.rollback()
            log.exception("Resume generation failed for user_id=%s", user_id)
            return {
                "success": False,
                "error": "Не удалось сгенерировать резюме из-за внутренней ошибки.",
                "status_code": 500,
            }

    def _build_document_data(self, achievement: Achievement) -> dict[str, object]:
        title = sanitize_resume_text(achievement.title or "Без названия", max_length=200) or "Без названия"
        description = sanitize_resume_text(achievement.description or "", max_length=1200)

        return {
            "title": title,
            "category": _enum_value(achievement.category, "Другое"),
            "level": _enum_value(achievement.level, "Не указан"),
            "description": description,
            "points": int(achievement.points or 0),
            "date": achievement.created_at.strftime("%d.%m.%Y") if achievement.created_at else "",
            "ocr_text": "",
            "file_path": achievement.file_path or "",
        }

    async def _extract_ocr_text(self, file_path: str, loop: asyncio.AbstractEventLoop) -> str:
        normalized_path = file_path.replace("\\", "/")
        source_for_extension = (
            storage.extract_key(normalized_path) if storage.is_minio_path(normalized_path) else normalized_path
        )
        extension = Path(source_for_extension).suffix.lower()
        if extension not in SUPPORTED_OCR_EXTENSIONS:
            return ""

        temp_path: Path | None = None

        try:
            if storage.is_minio_path(normalized_path):
                object_key = storage.extract_key(normalized_path)
                file_bytes = await storage.download(object_key)
                if not file_bytes:
                    return ""

                with tempfile.NamedTemporaryFile(delete=False, suffix=extension or ".tmp") as temp_file:
                    temp_file.write(file_bytes)
                    temp_path = Path(temp_file.name)
                source_path = temp_path
            else:
                relative_path = normalized_path.lstrip("/")
                if relative_path.startswith("static/"):
                    relative_path = relative_path[len("static/") :]
                source_path = resolve_static_path(relative_path)
                if not source_path.exists() or not source_path.is_file():
                    log.warning("Resume source file not found: %s", file_path)
                    return ""

            extractor = extract_text_from_pdf if extension == ".pdf" else extract_text_from_image
            extracted_text = await loop.run_in_executor(None, extractor, str(source_path))
            return sanitize_resume_text(extracted_text, max_length=OCR_TEXT_LIMIT)
        except Exception:
            log.exception("Failed to extract OCR text for %s", file_path)
            return ""
        finally:
            if temp_path and temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError as exc:
                    log.warning("Failed to remove temporary OCR file %s: %s", temp_path, exc)

    def _is_external_ai_configured(self) -> bool:
        api_key = settings.YANDEX_API_KEY or ""
        folder_id = settings.YANDEX_FOLDER_ID or ""
        has_placeholders = api_key.lower().startswith("your") or folder_id.lower().startswith("your")
        return bool(settings.RESUME_EXTERNAL_AI_ENABLED and api_key and folder_id and not has_placeholders)

    def _build_combined_text(self, student_name: str, docs_data: list[dict[str, object]]) -> str:
        parts = [f"Студент: {student_name}"]

        for document in docs_data:
            parts.append("--- Документ ---")
            parts.append(f"Название: {document['title']}")
            parts.append(f"Категория: {document['category']}")
            parts.append(f"Уровень: {document['level']}")

            description = sanitize_resume_text(str(document.get("description", "")), max_length=800)
            if description:
                parts.append(f"Описание: {description}")

            ocr_text = sanitize_resume_text(str(document.get("ocr_text", "")), max_length=1200)
            if ocr_text:
                parts.append(f"Распознанный текст: {ocr_text}")

        return sanitize_resume_text("\n".join(parts), max_length=PROMPT_TEXT_LIMIT)

    async def _call_yandex_gpt(self, combined_text: str, target_name: str) -> str | None:
        api_key = settings.YANDEX_API_KEY
        folder_id = settings.YANDEX_FOLDER_ID
        if not api_key or not folder_id:
            return None

        prompt = {
            "modelUri": f"gpt://{folder_id}/yandexgpt",
            "completionOptions": {
                "stream": False,
                "temperature": 0.1,
                "maxTokens": "1000",
            },
            "messages": [
                {
                    "role": "system",
                    "text": (
                        f"Ты строгий HR-специалист. Составь краткое профессиональное резюме для {target_name}. "
                        "Игнорируй имена других людей в тексте документов. "
                        "Собери достижения, определи сильные стороны и направления развития. "
                        "Напиши связный текст от третьего лица в 4-6 предложениях. "
                        "Не выводи сырой текст документов."
                    ),
                },
                {
                    "role": "user",
                    "text": f"Данные из документов:\n{combined_text}",
                },
            ],
        }

        url = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
        headers = {"Content-Type": "application/json", "Authorization": f"Api-Key {api_key}"}

        async with httpx.AsyncClient(timeout=45.0) as client:
            try:
                response = await client.post(url, headers=headers, json=prompt)
                response.raise_for_status()
                payload = response.json()
                result = (
                    payload.get("result", {})
                    .get("alternatives", [{}])[0]
                    .get("message", {})
                    .get("text", "")
                )
                sanitized = sanitize_resume_text(result, max_length=RESUME_TEXT_LIMIT)
                if sanitized:
                    log.info("YandexGPT resume generated for %s", target_name)
                    return sanitized
            except httpx.HTTPStatusError as exc:
                response_text = exc.response.text[:200] if exc.response is not None else ""
                log.error("YandexGPT API HTTP %s: %s", exc.response.status_code, response_text)
            except Exception:
                log.exception("YandexGPT API error for %s", target_name)

        return None

    def _generate_local_resume(
        self,
        student_name: str,
        user: Users,
        docs_data: list[dict[str, object]],
    ) -> str:
        total = len(docs_data)
        total_points = sum(int(document.get("points", 0) or 0) for document in docs_data)

        category_counter = Counter(str(document.get("category", "Другое")) for document in docs_data)
        level_counter = Counter(str(document.get("level", "Не указан")) for document in docs_data)
        best_level = max(
            docs_data,
            key=lambda document: LEVEL_ORDER.get(str(document.get("level", "")), 0),
        ).get("level", AchievementLevel.SCHOOL.value)

        education_info = ""
        if user and getattr(user, "education_level", None):
            education_value = _enum_value(user.education_level, "")
            course_label = f", {user.course} курс" if user.course else ""
            education_info = f"{education_value}{course_label}"

        parts = [
            f"СВОДКА ПРОФИЛЯ: {student_name}",
            "=" * 40,
        ]

        if education_info:
            parts.append(f"Обучение: {education_info}")
        parts.append(f"Подтверждённых достижений: {total}")
        parts.append(f"Общий балл: {total_points}")
        parts.append(f"Высший уровень: {best_level}")
        parts.append("")

        parts.append("ПО КАТЕГОРИЯМ:")
        for category, count in category_counter.most_common():
            parts.append(f"  - {category}: {count} шт.")
        parts.append("")

        parts.append("ПО УРОВНЯМ:")
        for level_name in sorted(level_counter.keys(), key=lambda value: LEVEL_ORDER.get(value, 0), reverse=True):
            parts.append(f"  - {level_name}: {level_counter[level_name]}")
        parts.append("")

        parts.append("ДОСТИЖЕНИЯ:")
        parts.append("-" * 40)

        for index, document in enumerate(docs_data, 1):
            title = str(document.get("title", "Без названия"))
            category = str(document.get("category", "Другое"))
            level = str(document.get("level", "Не указан"))
            points = int(document.get("points", 0) or 0)
            date = str(document.get("date", "") or "")
            description = sanitize_resume_text(str(document.get("description", "")), max_length=600)
            ocr_text = sanitize_resume_text(str(document.get("ocr_text", "")), max_length=350)

            parts.append(f"\n{index}. {title}")
            parts.append(f"   Категория: {category} | Уровень: {level}")
            if points:
                parts.append(f"   Баллы: +{points}")
            if date:
                parts.append(f"   Дата: {date}")
            if description:
                parts.append(f"   Описание: {description}")
            if ocr_text and len(ocr_text) > 10:
                parts.append(f"   Из документа: {ocr_text}")

        main_categories = [category for category, _ in category_counter.most_common(2)]
        categories_text = " и ".join(main_categories) if main_categories else "различных направлениях"

        parts.extend(
            [
                "",
                "-" * 40,
                (
                    f"Итог: {student_name} имеет {total} подтверждённых достижений "
                    f"в области {categories_text.lower()}, "
                    f"с максимальным уровнем \"{best_level}\" "
                    f"и общим баллом {total_points}."
                ),
                f"",
                f"Сводка сгенерирована: {datetime.now(timezone.utc).strftime('%d.%m.%Y %H:%M UTC')}",
            ]
        )

        return sanitize_resume_text("\n".join(parts), max_length=RESUME_TEXT_LIMIT)
