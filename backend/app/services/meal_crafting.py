"""Deterministic meal-crafting optimizer — see docs/adr/0003 and docs/adr/0012.

Pure functions over plain data, no DB/ORM coupling, so the algorithm is
directly testable. Hard Constraints (diet tags, allergens) are enforced
exactly by filtering; Soft Preferences are NOT used here at all — they only
come into play in the LLM polish step (app.services.meal_polish), which picks
among these candidates. Portion size is solved per user/meal, per
docs/adr/0007 — nothing here is a fixed "standard portion."

Real dining-hall meals can rarely hit all four macro targets exactly with a
handful of discrete items — this optimizes for closest fit within bounds,
not an exact solve. That's a deliberate simplification, not a bug.

Candidates are built from a benchmark plate model (protein + carb +
vegetable, one item each) rather than "one item per dining-hall station" —
see docs/adr/0012-plate-role-portioning.md for why: a station like "Salad"
mixes dressing, tofu, and rice under one label, so station name is not a
reliable stand-in for a food's role on a plate.
"""

from __future__ import annotations

from dataclasses import dataclass, field

GRAMS_ROUNDING = 10.0

# The protein-bearing item in a candidate set gets a dedicated, realistic
# entree-sized portion computed directly from the protein target, rather
# than being solved jointly with everything else — a joint solve was
# squeezing dense protein items down toward the floor (e.g. 20g of beef)
# whenever a little of them already covered the macro target on paper.
ANCHOR_MIN_GRAMS = 100.0
ANCHOR_MAX_GRAMS = 280.0

# Benchmark serving ranges for the other two plate roles — see
# docs/adr/0012. Grounded in the hand-portion method (roughly a fist of
# vegetables, 1-2 cupped hands of a starch/grain) rather than an arbitrary
# "side" range, and kept distinct from each other because a calorie-dilute
# vegetable and a calorie-dense starch shouldn't share one bound: forcing
# both into the same 40-250g window is what let a solve size a vegetable
# down to a garnish or a starch up to a mountain for a marginal macro-fit
# gain.
VEG_MIN_GRAMS = 80.0
VEG_MAX_GRAMS = 220.0
CARB_MIN_GRAMS = 100.0
CARB_MAX_GRAMS = 250.0

# Below this, even a floor-sized carb item (CARB_MIN_GRAMS) would overshoot
# the carb target several times over — a very low carb target (e.g. a
# keto-style macro split) can't be served by shrinking the role further,
# since CARB_MIN_GRAMS is already a realistic serving floor, not a knob.
# Dropping the carb role entirely fits a target this low far better than
# including it ever could. No equivalent threshold for protein/vegetable:
# their driving targets (protein_g, calories) aren't expected to run this
# close to zero the way a deliberately carb-restricted target does.
CARB_TARGET_SKIP_THRESHOLD_G = 15.0

# Protein density (not calorie share) separates real protein sources from
# everything else. Cooked grains/potatoes/vegetables all sit under ~3g
# protein/100g, so this threshold is comfortably above that noise floor
# without excluding fattier protein foods like tofu or salmon, which a
# calorie-*share* split would misclassify as "fat" (tofu is ~55% fat
# calories despite being a protein source) — see docs/adr/0012.
PROTEIN_DENSITY_MIN = 8.0

# Splits calorie-dilute "vegetable" items from calorie-dense "carb/starch"
# items by density, since both can be carb-dominant by macro share alone
# (a leafy green and a bowl of rice are both "mostly carbs" by ratio).
# Non-starchy vegetables run ~15-45 kcal/100g; starchy vegetables and
# cooked grains run ~70-140+ kcal/100g. 80 sits between the two bands.
VEGETABLE_MAX_CALORIES_PER_100G = 80.0

# Categories that are never a plate role regardless of nutrient profile —
# desserts/fruit-yogurt/bagel items can read as "low calorie density" and
# would otherwise slip into the vegetable role; beverages/coffee never
# belong on the plate at all.
EXCLUDED_ROLE_CATEGORIES = {
    "beverages", "beverage", "beverage bar", "coffee bar", "condiments",
    "dessert", "desserts", "fruit & yogurt bar", "bagel bar/cereal",
}

# Stations that aren't "the protein" even when a mismatched nutrition entry
# makes their number look protein-dense on paper — a salad-bar or soup item
# can read as high-protein from a bad USDA match (see docs/adr/0003
# addendum) more easily than an actual entree can, since it isn't a
# protein-heavy station to begin with. Restricting protein-role eligibility
# to real entree/protein stations catches that; these categories can still
# be picked for the carb/vegetable roles, just never protein.
PROTEIN_ROLE_EXCLUDED_CATEGORIES = {"salad", "soup", "chef's table - sides"}

