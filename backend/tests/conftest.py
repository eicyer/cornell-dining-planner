"""Shared fixtures for backend/tests/. Requires the local dev Postgres
(docker compose up -d) migrated to head — matches the dependency-override
testing pattern already documented in README.md, just made reusable.
"""

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.models import User
from app.main import app

ALLOWED_ORIGIN = settings.cors_origins[0]


@pytest.fixture
def client():
    # base_url="http://localhost" satisfies TrustedHostMiddleware (default
    # TestClient host "testserver" would otherwise be rejected — that
    # rejection is itself covered by test_trusted_host.py).
    with TestClient(app, base_url="http://localhost") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_user():
    return User(id=1, google_sub="test-admin-sub", email=settings.admin_email)


@pytest.fixture
def other_user():
    return User(id=2, google_sub="test-other-sub", email="not-the-admin@example.com")
