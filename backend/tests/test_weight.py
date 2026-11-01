"""Weigh-ins and recalculating targets — see docs/adr/0026-weight-log-and-progress.md.
One Weigh-in per day (re-logging replaces it), history that never moves
Recommended Targets on its own, and an explicit recalculate.
"""

import datetime

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.models import (
    ActivityLevel,
    ExerciseEntry,
    HealthGoal,
    LoggingEvent,
    Sex,
    TargetMode,
    User,
    UserPreference,
    WeightEntry,
)
from app.db.session import SessionLocal
from app.main import app
from tests.conftest import ALLOWED_ORIGIN

HEADERS = {"Origin": ALLOWED_ORIGIN}
TODAY = datetime.date.today()


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def users(db):
    created = [User(google_sub=f"weight-sub-{i}", email=f"weight-{i}@example.com") for i in range(2)]
    db.add_all(created)
    db.commit()
    for user in created:
        db.refresh(user)
        db.expunge(user)

    yield created

    ids = [u.id for u in created]
    db.query(WeightEntry).filter(WeightEntry.user_id.in_(ids)).delete()
    db.query(LoggingEvent).filter(LoggingEvent.user_id.in_(ids)).delete()
    db.query(ExerciseEntry).filter(ExerciseEntry.user_id.in_(ids)).delete()
    db.query(UserPreference).filter(UserPreference.user_id.in_(ids)).delete()
    db.query(User).filter(User.id.in_(ids)).delete()
    db.commit()


def _set_prefs(db, user: User, **fields) -> None:
    base = dict(calorie_goal=2000, protein_goal_g=100, carb_goal_g=250, fat_goal_g=70)
    db.add(UserPreference(user_id=user.id, **{**base, **fields}))
    db.commit()


RECOMMENDED_PROFILE = dict(
    target_mode=TargetMode.recommended,
    age=20,
    sex=Sex.female,
    height_cm=165,
    weight_kg=60,
    activity_level=ActivityLevel.moderate,
    health_goal=HealthGoal.maintain_weight,
)


@pytest.fixture
def as_user():
    def _as(user: User) -> TestClient:
        app.dependency_overrides[get_current_user] = lambda: user
        return client

    with TestClient(app, base_url="http://localhost") as client:
        yield _as
    app.dependency_overrides.clear()


def _weigh(client: TestClient, date: datetime.date, kg: float, expected: int = 200):
    response = client.put(f"/weight/{date.isoformat()}", json={"weight_kg": kg}, headers=HEADERS)
    assert response.status_code == expected, response.text
    return response.json()


def test_one_weigh_in_per_day_and_oldest_first(users, as_user):
    client = as_user(users[0])
    _weigh(client, TODAY, 70)
    _weigh(client, TODAY, 69.5)
    _weigh(client, TODAY - datetime.timedelta(days=3), 71)

    assert client.get("/weight").json() == [
        {"date": (TODAY - datetime.timedelta(days=3)).isoformat(), "weight_kg": 71},
        {"date": TODAY.isoformat(), "weight_kg": 69.5},
    ]


def test_rejects_future_days_and_bad_weights(users, as_user):
    client = as_user(users[0])
    _weigh(client, TODAY + datetime.timedelta(days=1), 70, expected=400)
    _weigh(client, TODAY, 20, expected=422)
    _weigh(client, TODAY, 301, expected=422)


def test_delete_and_isolation(users, as_user):
    _weigh(as_user(users[0]), TODAY, 70)
    other = as_user(users[1])
    assert other.get("/weight").json() == []
    assert other.delete(f"/weight/{TODAY.isoformat()}", headers=HEADERS).status_code == 404

    owner = as_user(users[0])
    assert owner.delete(f"/weight/{TODAY.isoformat()}", headers=HEADERS).status_code == 204
    assert owner.get("/weight").json() == []


def test_weigh_in_never_moves_targets_on_its_own(db, users, as_user):
    _set_prefs(db, users[0], **RECOMMENDED_PROFILE)
    client = as_user(users[0])
    _weigh(client, TODAY, 55)
    prefs = client.get("/preferences").json()
    assert (prefs["weight_kg"], prefs["calorie_goal"]) == (60, 2000)


def test_recalculate_uses_latest_weigh_in(db, users, as_user):
    _set_prefs(db, users[0], **RECOMMENDED_PROFILE)
    client = as_user(users[0])
    _weigh(client, TODAY - datetime.timedelta(days=5), 58)
    _weigh(client, TODAY, 55)

    response = client.post("/preferences/recalculate-targets", headers=HEADERS)
    assert response.status_code == 200, response.text
    prefs = response.json()
    assert prefs["weight_kg"] == 55
    assert prefs["calorie_goal"] != 2000


def test_recalculate_refuses_manual_targets_and_missing_weigh_ins(db, users, as_user):
    _set_prefs(db, users[0])
    assert as_user(users[0]).post("/preferences/recalculate-targets", headers=HEADERS).status_code == 400

    _set_prefs(db, users[1], **RECOMMENDED_PROFILE)
    assert as_user(users[1]).post("/preferences/recalculate-targets", headers=HEADERS).status_code == 400


def test_exercise_estimate_uses_latest_weigh_in(db, users, as_user):
    _set_prefs(db, users[0], weight_kg=60)
    client = as_user(users[0])
    _weigh(client, TODAY, 70)
    entry = client.post("/exercise", json={"activity": "running", "minutes": 30}, headers=HEADERS).json()
    # (9.8 − 1) × 70 × 0.5 = 308, not the 264 the profile weight gives.
    assert entry["calories"] == 308
