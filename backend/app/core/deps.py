from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import User
from app.db.session import get_db


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user_id = request.session.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not logged in")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Not logged in")
    return user


def get_current_user_optional(request: Request, db: Session = Depends(get_db)) -> User | None:
    """Same lookup as get_current_user but returns None instead of raising —
    used by page routes (e.g. /admin) that need to render a real page for
    the logged-out state rather than a bare 401 JSON body."""
    user_id = request.session.get("user_id")
    if user_id is None:
        return None
    return db.get(User, user_id)


def get_current_admin(user: User = Depends(get_current_user)) -> User:
    """Gates every /admin/api/* route — see docs/adr/0016. Exactly one
    operator (settings.admin_email), not a general role system."""
    if user.email.lower() != settings.admin_email.lower():
        raise HTTPException(status_code=403, detail="Not authorized")
    return user
