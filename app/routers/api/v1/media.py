from __future__ import annotations

import io

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse

from app.utils import storage
from app.utils.media_paths import guess_media_type, resolve_static_path

router = APIRouter(prefix='/api/v1/public/media', tags=['api.v1.public.media'])


@router.get('')
@router.get('/')
async def public_media(path: str = Query(..., min_length=1)):
    if storage.is_minio_path(path):
        key = storage.extract_key(path)
        try:
            data = await storage.download(key)
        except Exception as exc:
            raise HTTPException(status_code=404, detail='File not found.') from exc

        filename = key.rsplit('/', 1)[-1]
        return StreamingResponse(
            io.BytesIO(data),
            media_type=guess_media_type(filename),
            headers={'Content-Disposition': f'inline; filename="{filename}"'},
        )

    try:
        full_path = resolve_static_path(path)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail='Invalid file path.') from exc

    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail='File not found.')

    response = FileResponse(path=full_path, media_type=guess_media_type(full_path))
    response.headers['Content-Disposition'] = f'inline; filename="{full_path.name}"'
    return response
