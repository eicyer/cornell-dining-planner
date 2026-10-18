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


def is_admin(user: User) -> bool:
    """The single admin check — see docs/adr/0016. Exactly one operator
    (settings.admin_email), not a general role system. Case- and
    whitespace-insensitive so a stray capital or trailing space in
    ADMIN_EMAIL can't lock the operator out."""
    return user.email.strip().lower() == settings.admin_email.strip().lower()


def get_current_admin(user: User = Depends(get_current_user)) -> User:
    """Gates every /admin/api/* route."""
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Not authorized")
    return user
