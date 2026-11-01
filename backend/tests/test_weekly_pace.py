"""Weekly Pace and the Setup path — see docs/adr/0031-onboarding-and-goal-setting.md.
A pace turns into a capped daily adjustment, a null pace keeps the old
percentage shift, only the offered paces are accepted, and the floor says
when it kicked in.
"""

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.models import ActivityLevel, HealthGoal, Sex, User, UserPreference
from app.db.session import SessionLocal
from app.main import app
from app.services.tdee import recommend_targets
from tests.conftest import ALLOWED_ORIGIN

HEADERS = {"Origin": ALLOWED_ORIGIN}

PROFILE = dict(sex=Sex.male, weight_kg=80, height_cm=180, age=20, activity_level=ActivityLevel.moderate)


def test_pace_sets_the_daily_adjustment():
    maintain = recommend_targets(**PROFILE, health_goal=HealthGoal.maintain_weight)
    slow = recommend_targets(**PROFILE, health_goal=HealthGoal.lose_weight, weekly_pace_kg=0.25)
    fast = recommend_targets(**PROFILE, health_goal=HealthGoal.lose_weight, weekly_pace_kg=0.5)
    gain = recommend_targets(**PROFILE, health_goal=HealthGoal.gain_weight, weekly_pace_kg=0.25)

    # ±1 for each side's own rounding.
    assert abs(maintain.calorie_goal - slow.calorie_goal - 275) <= 1
    assert abs(maintain.calorie_goal - fast.calorie_goal - 550) <= 1
    assert abs(gain.calorie_goal - maintain.calorie_goal - 275) <= 1
    assert not fast.floor_applied


def test_null_pace_keeps_the_percentage_shift():
    legacy = recommend_targets(**PROFILE, health_goal=HealthGoal.lose_weight)
    assert legacy.calorie_goal == round(legacy.tdee * 0.8)


def test_small_sedentary_user_hits_the_cap_then_the_floor():
    result = recommend_targets(
        sex=Sex.female, weight_kg=45, height_cm=150, age=20,
        activity_level=ActivityLevel.sedentary, health_goal=HealthGoal.lose_weight, weekly_pace_kg=0.5,
    )
    assert result.calorie_goal == 1200
    assert result.floor_applied


@pytest.fixture
def user():
    db = SessionLocal()
    created = User(google_sub="pace-sub", email="pace@example.com")
    db.add(created)
    db.commit()
    db.refresh(created)
    db.expunge(created)

    yield created

    db.query(UserPreference).filter(UserPreference.user_id == created.id).delete()
    db.query(User).filter(User.id == created.id).delete()
    db.commit()
    db.close()


@pytest.fixture
def client(user):
    app.dependency_overrides[get_current_user] = lambda: user
    with TestClient(app, base_url="http://localhost") as c:
        yield c
    app.dependency_overrides.clear()


STATS = dict(age=20, sex="male", height_cm=180, weight_kg=80, activity_level="moderate")


def test_recommend_endpoint_validates_pace_per_goal(client):
    ok = client.post(
        "/preferences/recommend-targets",
        json={**STATS, "health_goal": "lose_weight", "weekly_pace_kg": 0.5},
        headers=HEADERS,
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["floor_applied"] is False

    for goal, pace in [("gain_weight", 0.5), ("maintain_weight", 0.25), ("lose_weight", 1.0)]:
        bad = client.post(
            "/preferences/recommend-targets",
            json={**STATS, "health_goal": goal, "weekly_pace_kg": pace},
            headers=HEADERS,
        )
        assert bad.status_code == 422, (goal, pace)


def test_setup_save_round_trips_pace(client):
    body = {
        **STATS,
        "calorie_goal": 2400, "protein_goal_g": 160, "carb_goal_g": 260, "fat_goal_g": 75,
        "health_goal": "lose_weight", "weekly_pace_kg": 0.25, "target_mode": "recommended",
    }
    response = client.put("/preferences", json=body, headers=HEADERS)
    assert response.status_code == 200, response.text
    saved = response.json()
    # Deferred fields get their defaults (docs/adr/0031).
    assert (saved["weekly_pace_kg"], saved["meals_per_day"], saved["exercise_adds_to_goal"]) == (0.25, 3, True)
