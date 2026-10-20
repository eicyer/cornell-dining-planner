"""Meal Sections and one-Logged-Meal-per-Menu-Event — see
docs/adr/0023-diary-meal-sections.md. A Logged Meal's Meal Section is
derived from its Menu Event's meal period (never stored or user-picked),
and logging again from the same Menu Event appends to the existing meal
instead of creating a second one.
"""

import datetime

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.models import Eatery, LoggedMeal, MenuEvent, MenuItem, NutritionMatch, NutritionSource, User
from app.db.session import SessionLocal
from app.main import app
from app.services.meal_sections import meal_section_for
from tests.conftest import ALLOWED_ORIGIN

PASTA = "Pytest Section Pasta"
SALAD = "Pytest Section Salad"
HEADERS = {"Origin": ALLOWED_ORIGIN}
PERIODS = ["Lunch", "Brunch", "Late Night"]


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def menu(db):
    eatery = Eatery(cornell_id=-9101, slug="pytest-section-eatery", name="Pytest Section Eatery", eatery_type="dining room")
    db.add(eatery)
    db.flush()
    events = [MenuEvent(eatery_id=eatery.id, date=datetime.date.today(), meal_period=p) for p in PERIODS]
    db.add_all(events)
    db.flush()
    for event in events:
        db.add_all(
            [
                MenuItem(menu_event_id=event.id, category="Pasta", name=PASTA),
                MenuItem(menu_event_id=event.id, category="Salad Bar", name=SALAD),
            ]
        )
    for name, cal, protein, carbs, fat in [(PASTA, 150, 5, 25, 4), (SALAD, 20, 1, 3, 0)]:
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
    eatery_id, event_ids = eatery.id, [e.id for e in events]

    yield eatery_id

    db.query(LoggedMeal).filter(LoggedMeal.menu_event_id.in_(event_ids)).delete()
    db.query(MenuItem).filter(MenuItem.menu_event_id.in_(event_ids)).delete()
    db.query(MenuEvent).filter(MenuEvent.id.in_(event_ids)).delete()
    db.query(NutritionMatch).filter(NutritionMatch.item_name.in_([PASTA, SALAD])).delete()
    db.query(Eatery).filter(Eatery.id == eatery_id).delete()
    db.commit()


@pytest.fixture
def users(db):
    created = [User(google_sub=f"logged-meal-section-sub-{i}", email=f"logged-meal-section-{i}@example.com") for i in range(2)]
    db.add_all(created)
    db.commit()
    for user in created:
        db.refresh(user)
        db.expunge(user)

    yield created

    ids = [u.id for u in created]
    db.query(LoggedMeal).filter(LoggedMeal.user_id.in_(ids)).delete()
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


def _log(client: TestClient, eatery_id: int, items: list[dict], meal_period: str = "Lunch", **extra) -> dict:
    response = client.post(
        "/logged-meals",
        json={"eatery_id": eatery_id, "meal_period": meal_period, "items": items, **extra},
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize(
    "meal_period, section",
    [
        ("Breakfast", "breakfast"),
        ("Brunch", "lunch"),
        ("Lunch", "lunch"),
        ("Late Lunch", "lunch"),
        ("Dinner", "dinner"),
        ("Late Night", "snacks"),
        # A period the feed adds later lands somewhere visible rather than
        # vanishing from the Diary.
        ("Midnight Feast", "snacks"),
    ],
)
def test_meal_section_mapping(meal_period, section):
    assert meal_section_for(meal_period) == section


def test_logged_meal_reports_its_derived_meal_section(menu, users, as_user):
    client = as_user(users[0])

    brunch = _log(client, menu, [{"name": PASTA, "grams": 100}], meal_period="Brunch")
    late_night = _log(client, menu, [{"name": SALAD, "grams": 100}], meal_period="Late Night")

    assert brunch["meal_section"] == "lunch"
    assert late_night["meal_section"] == "snacks"
    listed = {m["id"]: m["meal_section"] for m in client.get("/logged-meals").json()}
    assert listed == {brunch["id"]: "lunch", late_night["id"]: "snacks"}


def test_logging_again_from_same_menu_event_appends_to_existing_meal(menu, users, as_user, db):
    client = as_user(users[0])

    first = _log(client, menu, [{"name": PASTA, "grams": 200}])
    second = _log(client, menu, [{"name": SALAD, "grams": 100}])

    assert second["id"] == first["id"]
    assert [(i["name"], i["grams"]) for i in second["items"]] == [(PASTA, 200), (SALAD, 100)]
    # Totals are recomputed server-side over the merged list (docs/adr/0004).
    assert second["totals"]["calories"] == pytest.approx(300 + 20)
    assert db.query(LoggedMeal).filter(LoggedMeal.user_id == users[0].id).count() == 1


def test_re_adding_an_item_grows_its_portion_instead_of_duplicating_the_line(menu, users, as_user):
    client = as_user(users[0])

    _log(client, menu, [{"name": PASTA, "grams": 180}])
    meal = _log(client, menu, [{"name": PASTA, "grams": 180}])

    assert [(i["name"], i["grams"]) for i in meal["items"]] == [(PASTA, 360)]
    assert meal["totals"]["calories"] == pytest.approx(540)


def test_different_menu_events_stay_separate_meals(menu, users, as_user):
    client = as_user(users[0])

    lunch = _log(client, menu, [{"name": PASTA, "grams": 100}], meal_period="Lunch")
    brunch = _log(client, menu, [{"name": PASTA, "grams": 100}], meal_period="Brunch")

    # Both land in the Lunch Meal Section, but they're different Menu Events.
    assert lunch["id"] != brunch["id"]


def test_other_users_meals_are_never_merged_into(menu, users, as_user):
    mine = _log(as_user(users[0]), menu, [{"name": PASTA, "grams": 100}])
    theirs = _log(as_user(users[1]), menu, [{"name": PASTA, "grams": 100}])

    assert theirs["id"] != mine["id"]
    assert [(i["name"], i["grams"]) for i in mine["items"]] == [(PASTA, 100)]


def test_appending_keeps_an_existing_rating_unless_a_new_one_is_sent(menu, users, as_user):
    client = as_user(users[0])

    _log(client, menu, [{"name": PASTA, "grams": 100}], liked=True)
    unrated_append = _log(client, menu, [{"name": SALAD, "grams": 50}])
    rated_append = _log(client, menu, [{"name": SALAD, "grams": 50}], liked=False)

    assert unrated_append["liked"] is True
    assert rated_append["liked"] is False
