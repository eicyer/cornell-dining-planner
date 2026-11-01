"""USDA retries cover the throttle's bare 400, 429 and 5xx, but not
4xx responses that fail the same way every time (issue #114)."""

import asyncio

import httpx
import pytest

from app.services import usda


def _client(statuses: list[int]) -> tuple[httpx.AsyncClient, list[int]]:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        status = statuses[min(len(calls), len(statuses) - 1)]
        calls.append(status)
        return httpx.Response(status, json={"foods": []})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler)), calls


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(usda, "RETRY_BACKOFF_SECONDS", 0)
    monkeypatch.setattr(usda, "MIN_REQUEST_INTERVAL_SECONDS", 0)


@pytest.mark.parametrize("status", [401, 403, 404])
def test_non_retryable_4xx_fails_after_one_attempt(status):
    client, calls = _client([status])
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(usda._get_with_retry(client, params={}))
    assert len(calls) == 1


@pytest.mark.parametrize("status", [400, 429, 503])
def test_retryable_status_is_retried_until_success(status):
    client, calls = _client([status, 200])
    response = asyncio.run(usda._get_with_retry(client, params={}))
    assert response.status_code == 200
    assert len(calls) == 2


def test_retryable_status_gives_up_after_max_retries():
    client, calls = _client([503])
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(usda._get_with_retry(client, params={}))
    assert len(calls) == usda.MAX_RETRIES
