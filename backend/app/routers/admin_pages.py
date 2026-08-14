"""Serves the /admin HTML page — see docs/adr/0016. Separate from
admin_api.py's JSON routes: this handles the three auth states directly so
each renders a real styled page instead of a bare error body. The JSON API
still enforces get_current_admin independently — this page-level check is
not the only boundary.
"""

from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.core.config import settings
from app.core.deps import get_current_user_optional
from app.db.models import User
from app.services.llm_enrichment import ALLERGENS, DIET_TAGS

router = APIRouter(tags=["admin"])

templates = Jinja2Templates(directory=str(Path(__file__).resolve().parents[1] / "templates"))


@router.get("/admin", response_class=HTMLResponse)
def admin_page(request: Request, user: User | None = Depends(get_current_user_optional)):
    if user is None:
        return templates.TemplateResponse(request, "admin/login.html", status_code=401)
    if user.email != settings.admin_email:
        return templates.TemplateResponse(
            request, "admin/forbidden.html", {"email": user.email}, status_code=403
        )
    return templates.TemplateResponse(
        request, "admin/panel.html", {"email": user.email, "diet_tags": DIET_TAGS, "allergens": ALLERGENS}
    )
