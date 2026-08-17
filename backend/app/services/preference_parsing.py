"""Parse free-text food likes/dislikes into Soft Preference tags. See
docs/adr/0003 and CONTEXT.md ("Soft Preference") — these are only ever used
for ranking/tie-breaking candidate meals, never as a Hard Constraint filter.

Unlike diet_tags (app.services.llm_enrichment), there's no fixed vocabulary
here — free-form keywords are fine since matching against them is fuzzy
(substring/LLM judgment in the polish step), not exact filtering.
"""

from __future__ import annotations

import json
import logging

from anthropic import AsyncAnthropic

from app.services.llm_enrichment import MODEL

logger = logging.getLogger(__name__)


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.index("\n") + 1 :] if "\n" in text else text
    return json.loads(text)


# Bounds only, not a fixed vocabulary — free-form fuzzy tags are the
# intentional design here (see module docstring). This just keeps a
# malformed or runaway LLM response from being stored/echoed unbounded.
MAX_TAGS = 20
MAX_TAG_LENGTH = 40


def _clean_tags(raw: object) -> list[str]:
    if not isinstance(raw, list):
        return []
    cleaned: list[str] = []
    for tag in raw:
        if not isinstance(tag, str):
            continue
        tag = tag.strip().lower()[:MAX_TAG_LENGTH]
        if tag:
            cleaned.append(tag)
        if len(cleaned) >= MAX_TAGS:
            break
    return cleaned


async def parse_preferences(
    client: AsyncAnthropic, liked_text: str | None, disliked_text: str | None
) -> tuple[list[str], list[str]]:
    """Returns (liked_tags, disliked_tags). Empty input -> empty output, no LLM call."""
    if not (liked_text or "").strip() and not (disliked_text or "").strip():
        return [], []

    prompt = f"""Extract concise food keyword tags from a user's stated preferences for a
college dining hall meal planner. Tags will be fuzzy-matched against menu item names later.

Liked: "{liked_text or ''}"
Disliked: "{disliked_text or ''}"

Respond with ONLY valid JSON, no markdown fences, no commentary:
{{
  "liked_tags": [<short lowercase keywords: ingredients, proteins, cuisines, flavors>],
  "disliked_tags": [<same>]
}}

Keep each tag to 1-2 words (e.g. "chicken", "spicy", "mushroom", "italian"), not full phrases."""

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(block.text for block in response.content if block.type == "text")
        data = _extract_json(text)
        return _clean_tags(data.get("liked_tags")), _clean_tags(data.get("disliked_tags"))
    except Exception:
        logger.exception("Preference parsing failed for liked=%r disliked=%r", liked_text, disliked_text)
        return [], []
