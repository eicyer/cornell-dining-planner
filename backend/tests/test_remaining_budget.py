"""Remaining-Budget Target — see docs/adr/0027-crafted-meals-in-a-tracking-first-app.md.
Flat split until something is logged today; then (budget − eaten in other
sections) ÷ meals left, clamped to 50–150% of the flat split.
"""

from types import SimpleNamespace

import pytest

from app.services.remaining_budget import EatenToday, meals_left, remaining_budget_target

PREFS = SimpleNamespace(
    calorie_goal=2100, protein_goal_g=150, carb_goal_g=240, fat_goal_g=60, meals_per_day=3, exercise_adds_to_goal=True
)


def _eaten(by_section=None, exercise=0.0) -> EatenToday:
    full = {
        section: {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0, **totals}
        for section, totals in (by_section or {}).items()
    }
    return EatenToday(by_section=full, exercise_calories=exercise)


def test_flat_split_before_anything_is_logged():
    target, sized = remaining_budget_target(PREFS, _eaten(), "Lunch")
    assert sized is False
    assert (target.calories, target.protein_g) == (700, 50)


def test_sizes_to_what_is_left_after_breakfast():
    # Breakfast 500 cal: lunch and dinner split the other 1600.
    target, sized = remaining_budget_target(PREFS, _eaten({"breakfast": {"calories": 500, "protein_g": 30}}), "Lunch")
    assert sized is True
    assert target.calories == 800
    assert target.protein_g == 60


def test_food_already_in_this_section_does_not_shrink_it():
    eaten = _eaten({"breakfast": {"calories": 500}, "lunch": {"calories": 300}})
    target, _ = remaining_budget_target(PREFS, eaten, "Lunch")
    # Lunch's own 300 isn't subtracted; dinner is still empty, so 1600 / 2.
    assert target.calories == 800


def test_clamped_to_half_and_one_and_a_half_times_flat():
    nearly_spent = _eaten({"breakfast": {"calories": 1900}})
    assert remaining_budget_target(PREFS, nearly_spent, "Dinner")[0].calories == 350

    # Only a 100-cal snack logged, at dinner time: 2000 / 1 would be huge.
    barely = _eaten({"snacks": {"calories": 100}})
    assert remaining_budget_target(PREFS, barely, "Dinner")[0].calories == 1050


def test_counted_exercise_raises_the_budget_only_when_switched_on():
    eaten = _eaten({"breakfast": {"calories": 500}}, exercise=400)
    assert remaining_budget_target(PREFS, eaten, "Lunch")[0].calories == 1000

    off = SimpleNamespace(**{**vars(PREFS), "exercise_adds_to_goal": False})
    assert remaining_budget_target(off, eaten, "Lunch")[0].calories == 800


@pytest.mark.parametrize(
    "section, with_food, expected",
    [
        ("breakfast", set(), 3),
        ("lunch", {"breakfast"}, 2),
        ("lunch", {"breakfast", "dinner"}, 1),
        ("dinner", set(), 1),
        ("snacks", set(), 1),
    ],
)
def test_meals_left(section, with_food, expected):
    assert meals_left(section, with_food) == expected


# --- Re-portioning a precomputed Crafted Meal --------------------------

import datetime  # noqa: E402

from app.db.models import NutritionMatch, NutritionSource, QuickAddEntry, User, UserPreference  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.routers.crafted_meals import CraftedItemOut, CraftedMealOut, _Sizer  # noqa: E402

FOODS = {
    # name: (category, cal, protein, carbs, fat)
    "Pytest Budget Chicken": ("Entrees", 165, 31, 0, 3.6),
    "Pytest Budget Rice": ("Grains", 130, 2.7, 28, 0.3),
    "Pytest Budget Broccoli": ("Vegetables", 35, 2.4, 7, 0.4),
}


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def user_with_prefs(db):
    for name, (_, cal, p, c, f) in FOODS.items():
        db.add(
            NutritionMatch(
                item_name=name, source=NutritionSource.usda, calories_per_100g=cal,
                protein_g_per_100g=p, carbs_g_per_100g=c, fat_g_per_100g=f,
            )
        )
    user = User(google_sub="remaining-budget-sub", email="remaining-budget@example.com")
    db.add(user)
    db.commit()
    prefs = UserPreference(user_id=user.id, calorie_goal=2100, protein_goal_g=150, carb_goal_g=240, fat_goal_g=60)
    db.add(prefs)
    db.commit()

    yield user, prefs

    db.query(QuickAddEntry).filter(QuickAddEntry.user_id == user.id).delete()
    db.query(UserPreference).filter(UserPreference.user_id == user.id).delete()
    db.query(User).filter(User.id == user.id).delete()
    db.query(NutritionMatch).filter(NutritionMatch.item_name.in_(list(FOODS))).delete()
    db.commit()


def _meal(grams: dict[str, float]) -> CraftedMealOut:
    items = []
    for name, g in grams.items():
        category, cal, p, c, f = FOODS[name]
        items.append(
            CraftedItemOut(
                name=name, category=category, grams=g, calories=cal * g / 100, protein_g=p * g / 100,
                carbs_g=c * g / 100, fat_g=f * g / 100, sugar_g=0, fiber_g=0, role=None,
            )
        )
    return CraftedMealOut(name="Test plate", rationale="Because.", items=items, totals={})


def test_resize_keeps_items_name_and_rationale_but_shrinks_portions(db, user_with_prefs):
    user, prefs = user_with_prefs
    # ~855 cal, sized for a bigger budget than what's left after a 1500-cal lunch.
    meal = _meal({"Pytest Budget Chicken": 250, "Pytest Budget Rice": 300, "Pytest Budget Broccoli": 150})
    today = datetime.date.today()

    sizer = _Sizer(db, user, prefs, today)
    flat_target, sized = sizer.target_for("Dinner")
    assert sized is False
    assert sizer.resize(meal, flat_target, sized) is meal

    db.add(QuickAddEntry(user_id=user.id, date=today, meal_section="lunch", calories=1500, protein_g=100, carbs_g=180, fat_g=40))
    db.commit()
    sizer = _Sizer(db, user, prefs, today)
    target, sized = sizer.target_for("Dinner")
    assert sized is True and target.calories < flat_target.calories

    resized = sizer.resize(meal, target, sized)
    assert (resized.name, resized.rationale) == ("Test plate", "Because.")
    assert {i.name for i in resized.items} == set(FOODS)
    assert resized.totals["calories"] < sum(i.calories for i in meal.items)
    assert resized.totals["calories"] <= target.calories + 25  # gram rounding
