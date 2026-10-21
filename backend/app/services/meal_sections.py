"""Meal Section derivation — see docs/adr/0023-diary-meal-sections.md.

The single source of truth for which of the Diary's four fixed sections a
Menu Event's meal period lands in. Derived on read, never stored, so a
Logged Meal's section can't drift from its Menu Event; the frontend reads
`meal_section` off the API rather than mirroring this table.
"""

from __future__ import annotations

from typing import Literal

MealSection = Literal["breakfast", "lunch", "dinner", "snacks"]

# Display order of the Diary's sections.
MEAL_SECTIONS: list[MealSection] = ["breakfast", "lunch", "dinner", "snacks"]

_SECTION_BY_PERIOD: dict[str, MealSection] = {
    "breakfast": "breakfast",
    "brunch": "lunch",
    "lunch": "lunch",
    "late lunch": "lunch",
    "dinner": "dinner",
    "late night": "snacks",
}


def meal_section_for(meal_period: str) -> MealSection:
    # A period the feed introduces later falls into Snacks rather than
    # disappearing from the Diary — add it to the table above when it shows up.
    return _SECTION_BY_PERIOD.get(meal_period.strip().lower(), "snacks")
