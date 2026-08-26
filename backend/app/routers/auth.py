from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.db.models import CraftedMealsCache, LoggedMeal, User, UserPreference
from app.db.session import get_db

router = APIRouter(prefix="/auth")

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


# The only non-default post-login destination that will ever exist — a
# literal safelist, not a general open-redirect-prone allowlist.
ADMIN_NEXT_PATH = "/admin"


@router.get("/login")
@limiter.limit("10/minute")
async def login(request: Request, next: str | None = None):
    if next == ADMIN_NEXT_PATH:
        request.session["post_login_redirect"] = ADMIN_NEXT_PATH
    if settings.oauth_redirect_base_url:
        redirect_uri = f"{settings.oauth_redirect_base_url}/auth/callback"
    else:
        redirect_uri = request.url_for("auth_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/callback", name="auth_callback")
@limiter.limit("10/minute")
async def auth_callback(request: Request, db: Session = Depends(get_db)):
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo")
    if not userinfo or not userinfo.get("sub") or not userinfo.get("email") or not userinfo.get("email_verified"):
        raise HTTPException(status_code=400, detail="Google did not return a usable identity")

    user = db.query(User).filter(User.google_sub == userinfo["sub"]).one_or_none()
    if user is None:
        user = User(google_sub=userinfo["sub"], email=userinfo["email"])
        db.add(user)
        db.commit()
        db.refresh(user)

    next_path = request.session.pop("post_login_redirect", None)
    # Drop any pre-login session state before establishing the authenticated
    # one — closes a session-fixation window. See docs/adr/0018.
    request.session.clear()
    request.session["user_id"] = user.id
    return RedirectResponse(url=next_path or settings.frontend_url)


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"status": "logged out"}


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email}


@router.delete("/me")
async def delete_me(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Deletes this account and everything scoped to it — preferences,
    logged meals, cached crafted-meal payloads — then clears the session.
    No FK cascade is configured at the DB level (see app.db.models), so
    children are deleted explicitly before the User row itself. No
    confirmation step here; that's the frontend's job before this is ever
    called."""
    db.query(LoggedMeal).filter(LoggedMeal.user_id == user.id).delete()
    db.query(CraftedMealsCache).filter(CraftedMealsCache.user_id == user.id).delete()
    db.query(UserPreference).filter(UserPreference.user_id == user.id).delete()
    db.delete(user)
    db.commit()
    request.session.clear()
    return {"status": "account deleted"}
