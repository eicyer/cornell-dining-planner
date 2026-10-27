"""Logging Streak — see docs/adr/0032-streaks-day-completion-and-reminders.md.
Any food counts, today not yet logged doesn't break it, backfilling repairs
it, exercise doesn't count, and it's per user.
"""

import datetime

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.models import ExerciseEntry, LoggedMeal, QuickAddEntry, User
from app.db.session import SessionLocal
from app.main import app
from app.services.streaks import current_streak

TODAY = datetime.date.today()


def _days_ago(n: int) -> datetime.date:
    return TODAY - datetime.timedelta(days=n)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def users(db):
    created = [User(google_sub=f"streak-sub-{i}", email=f"streak-{i}@example.com") for i in range(2)]
    db.add_all(created)
    db.commit()
    for user in created:
        db.refresh(user)
        db.expunge(user)

    yield created

    ids = [u.id for u in created]
    for model in (LoggedMeal, QuickAddEntry, ExerciseEntry):
        db.query(model).filter(model.user_id.in_(ids)).delete()
    db.query(User).filter(User.id.in_(ids)).delete()
    db.commit()


def _meal(db, user: User, date: datetime.date) -> None:
    db.add(LoggedMeal(user_id=user.id, menu_event_id=None, date=date, items=[], totals={}))
    db.commit()


def _quick_add(db, user: User, date: datetime.date) -> None:
    db.add(QuickAddEntry(user_id=user.id, date=date, meal_section="snacks", calories=150))
    db.commit()


def test_counts_menu_and_quick_add_days_back_from_today(db, users):
    _meal(db, users[0], _days_ago(0))
    _quick_add(db, users[0], _days_ago(1))
    _meal(db, users[0], _days_ago(2))
    _meal(db, users[0], _days_ago(4))  # gap on day 3 ends it

    streak = current_streak(db, users[0].id, TODAY)
    assert (streak.days, streak.logged_today) == (3, True)


def test_unlogged_today_keeps_yesterdays_streak(db, users):
    _meal(db, users[0], _days_ago(1))
    _meal(db, users[0], _days_ago(2))

    streak = current_streak(db, users[0].id, TODAY)
    assert (streak.days, streak.logged_today) == (2, False)


def test_backfilling_a_gap_repairs_it(db, users):
    _meal(db, users[0], _days_ago(0))
    _meal(db, users[0], _days_ago(2))
    assert current_streak(db, users[0].id, TODAY).days == 1

    _quick_add(db, users[0], _days_ago(1))
    assert current_streak(db, users[0].id, TODAY).days == 3


def test_exercise_alone_is_not_a_logging_day(db, users):
    db.add(ExerciseEntry(user_id=users[0].id, date=TODAY, activity="walking", label="Walking", minutes=30, calories=100))
    db.commit()
    assert current_streak(db, users[0].id, TODAY).days == 0


def test_endpoint_is_per_user(db, users):
    _meal(db, users[0], _days_ago(0))
    _meal(db, users[0], _days_ago(1))
    with TestClient(app, base_url="http://localhost") as client:
        app.dependency_overrides[get_current_user] = lambda: users[1]
        assert client.get("/logged-meals/streak").json() == {"days": 0, "logged_today": False}
        app.dependency_overrides[get_current_user] = lambda: users[0]
        assert client.get("/logged-meals/streak").json() == {"days": 2, "logged_today": True}
    app.dependency_overrides.clear()
