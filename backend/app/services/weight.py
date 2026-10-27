"""Weigh-in lookups — see docs/adr/0026-weight-log-and-progress.md."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import UserPreference, WeightEntry


def latest_weigh_in_kg(db: Session, user_id: int) -> float | None:
    entry = (
        db.query(WeightEntry)
        .filter(WeightEntry.user_id == user_id)
        .order_by(WeightEntry.date.desc())
        .first()
    )
    return entry.weight_kg if entry else None


def current_weight_kg(db: Session, user_id: int) -> float | None:
    """The user's best-known weight right now: their latest Weigh-in, else
    the weight on their preferences. Not for Recommended Targets — those use
    UserPreference.weight_kg until the user chooses to recalculate."""
    latest = latest_weigh_in_kg(db, user_id)
    if latest is not None:
        return latest
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user_id).one_or_none()
    return prefs.weight_kg if prefs else None
