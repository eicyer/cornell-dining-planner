"""Standard security headers on every response, plus a per-request CSP
nonce (request.state.csp_nonce) that admin_pages.py's Jinja2 templates put
on their inline <script>/<style> tags instead of relying on
'unsafe-inline' — see docs/adr/0016 for why /admin renders same-origin
inline HTML in the first place, and docs/adr/0018 for HSTS's environment
gating.
"""

import secrets

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import settings


def _content_security_policy(nonce: str) -> str:
    return "; ".join(
        [
            "default-src 'self'",
            f"script-src 'self' 'nonce-{nonce}'",
            f"style-src 'self' 'nonce-{nonce}' https://fonts.googleapis.com",
            "font-src https://fonts.gstatic.com",
            "img-src 'self' data:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]
    )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        nonce = secrets.token_urlsafe(16)
        request.state.csp_nonce = nonce

        response = await call_next(request)

        response.headers["Content-Security-Policy"] = _content_security_policy(nonce)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Every response here is session-dependent or otherwise dynamic.
        # Without this, a CDN/reverse-proxy fronting this API (e.g. a
        # Vercel rewrite) can cache and replay a stale response verbatim —
        # observed as /auth/login serving an identical, already-signed
        # session cookie on repeat visits, breaking the OAuth CSRF state
        # check on the next /auth/callback.
        response.headers["Cache-Control"] = "no-store"
        if settings.environment == "production":
            # Meaningless (and potentially confusing) over local HTTP, so
            # only sent once ENVIRONMENT=production implies real HTTPS.
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response
