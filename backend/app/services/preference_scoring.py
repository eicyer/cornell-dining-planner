"""Deterministic Soft Preference scoring — see docs/adr/0009 and docs/adr/0015.

Ranks MealCandidates by how well they fit liked/disliked tags and the
selected Eating Styles (app.services.eating_styles), entirely without an LLM
call. Used to sort candidates before they reach app.services.meal_polish,
so preference-fit doesn't depend on that LLM call succeeding or judging
well. Never excludes a candidate outright — Soft Preferences only rank,
per CONTEXT.md; a disliked food can still appear if nothing else fits the
macro target, it's just scored lower. Every Eating Style rule below follows
that same never-exclude contract.
"""

from __future__ import annotations

from app.services.meal_crafting import CraftedItem, MealCandidate

# Categories/keywords that read as processed/indulgent rather than whole
# foods. An approximation (there's no real "processed-ness" data on menu
# items) — same category-heuristic pattern used for anchor selection in
# app.services.meal_crafting. Only ever penalizes; never boosts a category,
# to avoid falsely claiming something is a "whole food."
WHOLE_FOODS_PENALIZED_CATEGORIES = {"dessert", "desserts", "bagel bar/cereal", "pizza", "pizza station"}
WHOLE_FOODS_PENALIZED_KEYWORDS = {"fried", "candy", "cookie", "cake", "soda"}

# UK FSA traffic-light "high sugar" line, per 100g — an externally-defined
# threshold rather than one tuned to this app's data, same spirit as the
# category heuristics above but backed by real sugar_g/fiber_g data now
# that it exists (see docs/adr/0014). Checked against the item's own
# density (grams of sugar per 100g of the item), not the absolute grams
# contributed to this meal — "is this a high-sugar food" is a property of
# the food, not of how much of it happens to be on the plate.
HIGH_SUGAR_G_PER_100G = 22.5

# Commonly-cited "good source of fiber" line (FDA per-serving convention,
# roughly 10% DV) adapted to this app's per-100g density convention rather
# than a specific serving size.
GOOD_FIBER_SOURCE_G_PER_100G = 3.0


def _matches_any_tag(name_lower: str, tags: list[str]) -> bool:
    return any(tag.lower() in name_lower for tag in tags if tag)


def _is_processed(name_lower: str, category: str) -> bool:
    if category.strip().lower() in WHOLE_FOODS_PENALIZED_CATEGORIES:
        return True
    return any(keyword in name_lower for keyword in WHOLE_FOODS_PENALIZED_KEYWORDS)


def _density_per_100g(grams_of_nutrient: float, item_grams: float) -> float:
    return grams_of_nutrient / item_grams * 100 if item_grams > 0 else 0.0


def _is_high_sugar(item: CraftedItem) -> bool:
    return _density_per_100g(item.sugar_g, item.grams) >= HIGH_SUGAR_G_PER_100G


def _is_good_fiber_source(item: CraftedItem) -> bool:
    return _density_per_100g(item.fiber_g, item.grams) >= GOOD_FIBER_SOURCE_G_PER_100G


def score_candidate(
    candidate: MealCandidate,
    liked_tags: list[str],
    disliked_tags: list[str],
    eating_styles: list[str],
) -> int:
    score = 0
    for item in candidate.items:
        name_lower = item.name.lower()
        if _matches_any_tag(name_lower, liked_tags):
            score += 1
        if _matches_any_tag(name_lower, disliked_tags):
            score -= 1
        if "whole_foods_focus" in eating_styles and _is_processed(name_lower, item.category):
            score -= 1
        if "low_sugar" in eating_styles and _is_high_sugar(item):
            score -= 1
        if "high_fiber" in eating_styles and _is_good_fiber_source(item):
            score += 1
    return score


def rank_candidates(
    candidates: list[MealCandidate],
    liked_tags: list[str],
    disliked_tags: list[str],
    eating_styles: list[str],
) -> list[MealCandidate]:
    """Highest score first. Stable for ties, so candidate order from
    generate_candidates still breaks ties when preference fit is equal."""
    return sorted(
        candidates,
        key=lambda c: score_candidate(c, liked_tags, disliked_tags, eating_styles),
        reverse=True,
    )
