"""Exercise Entries — see docs/adr/0025-exercise-entries-and-net-calories.md.
Activity + minutes with a server-side (MET − 1) × kg × hours estimate, typed
calories as the fallback, and each day's burn reported in the summary.
"""

import datetime

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.models import ExerciseEntry, User, UserPreference
from app.db.session import SessionLocal
from app.main import app
from app.services.exercise import ACTIVITIES_BY_KEY, estimate_calories
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
    created = [User(google_sub=f"exercise-sub-{i}", email=f"exercise-{i}@example.com") for i in range(2)]
    db.add_all(created)
    db.commit()
    for user in created:
        db.refresh(user)
        db.expunge(user)

    yield created

    ids = [u.id for u in created]
    db.query(ExerciseEntry).filter(ExerciseEntry.user_id.in_(ids)).delete()
    db.query(UserPreference).filter(UserPreference.user_id.in_(ids)).delete()
    db.query(User).filter(User.id.in_(ids)).delete()
    db.commit()


def _set_prefs(db, user: User, **fields) -> None:
    db.add(UserPreference(user_id=user.id, calorie_goal=2000, protein_goal_g=100, carb_goal_g=250, fat_goal_g=70, **fields))
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
    response = client.post("/exercise", json={"activity": "running", "minutes": 30, **body}, headers=HEADERS)
    assert response.status_code == expected, response.text
    return response.json()


def test_estimate_subtracts_resting_met():
    # Running is 9.8 MET: (9.8 − 1) × 70kg × 0.5h = 308.
    assert ACTIVITIES_BY_KEY["running"].met == 9.8
    assert estimate_calories("running", 30, 70) == 308


def test_estimates_from_preference_weight(db, users, as_user):
    _set_prefs(db, users[0], weight_kg=70)
    entry = _add(as_user(users[0]))
    assert (entry["label"], entry["calories"], entry["calories_typed"]) == ("Running", 308, False)


def test_needs_typed_calories_without_weight_or_for_other(db, users, as_user):
    _set_prefs(db, users[0])
    client = as_user(users[0])
    _add(client, expected=400)
    _add(client, expected=400, activity="other")

    typed = _add(client, activity="other", label="Ultimate frisbee", calories=250)
    assert (typed["label"], typed["calories"], typed["calories_typed"]) == ("Ultimate frisbee", 250, True)


@pytest.mark.parametrize(
    "body", [{"minutes": 0}, {"minutes": 601}, {"calories": 0}, {"calories": 3001}, {"activity": "quidditch"}]
)
def test_rejects_bad_entries(db, users, as_user, body):
    _set_prefs(db, users[0], weight_kg=70)
    client = as_user(users[0])
    response = client.post("/exercise", json={"activity": "running", "minutes": 30, **body}, headers=HEADERS)
    assert response.status_code in (400, 422), response.text


def test_rejects_future_days(db, users, as_user):
    _set_prefs(db, users[0], weight_kg=70)
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
    _add(as_user(users[0]), expected=400, date=tomorrow)


def test_replace_re_estimates(db, users, as_user):
    _set_prefs(db, users[0], weight_kg=70)
    client = as_user(users[0])
    entry = _add(client, calories=500)
    replaced = client.put(f"/exercise/{entry['id']}", json={"activity": "yoga", "minutes": 60}, headers=HEADERS)
    assert replaced.status_code == 200, replaced.text
    body = replaced.json()
    # Yoga 2.5 MET: (2.5 − 1) × 70 × 1 = 105.
    assert (body["label"], body["calories"], body["calories_typed"]) == ("Yoga", 105, False)


def test_other_users_entries_are_invisible(db, users, as_user):
    _set_prefs(db, users[0], weight_kg=70)
    entry = _add(as_user(users[0]))
    other = as_user(users[1])
    assert other.get("/exercise").json() == []
    assert other.delete(f"/exercise/{entry['id']}", headers=HEADERS).status_code == 404
    assert as_user(users[0]).delete(f"/exercise/{entry['id']}", headers=HEADERS).status_code == 204


def test_summary_reports_exercise_and_the_switch(db, users, as_user):
    _set_prefs(db, users[0], weight_kg=70, exercise_adds_to_goal=False)
    client = as_user(users[0])
    _add(client)
    _add(client, activity="other", calories=100)

    today = client.get("/logged-meals/summary?days=1").json()[0]
    assert today["exercise_calories"] == 408
    assert today["exercise_adds_to_goal"] is False
    assert today["goal"]["calories"] == 2000


def test_lists_activities_with_labels(as_user, users):
    activities = as_user(users[0]).get("/exercise/activities").json()
    assert {"key": "running", "label": "Running"} in activities
