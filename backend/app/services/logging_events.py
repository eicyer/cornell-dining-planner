"""Writes Logging Events — see docs/adr/0028-success-metrics-and-first-party-instrumentation.md."""

from __future__ import annotations

import datetime
from typing import Literal

from sqlalchemy.orm import Session

from app.db.models import LoggingEvent

EventKind = Literal["menu", "crafted", "quick_add", "exercise", "weigh_in"]
EVENT_KINDS: list[EventKind] = ["menu", "crafted", "quick_add", "exercise", "weigh_in"]
FOOD_EVENT_KINDS: list[EventKind] = ["menu", "crafted", "quick_add"]


def record_event(db: Session, user_id: int, kind: EventKind, date: datetime.date) -> None:
    """Adds the event to the caller's session; it commits with the logging
    action itself, so a failed log never leaves an orphan event."""
    db.add(LoggingEvent(user_id=user_id, kind=kind, date=date))
