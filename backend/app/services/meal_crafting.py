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

GRAMS_ROUNDING = 10.0

# The item with the highest protein density in a candidate set is treated as
# "the protein choice" (meat/fish/tofu/beans reliably out-protein sides like
# rice or salad per 100g — see docs/adr/0003 addendum). It gets a dedicated,
# realistic entree-sized portion computed directly from the protein target,
# rather than being solved jointly with everything else — that joint solve
# was squeezing dense protein items down toward the floor (e.g. 20g of beef)
# whenever a little of them already covered the macro target on paper.
ANCHOR_MIN_GRAMS = 100.0
ANCHOR_MAX_GRAMS = 280.0

# Remaining (non-anchor) items share a narrower range than before so no side
# ends up looking like a garnish (too little) or a mountain (too much) next
# to the anchor — keeps portions across one meal in a plausible range of
# each other instead of swinging from 20g to 400g.
SIDE_MIN_GRAMS = 40.0
SIDE_MAX_GRAMS = 250.0

MAX_CATEGORIES = 5
# Categories that don't meaningfully contribute to "a meal" and would
# otherwise dilute candidate generation (a coffee isn't a meal component).
NON_MEAL_CATEGORIES = {"beverages", "coffee bar", "condiments"}

# Stations that aren't "the protein" even when their nutrition numbers look
# protein-dense on paper (a mismatched USDA entry can make a yogurt/fruit
# item read as higher-protein than the actual entree). Anchor selection is
# restricted to real protein/entree stations so it never picks, say, a chia
# pudding over the beef dish next to it.
ANCHOR_EXCLUDED_CATEGORIES = {
    "bagel bar/cereal", "beverage", "beverage bar", "beverages",
    "dessert", "desserts", "fruit & yogurt bar", "salad", "soup",
    "chef's table - sides",
}


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
    # Set only for items that are only ever served as a whole plate (e.g. a
    # build-your-own stir-fry) — see app.services.customizable_items. Skips
    # gram-solving entirely instead of being bounded like a normal anchor/side.
    fixed_serving_grams: float | None = None


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


def _pick_anchor(selected: list[ItemNutrition]) -> ItemNutrition | None:
    """The item most representative of "the protein" in this set: highest
    protein density, restricted to actual entree/protein stations."""
    candidates = [
        i for i in selected
        if i.protein_g_per_100g > 0 and i.category.strip().lower() not in ANCHOR_EXCLUDED_CATEGORIES
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda i: i.protein_g_per_100g)


def _append_item(
    items: list[CraftedItem], totals: dict[str, float], item: ItemNutrition, grams: float
) -> None:
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


def _normalized_row(values: list[float], target_value: float) -> list[float]:
    # Guards against a macro the anchor already fully covered (remaining
    # target 0) rather than requiring every macro to still be positive.
    denom = target_value if target_value > 1e-6 else 1.0
    return [v / denom for v in values]


def _solve_bounded(
    items: list[ItemNutrition], target: Target, min_grams: float, max_grams: float
) -> list[tuple[ItemNutrition, float]]:
    """Bounded least squares: minimize relative deviation from target across
    all four macros simultaneously (normalizing by target so a calorie error
    and a gram-of-protein error are weighted comparably), one unknown (grams,
    bounded to a realistic serving range) per item."""
    A = np.array(
        [
            _normalized_row([i.calories_per_100g for i in items], target.calories),
            _normalized_row([i.protein_g_per_100g for i in items], target.protein_g),
            _normalized_row([i.carbs_g_per_100g for i in items], target.carbs_g),
            _normalized_row([i.fat_g_per_100g for i in items], target.fat_g),
        ]
    )
    b = np.ones(4)
    bounds = (min_grams / 100, max_grams / 100)
    result = lsq_linear(A, b, bounds=bounds)
    return [
        (item, max(min_grams, round(x * 100 / GRAMS_ROUNDING) * GRAMS_ROUNDING))
        for item, x in zip(items, result.x)
    ]


def solve_portions(selected: list[ItemNutrition], target: Target) -> MealCandidate | None:
    """Fixed-serving items (whole-plate-only dishes) are always included at
    their fixed weight first, never gram-solved. The remaining, flexible
    items then anchor on their protein item (a dedicated, realistic
    entree-sized portion sized off whatever's left of the protein target),
    and solve the rest against whatever's left of the target after that. If
    nothing in the set has any protein, every flexible item is solved jointly
    against the side bounds instead — there's no anchor to speak of."""
    if not selected:
        return None
    if target.calories <= 0 or target.protein_g <= 0 or target.carbs_g <= 0 or target.fat_g <= 0:
        return None

    fixed = [i for i in selected if i.fixed_serving_grams is not None]
    flexible = [i for i in selected if i.fixed_serving_grams is None]

    items: list[CraftedItem] = []
    totals = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
    remaining_target = target

    for item in fixed:
        _append_item(items, totals, item, item.fixed_serving_grams)

    if fixed:
        remaining_target = Target(
            calories=max(target.calories - totals["calories"], 0.0),
            protein_g=max(target.protein_g - totals["protein_g"], 0.0),
            carbs_g=max(target.carbs_g - totals["carbs_g"], 0.0),
            fat_g=max(target.fat_g - totals["fat_g"], 0.0),
        )

    anchor = _pick_anchor(flexible)
    others = [i for i in flexible if i is not anchor]

    if anchor is not None:
        grams_for_target = remaining_target.protein_g / anchor.protein_g_per_100g * 100
        anchor_grams = min(max(grams_for_target, ANCHOR_MIN_GRAMS), ANCHOR_MAX_GRAMS)
        anchor_grams = round(anchor_grams / GRAMS_ROUNDING) * GRAMS_ROUNDING
        _append_item(items, totals, anchor, anchor_grams)

        remaining_target = Target(
            calories=max(remaining_target.calories - anchor.calories_per_100g * anchor_grams / 100, 0.0),
            protein_g=max(remaining_target.protein_g - anchor.protein_g_per_100g * anchor_grams / 100, 0.0),
            carbs_g=max(remaining_target.carbs_g - anchor.carbs_g_per_100g * anchor_grams / 100, 0.0),
            fat_g=max(remaining_target.fat_g - anchor.fat_g_per_100g * anchor_grams / 100, 0.0),
        )

    if others:
        for item, grams in _solve_bounded(others, remaining_target, SIDE_MIN_GRAMS, SIDE_MAX_GRAMS):
            _append_item(items, totals, item, grams)

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
