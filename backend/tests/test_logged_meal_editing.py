"""PATCH/DELETE /logged-meals/{id} — see app.routers.logged_meals. Edited
items must still be on the meal's own Menu Event and get their nutrition
recomputed server-side, same as logging (docs/adr/0004); another user's
meal is never editable or deletable.
"""

import datetime

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.models import Eatery, LoggedMeal, LoggingEvent, MenuEvent, MenuItem, NutritionMatch, NutritionSource, User
from app.db.session import SessionLocal
from app.main import app
from tests.conftest import ALLOWED_ORIGIN

CHICKEN = "Pytest Edit Chicken"
RICE = "Pytest Edit Rice"
OFF_MENU = "Pytest Edit Off-Menu Item"
HEADERS = {"Origin": ALLOWED_ORIGIN}


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def menu(db):
    eatery = Eatery(cornell_id=-9001, slug="pytest-edit-eatery", name="Pytest Edit Eatery", eatery_type="dining room")
    db.add(eatery)
    db.flush()
    event = MenuEvent(eatery_id=eatery.id, date=datetime.date.today(), meal_period="Lunch")
    db.add(event)
    db.flush()
    db.add_all(
        [
            MenuItem(menu_event_id=event.id, category="Grill", name=CHICKEN),
            MenuItem(menu_event_id=event.id, category="Sides", name=RICE),
        ]
    )
    for name, cal, protein, carbs, fat in [(CHICKEN, 200, 30, 0, 8), (RICE, 130, 3, 28, 0), (OFF_MENU, 100, 1, 1, 1)]:
        db.add(
            NutritionMatch(
                item_name=name,
                source=NutritionSource.usda,
                calories_per_100g=cal,
                protein_g_per_100g=protein,
                carbs_g_per_100g=carbs,
                fat_g_per_100g=fat,
            )
        )
    db.commit()
    eatery_id = eatery.id

    yield eatery_id

    db.query(LoggedMeal).filter(LoggedMeal.menu_event_id == event.id).delete()
    db.query(MenuItem).filter(MenuItem.menu_event_id == event.id).delete()
    db.query(MenuEvent).filter(MenuEvent.id == event.id).delete()
    db.query(NutritionMatch).filter(NutritionMatch.item_name.in_([CHICKEN, RICE, OFF_MENU])).delete()
    db.query(Eatery).filter(Eatery.id == eatery_id).delete()
    db.commit()


@pytest.fixture
def users(db):
    created = [User(google_sub=f"logged-meal-edit-sub-{i}", email=f"logged-meal-edit-{i}@example.com") for i in range(2)]
    db.add_all(created)
    db.commit()
    for user in created:
        db.refresh(user)
        db.expunge(user)

    yield created

    ids = [u.id for u in created]
    db.query(LoggedMeal).filter(LoggedMeal.user_id.in_(ids)).delete()
    db.query(LoggingEvent).filter(LoggingEvent.user_id.in_(ids)).delete()
    db.query(User).filter(User.id.in_(ids)).delete()
    db.commit()


@pytest.fixture
def as_user():
    def _as(user: User) -> TestClient:
        app.dependency_overrides[get_current_user] = lambda: user
        return client

    with TestClient(app, base_url="http://localhost") as client:
        yield _as
    app.dependency_overrides.clear()


def _log(client: TestClient, eatery_id: int) -> dict:
    response = client.post(
        "/logged-meals",
        json={"eatery_id": eatery_id, "meal_period": "Lunch", "items": [{"name": CHICKEN, "grams": 150}]},
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_edit_items_recomputes_nutrition_server_side(menu, users, as_user):
    client = as_user(users[0])
    meal = _log(client, menu)

    response = client.patch(
        f"/logged-meals/{meal['id']}",
        json={"items": [{"name": CHICKEN, "grams": 100}, {"name": RICE, "grams": 200}]},
        headers=HEADERS,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert [(i["name"], i["grams"]) for i in body["items"]] == [(CHICKEN, 100), (RICE, 200)]
    assert body["totals"]["calories"] == pytest.approx(200 + 260)
    assert body["totals"]["carbs_g"] == pytest.approx(56)
    assert body["eatery_id"] == menu
    assert body["meal_period"] == "Lunch"


def test_edit_leaves_rating_alone_unless_sent(menu, users, as_user):
    client = as_user(users[0])
    meal = _log(client, menu)
    client.patch(f"/logged-meals/{meal['id']}", json={"liked": True}, headers=HEADERS)

    response = client.patch(
        f"/logged-meals/{meal['id']}", json={"items": [{"name": RICE, "grams": 50}]}, headers=HEADERS
    )
    assert response.json()["liked"] is True

    response = client.patch(f"/logged-meals/{meal['id']}", json={"liked": None}, headers=HEADERS)
    assert response.json()["liked"] is None
    assert response.json()["items"][0]["name"] == RICE


@pytest.mark.parametrize(
    "items",
    [
        [],
        [{"name": OFF_MENU, "grams": 100}],
        [{"name": CHICKEN, "grams": 0}],
    ],
)
def test_invalid_edit_is_rejected_and_meal_unchanged(menu, users, as_user, items):
    client = as_user(users[0])
    meal = _log(client, menu)

    response = client.patch(f"/logged-meals/{meal['id']}", json={"items": items}, headers=HEADERS)
    assert response.status_code == 400

    unchanged = client.get("/logged-meals").json()
    assert [m for m in unchanged if m["id"] == meal["id"]][0]["items"] == meal["items"]


def test_delete_removes_meal(menu, users, as_user, db):
    client = as_user(users[0])
    meal = _log(client, menu)

    response = client.delete(f"/logged-meals/{meal['id']}", headers=HEADERS)

    assert response.status_code == 204
    assert db.get(LoggedMeal, meal["id"]) is None


def test_other_users_meal_cannot_be_edited_or_deleted(menu, users, as_user, db):
    owner, intruder = users
    meal = _log(as_user(owner), menu)

    client = as_user(intruder)
    edit = client.patch(f"/logged-meals/{meal['id']}", json={"items": [{"name": RICE, "grams": 1}]}, headers=HEADERS)
    delete = client.delete(f"/logged-meals/{meal['id']}", headers=HEADERS)

    assert edit.status_code == 404
    assert delete.status_code == 404
    assert db.get(LoggedMeal, meal["id"]) is not None
