from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
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
    return {"status": "logged in", "email": user.email}


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"status": "logged out"}


@router.get("/me")
async def me(request: Request, db: Session = Depends(get_db)):
    user_id = request.session.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not logged in")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Not logged in")
    return {"id": user.id, "email": user.email}