# Name substrings for seasoning-scale items (dressings, sauces, spreads).
# These can be calorie-dense or protein-adjacent enough to slip past the
# category/density checks above, but a bounded solve has no way to tell a
# 20g drizzle of dressing from a 200g vegetable apart from this — see
# docs/adr/0012. Only ever excludes; a real entree that happens to contain
# one of these words is a false negative we accept over the false positive
# of sizing a condiment like a side.
CONDIMENT_KEYWORDS = {
    "dressing", "vinaigrette", "sauce", "syrup", "gravy", "dip", "topping",
    "butter", "oil", "jam", "jelly", "cream cheese",
}

ROLE_ORDER = ("protein", "carb", "vegetable")


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
    # Informational only — never a Hard Constraint or a solve target (there's
    # no "daily sugar/fiber goal" field), just data for
    # app.services.preference_scoring's eating-style rules to read off the
    # final candidate. Defaults to 0.0 rather than None so callers with no
    # data for an item (see docs/adr/0014) don't need a null check.
    sugar_g_per_100g: float = 0.0
    fiber_g_per_100g: float = 0.0


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
    sugar_g: float
    fiber_g: float


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


def classify_role(item: ItemNutrition) -> str | None:
    """Which plate role (see docs/adr/0012) this item plays, or None if it
    isn't a real plate component (drinks, desserts, condiments) — those are
    excluded from candidate generation entirely rather than gram-solved
    like a side."""
    name_lower = item.name.lower()
    if item.category.strip().lower() in EXCLUDED_ROLE_CATEGORIES:
        return None
    if any(keyword in name_lower for keyword in CONDIMENT_KEYWORDS):
        return None
    if (
        item.protein_g_per_100g >= PROTEIN_DENSITY_MIN
        and item.category.strip().lower() not in PROTEIN_ROLE_EXCLUDED_CATEGORIES
    ):
        return "protein"
    if item.calories_per_100g < VEGETABLE_MAX_CALORIES_PER_100G:
        return "vegetable"
    return "carb"


def group_by_role(items: list[ItemNutrition]) -> dict[str, list[ItemNutrition]]:
    groups: dict[str, list[ItemNutrition]] = {role: [] for role in ROLE_ORDER}
    for item in items:
        role = classify_role(item)
        if role is not None:
            groups[role].append(item)
    return {role: bucket for role, bucket in groups.items() if bucket}


def generate_item_sets(groups: dict[str, list[ItemNutrition]], n_sets: int) -> list[list[ItemNutrition]]:
    """n_sets deterministic, distinct combinations — at most one item per
    available role (protein/carb/vegetable), rotating through each role's
    options so candidates differ. A role missing from the eatery's current
    offerings is simply skipped rather than forcing an unrelated
    substitute into that slot."""
    roles = [r for r in ROLE_ORDER if r in groups]
    sets = []
    for i in range(n_sets):
        chosen = [groups[role][i % len(groups[role])] for role in roles]
        if chosen not in sets:
            sets.append(chosen)
    return sets


def _append_item(
    items: list[CraftedItem], totals: dict[str, float], item: ItemNutrition, grams: float
) -> None:
    calories = item.calories_per_100g * grams / 100
    protein_g = item.protein_g_per_100g * grams / 100
    carbs_g = item.carbs_g_per_100g * grams / 100
    fat_g = item.fat_g_per_100g * grams / 100
    sugar_g = item.sugar_g_per_100g * grams / 100
    fiber_g = item.fiber_g_per_100g * grams / 100
    items.append(
        CraftedItem(
            name=item.name, category=item.category, grams=grams,
            calories=calories, protein_g=protein_g, carbs_g=carbs_g, fat_g=fat_g,
            sugar_g=sugar_g, fiber_g=fiber_g,
        )
    )
    totals["calories"] += calories
    totals["protein_g"] += protein_g
    totals["carbs_g"] += carbs_g
    totals["fat_g"] += fat_g
    totals["sugar_g"] += sugar_g
    totals["fiber_g"] += fiber_g


def _reduce_target(target: Target, item: ItemNutrition, grams: float) -> Target:
    return Target(
        calories=max(target.calories - item.calories_per_100g * grams / 100, 0.0),
        protein_g=max(target.protein_g - item.protein_g_per_100g * grams / 100, 0.0),
        carbs_g=max(target.carbs_g - item.carbs_g_per_100g * grams / 100, 0.0),
        fat_g=max(target.fat_g - item.fat_g_per_100g * grams / 100, 0.0),
    )


def _grams_for_remaining(
    remaining_value: float,
    density_per_100g: float,
    min_grams: float,
    max_grams: float,
    calorie_bound: tuple[float, float] | None = None,
) -> float:
    """Solves grams directly from whatever's left of this role's driving
    number (protein for protein, carbs for carb, calories for vegetable —
    see docs/adr/0012), then clamps to a realistic serving range. A target
    already covered by an earlier role (remaining ~0) clamps to the floor
    rather than solving toward 0g; a very calorie-dilute item clamps to the
    ceiling rather than ballooning to try to cover the remainder alone —
    this clamp is what makes the portion adapt to the specific item's
    calorie density instead of applying one fixed gram figure to every food
    in a role.

    `calorie_bound`, when given, is `(remaining_calories, calories_per_100g)`
    for this same item: reaching the driving macro is still the goal, but
    the solve is never allowed to use more grams than it'd take to burn
    through the meal's whole remaining calorie budget on this item alone —
    see docs/adr/0012 addendum. Without this, a calorie-dense item chasing
    a still-unmet macro target (e.g. a fatty protein source short of the
    protein target) could land on the macro while blowing well past the
    meal's calorie target."""
    if density_per_100g <= 0:
        grams = max_grams
    else:
        grams = remaining_value / density_per_100g * 100
    if calorie_bound is not None:
        remaining_calories, calories_per_100g = calorie_bound
        if calories_per_100g > 0:
            grams = min(grams, remaining_calories / calories_per_100g * 100)
    grams = min(max(grams, min_grams), max_grams)
    return round(grams / GRAMS_ROUNDING) * GRAMS_ROUNDING


