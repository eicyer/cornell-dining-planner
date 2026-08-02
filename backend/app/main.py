from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.core.config import settings
from app.routers import auth, health, menus

app = FastAPI(title="Cornell Dining Planner API")
app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)
app.add_middleware(
    CORSMiddleware,
    # Expo web dev server ports vary by SDK version — cover the common ones.
    allow_origins=["http://localhost:8081", "http://localhost:19006", "http://localhost:19000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(menus.router)
