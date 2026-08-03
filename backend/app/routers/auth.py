from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.models import User
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


@router.get("/login")
async def login(request: Request):
    redirect_uri = request.url_for("auth_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/callback", name="auth_callback")
async def auth_callback(request: Request, db: Session = Depends(get_db)):
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo")
    if not userinfo or not userinfo.get("sub") or not userinfo.get("email"):
        raise HTTPException(status_code=400, detail="Google did not return a usable identity")

    user = db.query(User).filter(User.google_sub == userinfo["sub"]).one_or_none()
    if user is None:
        user = User(google_sub=userinfo["sub"], email=userinfo["email"])
        db.add(user)
        db.commit()
        db.refresh(user)

    request.session["user_id"] = user.id
    return RedirectResponse(url=settings.frontend_url)


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"status": "logged out"}


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email}
