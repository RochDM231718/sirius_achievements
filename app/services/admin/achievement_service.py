import os
import structlog
from fastapi import UploadFile
from app.services.admin.base_crud_service import BaseCrudService
from app.repositories.admin.achievement_repository import AchievementRepository
from app.config import settings
from app.utils.file_validator import FileValidator, DOC_SIGNATURES

logger = structlog.get_logger()


class AchievementService(BaseCrudService):
    upload_dir = "static"

    def __init__(self, repo: AchievementRepository):
        super().__init__(repo)
        self.repo = repo
        self._file_validator = FileValidator(
            allowed=DOC_SIGNATURES,
            max_size=settings.MAX_DOC_SIZE,
            upload_dir=settings.UPLOAD_DIR_ACHIEVEMENTS,
        )

    async def save_file(self, file: UploadFile) -> str:
        return await self._file_validator.validate_and_save(file)

    async def delete(self, id: int, user_id: int, user_role: str):
        item = await self.repo.find(id)
        if not item:
            return

        is_owner = item.user_id == user_id
        is_staff = str(user_role) in ['moderator', 'super_admin', 'MODERATOR', 'SUPER_ADMIN']

        if not is_owner and not is_staff:
            raise ValueError("У вас нет прав на удаление этого файла")

        if item.file_path:
            full_path = os.path.join("static", item.file_path)
            if os.path.exists(full_path):
                try:
                    os.remove(full_path)
                except OSError:
                    logger.warning("Failed to delete file", path=full_path)

        await self.repo.delete(id)
