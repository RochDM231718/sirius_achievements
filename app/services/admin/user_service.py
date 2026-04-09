import os
import structlog
from fastapi import UploadFile
from app.services.admin.base_crud_service import BaseCrudService
from app.repositories.admin.user_repository import UserRepository
from app.models.enums import UserRole
from app.config import settings
from app.utils.file_validator import FileValidator, AVATAR_SIGNATURES
from app.utils import storage

logger = structlog.get_logger()


class UserService(BaseCrudService):
    def __init__(self, repository: UserRepository):
        super().__init__(repository)
        self.repository = repository
        self._file_validator = FileValidator(
            allowed=AVATAR_SIGNATURES,
            max_size=settings.MAX_AVATAR_SIZE,
            upload_dir=settings.UPLOAD_DIR_AVATARS,
        )

    async def save_avatar(self, user_id: int, file: UploadFile) -> str:
        user = await self.repository.find(user_id)

        if user and user.avatar_path:
            if storage.is_minio_path(user.avatar_path):
                await storage.delete(storage.extract_key(user.avatar_path))
            else:
                old_path = os.path.normpath(os.path.join("static", user.avatar_path))
                if old_path.startswith("static") and os.path.exists(old_path) and os.path.isfile(old_path):
                    try:
                        os.remove(old_path)
                    except Exception:
                        logger.warning("Failed to delete old avatar", path=old_path)

        return await self._file_validator.validate_and_store(file)

    async def update_role(self, user_id: int, new_role: UserRole):
        user = await self.repository.find(user_id)
        if user:
            user.role = new_role
            await self.repository.db.commit()
            await self.repository.db.refresh(user)
        return user
