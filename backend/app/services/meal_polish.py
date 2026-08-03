"""LLM polish step for crafted meals — see docs/adr/0003.

The optimizer (app.services.meal_crafting) already guarantees every candidate
satisfies Hard Constraints and is a reasonable macro fit. This step does NOT
touch the numbers — it only picks among candidates using Soft Preferences
(liked/disliked tags), and writes a name + short rationale. If the LLM call
fails, callers should fall back to the first candidate with a generic name
rather than surfacing nothing.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from anthropic import AsyncAnthropic

from app.services.llm_enrichment import MODEL
from app.services.meal_crafting import MealCandidate, Target

logger = logging.getLogger(__name__)


@dataclass
class PolishedMeal:
    candidate_index: int
    name: str
    rationale: str


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.index("\n") + 1 :] if "\n" in text else text
    return json.loads(text)


def _describe_candidate(index: int, candidate: MealCandidate) -> str:
    items = ", ".join(f"{i.name} ({i.grams:.0f}g)" for i in candidate.items)
    t = candidate.totals
    return (
        f"Candidate {index}: {items}\n"
        f"  Totals: {t['calories']:.0f} cal, {t['protein_g']:.0f}g protein, "
        f"{t['carbs_g']:.0f}g carbs, {t['fat_g']:.0f}g fat"
    )


def _build_prompt(
    candidates: list[MealCandidate], target: Target, liked_tags: list[str], disliked_tags: list[str]
) -> str:
    candidates_block = "\n".join(_describe_candidate(i, c) for i, c in enumerate(candidates))
    return f"""You are picking the best meal option for a college student at a dining hall,
from candidates that already satisfy their dietary restrictions and are close to their
macro targets. Only use liked/disliked preferences to choose between them and to write
a short, appealing description — do not change the items or amounts.

Target: {target.calories:.0f} cal, {target.protein_g:.0f}g protein, {target.carbs_g:.0f}g carbs, {target.fat_g:.0f}g fat
Liked foods: {liked_tags or "none stated"}
Disliked foods: {disliked_tags or "none stated"}

{candidates_block}

Respond with ONLY valid JSON, no markdown fences, no commentary:
{{
  "chosen_index": <int, index of the best candidate above>,
  "name": <short appealing meal name, e.g. "Grilled Chicken & Rice Bowl">,
  "rationale": <one sentence on why this fits their goals/preferences>
}}"""


async def polish_meal(
    client: AsyncAnthropic,
    candidates: list[MealCandidate],
    target: Target,
    liked_tags: list[str],
    disliked_tags: list[str],
) -> PolishedMeal | None:
    if not candidates:
        return None

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=300,
            messages=[{"role": "user", "content": _build_prompt(candidates, target, liked_tags, disliked_tags)}],
        )
        text = "".join(block.text for block in response.content if block.type == "text")
        data = _extract_json(text)

        chosen_index = int(data["chosen_index"])
        if not (0 <= chosen_index < len(candidates)):
            chosen_index = 0

        return PolishedMeal(candidate_index=chosen_index, name=str(data["name"]), rationale=str(data["rationale"]))
    except Exception:
        logger.exception("Meal polish failed, falling back to first candidate")
        return PolishedMeal(candidate_index=0, name="Today's Meal", rationale="")
