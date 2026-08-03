"""LLM enrichment — nutrition density (per 100g) plus diet/allergen tagging.
See docs/adr/0001, 0002, 0007.

When USDA has a match, its per-100g numbers are used directly — the LLM is
NOT asked to re-guess them, only to infer diet/allergen tags (which USDA data
doesn't provide). The LLM only estimates macros from scratch when USDA has no
match at all. This keeps "source": "usda" meaning what it says.

Actual portion size (how many grams a user gets) is a personalization
decision, not something baked in here — see docs/adr/0007. Diet/allergen tags
are inferred from a bare item name with no ingredient list — informational,
not an authoritative safety guarantee. See CONTEXT.md ("Diet Tag").
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

from anthropic import AsyncAnthropic

from app.core.config import settings
from app.services.usda import UsdaMatch

logger = logging.getLogger(__name__)

MODEL = "claude-haiku-4-5-20251001"

DIET_TAGS = ["vegan", "vegetarian", "gluten_free", "dairy_free", "halal", "kosher"]
ALLERGENS = ["dairy", "eggs", "gluten", "soy", "peanuts", "tree_nuts", "fish", "shellfish", "sesame"]

# Survey (FNDDS) is "as prepared/consumed" data — the closest match to a named
# dish. Foundation/SR Legacy are raw ingredients, a looser fit for a composed
# dining-hall item, so a lower fixed confidence reflects that gap. Both skip
# the LLM entirely for the numbers themselves.
USDA_CONFIDENCE_BY_DATA_TYPE = {
    "Survey (FNDDS)": 0.85,
}
DEFAULT_USDA_CONFIDENCE = 0.75


@dataclass
class EnrichmentResult:
    calories_per_100g: float
    protein_g_per_100g: float
    carbs_g_per_100g: float
    fat_g_per_100g: float
    confidence: float
    source: str  # "usda" | "llm_estimate" — see app.db.models.NutritionSource
    diet_tags: list[str] = field(default_factory=list)
    likely_allergens: list[str] = field(default_factory=list)


def _diet_tags_prompt(item_name: str, category: str, eatery_name: str, is_kosher_hall: bool) -> str:
    kosher_note = f'"{eatery_name}" is a certified kosher/halal dining hall.\n' if is_kosher_hall else ""
    return f"""You are tagging diet/allergen info for a college dining hall menu item.
Nutrition numbers are already known (from USDA) — only classify diet compatibility.

Item: "{item_name}"
Menu category: "{category}"
Eatery: "{eatery_name}"
{kosher_note}
Respond with ONLY valid JSON, no markdown fences, no commentary:
{{
  "diet_tags": [<subset of {DIET_TAGS}>],
  "likely_allergens": [<subset of {ALLERGENS}>]
}}

Only use values from the lists shown — omit anything not clearly applicable rather than guessing."""


def _full_estimate_prompt(item_name: str, category: str, eatery_name: str, is_kosher_hall: bool) -> str:
    kosher_note = f'"{eatery_name}" is a certified kosher/halal dining hall.\n' if is_kosher_hall else ""
    return f"""You are estimating nutrition and diet info for a college dining hall menu item.
No USDA reference match was found — estimate from the name alone.

Item: "{item_name}"
Menu category: "{category}"
Eatery: "{eatery_name}"
{kosher_note}
Respond with ONLY valid JSON, no markdown fences, no commentary:
{{
  "calories_per_100g": <int, as it would appear on a standard nutrition facts label per 100g>,
  "protein_g_per_100g": <float>,
  "carbs_g_per_100g": <float>,
  "fat_g_per_100g": <float>,
  "confidence": <float 0-1, your confidence in these numbers>,
  "diet_tags": [<subset of {DIET_TAGS}>],
  "likely_allergens": [<subset of {ALLERGENS}>]
}}

diet_tags and likely_allergens must only use values from the lists shown — omit anything not clearly
applicable rather than guessing. If the item name is too vague to be confident (e.g. "Chef's Choice"),
lower the confidence score rather than the accuracy of the numbers."""


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.index("\n") + 1 :] if "\n" in text else text
    return json.loads(text)


async def _call(client: AsyncAnthropic, prompt: str) -> dict:
    response = await client.messages.create(
        model=MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(block.text for block in response.content if block.type == "text")
    return _extract_json(text)


def _usda_confidence(usda_reference: UsdaMatch) -> float:
    return USDA_CONFIDENCE_BY_DATA_TYPE.get(usda_reference.data_type, DEFAULT_USDA_CONFIDENCE)


async def enrich_item(
    client: AsyncAnthropic,
    item_name: str,
    category: str,
    eatery_name: str,
    is_kosher_hall: bool,
    usda_reference: UsdaMatch | None,
) -> EnrichmentResult | None:
    try:
        if usda_reference is not None:
            data = await _call(client, _diet_tags_prompt(item_name, category, eatery_name, is_kosher_hall))
            return EnrichmentResult(
                calories_per_100g=usda_reference.calories,
                protein_g_per_100g=usda_reference.protein_g,
                carbs_g_per_100g=usda_reference.carbs_g,
                fat_g_per_100g=usda_reference.fat_g,
                confidence=_usda_confidence(usda_reference),
                source="usda",
                diet_tags=[t for t in data.get("diet_tags", []) if t in DIET_TAGS],
                likely_allergens=[a for a in data.get("likely_allergens", []) if a in ALLERGENS],
            )

        data = await _call(client, _full_estimate_prompt(item_name, category, eatery_name, is_kosher_hall))
        return EnrichmentResult(
            calories_per_100g=float(data["calories_per_100g"]),
            protein_g_per_100g=float(data["protein_g_per_100g"]),
            carbs_g_per_100g=float(data["carbs_g_per_100g"]),
            fat_g_per_100g=float(data["fat_g_per_100g"]),
            confidence=float(data["confidence"]),
            source="llm_estimate",
            diet_tags=[t for t in data.get("diet_tags", []) if t in DIET_TAGS],
            likely_allergens=[a for a in data.get("likely_allergens", []) if a in ALLERGENS],
        )
    except Exception:
        logger.exception("LLM enrichment failed for %r", item_name)
        return None


def make_client() -> AsyncAnthropic:
    return AsyncAnthropic(api_key=settings.anthropic_api_key)
