"""app.routers.crafted_meals.get_or_build_daily_crafted's daily rebuild cap
(MAX_BUILDS_PER_DAY) — bounds per-user Anthropic spend from a sustained
preference-edit/invalidate/rebuild cycle, independent of the per-IP rate
limits on the routes that trigger it. See docs/adr/0018 and
app.db.models.CraftedMealsCache.build_count/stale.

Exercises get_or_build_daily_crafted directly against a real DB session
(mirrors the pattern in app/jobs/*), with build_daily_crafted mocked out so
this doesn't need real menu/eatery data or a live LLM call.
"""

import datetime
from unittest.mock import AsyncMock, patch

import pytest

from app.db.models import ActivityLevel, CraftedMealsCache, HealthGoal, MacroStyle, Sex, TargetMode, User, UserPreference
from app.db.session import SessionLocal
from app.routers.crafted_meals import MAX_BUILDS_PER_DAY, get_or_build_daily_crafted


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def user_and_prefs(db):
    user = User(google_sub="rebuild-cap-test-sub", email="rebuild-cap-test@example.com")
    db.add(user)
    db.commit()
    db.refresh(user)

    prefs = UserPreference(
        user_id=user.id,
        calorie_goal=2000,
        protein_goal_g=150,
        carb_goal_g=200,
        fat_goal_g=70,
        meals_per_day=3,
        sex=Sex.male,
        activity_level=ActivityLevel.moderate,
        health_goal=HealthGoal.maintain_weight,
        macro_style=MacroStyle.balanced,
        target_mode=TargetMode.manual,
    )
    db.add(prefs)
    db.commit()
    db.refresh(prefs)

    yield user, prefs

    db.query(CraftedMealsCache).filter(CraftedMealsCache.user_id == user.id).delete()
    db.query(UserPreference).filter(UserPreference.user_id == user.id).delete()
    db.query(User).filter(User.id == user.id).delete()
    db.commit()


@pytest.mark.asyncio
async def test_first_call_builds_once(db, user_and_prefs):
    user, prefs = user_and_prefs
    today = datetime.date.today()

    with patch("app.routers.crafted_meals.build_daily_crafted", new=AsyncMock(return_value=[])) as mock_build:
        await get_or_build_daily_crafted(user, prefs, today, db)
        assert mock_build.await_count == 1

    row = db.query(CraftedMealsCache).filter(CraftedMealsCache.user_id == user.id, CraftedMealsCache.date == today).one()
    assert row.build_count == 1
    assert row.stale is False


@pytest.mark.asyncio
async def test_fresh_cache_hit_does_not_rebuild(db, user_and_prefs):
    user, prefs = user_and_prefs
    today = datetime.date.today()

    with patch("app.routers.crafted_meals.build_daily_crafted", new=AsyncMock(return_value=[])) as mock_build:
        await get_or_build_daily_crafted(user, prefs, today, db)
        await get_or_build_daily_crafted(user, prefs, today, db)
        assert mock_build.await_count == 1


@pytest.mark.asyncio
async def test_stale_cache_triggers_one_rebuild(db, user_and_prefs):
    user, prefs = user_and_prefs
    today = datetime.date.today()

    with patch("app.routers.crafted_meals.build_daily_crafted", new=AsyncMock(return_value=[])) as mock_build:
        await get_or_build_daily_crafted(user, prefs, today, db)

        db.query(CraftedMealsCache).filter(CraftedMealsCache.user_id == user.id).update({"stale": True})
        db.commit()

        await get_or_build_daily_crafted(user, prefs, today, db)
        assert mock_build.await_count == 2

    row = db.query(CraftedMealsCache).filter(CraftedMealsCache.user_id == user.id, CraftedMealsCache.date == today).one()
    assert row.build_count == 2
    assert row.stale is False


@pytest.mark.asyncio
async def test_rebuild_cap_falls_back_to_stale_payload_instead_of_rebuilding(db, user_and_prefs):
    user, prefs = user_and_prefs
    today = datetime.date.today()

    row = CraftedMealsCache(user_id=user.id, date=today, payload=[], stale=True, build_count=MAX_BUILDS_PER_DAY)
    db.add(row)
    db.commit()

    with patch("app.routers.crafted_meals.build_daily_crafted", new=AsyncMock(return_value=[])) as mock_build:
        result = await get_or_build_daily_crafted(user, prefs, today, db)
        assert mock_build.await_count == 0
        assert result == []

    row = db.query(CraftedMealsCache).filter(CraftedMealsCache.user_id == user.id, CraftedMealsCache.date == today).one()
    assert row.build_count == MAX_BUILDS_PER_DAY
