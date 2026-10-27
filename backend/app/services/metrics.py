"""Success metrics for the tracking pivot — see
docs/adr/0028-success-metrics-and-first-party-instrumentation.md.

Aggregates only: every function returns counts and rates across users,
never per-user rows. Logging Days, signups and retention come from the
tables that already exist (so pre-pivot history is the baseline); only the
logging source mix needs LoggingEvent.
"""

from __future__ import annotations

import datetime
from collections import defaultdict
from dataclasses import asdict, dataclass

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import LoggedMeal, LoggingEvent, QuickAddEntry, User
from app.services.logging_events import EVENT_KINDS, FOOD_EVENT_KINDS

ACTIVATION_WINDOW = datetime.timedelta(hours=24)
ENGAGED_DAYS_PER_WEEK = 4
SOURCE_MIX_DAYS = 28


@dataclass
class WeekRow:
    week_start: datetime.date
    logging_users: int
    avg_logging_days: float
    engaged_share: float  # logging users with >= ENGAGED_DAYS_PER_WEEK days


@dataclass
class CohortRow:
    week_start: datetime.date
    signups: int
    activated_share: float
    week1_retention: float | None  # None until the cohort is old enough
    week4_retention: float | None


@dataclass
class MetricsReport:
    weeks: list[WeekRow]
    cohorts: list[CohortRow]
    source_mix: dict[str, int]
    crafted_share_of_food_logs: float
    crafted_users: int

    def to_dict(self) -> dict:
        return asdict(self)


def week_start(date: datetime.date) -> datetime.date:
    return date - datetime.timedelta(days=date.weekday())


def _logging_days(db: Session, since: datetime.date) -> dict[int, set[datetime.date]]:
    """User id -> distinct days with any food logged, since `since`."""
    days: dict[int, set[datetime.date]] = defaultdict(set)
    for model in (LoggedMeal, QuickAddEntry):
        rows = db.query(model.user_id, model.date).filter(model.date >= since).distinct()
        for user_id, date in rows:
            days[user_id].add(date)
    return days


def _first_food_log_at(db: Session) -> dict[int, datetime.datetime]:
    first: dict[int, datetime.datetime] = {}
    for model in (LoggedMeal, QuickAddEntry):
        for user_id, created_at in db.query(model.user_id, func.min(model.created_at)).group_by(model.user_id):
            if user_id not in first or created_at < first[user_id]:
                first[user_id] = created_at
    return first


def _share(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 3) if denominator else 0.0


def build_report(db: Session, weeks: int = 8, today: datetime.date | None = None) -> MetricsReport:
    today = today or datetime.date.today()
    this_week = week_start(today)
    first_week = this_week - datetime.timedelta(weeks=weeks - 1)
    # Every week reported, and every retention week after it, is on or after first_week.
    days_by_user = _logging_days(db, first_week)

    week_rows: list[WeekRow] = []
    for i in range(weeks):
        start = first_week + datetime.timedelta(weeks=i)
        end = start + datetime.timedelta(days=7)
        per_user = [sum(1 for d in days if start <= d < end) for days in days_by_user.values()]
        per_user = [n for n in per_user if n > 0]
        week_rows.append(
            WeekRow(
                week_start=start,
                logging_users=len(per_user),
                avg_logging_days=round(sum(per_user) / len(per_user), 2) if per_user else 0.0,
                engaged_share=_share(sum(1 for n in per_user if n >= ENGAGED_DAYS_PER_WEEK), len(per_user)),
            )
        )

    first_logs = _first_food_log_at(db)
    signups = (
        db.query(User.id, User.created_at)
        .filter(User.created_at >= datetime.datetime.combine(first_week, datetime.time.min))
        .all()
    )
    by_cohort: dict[datetime.date, list[tuple[int, datetime.datetime]]] = defaultdict(list)
    for user_id, created_at in signups:
        by_cohort[week_start(created_at.date())].append((user_id, created_at))

    def logged_in_week(user_id: int, start: datetime.date) -> bool:
        end = start + datetime.timedelta(days=7)
        return any(start <= d < end for d in days_by_user.get(user_id, ()))

    cohort_rows: list[CohortRow] = []
    for i in range(weeks):
        start = first_week + datetime.timedelta(weeks=i)
        members = by_cohort.get(start, [])
        activated = sum(
            1 for user_id, created_at in members
            if user_id in first_logs and first_logs[user_id] - created_at <= ACTIVATION_WINDOW
        )

        def retention(k: int) -> float | None:
            target = start + datetime.timedelta(weeks=k)
            # Only report a week that has fully happened.
            if target + datetime.timedelta(days=7) > today + datetime.timedelta(days=1):
                return None
            return _share(sum(1 for user_id, _ in members if logged_in_week(user_id, target)), len(members))

        cohort_rows.append(
            CohortRow(
                week_start=start,
                signups=len(members),
                activated_share=_share(activated, len(members)),
                week1_retention=retention(1),
                week4_retention=retention(4),
            )
        )

    since = today - datetime.timedelta(days=SOURCE_MIX_DAYS - 1)
    counts = dict(
        db.query(LoggingEvent.kind, func.count(LoggingEvent.id))
        .filter(LoggingEvent.date >= since, LoggingEvent.date <= today)
        .group_by(LoggingEvent.kind)
        .all()
    )
    source_mix = {kind: counts.get(kind, 0) for kind in EVENT_KINDS}
    food_logs = sum(source_mix[k] for k in FOOD_EVENT_KINDS)
    crafted_users = (
        db.query(func.count(func.distinct(LoggingEvent.user_id)))
        .filter(LoggingEvent.kind == "crafted", LoggingEvent.date >= since, LoggingEvent.date <= today)
        .scalar()
    )

    return MetricsReport(
        weeks=week_rows,
        cohorts=cohort_rows,
        source_mix=source_mix,
        crafted_share_of_food_logs=_share(source_mix["crafted"], food_logs),
        crafted_users=crafted_users or 0,
    )
