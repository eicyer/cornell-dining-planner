"""app.core.csrf.CSRFOriginCheckMiddleware — defense-in-depth against CSRF
on top of SameSite=Lax session cookies (docs/adr/0018). Unsafe methods
without a matching Origin get 403 before reaching auth or a route handler
at all; safe methods (GET) are untouched."""

from tests.conftest import ALLOWED_ORIGIN


def test_missing_origin_on_unsafe_method_is_rejected(client):
    response = client.post("/logged-meals", json={})
    assert response.status_code == 403


def test_mismatched_origin_on_unsafe_method_is_rejected(client):
    response = client.post("/logged-meals", json={}, headers={"Origin": "https://evil.example.com"})
    assert response.status_code == 403


def test_allowed_origin_on_unsafe_method_passes_csrf_check(client):
    # Passes CSRF, falls through to the next real check (401, not logged in)
    # rather than 403 — proves the CSRF layer isn't what's rejecting this one.
    response = client.post("/logged-meals", json={}, headers={"Origin": ALLOWED_ORIGIN})
    assert response.status_code == 401


def test_get_is_unaffected_by_csrf_check(client):
    response = client.get("/health")
    assert response.status_code == 200
