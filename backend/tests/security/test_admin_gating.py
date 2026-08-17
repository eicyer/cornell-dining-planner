"""app.core.deps.get_current_admin (docs/adr/0016) is the entire
authorization boundary for /admin/api/* — a logged-in non-admin must get
403, and the configured admin_email account must get through. Uses
dependency overrides for get_current_user rather than real OAuth, per the
pattern documented in README.md."""

from app.core.deps import get_current_user
from app.main import app
from tests.conftest import ALLOWED_ORIGIN


def test_non_admin_gets_403(client, other_user):
    app.dependency_overrides[get_current_user] = lambda: other_user
    response = client.get("/admin/api/foods", headers={"Origin": ALLOWED_ORIGIN})
    assert response.status_code == 403


def test_admin_gets_through(client, admin_user):
    app.dependency_overrides[get_current_user] = lambda: admin_user
    response = client.get("/admin/api/foods", headers={"Origin": ALLOWED_ORIGIN})
    assert response.status_code == 200
