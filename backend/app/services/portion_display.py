"""Manually-synced mirror of frontend/foodDensity.ts's UNIT_RULES.

Display-only: powers the "portion" section of the admin panel so a bad
keyword match can be spotted and overridden per food (docs/adr/0022), never
used for any nutrition/serving calculation on the backend. If frontend/foodDensity.ts changes, update this
file to match — same manual-mirror contract frontend/api.ts already keeps
for this backend's DIET_TAGS/ALLERGENS/EATING_STYLES constants, just in the
other direction. Only the static unit + grams-per-unit lookup is ported, not
the stepper/rounding logic, since that's all the admin display needs.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.db.models import PortionOverride

PortionUnit = str  # 'scoop' | 'slice' | 'cup' | 'palm' | 'plate' | 'tbsp' | 'piece'


@dataclass(frozen=True)
class UnitRule:
    keywords: list[str]
    unit: PortionUnit
    grams_per_unit: float


# Rule order matters (first match wins) — mirrors UNIT_RULES in
# frontend/foodDensity.ts exactly, including comment ordering rationale.
UNIT_RULES: list[UnitRule] = [
    UnitRule(["salad", "greens", "spinach", "kale", "arugula", "slaw", "tabbouleh", "kimchi"], "cup", 45),
    UnitRule(["bread", "roll", "bagel", "toast", "tortilla", "wrap", "naan", "pita", "focaccia"], "slice", 35),
    UnitRule(["pizza"], "slice", 120),
    UnitRule(["cake", "pie"], "slice", 90),
    UnitRule(
        [
            "broccoli", "vegetable", "veggie", "pepper", "zucchini", "squash", "asparagus", "green bean",
            "carrot", "tomato", "corn", "cauliflower", "mushroom", "brussel", "cabbage", " peas",
            "cucumber", "chard", "lettuce", "calabacitas", "butternut",
        ],
        "cup",
        130,
    ),
    UnitRule(["potato", "fries"], "scoop", 100),
    UnitRule(["rice", "quinoa", "grain", "couscous", "barley", "polenta"], "scoop", 95),
    UnitRule(["ice cream"], "scoop", 65),
    UnitRule(["pasta", "noodle", "spaghetti", "penne", "mac"], "scoop", 110),
    UnitRule(["bean", "lentil", "chickpea", "edamame"], "scoop", 85),
    UnitRule(
        ["fruit", "apple", "berry", "banana", "melon", "grape", "pineapple", "mango", "orange", "peach"],
        "cup",
        145,
    ),
    UnitRule(
        [
            "soup", "bisque", "chowder", "broth", "stew", "cereal", "oatmeal", "grits", "porridge",
            "bowl", "pudding", "borscht", "beverage", "water", "yogurt",
        ],
        "cup",
        240,
    ),
    UnitRule(["nugget"], "piece", 20),
    UnitRule(["drumstick"], "piece", 90),
    UnitRule(["patty"], "piece", 110),
    UnitRule(["cookie"], "piece", 40),
    UnitRule(["muffin"], "piece", 90),
    UnitRule(["biscuit"], "piece", 60),
    UnitRule(["arancini"], "piece", 50),
    UnitRule(["waffle"], "piece", 75),
    UnitRule(["omelet"], "piece", 180),
    UnitRule(["plantain"], "piece", 25),
    UnitRule(["pastr"], "piece", 55),  # pastry/pastries
    UnitRule(["dessert bar"], "piece", 50),
    UnitRule(["cinnamon twist"], "piece", 50),
    UnitRule(
        [
            "beef", "steak", "burger", "meatball", "meatloaf", "pork", "bacon", "ham", "sausage",
            "chicken", "turkey", "poultry", "salmon", "fish", "tuna", "shrimp", "seafood", "cod",
            "tofu", "tempeh", "seitan", "egg", "lamb", "haddock", "pollock", "carne asada", "chick'n",
        ],
        "palm",
        85,
    ),
    UnitRule(
        [
            "sauce", "gravy", "dressing", "aioli", "vinaigrette", "crema", "chutney", "salsa", "hummus",
            "sour cream", "onion", "olive", "pickle", "avocado", "basil", "brown sugar", "cranberries",
            "pico de gallo",
        ],
        "tbsp",
        15,
    ),
    UnitRule(["cheese"], "slice", 20),
]

# "corn" substring-collides with "Cornell"/"Corned Beef" — mirrors the same
# narrow special case in foodDensity.ts rather than a general word-boundary rule.
_CORN_RE = re.compile(r"\bcorn(?![a-z])")

DEFAULT_RULE = UnitRule([], "plate", 300)

UNIT_LABELS: dict[PortionUnit, tuple[str, str]] = {
    "scoop": ("scoop", "scoops"),
    "slice": ("slice", "slices"),
    "cup": ("cup", "cups"),
    "palm": ("palm", "palms"),
    "plate": ("plate", "plates"),
    "tbsp": ("tbsp", "tbsp"),
    "piece": ("piece", "pieces"),
}


def _matches_keyword(keyword: str, lower: str) -> bool:
    if keyword == "corn":
        return bool(_CORN_RE.search(lower))
    return keyword in lower


@dataclass(frozen=True)
class PortionDisplay:
    unit: PortionUnit
    grams_per_unit: float
    label: str
    plural_label: str


def _display(unit: PortionUnit, grams_per_unit: float) -> PortionDisplay:
    label, plural_label = UNIT_LABELS[unit]
    return PortionDisplay(unit=unit, grams_per_unit=grams_per_unit, label=label, plural_label=plural_label)


def get_heuristic_portion_display(item_name: str) -> PortionDisplay:
    """The everyday unit + grams-per-unit this food name maps to per the
    frontend keyword heuristic alone, ignoring any admin override."""
    lower = item_name.lower()
    rule = next(
        (r for r in UNIT_RULES if any(_matches_keyword(k, lower) for k in r.keywords)),
        DEFAULT_RULE,
    )
    return _display(rule.unit, rule.grams_per_unit)


def get_portion_display(item_name: str, override: PortionOverride | None = None) -> PortionDisplay:
    """The unit the app actually pictures this food in: the admin override
    when one exists, otherwise the keyword heuristic — same precedence as
    getPortionUnit in frontend/foodDensity.ts."""
    if override is not None:
        return _display(override.unit, override.grams_per_unit)
    return get_heuristic_portion_display(item_name)
