from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request
import os
import secrets


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    @staticmethod
    def _is_embeddable_media(request: Request) -> bool:
        path = request.url.path
        return (
            path.startswith("/sirius.achievements/documents/")
            and path.endswith("/preview")
        ) or (
            path.startswith("/sirius.achievements/support/messages/")
            and path.endswith("/attachment")
        )

    async def dispatch(self, request: Request, call_next):
        request.state.csp_nonce = secrets.token_urlsafe(16)
        response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

        if not self._is_embeddable_media(request):
            nonce = request.state.csp_nonce
            response.headers["X-Frame-Options"] = "DENY"
            csp = (
                "default-src 'self'; "
                f"script-src 'self' 'unsafe-eval' 'nonce-{nonce}' https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://cdnjs.cloudflare.com; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
                "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; "
                "img-src 'self' data: blob:; "
                "connect-src 'self' blob: ws: wss: https://cdn.jsdelivr.net https://cdn.tailwindcss.com; "
                "worker-src 'self' blob:; "
                "frame-src 'self' blob:; "
                "frame-ancestors 'none'; "
                "base-uri 'self'; "
                "form-action 'self'"
            )
            response.headers["Content-Security-Policy"] = csp

        if os.getenv("ENV") == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response
