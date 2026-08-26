"""DELETE /auth/me — see app.routers.auth.delete_me. Confirms it actually
removes every row scoped to the user (not just the User row itself, which
would otherwise leave orphaned preferences/logged-meals/cache rows behind
since no FK cascade is configured at the DB level — see app.db.models) and
clears the session.
"""

import datetime

import pytest

from app.core.deps import get_current_user
from app.db.models import CraftedMealsCache, LoggedMeal, Sex, TargetMode, User, UserPreference
from app.db.session import SessionLocal
from app.main import app
from tests.conftest import ALLOWED_ORIGIN


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def deletable_user(db):
    user = User(google_sub="account-deletion-test-sub", email="account-deletion-test@example.com")
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(
        UserPreference(
            user_id=user.id,
            calorie_goal=2000,
            protein_goal_g=150,
            carb_goal_g=200,
            fat_goal_g=70,
            meals_per_day=3,
            sex=Sex.male,
            target_mode=TargetMode.manual,
        )
    )
    db.add(
        LoggedMeal(
            user_id=user.id,
            date=datetime.date.today(),
            items=[],
            totals={"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0},
        )
    )
    db.add(CraftedMealsCache(user_id=user.id, date=datetime.date.today(), payload=[]))
    db.commit()

    # Force-load attributes (the second commit above expired them) before
    # detaching — the route's own `db` (a separate SessionLocal() from
    # get_db) will otherwise conflict trying to attach an instance already
    # bound to this fixture's session, and a detached-but-expired instance
    # can't refresh itself once it has no session.
    db.refresh(user)
    db.expunge(user)

    yield user

    # Best-effort cleanup in case a test fails before the endpoint deletes
    # these itself.
    db.query(LoggedMeal).filter(LoggedMeal.user_id == user.id).delete()
    db.query(CraftedMealsCache).filter(CraftedMealsCache.user_id == user.id).delete()
    db.query(UserPreference).filter(UserPreference.user_id == user.id).delete()
    db.query(User).filter(User.id == user.id).delete()
    db.commit()


def test_delete_me_removes_every_scoped_row(db, deletable_user):
    user_id = deletable_user.id
    app.dependency_overrides[get_current_user] = lambda: deletable_user

    from fastapi.testclient import TestClient

    with TestClient(app, base_url="http://localhost") as client:
        response = client.delete("/auth/me", headers={"Origin": ALLOWED_ORIGIN})
    app.dependency_overrides.clear()

    assert response.status_code == 200

    db.expire_all()
    assert db.query(User).filter(User.id == user_id).one_or_none() is None
    assert db.query(UserPreference).filter(UserPreference.user_id == user_id).one_or_none() is None
    assert db.query(LoggedMeal).filter(LoggedMeal.user_id == user_id).one_or_none() is None
    assert db.query(CraftedMealsCache).filter(CraftedMealsCache.user_id == user_id).one_or_none() is None
