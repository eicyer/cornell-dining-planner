"""Logging Streak — see docs/adr/0032-streaks-day-completion-and-reminders.md.

Consecutive Logging Days (any Logged Meal or Quick Add Entry, the same
definition app.services.metrics counts) ending today, or yesterday when
today has nothing yet. Days count by the date food is on, not when it was
entered, so backfilling a missed day repairs the streak.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.db.models import LoggedMeal, QuickAddEntry

# Far enough back that nobody's real streak gets cut off, without scanning
# a user's whole history on every Diary load.
MAX_STREAK_DAYS = 366


@dataclass
class Streak:
    days: int
    logged_today: bool


def current_streak(db: Session, user_id: int, today: datetime.date) -> Streak:
    since = today - datetime.timedelta(days=MAX_STREAK_DAYS)
    logged: set[datetime.date] = set()
    for model in (LoggedMeal, QuickAddEntry):
        rows = db.query(model.date).filter(model.user_id == user_id, model.date >= since, model.date <= today)
        logged.update(date for (date,) in rows.distinct())

    logged_today = today in logged
    day = today if logged_today else today - datetime.timedelta(days=1)
    days = 0
    while day in logged:
        days += 1
        day -= datetime.timedelta(days=1)
    return Streak(days=days, logged_today=logged_today)
