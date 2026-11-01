"""Success metrics — see docs/adr/0028-success-metrics-and-first-party-instrumentation.md.
Runs against a fixed week in 2001 so the dev database's real rows can't
leak into the aggregates.
"""

import datetime

import pytest

from app.core.deps import get_current_admin
from app.db.models import LoggedMeal, LoggingEvent, QuickAddEntry, User
from app.db.session import SessionLocal
from app.main import app
from app.services.logging_events import record_event
from app.services.metrics import build_report, week_start

MONDAY = datetime.date(2001, 1, 1)  # a Monday
TODAY = MONDAY + datetime.timedelta(weeks=5, days=2)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _at(date: datetime.date, hour: int = 12) -> datetime.datetime:
    return datetime.datetime.combine(date, datetime.time(hour))


@pytest.fixture
def cohort(db):
    """Three users who signed up on MONDAY:
    - daily: logs food every day of weeks 0, 1 and 4 (first log within 24h)
    - once: one Quick Add on day 3 of week 0, never again (not activated)
    - never: signs up and never logs
    """
    users = [User(google_sub=f"metrics-sub-{n}", email=f"metrics-{n}@example.com", created_at=_at(MONDAY, 9)) for n in ("daily", "once", "never")]
    db.add_all(users)
    db.commit()
    daily, once, _ = users

    for week in (0, 1, 4):
        for day in range(7):
            date = MONDAY + datetime.timedelta(weeks=week, days=day)
            db.add(LoggedMeal(user_id=daily.id, menu_event_id=None, date=date, items=[], totals={}, created_at=_at(date)))
            record_event(db, daily.id, "crafted" if day == 0 else "menu", date)
    once_date = MONDAY + datetime.timedelta(days=3)
    db.add(QuickAddEntry(user_id=once.id, date=once_date, meal_section="snacks", calories=200, created_at=_at(once_date)))
    record_event(db, once.id, "quick_add", once_date)
    db.commit()

    yield users

    ids = [u.id for u in users]
    for model in (LoggedMeal, QuickAddEntry, LoggingEvent):
        db.query(model).filter(model.user_id.in_(ids)).delete()
    db.query(User).filter(User.id.in_(ids)).delete()
    db.commit()


def test_week_start_is_monday():
    assert week_start(MONDAY + datetime.timedelta(days=6)) == MONDAY


def test_north_star_per_week(db, cohort):
    report = build_report(db, weeks=6, today=TODAY)
    week0, week1, week2 = report.weeks[0], report.weeks[1], report.weeks[2]
    assert week0.week_start == MONDAY
    assert (week0.logging_users, week0.avg_logging_days, week0.engaged_share) == (2, 4.0, 0.5)
    assert (week1.logging_users, week1.avg_logging_days, week1.engaged_share) == (1, 7.0, 1.0)
    assert week2.logging_users == 0


def test_cohort_activation_and_retention(db, cohort):
    cohort_row = build_report(db, weeks=6, today=TODAY).cohorts[0]
    assert cohort_row.signups == 3
    assert cohort_row.activated_share == pytest.approx(0.333, abs=0.001)
    assert cohort_row.week1_retention == pytest.approx(0.333, abs=0.001)
    assert cohort_row.week4_retention == pytest.approx(0.333, abs=0.001)


def test_retention_not_reported_before_the_week_has_happened(db, cohort):
    early = build_report(db, weeks=2, today=MONDAY + datetime.timedelta(days=9))
    assert early.cohorts[0].week1_retention is None


def test_source_mix_and_crafted_usage(db, cohort):
    # The 28 days ending TODAY start on day 3 of week 1: four menu days
    # from week 1, then week 4's six menu days and one crafted day.
    report = build_report(db, weeks=6, today=TODAY)
    assert report.source_mix == {"menu": 10, "crafted": 1, "quick_add": 0, "exercise": 0, "weigh_in": 0}
    assert report.crafted_share_of_food_logs == pytest.approx(0.091, abs=0.001)
    assert report.crafted_users == 1


def test_admin_endpoint_is_admin_only(client, admin_user, other_user):
    assert client.get("/admin/api/metrics").status_code in (401, 403)
    app.dependency_overrides[get_current_admin] = lambda: admin_user
    body = client.get("/admin/api/metrics?weeks=2").json()
    assert set(body) == {"weeks", "cohorts", "source_mix", "crafted_share_of_food_logs", "crafted_users"}
