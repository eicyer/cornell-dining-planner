"""Admin portion-unit overrides — see docs/adr/0022. An override must take
precedence over the keyword heuristic everywhere the app reads portions
(admin panel + public /portion-overrides), and clearing it must fall back
to the heuristic rather than leaving a stale unit behind.
"""

import pytest

from app.core.deps import get_current_user
from app.db.models import NutritionMatch, NutritionSource, PortionOverride
from app.db.session import SessionLocal
from app.main import app
from tests.conftest import ALLOWED_ORIGIN

# "Soup" → the heuristic's 240g cup, so an override to anything else is
# distinguishable from the default.
ITEM_NAME = "Portion Override Test Soup"


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def food(db):
    db.add(
        NutritionMatch(
            item_name=ITEM_NAME,
            source=NutritionSource.llm_estimate,
            calories_per_100g=50,
            protein_g_per_100g=2,
            carbs_g_per_100g=8,
            fat_g_per_100g=1,
            confidence_score=0.5,
        )
    )
    db.commit()
    yield ITEM_NAME
    db.query(PortionOverride).filter(PortionOverride.item_name == ITEM_NAME).delete()
    db.query(NutritionMatch).filter(NutritionMatch.item_name == ITEM_NAME).delete()
    db.commit()


@pytest.fixture
def as_admin(client, admin_user):
    app.dependency_overrides[get_current_user] = lambda: admin_user
    return client


def test_food_starts_on_heuristic(as_admin, food):
    body = as_admin.get("/admin/api/foods/detail", params={"item_name": food}).json()
    assert body["portion_overridden"] is False
    assert (body["portion_unit"], body["portion_grams_per_unit"]) == ("cup", 240)
    assert (body["default_portion_unit"], body["default_portion_grams_per_unit"]) == ("cup", 240)


def test_set_override_takes_precedence_everywhere(as_admin, food):
    res = as_admin.put(
        "/admin/api/foods/portion",
        json={"item_name": food, "unit": "scoop", "grams_per_unit": 150},
        headers={"Origin": ALLOWED_ORIGIN},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["portion_overridden"] is True
    assert (body["portion_unit"], body["portion_grams_per_unit"], body["portion_label"]) == ("scoop", 150, "scoop")
    assert body["default_portion_unit"] == "cup"
    assert body["portion_calories"] == 75  # 50 cal/100g x 150g

    public = as_admin.get("/portion-overrides").json()
    assert public[food] == {"unit": "scoop", "grams_per_unit": 150}


def test_clear_override_falls_back_to_heuristic(as_admin, food):
    as_admin.put(
        "/admin/api/foods/portion",
        json={"item_name": food, "unit": "piece", "grams_per_unit": 40},
        headers={"Origin": ALLOWED_ORIGIN},
    )
    res = as_admin.delete(
        "/admin/api/foods/portion", params={"item_name": food}, headers={"Origin": ALLOWED_ORIGIN}
    )
    assert res.status_code == 200
    assert res.json()["portion_overridden"] is False
    assert res.json()["portion_unit"] == "cup"
    assert food not in as_admin.get("/portion-overrides").json()


def test_saving_macros_does_not_create_override(as_admin, food):
    detail = as_admin.get("/admin/api/foods/detail", params={"item_name": food}).json()
    update = {k: detail[k] for k in (
        "item_name", "source", "calories_per_100g", "protein_g_per_100g", "carbs_g_per_100g",
        "fat_g_per_100g", "sugar_g_per_100g", "fiber_g_per_100g", "confidence_score",
        "diet_tags", "likely_allergens",
    )}
    res = as_admin.put("/admin/api/foods/detail", json=update, headers={"Origin": ALLOWED_ORIGIN})
    assert res.status_code == 200
    assert res.json()["portion_overridden"] is False


@pytest.mark.parametrize("payload", [
    {"unit": "handful", "grams_per_unit": 50},
    {"unit": "cup", "grams_per_unit": 0},
    {"unit": "cup", "grams_per_unit": 5000},
])
def test_rejects_bad_override(as_admin, food, payload):
    res = as_admin.put(
        "/admin/api/foods/portion", json={"item_name": food, **payload}, headers={"Origin": ALLOWED_ORIGIN}
    )
    assert res.status_code == 422


def test_unknown_food_404s(as_admin):
    res = as_admin.put(
        "/admin/api/foods/portion",
        json={"item_name": "No Such Food Anywhere", "unit": "cup", "grams_per_unit": 100},
        headers={"Origin": ALLOWED_ORIGIN},
    )
    assert res.status_code == 404


def test_non_admin_cannot_set_override(client, other_user, food):
    app.dependency_overrides[get_current_user] = lambda: other_user
    res = client.put(
        "/admin/api/foods/portion",
        json={"item_name": food, "unit": "cup", "grams_per_unit": 100},
        headers={"Origin": ALLOWED_ORIGIN},
    )
    assert res.status_code == 403
