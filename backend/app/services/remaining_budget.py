"""Remaining-Budget Target — see docs/adr/0027-crafted-meals-in-a-tracking-first-app.md.

Once a user has logged anything today, Crafted Meals are sized to what's
left of the day's budget instead of the flat goal ÷ meals_per_day split
(docs/adr/0008). Pure arithmetic over what's already stored; no LLM, and
nothing here touches the crafted-meals cache.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.db.models import ExerciseEntry, LoggedMeal, MenuEvent, QuickAddEntry, UserPreference
from app.services.meal_crafting import Target, per_meal_target
from app.services.meal_sections import MealSection, meal_section_for

# The sections a day's "meals" are spread across; Snacks is never counted
# as a meal still to come.
MAIN_SECTIONS: list[MealSection] = ["breakfast", "lunch", "dinner"]

# Bounds on the remaining-budget target relative to the flat split. The
# floor keeps a nearly-spent day from producing a sliver of a meal; the
# ceiling keeps one unlogged meal from producing a giant one.
MIN_FRACTION_OF_FLAT = 0.5
MAX_FRACTION_OF_FLAT = 1.5

_MACROS = ("calories", "protein_g", "carbs_g", "fat_g")


@dataclass
class EatenToday:
    # Meal Section -> summed macros of everything logged in it today.
    by_section: dict[str, dict[str, float]]
    exercise_calories: float

    @property
    def anything_logged(self) -> bool:
        return bool(self.by_section)

    def outside(self, section: str) -> dict[str, float]:
        """Totals eaten in every section except `section`."""
        totals = dict.fromkeys(_MACROS, 0.0)
        for s, section_totals in self.by_section.items():
            if s != section:
                for key in _MACROS:
                    totals[key] += section_totals[key]
        return totals


def eaten_today(db: Session, user_id: int, date: datetime.date) -> EatenToday:
    by_section: dict[str, dict[str, float]] = {}

    def add(section: str, values: dict[str, float]) -> None:
        section_totals = by_section.setdefault(section, dict.fromkeys(_MACROS, 0.0))
        for key in _MACROS:
            section_totals[key] += values.get(key, 0.0)

    meals = db.query(LoggedMeal).filter(LoggedMeal.user_id == user_id, LoggedMeal.date == date).all()
    period_by_event = {
        e.id: e.meal_period
        for e in db.query(MenuEvent).filter(MenuEvent.id.in_([m.menu_event_id for m in meals if m.menu_event_id]))
    }
    for meal in meals:
        add(meal_section_for(period_by_event.get(meal.menu_event_id, "")), meal.totals)

    for entry in db.query(QuickAddEntry).filter(QuickAddEntry.user_id == user_id, QuickAddEntry.date == date):
        add(entry.meal_section, {key: getattr(entry, key) for key in _MACROS})

    exercise = sum(
        e.calories for e in db.query(ExerciseEntry).filter(ExerciseEntry.user_id == user_id, ExerciseEntry.date == date)
    )
    return EatenToday(by_section=by_section, exercise_calories=exercise)


def meals_left(section: MealSection, sections_with_food: set[str]) -> int:
    """The requested section itself (it's the meal being suggested, even if
    part of it is already logged) plus every later main section still empty."""
    if section not in MAIN_SECTIONS:
        return 1
    later = MAIN_SECTIONS[MAIN_SECTIONS.index(section) + 1 :]
    return 1 + sum(1 for s in later if s not in sections_with_food)


def remaining_budget_target(prefs: UserPreference, eaten: EatenToday, meal_period: str) -> tuple[Target, bool]:
    """Returns (target, sized_to_remaining). Before anything is logged today
    the flat split applies unchanged — an unlogged breakfast looks the same
    as a skipped one, and guessing "skipped" oversizes lunch."""
    flat = per_meal_target(prefs.calorie_goal, prefs.protein_goal_g, prefs.carb_goal_g, prefs.fat_goal_g, prefs.meals_per_day)
    if not eaten.anything_logged:
        return flat, False

    budget = {
        "calories": prefs.calorie_goal + (eaten.exercise_calories if prefs.exercise_adds_to_goal else 0.0),
        "protein_g": prefs.protein_goal_g,
        "carbs_g": prefs.carb_goal_g,
        "fat_g": prefs.fat_goal_g,
    }
    # Food already logged in this meal's own section is part of this meal,
    # not a reason to shrink it — so it's left out of "eaten" here.
    section = meal_section_for(meal_period)
    eaten_elsewhere = eaten.outside(section)
    n = meals_left(section, set(eaten.by_section))

    def sized(key: str) -> float:
        flat_value = getattr(flat, key)
        raw = (budget[key] - eaten_elsewhere[key]) / n
        return min(max(raw, flat_value * MIN_FRACTION_OF_FLAT), flat_value * MAX_FRACTION_OF_FLAT)

    return Target(**{key: sized(key) for key in _MACROS}), True
