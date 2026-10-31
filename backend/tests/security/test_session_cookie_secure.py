"""The session cookie must carry Secure in production and not in development
(docs/adr/0018: the flag lives on SessionMiddleware in app.main, driven by
settings.environment)."""

import importlib

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

import app.main as main_module
from app.core.config import settings


def _session_set_cookie(environment: str, monkeypatch) -> str:
    monkeypatch.setattr(settings, "environment", environment)
    built = importlib.reload(main_module).app

    @built.get("/_test/write-session")
    def write_session(request: Request):
        request.session["probe"] = "1"
        return {}

    scheme = "https" if environment == "production" else "http"
    with TestClient(built, base_url=f"{scheme}://localhost") as c:
        return c.get("/_test/write-session").headers["set-cookie"]


@pytest.fixture(autouse=True)
def _restore_main():
    yield
    # monkeypatch has undone settings.environment by now; rebuild app.main
    # with the real settings so later tests see the normal module state.
    importlib.reload(main_module)



def test_session_cookie_is_secure_in_production(monkeypatch):
    assert "secure" in _session_set_cookie("production", monkeypatch).lower().split("; ")


def test_session_cookie_is_not_secure_in_development(monkeypatch):
    assert "secure" not in _session_set_cookie("development", monkeypatch).lower().split("; ")
