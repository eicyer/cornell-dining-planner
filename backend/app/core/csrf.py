"""Defense-in-depth CSRF protection layered on top of SameSite=Lax session
cookies — see docs/adr/0018-session-cookie-and-csrf-hardening. Every
state-changing route relies on the browser's cookie jar (there's no bearer
token), and CORS runs with allow_credentials=True, so an Origin check on
unsafe methods is the proportionate mitigation given the app has only a
handful of mutating routes — a full double-submit-token system would be
scope creep for that surface.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class CSRFOriginCheckMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in UNSAFE_METHODS:
            allowed = set(settings.cors_origins)
            allowed.add(settings.backend_url)
            origin = request.headers.get("origin")
            if origin is None or origin not in allowed:
                return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
        return await call_next(request)
