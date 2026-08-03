"""Deterministic meal-crafting optimizer — see docs/adr/0003.

Pure functions over plain data, no DB/ORM coupling, so the algorithm is
directly testable. Hard Constraints (diet tags, allergens) are enforced
exactly by filtering; Soft Preferences are NOT used here at all — they only
come into play in the LLM polish step (app.services.meal_polish), which picks
among these candidates. Portion size is solved per user/meal, per
docs/adr/0007 — nothing here is a fixed "standard portion."

Real dining-hall meals can rarely hit all four macro targets exactly with a
handful of discrete items — this optimizes for closest fit within bounds,
not an exact solve. That's a deliberate simplification, not a bug.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import lsq_linear

MIN_GRAMS = 20.0
MAX_GRAMS = 400.0
GRAMS_ROUNDING = 10.0

MAX_CATEGORIES = 5
# Categories that don't meaningfully contribute to "a meal" and would
# otherwise dilute candidate generation (a coffee isn't a meal component).
NON_MEAL_CATEGORIES = {"beverages", "coffee bar", "condiments"}


@dataclass
class ItemNutrition:
    name: str
    category: str
    calories_per_100g: float
    protein_g_per_100g: float
    carbs_g_per_100g: float
    fat_g_per_100g: float
    diet_tags: list[str] = field(default_factory=list)
    likely_allergens: list[str] = field(default_factory=list)


@dataclass
class Target:
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float


@dataclass
class HardConstraints:
    required_diet_tags: list[str] = field(default_factory=list)
    excluded_allergens: list[str] = field(default_factory=list)


@dataclass
class CraftedItem:
    name: str
    category: str
    grams: float
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float


@dataclass
class MealCandidate:
    items: list[CraftedItem]
    totals: dict[str, float]


def per_meal_target(
    daily_calories: float, daily_protein_g: float, daily_carb_g: float, daily_fat_g: float, meals_per_day: int
) -> Target:
    n = max(meals_per_day, 1)
    return Target(
        calories=daily_calories / n,
        protein_g=daily_protein_g / n,
        carbs_g=daily_carb_g / n,
        fat_g=daily_fat_g / n,
    )


def passes_hard_constraints(item: ItemNutrition, constraints: HardConstraints) -> bool:
    if any(d not in item.diet_tags for d in constraints.required_diet_tags):
        return False
    if any(a in item.likely_allergens for a in constraints.excluded_allergens):
        return False
    return True


def filter_items(items: list[ItemNutrition], constraints: HardConstraints) -> list[ItemNutrition]:
    return [i for i in items if passes_hard_constraints(i, constraints)]


def group_by_category(items: list[ItemNutrition]) -> dict[str, list[ItemNutrition]]:
    groups: dict[str, list[ItemNutrition]] = {}
    for item in items:
        if item.category.strip().lower() in NON_MEAL_CATEGORIES:
            continue
        groups.setdefault(item.category, []).append(item)
    return groups


def generate_item_sets(groups: dict[str, list[ItemNutrition]], n_sets: int) -> list[list[ItemNutrition]]:
    """n_sets deterministic, distinct combinations — one item per category,
    rotating through each category's options so candidates differ."""
    categories = list(groups.keys())[:MAX_CATEGORIES]
    sets = []
    for i in range(n_sets):
        chosen = [groups[cat][i % len(groups[cat])] for cat in categories]
        if chosen not in sets:
            sets.append(chosen)
    return sets


def solve_portions(selected: list[ItemNutrition], target: Target) -> MealCandidate | None:
    """Bounded least squares: minimize relative deviation from target across
    all four macros simultaneously (normalizing by target so a calorie error
    and a gram-of-protein error are weighted comparably), one unknown (grams,
    bounded to a realistic serving range) per selected item."""
    if not selected:
        return None
    if target.calories <= 0 or target.protein_g <= 0 or target.carbs_g <= 0 or target.fat_g <= 0:
        return None

    A = np.array(
        [
            [i.calories_per_100g / target.calories for i in selected],
            [i.protein_g_per_100g / target.protein_g for i in selected],
            [i.carbs_g_per_100g / target.carbs_g for i in selected],
            [i.fat_g_per_100g / target.fat_g for i in selected],
        ]
    )
    b = np.ones(4)
    bounds = (MIN_GRAMS / 100, MAX_GRAMS / 100)

    result = lsq_linear(A, b, bounds=bounds)

    items: list[CraftedItem] = []
    totals = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
    for item, x in zip(selected, result.x):
        grams = max(MIN_GRAMS, round(x * 100 / GRAMS_ROUNDING) * GRAMS_ROUNDING)
        calories = item.calories_per_100g * grams / 100
        protein_g = item.protein_g_per_100g * grams / 100
        carbs_g = item.carbs_g_per_100g * grams / 100
        fat_g = item.fat_g_per_100g * grams / 100

        items.append(
            CraftedItem(
                name=item.name, category=item.category, grams=grams,
                calories=calories, protein_g=protein_g, carbs_g=carbs_g, fat_g=fat_g,
            )
        )
        totals["calories"] += calories
        totals["protein_g"] += protein_g
        totals["carbs_g"] += carbs_g
        totals["fat_g"] += fat_g

    return MealCandidate(items=items, totals=totals)


def generate_candidates(
    items: list[ItemNutrition], target: Target, constraints: HardConstraints, n_candidates: int = 3
) -> list[MealCandidate]:
    eligible = filter_items(items, constraints)
    groups = group_by_category(eligible)
    if not groups:
        return []

    item_sets = generate_item_sets(groups, n_candidates)
    candidates = [solve_portions(item_set, target) for item_set in item_sets]
    return [c for c in candidates if c is not None]
