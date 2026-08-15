"""app.services.preference_parsing trusts the LLM's returned tags — the one
clearly-unvalidated-output surface in the codebase before docs/adr/0018.
_clean_tags bounds (not vocabulary-constrains, that's intentional — see the
module docstring) list length, item type, and item length."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.preference_parsing import MAX_TAG_LENGTH, MAX_TAGS, _clean_tags, parse_preferences


def test_clean_tags_drops_non_list_input():
    assert _clean_tags("not a list") == []
    assert _clean_tags(None) == []


def test_clean_tags_drops_non_string_items():
    assert _clean_tags(["chicken", 42, None, {"a": 1}, "spicy"]) == ["chicken", "spicy"]


def test_clean_tags_caps_list_length():
    oversized = [f"tag{i}" for i in range(MAX_TAGS + 50)]
    cleaned = _clean_tags(oversized)
    assert len(cleaned) == MAX_TAGS


def test_clean_tags_caps_item_length():
    long_tag = "x" * (MAX_TAG_LENGTH + 100)
    cleaned = _clean_tags([long_tag])
    assert cleaned == [long_tag[:MAX_TAG_LENGTH]]


def test_clean_tags_strips_and_lowercases():
    assert _clean_tags(["  Chicken  ", "SPICY"]) == ["chicken", "spicy"]


def _mock_client(response_text: str) -> MagicMock:
    block = MagicMock()
    block.type = "text"
    block.text = response_text
    response = MagicMock()
    response.content = [block]
    client = MagicMock()
    client.messages.create = AsyncMock(return_value=response)
    return client


@pytest.mark.asyncio
async def test_parse_preferences_bounds_oversized_llm_response():
    oversized = [f"tag{i}" for i in range(MAX_TAGS + 50)]
    response_text = f'{{"liked_tags": {oversized}, "disliked_tags": []}}'.replace("'", '"')
    client = _mock_client(response_text)

    liked, disliked = await parse_preferences(client, "something", None)
    assert len(liked) == MAX_TAGS
    assert disliked == []


@pytest.mark.asyncio
async def test_parse_preferences_returns_empty_on_malformed_llm_response():
    client = _mock_client("not valid json at all")
    liked, disliked = await parse_preferences(client, "something", None)
    assert liked == []
    assert disliked == []
