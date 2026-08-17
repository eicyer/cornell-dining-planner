"""CORSMiddleware (app.main) is configured from settings.cors_origins
(docs/adr/0018) — a disallowed Origin must not get an
Access-Control-Allow-Origin back, even for a route that would otherwise
succeed."""

from tests.conftest import ALLOWED_ORIGIN


def test_allowed_origin_gets_cors_header(client):
    response = client.get("/health", headers={"Origin": ALLOWED_ORIGIN})
    assert response.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


def test_disallowed_origin_gets_no_cors_header(client):
    response = client.get("/health", headers={"Origin": "https://evil.example.com"})
    assert "access-control-allow-origin" not in response.headers
