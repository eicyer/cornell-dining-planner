"""Meal Preference Survey — pairwise "which would you rather eat" contrasts
drawn from the admin-curated Common Foods catalog (app.db.models.CommonFood),
one round per (meal_period, role) bucket. See
docs/adr/0020-common-foods-catalog-and-meal-preference-survey.

Mirrors app.services.station_survey's shape exactly: reuses
app.services.food_survey's FoodSurveyItem/FoodSurveyPair dataclasses and
score_survey/merge_tags engine, so app.services.preference_scoring needs no
changes to consume the result — a winning "chicken" tag substring-matches
"Grilled Chicken Breast" the same way any other liked_tags entry does.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.services.food_survey import FoodSurveyItem, FoodSurveyPair

MEAL_PERIOD_ORDER = ("breakfast", "lunch", "dinner")
ROLE_ORDER = ("protein", "vegetable", "carb")

# One pair per (meal_period, role) bucket — nine buckets total — keeps this
# a quick ~9-round comparison rather than exhaustively pairing every
# subtype, the same "quick, not exhaustive" ethos as
# station_survey.MAX_PAIRS_PER_STATION (tuned to 1 instead of 2 here since
# there are already nine buckets rather than three stations).
MAX_PAIRS_PER_BUCKET = 1


@dataclass(frozen=True)
class CommonFoodItem:
    id: int
    name: str
    meal_period: str
    role: str
    subtype: str
    tags: list[str]
    diet_tags: list[str]
    allergens: list[str]


def _item_compatible(item: CommonFoodItem, diet_restrictions: list[str], allergens: list[str]) -> bool:
    return set(diet_restrictions).issubset(item.diet_tags) and not (set(item.allergens) & set(allergens))


def _slug(s: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in s.lower()).strip("_")


def _pair_id(meal_period: str, role: str, subtype_a: str, subtype_b: str) -> str:
    return f"meal_pref:{meal_period}:{role}:{_slug(subtype_a)}_vs_{_slug(subtype_b)}"


def _to_survey_item(item: CommonFoodItem) -> FoodSurveyItem:
    return FoodSurveyItem(
        id=item.name, name=item.name, tags=item.tags, diet_tags=item.diet_tags, allergens=item.allergens
    )


def build_meal_preference_survey(
    foods: list[CommonFoodItem], diet_restrictions: list[str], allergens: list[str]
) -> list[FoodSurveyPair]:
    """Deterministic given the same (foods, restrictions) — same "no
    server-side survey state between GET and POST" contract as
    app.services.food_survey.build_survey and
    app.services.station_survey.build_station_survey: items are grouped and
    sorted by name/subtype before pairing, so a POST handler can re-derive
    the identical pairs from scratch.

    Within each (meal_period, role) bucket, picks one representative item
    per distinct subtype (alphabetically first by name) and pairs adjacent
    subtypes (sorted alphabetically) — e.g. dinner protein's
    [chicken, fish, minced_meat, ...] contrasts chicken vs. fish. A bucket
    with fewer than two distinct subtypes yields no pair.
    """
    compatible = [f for f in foods if _item_compatible(f, diet_restrictions, allergens)]

    pairs: list[FoodSurveyPair] = []
    for meal_period in MEAL_PERIOD_ORDER:
        for role in ROLE_ORDER:
            bucket = [f for f in compatible if f.meal_period == meal_period and f.role == role]
            by_subtype: dict[str, CommonFoodItem] = {}
            for item in sorted(bucket, key=lambda f: f.name):
                by_subtype.setdefault(item.subtype, item)
            subtypes = sorted(by_subtype)

            n_pairs = min(MAX_PAIRS_PER_BUCKET, len(subtypes) // 2)
            for i in range(n_pairs):
                subtype_a, subtype_b = subtypes[2 * i], subtypes[2 * i + 1]
                item_a, item_b = by_subtype[subtype_a], by_subtype[subtype_b]
                pairs.append(
                    FoodSurveyPair(
                        id=_pair_id(meal_period, role, subtype_a, subtype_b),
                        item_a=_to_survey_item(item_a),
                        item_b=_to_survey_item(item_b),
                    )
                )
    return pairs
