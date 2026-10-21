"""Quick Add Entries — see docs/adr/0024-quick-add-entries.md. User-typed
calories for food outside the dining halls, stored as entered within
sanity bounds, filed under a user-chosen Meal Section, and counted in the
day's totals alongside Logged Meals.
"""

import datetime

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.models import QuickAddEntry, User, UserPreference
from app.db.session import SessionLocal
from app.main import app
from tests.conftest import ALLOWED_ORIGIN

HEADERS = {"Origin": ALLOWED_ORIGIN}


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def users(db):
    created = [User(google_sub=f"quick-add-sub-{i}", email=f"quick-add-{i}@example.com") for i in range(2)]
    db.add_all(created)
    db.commit()
    for user in created:
        db.refresh(user)
        db.expunge(user)

    yield created

    ids = [u.id for u in created]
    db.query(QuickAddEntry).filter(QuickAddEntry.user_id.in_(ids)).delete()
    db.query(UserPreference).filter(UserPreference.user_id.in_(ids)).delete()
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


def _add(client: TestClient, expected: int = 200, **body) -> dict:
    response = client.post("/quick-add", json={"meal_section": "snacks", "calories": 250, **body}, headers=HEADERS)
    assert response.status_code == expected, response.text
    return response.json()


def test_stores_numbers_as_entered_with_blank_name_as_none(users, as_user):
    client = as_user(users[0])
    entry = _add(client, name="  ", calories=310, protein_g=12.5, meal_section="breakfast")
    assert entry["name"] is None
    assert entry["meal_section"] == "breakfast"
    assert (entry["calories"], entry["protein_g"], entry["carbs_g"], entry["fat_g"]) == (310, 12.5, 0, 0)
    assert entry["date"] == datetime.date.today().isoformat()


@pytest.mark.parametrize(
    "body",
    [
        {"calories": 0},
        {"calories": 5001},
        {"protein_g": -1},
        {"fat_g": 501},
        {"meal_section": "brunch"},
        {"name": "x" * 81},
    ],
)
def test_rejects_out_of_bounds_entries(users, as_user, body):
    _add(as_user(users[0]), expected=422, **body)


def test_rejects_future_days_but_allows_backfill(users, as_user):
    client = as_user(users[0])
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    _add(client, expected=400, date=tomorrow)
    assert _add(client, date=yesterday)["date"] == yesterday

    listed = client.get(f"/quick-add?date={yesterday}").json()
    assert [e["date"] for e in listed] == [yesterday]
    assert client.get("/quick-add").json() == []


def test_update_applies_only_sent_fields_and_can_clear_name(users, as_user):
    client = as_user(users[0])
    entry = _add(client, name="Bagel", calories=300, carbs_g=55)

    updated = client.patch(f"/quick-add/{entry['id']}", json={"meal_section": "breakfast", "name": None}, headers=HEADERS)
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert (body["meal_section"], body["name"], body["calories"], body["carbs_g"]) == ("breakfast", None, 300, 55)

    assert client.patch(f"/quick-add/{entry['id']}", json={"calories": None}, headers=HEADERS).status_code == 400


def test_other_users_entries_are_invisible(users, as_user):
    entry = _add(as_user(users[0]))
    other = as_user(users[1])
    assert other.get("/quick-add").json() == []
    assert other.patch(f"/quick-add/{entry['id']}", json={"calories": 1}, headers=HEADERS).status_code == 404
    assert other.delete(f"/quick-add/{entry['id']}", headers=HEADERS).status_code == 404

    owner = as_user(users[0])
    assert owner.delete(f"/quick-add/{entry['id']}", headers=HEADERS).status_code == 204
    assert owner.get("/quick-add").json() == []


def test_summary_counts_quick_add_in_the_days_totals(db, users, as_user):
    user = users[0]
    db.add(
        UserPreference(user_id=user.id, calorie_goal=2000, protein_goal_g=100, carb_goal_g=250, fat_goal_g=70)
    )
    db.commit()
    client = as_user(user)
    _add(client, calories=400, protein_g=20)
    _add(client, calories=100, fat_g=5)

    today = client.get("/logged-meals/summary?days=1").json()[0]
    assert today["totals"] == {"calories": 500, "protein_g": 20, "carbs_g": 0, "fat_g": 5}
