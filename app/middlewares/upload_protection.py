from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from fastapi import Request


class UploadProtectionMiddleware(BaseHTTPMiddleware):
    """Block direct access to private uploads.

    Achievement files and support attachments are only available through
    authorized preview/download endpoints.
    """

    PROTECTED_PATHS = [
        "/static/uploads/achievements/",
        "/static/uploads/support/",
    ]

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if any(path.startswith(p) for p in self.PROTECTED_PATHS):
            return Response(status_code=403, content="Forbidden")

        return await call_next(request)
