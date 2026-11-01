"""The admin panel's implausible-calories flag (issue #164): kcal/100g
outside 5–900 is flagged whatever the source, counts as needs_attention,
and can be filtered on and sorted first."""

import pytest

from app.core.deps import get_current_admin
from app.db.models import NutritionMatch, NutritionSource
from app.db.session import SessionLocal
from app.main import app
from tests.conftest import ALLOWED_ORIGIN

PREFIX = "Pytest Implausible"
HEADERS = {"Origin": ALLOWED_ORIGIN}
# name suffix -> (kcal/100g, source)
ROWS = {
    "A 4.9": (4.9, NutritionSource.llm_estimate),
    "B 5": (5, NutritionSource.llm_estimate),
    "C 900": (900, NutritionSource.usda),
    "D 900.1": (900.1, NutritionSource.usda),
}


@pytest.fixture
def foods():
    db = SessionLocal()
    names = [f"{PREFIX} {suffix}" for suffix in ROWS]
    for name, (kcal, source) in zip(names, ROWS.values()):
        db.add(
            NutritionMatch(
                item_name=name,
                source=source,
                calories_per_100g=kcal,
                protein_g_per_100g=0,
                carbs_g_per_100g=0,
                fat_g_per_100g=0,
                confidence_score=0.9,
            )
        )
    db.commit()
    yield names
    db.query(NutritionMatch).filter(NutritionMatch.item_name.in_(names)).delete()
    db.commit()
    db.close()


@pytest.fixture
def admin_client(client, admin_user):
    app.dependency_overrides[get_current_admin] = lambda: admin_user
    return client


def _list(client, **params):
    res = client.get("/admin/api/foods", params={"q": PREFIX, **params}, headers=HEADERS)
    assert res.status_code == 200, res.text
    return {f["item_name"].removeprefix(f"{PREFIX} "): f for f in res.json()["items"]}


def test_bounds_are_strict_and_apply_to_usda_too(admin_client, foods):
    flags = {name: f["implausible_calories"] for name, f in _list(admin_client).items()}
    assert flags == {"A 4.9": True, "B 5": False, "C 900": False, "D 900.1": True}


def test_implausible_counts_as_needs_attention(admin_client, foods):
    # D is a high-confidence USDA row with no other signal except this one.
    assert _list(admin_client)["D 900.1"]["needs_attention"] is True


def test_filter(admin_client, foods):
    assert set(_list(admin_client, implausible_calories="true")) == {"A 4.9", "D 900.1"}
    assert set(_list(admin_client, implausible_calories="false")) == {"B 5", "C 900"}


def test_implausible_first_sort(admin_client, foods):
    assert list(_list(admin_client, sort="implausible_first")) == ["A 4.9", "D 900.1", "B 5", "C 900"]
