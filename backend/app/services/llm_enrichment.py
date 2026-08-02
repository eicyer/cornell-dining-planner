"""LLM enrichment — nutrition estimate (USDA-grounded when possible) plus
diet/allergen tagging, in a single call per item. See docs/adr/0001 and
docs/adr/0002.

Diet/allergen tags are inferred from a bare item name with no ingredient list —
they are informational, not an authoritative safety guarantee. See CONTEXT.md
("Diet Tag").
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


@dataclass
class EnrichmentResult:
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    confidence: float
    source: str  # "usda" | "llm_estimate" — see app.db.models.NutritionSource
    diet_tags: list[str] = field(default_factory=list)
    likely_allergens: list[str] = field(default_factory=list)


def _build_prompt(
    item_name: str, category: str, eatery_name: str, is_kosher_hall: bool, usda_reference: UsdaMatch | None
) -> str:
    reference_block = "No USDA reference match found — estimate from the name alone."
    if usda_reference is not None:
        reference_block = (
            f"USDA reference match: \"{usda_reference.description}\" ({usda_reference.data_type}), "
            f"per 100g: {usda_reference.calories:.0f} kcal, {usda_reference.protein_g:.1f}g protein, "
            f"{usda_reference.carbs_g:.1f}g carbs, {usda_reference.fat_g:.1f}g fat.\n"
            "Use this as a grounding data point, not gospel — scale it to a realistic single "
            "dining-hall portion size for this specific item, adjusting for how it's actually served."
        )

    kosher_note = f'"{eatery_name}" is a certified kosher/halal dining hall.\n' if is_kosher_hall else ""

    return f"""You are estimating nutrition and diet info for a college dining hall menu item.

Item: "{item_name}"
Menu category: "{category}"
Eatery: "{eatery_name}"
{kosher_note}
{reference_block}

Respond with ONLY valid JSON, no markdown fences, no commentary:
{{
  "calories": <int, single standard dining-hall portion>,
  "protein_g": <float>,
  "carbs_g": <float>,
  "fat_g": <float>,
  "confidence": <float 0-1, your confidence in these numbers>,
  "diet_tags": [<subset of {DIET_TAGS}>],
  "likely_allergens": [<subset of {ALLERGENS}>]
}}

diet_tags and likely_allergens must only use values from the lists shown — omit anything not clearly
applicable rather than guessing. If the item name is too vague to be confident (e.g. "Chef's Choice"),
lower the confidence score rather than the accuracy of the numbers."""


def _parse_response(text: str, had_usda_reference: bool) -> EnrichmentResult:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.index("\n") + 1 :] if "\n" in text else text

    data = json.loads(text)

    return EnrichmentResult(
        calories=float(data["calories"]),
        protein_g=float(data["protein_g"]),
        carbs_g=float(data["carbs_g"]),
        fat_g=float(data["fat_g"]),
        confidence=float(data["confidence"]),
        source="usda" if had_usda_reference else "llm_estimate",
        diet_tags=[t for t in data.get("diet_tags", []) if t in DIET_TAGS],
        likely_allergens=[a for a in data.get("likely_allergens", []) if a in ALLERGENS],
    )


async def enrich_item(
    client: AsyncAnthropic,
    item_name: str,
    category: str,
    eatery_name: str,
    is_kosher_hall: bool,
    usda_reference: UsdaMatch | None,
) -> EnrichmentResult | None:
    prompt = _build_prompt(item_name, category, eatery_name, is_kosher_hall, usda_reference)

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(block.text for block in response.content if block.type == "text")
        return _parse_response(text, usda_reference is not None)
    except Exception:
        logger.exception("LLM enrichment failed for %r", item_name)
        return None


def make_client() -> AsyncAnthropic:
    return AsyncAnthropic(api_key=settings.anthropic_api_key)
