"""Menu Events come back in the order they're served, not alphabetically
by meal period (issue #115)."""

from app.services.meal_sections import meal_period_sort_key


def test_known_periods_sort_chronologically():
    periods = ["Dinner", "Late Lunch", "Breakfast", "Late Night", "Lunch", "Brunch"]
    assert sorted(periods, key=meal_period_sort_key) == [
        "Breakfast", "Brunch", "Lunch", "Late Lunch", "Dinner", "Late Night",
    ]


def test_unknown_period_sorts_last():
    assert sorted(["Tea Time", "Dinner", "Breakfast"], key=meal_period_sort_key) == ["Breakfast", "Dinner", "Tea Time"]


def test_case_and_whitespace_insensitive():
    assert meal_period_sort_key(" LUNCH ") == meal_period_sort_key("Lunch")
