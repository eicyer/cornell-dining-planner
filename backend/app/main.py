from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app.core.config import settings
from app.routers import auth, health

app = FastAPI(title="Cornell Dining Planner API")
app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)

app.include_router(health.router)
app.include_router(auth.router)
