"""Pairwise forced-choice food survey — derives Soft Preference tags without
requiring free-text input. See docs/adr/0011-food-preference-survey and
CONTEXT.md ("Food Preference Survey"). Output feeds the *same*
liked_tags/disliked_tags UserPreference already has (app.services
.preference_parsing's target), so app.services.preference_scoring needs no
changes to consume it.

Item names are real, current Cornell dining item names, cross-checked
against the live scraped `menu_items` table rather than invented.

image_url values are illustrative stock photos (freely-licensed Wikimedia
Commons pictures of the same dish type) — not actual photos of the Cornell
dining hall's plating.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class FoodSurveyItem:
    id: str
    name: str
    tags: list[str]
    diet_tags: list[str]
    allergens: list[str]
    # Only ever populated for this module's hand-curated catalog below — see
    # each _item(...) call's image_url arg. app.services.station_survey
    # derives items from the live, ever-changing menu feed, so there's no
    # fixed catalog to hand-pick photos against there; those items always
    # get None and the frontend falls back to the existing color-dot look.
    image_url: str | None = None


@dataclass(frozen=True)
class FoodSurveyPair:
    id: str
    item_a: FoodSurveyItem
    item_b: FoodSurveyItem


def _item(
    id: str,
    name: str,
    tags: list[str],
    diet_tags: list[str] | None = None,
    allergens: list[str] | None = None,
    image_url: str | None = None,
) -> FoodSurveyItem:
    return FoodSurveyItem(
        id=id, name=name, tags=tags, diet_tags=diet_tags or [], allergens=allergens or [], image_url=image_url
    )


CHEESE_PIZZA = _item(
    "cheese_pizza", "Cheese Pizza", ["pizza", "cheese", "comfort food"], ["vegetarian"], ["dairy", "gluten"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Single_slice_of_deep_dish_cheese_pizza_from_Armand%27s.jpg/500px-Single_slice_of_deep_dish_cheese_pizza_from_Armand%27s.jpg",
)
VEGAN_CHEESE_PIZZA = _item(
    "vegan_cheese_pizza", "Vegan Cheese Pizza", ["pizza", "vegan", "cheese"],
    ["vegan", "vegetarian", "dairy_free"], ["gluten", "soy"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Happy_Spicy_Pizza_with_Daiya_Vegan_Cheese_%284713217908%29.jpg/500px-Happy_Spicy_Pizza_with_Daiya_Vegan_Cheese_%284713217908%29.jpg",
)
PEPPERONI_PIZZA = _item(
    "pepperoni_pizza", "Pepperoni Pizza", ["pizza", "pepperoni", "meat"], [], ["dairy", "gluten"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Pepperoni_pizza_slice_on_a_red_plate.jpg/500px-Pepperoni_pizza_slice_on_a_red_plate.jpg",
)
BBQ_CHICKEN_PIZZA = _item(
    "bbq_chicken_pizza", "BBQ Chicken Pizza", ["pizza", "chicken", "bbq"], [], ["dairy", "gluten"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Chicken_BBQ_Pizza.jpg/500px-Chicken_BBQ_Pizza.jpg",
)
CHEFS_CHOICE_PASTA = _item(
    "chefs_choice_pasta", "Chef's Choice Pasta", ["pasta", "italian", "comfort food"],
    ["vegetarian"], ["gluten", "dairy"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Creamy_white_sauce_penne_pasta.jpg/500px-Creamy_white_sauce_penne_pasta.jpg",
)
IRON_GRILL_STIR_FRY = _item(
    "iron_grill_stir_fry", "Customizable Iron Grill Stir-Fry", ["stir-fry", "asian", "vegetables"],
    ["gluten_free"], ["soy", "sesame"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Chinese_vegetable_stir_fry_noodles.jpg/500px-Chinese_vegetable_stir_fry_noodles.jpg",
)
SESAME_TOFU = _item(
    "sesame_tofu", "Sesame Marinated Tofu", ["tofu", "vegan", "sesame"],
    ["vegan", "vegetarian", "dairy_free", "gluten_free"], ["soy", "sesame"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Sesame_Tofu_%28121493798%29.jpg/500px-Sesame_Tofu_%28121493798%29.jpg",
)
SCRAMBLED_TOFU = _item(
    "scrambled_tofu", "Scrambled Tofu", ["tofu", "vegan", "breakfast"],
    ["vegan", "vegetarian", "dairy_free"], ["soy"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Tofu_Scramble_in_New_Orleans.jpg/500px-Tofu_Scramble_in_New_Orleans.jpg",
)
SCRAMBLED_EGGS = _item(
    "scrambled_eggs", "Scrambled Eggs", ["eggs", "breakfast", "protein"],
    ["vegetarian", "gluten_free"], ["eggs", "dairy"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Scrambled_eggs_with_basil.jpg/500px-Scrambled_eggs_with_basil.jpg",
)
HARD_BOILED_EGGS = _item(
    "hard_boiled_eggs", "Hard Boiled Eggs", ["eggs", "protein", "breakfast"],
    ["vegetarian", "gluten_free", "dairy_free"], ["eggs"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Hard_boiled_eggs_for_thit_heo_kho%2C_peeled.jpg/500px-Hard_boiled_eggs_for_thit_heo_kho%2C_peeled.jpg",
)
HOME_FRIES = _item(
    "home_fries", "Home Fries", ["potatoes", "fried", "comfort food"],
    ["vegan", "vegetarian", "gluten_free", "dairy_free"], [],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Solstice_morning_home_fries_in_pan.jpg/500px-Solstice_morning_home_fries_in_pan.jpg",
)
ROASTED_BROCCOLI = _item(
    "roasted_broccoli", "Roasted Broccoli", ["broccoli", "roasted vegetables", "healthy"],
    ["vegan", "vegetarian", "gluten_free", "dairy_free"], [],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Broccoli_close_up_%2849200262862%29.jpg/500px-Broccoli_close_up_%2849200262862%29.jpg",
)
PANCAKES = _item(
    "pancakes", "Pancakes with Syrup", ["pancakes", "sweet", "breakfast"],
    ["vegetarian"], ["gluten", "dairy", "eggs"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Pancake_with_maple_syrup_1.jpg/500px-Pancake_with_maple_syrup_1.jpg",
)
ICE_CREAM = _item(
    "ice_cream", "Cornell Dairy Ice Cream", ["ice cream", "dessert", "dairy"], ["vegetarian"], ["dairy"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Bowl_~_Ice_cream.jpg/500px-Bowl_~_Ice_cream.jpg",
)
VEGAN_CHOCOLATE_CAKE = _item(
    "vegan_chocolate_cake", "Vegan Chocolate Cake", ["chocolate", "dessert", "vegan"],
    ["vegan", "vegetarian", "dairy_free"], ["gluten", "soy"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Piece_of_chocolate_cake_on_a_white_plate_decorated_with_chocolate_sauce.jpg/500px-Piece_of_chocolate_cake_on_a_white_plate_decorated_with_chocolate_sauce.jpg",
)
CHIA_PUDDING = _item(
    "chia_pudding", "Coconut Chia Seed Pudding", ["chia seed pudding", "coconut", "vegan"],
    ["vegan", "vegetarian", "dairy_free", "gluten_free"], [],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Chia_pudding_with_coconut_milk_and_berries_%28KETO%2C_LCHF%2C_Low_Carb%2C_Gluten_free%2C_FIT%29_-_52774529156.jpg/500px-Chia_pudding_with_coconut_milk_and_berries_%28KETO%2C_LCHF%2C_Low_Carb%2C_Gluten_free%2C_FIT%29_-_52774529156.jpg",
)
OVERNIGHT_OATS = _item(
    "overnight_oats", "Apple Cinnamon Overnight Oats", ["oats", "apple", "breakfast"],
    ["vegan", "vegetarian", "dairy_free"], ["gluten"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Protein_overnight_oats.jpg/500px-Protein_overnight_oats.jpg",
)
TABBOULEH = _item(
    "tabbouleh", "Tabbouleh", ["tabbouleh", "herbs", "vegan"],
    ["vegan", "vegetarian", "dairy_free"], ["gluten"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Flickr_-_cyclonebill_-_Tabbouleh.jpg/500px-Flickr_-_cyclonebill_-_Tabbouleh.jpg",
)
GREEK_SALAD = _item(
    "greek_salad", "Greek Salad", ["salad", "feta", "vegetables"],
    ["vegetarian", "gluten_free"], ["dairy"],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Greek_salad_and_Tzatziki.jpg/500px-Greek_salad_and_Tzatziki.jpg",
)
CUCUMBER_TOMATO_SALAD = _item(
    "cucumber_tomato_salad", "Cucumber Tomato Salad", ["salad", "fresh vegetables", "light"],
    ["vegan", "vegetarian", "gluten_free", "dairy_free"], [],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Cucumber_onion_and_tomato_salad_with_mint_coriander_and_lemon.jpg/500px-Cucumber_onion_and_tomato_salad_with_mint_coriander_and_lemon.jpg",
)
JASMINE_RICE = _item(
    "jasmine_rice", "Steamed Jasmine Rice", ["rice", "asian", "simple"],
    ["vegan", "vegetarian", "gluten_free", "dairy_free"], [],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Steamed_rice_in_bowl_01.jpg/500px-Steamed_rice_in_bowl_01.jpg",
)
FRESH_WHOLE_FRUIT = _item(
    "fresh_whole_fruit", "Fresh Whole Fruit", ["fruit", "fresh", "light"],
    ["vegan", "vegetarian", "gluten_free", "dairy_free"], [],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/An_assortment_of_fresh_fruits.jpg/500px-An_assortment_of_fresh_fruits.jpg",
)
FRESH_FRUIT_SLICES = _item(
    "fresh_fruit_slices", "Fresh Fruit Slices", ["fruit", "fresh", "sweet"],
    ["vegan", "vegetarian", "gluten_free", "dairy_free"], [],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/20220123_Fruit_platter_anagoria.jpg/500px-20220123_Fruit_platter_anagoria.jpg",
)
ROASTED_VEGETABLES = _item(
    "roasted_vegetables", "Assorted Roasted Vegetables", ["roasted vegetables", "healthy", "savory"],
    ["vegan", "vegetarian", "gluten_free", "dairy_free"], [],
    image_url="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Neon_root_veggies_%28roasted_beets%2C_turnips%2C_rutabaga%2C_carrots_and_onions%29_%286893015819%29.jpg/500px-Neon_root_veggies_%28roasted_beets%2C_turnips%2C_rutabaga%2C_carrots_and_onions%29_%286893015819%29.jpg",
)


def _pair(id: str, item_a: FoodSurveyItem, item_b: FoodSurveyItem) -> FoodSurveyPair:
    return FoodSurveyPair(id=id, item_a=item_a, item_b=item_b)


# Contrast designed for signal: comfort vs. healthy, cuisine style, plant vs.
# animal protein, dessert style, sweet vs. savory breakfast, vegan vs. meat.
PRIMARY_PAIRS: list[FoodSurveyPair] = [
    _pair("pizza_vs_greek_salad", CHEESE_PIZZA, GREEK_SALAD),
    _pair("stirfry_vs_pasta", IRON_GRILL_STIR_FRY, CHEFS_CHOICE_PASTA),
    _pair("tofu_vs_bbq_chicken_pizza", SESAME_TOFU, BBQ_CHICKEN_PIZZA),
    _pair("ice_cream_vs_vegan_cake", ICE_CREAM, VEGAN_CHOCOLATE_CAKE),
    _pair("pancakes_vs_scrambled_eggs", PANCAKES, SCRAMBLED_EGGS),
    _pair("home_fries_vs_roasted_broccoli", HOME_FRIES, ROASTED_BROCCOLI),
    _pair("tabbouleh_vs_cucumber_tomato_salad", TABBOULEH, CUCUMBER_TOMATO_SALAD),
    _pair("vegan_pizza_vs_pepperoni_pizza", VEGAN_CHEESE_PIZZA, PEPPERONI_PIZZA),
    _pair("chia_pudding_vs_overnight_oats", CHIA_PUDDING, OVERNIGHT_OATS),
    _pair("scrambled_tofu_vs_hard_boiled_eggs", SCRAMBLED_TOFU, HARD_BOILED_EGGS),
]

# Mostly maximally-compatible items, to top up the pool for restricted users
# once PRIMARY_PAIRS has been filtered down.
BACKUP_PAIRS: list[FoodSurveyPair] = [
    _pair("jasmine_rice_vs_roasted_broccoli", JASMINE_RICE, ROASTED_BROCCOLI),
    _pair("fresh_whole_fruit_vs_roasted_vegetables", FRESH_WHOLE_FRUIT, ROASTED_VEGETABLES),
    _pair("home_fries_vs_fresh_fruit_slices", HOME_FRIES, FRESH_FRUIT_SLICES),
    _pair("cucumber_tomato_salad_vs_jasmine_rice", CUCUMBER_TOMATO_SALAD, JASMINE_RICE),
    _pair("tabbouleh_vs_roasted_vegetables", TABBOULEH, ROASTED_VEGETABLES),
    _pair("chia_pudding_vs_fresh_fruit_slices", CHIA_PUDDING, FRESH_FRUIT_SLICES),
]

_ALL_PAIRS_BY_ID: dict[str, FoodSurveyPair] = {p.id: p for p in PRIMARY_PAIRS + BACKUP_PAIRS}


def _item_compatible(item: FoodSurveyItem, diet_restrictions: list[str], allergens: list[str]) -> bool:
    return set(diet_restrictions).issubset(item.diet_tags) and not (set(item.allergens) & set(allergens))


def _pair_compatible(pair: FoodSurveyPair, diet_restrictions: list[str], allergens: list[str]) -> bool:
    return _item_compatible(pair.item_a, diet_restrictions, allergens) and _item_compatible(
        pair.item_b, diet_restrictions, allergens
    )


def build_survey(diet_restrictions: list[str], allergens: list[str], limit: int = 10) -> list[FoodSurveyPair]:
    """Deterministic (not randomized) — pair_id + choice must resolve the same
    way regardless of when GET ran vs POST. Filters PRIMARY_PAIRS first, tops
    up from BACKUP_PAIRS if short. May return fewer than `limit` (even an
    empty list) for maximally restricted users — callers must not assume
    len(result) == limit.
    """
    candidates = [p for p in PRIMARY_PAIRS if _pair_compatible(p, diet_restrictions, allergens)]
    if len(candidates) < limit:
        candidates += [p for p in BACKUP_PAIRS if _pair_compatible(p, diet_restrictions, allergens)]
    return candidates[:limit]


@dataclass(frozen=True)
class SurveyResponse:
    pair_id: str
    choice: Literal["a", "b", "skip"]


def score_survey(
    responses: list[SurveyResponse], pairs_by_id: dict[str, FoodSurveyPair] | None = None
) -> tuple[list[str], list[str]]:
    """Net +1/-1 per tag per round (skip = no-op; unknown pair_id ignored).
    Returns (liked_tags, disliked_tags) for tags with net > 0 / net < 0;
    net == 0 is dropped as ambiguous. Pure function, no DB access.

    `pairs_by_id` defaults to this module's hand-curated catalog; callers
    with a different pair source (e.g. app.services.station_survey's
    live-menu-derived pairs) pass their own so the same +1/-1 logic doesn't
    need duplicating — the scoring rule only needs a pair's two items and
    their tags, not where the pair came from.
    """
    catalog = _ALL_PAIRS_BY_ID if pairs_by_id is None else pairs_by_id
    net: dict[str, int] = {}
    for r in responses:
        pair = catalog.get(r.pair_id)
        if pair is None or r.choice == "skip":
            continue
        won, lost = (pair.item_a, pair.item_b) if r.choice == "a" else (pair.item_b, pair.item_a)
        for tag in won.tags:
            net[tag] = net.get(tag, 0) + 1
        for tag in lost.tags:
            net[tag] = net.get(tag, 0) - 1
    liked = sorted(tag for tag, n in net.items() if n > 0)
    disliked = sorted(tag for tag, n in net.items() if n < 0)
    return liked, disliked


def merge_tags(
    existing_liked: list[str],
    existing_disliked: list[str],
    new_liked: list[str],
    new_disliked: list[str],
) -> tuple[list[str], list[str]]:
    """Union each list (dedup) on top of whatever's already there, whether
    from free-text parsing or a prior survey take — never drops existing
    tags. A tag that lands in both liked and disliked across the two sources
    resolves as liked (dropped from disliked)."""
    liked = set(existing_liked) | set(new_liked)
    disliked = (set(existing_disliked) | set(new_disliked)) - liked
    return sorted(liked), sorted(disliked)
