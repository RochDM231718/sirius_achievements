import os
import uuid
import aiofiles
from fastapi import UploadFile

# Magic byte signatures for supported file types
SIGNATURES = {
    "pdf": (b'\x25\x50\x44\x46',),
    "jpg": (b'\xFF\xD8\xFF',),
    "png": (b'\x89\x50\x4E\x47\x0D\x0A\x1A\x0A',),
    "webp": (b'RIFF',),
}

DOC_SIGNATURES = {"pdf": SIGNATURES["pdf"], "jpg": SIGNATURES["jpg"], "png": SIGNATURES["png"]}
IMAGE_SIGNATURES = {"jpg": SIGNATURES["jpg"], "png": SIGNATURES["png"], "webp": SIGNATURES["webp"]}
AVATAR_SIGNATURES = IMAGE_SIGNATURES


class FileValidator:
    def __init__(self, allowed: dict[str, tuple], max_size: int, upload_dir: str):
        self.allowed = allowed
        self.max_size = max_size
        self.upload_dir = upload_dir

    async def validate_and_save(self, file: UploadFile, subdirectory: str = "") -> str:
        header = await file.read(8)
        await file.seek(0)

        detected_ext = self._detect_extension(header)
        if not detected_ext:
            formats = ", ".join(ext.upper() for ext in self.allowed)
            raise ValueError(f"Недопустимый формат файла. Допустимы: {formats}.")

        file_size = await self._get_file_size(file)
        max_mb = self.max_size // (1024 * 1024)
        if file_size > self.max_size:
            raise ValueError(f"Файл слишком большой. Максимум: {max_mb} МБ.")

        save_dir = os.path.join(self.upload_dir, subdirectory) if subdirectory else self.upload_dir
        os.makedirs(save_dir, exist_ok=True)

        unique_name = f"{uuid.uuid4().hex}.{detected_ext}"
        file_path = os.path.join(save_dir, unique_name)

        async with aiofiles.open(file_path, "wb") as f:
            while chunk := await file.read(8192):
                await f.write(chunk)

        relative_dir = save_dir.replace("static/", "", 1) if save_dir.startswith("static/") else save_dir
        return f"{relative_dir}/{unique_name}"

    def _detect_extension(self, header: bytes) -> str | None:
        for ext, sigs in self.allowed.items():
            for sig in sigs:
                if header.startswith(sig):
                    return ext
        return None

    @staticmethod
    async def _get_file_size(file: UploadFile) -> int:
        content = await file.read()
        size = len(content)
        await file.seek(0)
        return size
