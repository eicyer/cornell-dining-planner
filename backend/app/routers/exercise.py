import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import ExerciseEntry, User
from app.db.session import get_db
from app.services.exercise import ACTIVITIES, ACTIVITIES_BY_KEY, OTHER, estimate_calories
from app.services.logging_events import record_event
from app.services.weight import current_weight_kg

router = APIRouter()

# Sanity bounds on what the user types — see docs/adr/0025.
MAX_MINUTES = 600
MAX_CALORIES = 3000


class ActivityOut(BaseModel):
    key: str
    label: str


class ExerciseIn(BaseModel):
    """Calories are optional: omitted means "estimate it" from the activity,
    minutes and the user's weight. "Other" always needs them typed."""

    activity: str
    minutes: int = Field(ge=1, le=MAX_MINUTES)
    calories: float | None = Field(default=None, gt=0, le=MAX_CALORIES)
    # Only used for "Other"; known activities keep their own label.
    label: str | None = Field(default=None, max_length=80)


class ExerciseCreate(ExerciseIn):
    date: datetime.date | None = None


class ExerciseOut(BaseModel):
    id: int
    date: datetime.date
    activity: str
    label: str
    minutes: int
    calories: float
    calories_typed: bool


def _to_out(entry: ExerciseEntry) -> ExerciseOut:
    return ExerciseOut(
        id=entry.id,
        date=entry.date,
        activity=entry.activity,
        label=entry.label,
        minutes=entry.minutes,
        calories=entry.calories,
        calories_typed=entry.calories_typed,
    )


def _apply(db: Session, user: User, entry: ExerciseEntry, body: ExerciseIn) -> None:
    """Fills activity/label/minutes/calories from the request — shared by
    create and edit so an edit re-estimates the burn exactly like a new
    entry would."""
    if body.activity != OTHER and body.activity not in ACTIVITIES_BY_KEY:
        raise HTTPException(status_code=400, detail=f"Unknown activity {body.activity!r}")

    if body.calories is not None:
        calories, typed = body.calories, True
    elif body.activity == OTHER:
        raise HTTPException(status_code=400, detail="Type the calories burned for Other")
    else:
        # Latest Weigh-in, else the profile weight (docs/adr/0026).
        weight_kg = current_weight_kg(db, user.id)
        if weight_kg is None:
            raise HTTPException(
                status_code=400, detail="Log your weight on Progress to estimate this, or type the calories"
            )
        calories, typed = estimate_calories(body.activity, body.minutes, weight_kg), False

    entry.activity = body.activity
    entry.label = (
        ((body.label or "").strip() or "Other") if body.activity == OTHER else ACTIVITIES_BY_KEY[body.activity].label
    )
    entry.minutes = body.minutes
    entry.calories = calories
    entry.calories_typed = typed


def _get_own_entry(db: Session, entry_id: int, user: User) -> ExerciseEntry:
    # Someone else's entry 404s rather than 403s so ids can't be probed.
    entry = db.get(ExerciseEntry, entry_id)
    if entry is None or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Exercise entry not found")
    return entry


@router.get("/exercise/activities", response_model=list[ActivityOut])
def list_activities():
    return [ActivityOut(key=a.key, label=a.label) for a in ACTIVITIES]


@router.post("/exercise", response_model=ExerciseOut)
def create_exercise(body: ExerciseCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    date = body.date or datetime.date.today()
    if date > datetime.date.today():
        raise HTTPException(status_code=400, detail="Can't log exercise for a future day")

    entry = ExerciseEntry(user_id=user.id, date=date)
    _apply(db, user, entry, body)
    db.add(entry)
    record_event(db, user.id, "exercise", date)
    db.commit()
    db.refresh(entry)
    return _to_out(entry)


@router.get("/exercise", response_model=list[ExerciseOut])
def list_exercise(
    date: datetime.date | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    target_date = date or datetime.date.today()
    entries = (
        db.query(ExerciseEntry)
        .filter(ExerciseEntry.user_id == user.id, ExerciseEntry.date == target_date)
        .order_by(ExerciseEntry.created_at)
        .all()
    )
    return [_to_out(e) for e in entries]


@router.put("/exercise/{entry_id}", response_model=ExerciseOut)
def replace_exercise(
    entry_id: int, body: ExerciseIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """A full replace rather than a partial PATCH: changing the activity or
    minutes has to re-estimate the calories, so the entry is re-derived
    from the whole request. The date can't change."""
    entry = _get_own_entry(db, entry_id, user)
    _apply(db, user, entry, body)
    db.commit()
    db.refresh(entry)
    return _to_out(entry)


@router.delete("/exercise/{entry_id}", status_code=204)
def delete_exercise(entry_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_get_own_entry(db, entry_id, user))
    db.commit()