def solve_portions(selected: list[ItemNutrition], target: Target) -> MealCandidate | None:
    """Fixed-serving items (whole-plate-only dishes) are always included at
    their fixed weight first, never gram-solved. Each remaining, flexible
    item is sized directly off whatever's left of its role's driving macro
    after earlier roles have taken their share — protein anchors off the
    protein target, carb off the carb target, vegetable off the calorie
    target (vegetables aren't chosen to hit a specific macro) — bounded to
    that role's benchmark serving range and, for protein/carb, to the
    meal's remaining calorie budget at that item's own density, so a
    calorie-dense item chasing its macro target can't do so by blowing
    past the calorie target (see docs/adr/0012 addendum). A role with no
    item in this candidate set is simply skipped."""
    if not selected:
        return None
    if target.calories <= 0 or target.protein_g <= 0 or target.carbs_g <= 0 or target.fat_g <= 0:
        return None

    fixed = [i for i in selected if i.fixed_serving_grams is not None]
    flexible = [i for i in selected if i.fixed_serving_grams is None]

    items: list[CraftedItem] = []
    totals = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0, "sugar_g": 0.0, "fiber_g": 0.0}
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

    by_role = {classify_role(i): i for i in flexible if classify_role(i) is not None}

    carb_item = by_role.get("carb")
    if carb_item is not None and remaining_target.carbs_g < CARB_TARGET_SKIP_THRESHOLD_G:
        # See CARB_TARGET_SKIP_THRESHOLD_G.
        carb_item = None

    # The other two roles still need at least their own floor portion after
    # the anchor is sized — reserving those floor-calories up front (rather
    # than bounding the anchor to the *entire* remaining budget) keeps a
    # calorie-dense anchor from consuming the whole meal and forcing carb/
    # veg down to a floor that then overshoots on top of it anyway. See
    # docs/adr/0012 addendum.
    reserved_calories = 0.0
    if carb_item is not None:
        reserved_calories += carb_item.calories_per_100g * CARB_MIN_GRAMS / 100
    veg_item = by_role.get("vegetable")
    if veg_item is not None:
        reserved_calories += veg_item.calories_per_100g * VEG_MIN_GRAMS / 100

    protein_item = by_role.get("protein")
    if protein_item is not None:
        protein_calorie_budget = max(remaining_target.calories - reserved_calories, 0.0)
        grams = _grams_for_remaining(
            remaining_target.protein_g, protein_item.protein_g_per_100g, ANCHOR_MIN_GRAMS, ANCHOR_MAX_GRAMS,
            calorie_bound=(protein_calorie_budget, protein_item.calories_per_100g),
        )
        _append_item(items, totals, protein_item, grams)
        remaining_target = _reduce_target(remaining_target, protein_item, grams)

    if carb_item is not None:
        veg_reserved_calories = veg_item.calories_per_100g * VEG_MIN_GRAMS / 100 if veg_item is not None else 0.0
        carb_calorie_budget = max(remaining_target.calories - veg_reserved_calories, 0.0)
        grams = _grams_for_remaining(
            remaining_target.carbs_g, carb_item.carbs_g_per_100g, CARB_MIN_GRAMS, CARB_MAX_GRAMS,
            calorie_bound=(carb_calorie_budget, carb_item.calories_per_100g),
        )
        _append_item(items, totals, carb_item, grams)
        remaining_target = _reduce_target(remaining_target, carb_item, grams)

    if veg_item is not None:
        grams = _grams_for_remaining(
            remaining_target.calories, veg_item.calories_per_100g, VEG_MIN_GRAMS, VEG_MAX_GRAMS
        )
        _append_item(items, totals, veg_item, grams)
        remaining_target = _reduce_target(remaining_target, veg_item, grams)

    return MealCandidate(items=items, totals=totals)


def generate_candidates(
    items: list[ItemNutrition], target: Target, constraints: HardConstraints, n_candidates: int = 3
) -> list[MealCandidate]:
    eligible = filter_items(items, constraints)
    groups = group_by_role(eligible)
    if not groups:
        return []

    item_sets = generate_item_sets(groups, n_candidates)
    candidates = [solve_portions(item_set, target) for item_set in item_sets]
    return [c for c in candidates if c is not None]
