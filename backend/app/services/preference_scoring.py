"""Deterministic Soft Preference scoring — see docs/adr/0009.

Ranks MealCandidates by how well they fit liked/disliked tags and the
"prefer whole & minimally processed foods" toggle, entirely without an LLM
call. Used to sort candidates before they reach app.services.meal_polish,
so preference-fit doesn't depend on that LLM call succeeding or judging
well. Never excludes a candidate outright — Soft Preferences only rank,
per CONTEXT.md; a disliked food can still appear if nothing else fits the
macro target, it's just scored lower.
"""

from __future__ import annotations

from app.services.meal_crafting import MealCandidate

# Categories/keywords that read as processed/indulgent rather than whole
# foods. An approximation (there's no real "processed-ness" data on menu
# items) — same category-heuristic pattern used for anchor selection in
# app.services.meal_crafting. Only ever penalizes; never boosts a category,
# to avoid falsely claiming something is a "whole food."
WHOLE_FOODS_PENALIZED_CATEGORIES = {"dessert", "desserts", "bagel bar/cereal", "pizza", "pizza station"}
WHOLE_FOODS_PENALIZED_KEYWORDS = {"fried", "candy", "cookie", "cake", "soda"}


def _matches_any_tag(name_lower: str, tags: list[str]) -> bool:
    return any(tag.lower() in name_lower for tag in tags if tag)


def _is_processed(name_lower: str, category: str) -> bool:
    if category.strip().lower() in WHOLE_FOODS_PENALIZED_CATEGORIES:
        return True
    return any(keyword in name_lower for keyword in WHOLE_FOODS_PENALIZED_KEYWORDS)


def score_candidate(
    candidate: MealCandidate,
    liked_tags: list[str],
    disliked_tags: list[str],
    prefer_whole_foods: bool,
) -> int:
    score = 0
    for item in candidate.items:
        name_lower = item.name.lower()
        if _matches_any_tag(name_lower, liked_tags):
            score += 1
        if _matches_any_tag(name_lower, disliked_tags):
            score -= 1
        if prefer_whole_foods and _is_processed(name_lower, item.category):
            score -= 1
    return score


def rank_candidates(
    candidates: list[MealCandidate],
    liked_tags: list[str],
    disliked_tags: list[str],
    prefer_whole_foods: bool,
) -> list[MealCandidate]:
    """Highest score first. Stable for ties, so candidate order from
    generate_candidates still breaks ties when preference fit is equal."""
    return sorted(
        candidates,
        key=lambda c: score_candidate(c, liked_tags, disliked_tags, prefer_whole_foods),
        reverse=True,
    )
