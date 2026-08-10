"""Per-eatery, per-station pairwise comparison — a live-menu counterpart to
app/services/food_survey.py's hand-curated catalog. See docs/adr/0013.

app/services/food_survey.py's PRIMARY_PAIRS work well for one-time
onboarding signal, but they're the same fixed Cornell-wide items for every
user forever. This instead asks "which of today's actual Grill/Pizza/Chef's
Table options at *this* eatery would you rather eat" — a smaller, repeatable
comparison sourced from whatever's really on the menu right now, restricted
to the "staple" stations that reliably offer more than one option worth
comparing (most other categories either aren't a real choice — see
docs/adr/0012's finding that station names mix dressings/desserts/entrees —
or are a single specialty item with nothing to compare it against).

Feeds the same liked_tags/disliked_tags UserPreference already has, via the
same score_survey/merge_tags app.services.food_survey already provides —
app.services.preference_scoring needs no changes to consume it.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.services.food_survey import FoodSurveyItem, FoodSurveyPair
from app.services.meal_crafting import CONDIMENT_KEYWORDS

# Dining-hall station category names (lowercased) that reliably serve more
# than one comparable staple option, grouped under one station label.
# Deliberately not every category — "Salad" mixes dressing/tofu/rice under
# one label, "Desserts" isn't a meal-preference comparison anyone asked for
# (same category-name-isn't-food-role finding as docs/adr/0012).
STAPLE_STATIONS: dict[str, set[str]] = {
    "grill": {"grill", "flat top grill", "iron grill"},
    "pizza": {"pizza", "pizza station"},
    "chef's choice": {"chef's table"},
}

# Per station, not overall — keeps a single eatery visit to a handful of
# quick comparisons (at most 2 stations-worth here × 3 stations = 6) rather
# than exhaustively pairing every item, matching the existing food survey's
# "quick, not exhaustive" design.
MAX_PAIRS_PER_STATION = 2

_STOPWORDS = {"with", "and", "the", "a", "an", "of", "in", "on", "style", "fresh", "assorted", "house", "made", "our"}


@dataclass(frozen=True)
class StationItem:
    name: str
    category: str
    diet_tags: list[str]
    allergens: list[str]


def _derive_tags(name: str) -> list[str]:
    """Lowercase, punctuation-stripped significant words from the item name
    as taste tags — same loose substring-matching contract
    app.services.preference_scoring already expects, just derived from the
    live name instead of hand-curated (no LLM call: this runs on every
    eatery-detail view, not a one-time onboarding step, so it stays free
    and instant)."""
    words = [w.strip(".,()") for w in name.lower().split()]
    significant = [w for w in words if w and w not in _STOPWORDS and len(w) > 2]
    return significant or [name.lower()]


def _is_condiment(name: str) -> bool:
    """A station's raw feed items can include a sauce/dressing alongside its
    real entree-style choices (confirmed live: Cornell's "Flat Top Grill"
    category lists a tahini sauce next to a rice-and-lentils dish) — the
    same mismatch app.services.meal_crafting's CONDIMENT_KEYWORDS already
    guards against for candidate generation applies just as much here: a
    sauce isn't a meaningful "which would you rather eat" alternative to a
    salad or a protein."""
    name_lower = name.lower()
    return any(keyword in name_lower for keyword in CONDIMENT_KEYWORDS)


def _item_compatible(item: StationItem, diet_restrictions: list[str], allergens: list[str]) -> bool:
    return set(diet_restrictions).issubset(item.diet_tags) and not (set(item.allergens) & set(allergens))


def _slug(s: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in s.lower()).strip("_")


def _pair_id(eatery_id: int, station: str, item_a: str, item_b: str) -> str:
    return f"station:{eatery_id}:{_slug(station)}:{_slug(item_a)}_vs_{_slug(item_b)}"


def build_station_survey(
    eatery_id: int, items: list[StationItem], diet_restrictions: list[str], allergens: list[str]
) -> list[FoodSurveyPair]:
    """Deterministic given the same (eatery, items, restrictions) — same
    contract as app.services.food_survey.build_survey: pair_id + choice
    must resolve the same way on GET vs POST. No server-side survey state
    is kept between the two calls — the POST handler re-derives the same
    pairs from scratch and looks responses up against that, which only
    works if this never randomizes and items are processed in a stable
    order (name) here."""
    by_station: dict[str, dict[str, StationItem]] = {}
    for item in items:
        if _is_condiment(item.name) or not _item_compatible(item, diet_restrictions, allergens):
            continue
        category = item.category.strip().lower()
        for station, categories in STAPLE_STATIONS.items():
            if category in categories:
                by_station.setdefault(station, {})[item.name] = item
                break

    pairs: list[FoodSurveyPair] = []
    for station, by_name in by_station.items():
        deduped = sorted(by_name.values(), key=lambda i: i.name)
        n_pairs = min(MAX_PAIRS_PER_STATION, len(deduped) // 2)
        for i in range(n_pairs):
            a, b = deduped[2 * i], deduped[2 * i + 1]
            pairs.append(
                FoodSurveyPair(
                    id=_pair_id(eatery_id, station, a.name, b.name),
                    item_a=FoodSurveyItem(
                        id=a.name, name=a.name, tags=_derive_tags(a.name),
                        diet_tags=a.diet_tags, allergens=a.allergens,
                    ),
                    item_b=FoodSurveyItem(
                        id=b.name, name=b.name, tags=_derive_tags(b.name),
                        diet_tags=b.diet_tags, allergens=b.allergens,
                    ),
                )
            )
    return pairs
