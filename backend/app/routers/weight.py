import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import User, WeightEntry
from app.db.session import get_db

router = APIRouter()


class WeighInIn(BaseModel):
    # Same bounds as the profile weight on PUT /preferences.
    weight_kg: float = Field(ge=30, le=300)


class WeighInOut(BaseModel):
    date: datetime.date
    weight_kg: float


@router.get("/weight", response_model=list[WeighInOut])
def list_weigh_ins(days: int = 90, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Oldest first, for charting."""
    start = datetime.date.today() - datetime.timedelta(days=max(days, 1) - 1)
    entries = (
        db.query(WeightEntry)
        .filter(WeightEntry.user_id == user.id, WeightEntry.date >= start)
        .order_by(WeightEntry.date)
        .all()
    )
    return [WeighInOut(date=e.date, weight_kg=e.weight_kg) for e in entries]


@router.put("/weight/{date}", response_model=WeighInOut)
def put_weigh_in(
    date: datetime.date, body: WeighInIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """At most one Weigh-in per day: logging again replaces it
    (docs/adr/0026). Never touches UserPreference.weight_kg."""
    if date > datetime.date.today():
        raise HTTPException(status_code=400, detail="Can't log a weigh-in for a future day")

    def upsert() -> WeightEntry:
        entry = (
            db.query(WeightEntry)
            .filter(WeightEntry.user_id == user.id, WeightEntry.date == date)
            .with_for_update()
            .one_or_none()
        )
        if entry is None:
            entry = WeightEntry(user_id=user.id, date=date)
            db.add(entry)
        entry.weight_kg = body.weight_kg
        db.commit()
        return entry

    try:
        entry = upsert()
    except IntegrityError:
        # A concurrent first weigh-in for the same day won the race; retry
        # once, which now updates it.
        db.rollback()
        entry = upsert()
    return WeighInOut(date=entry.date, weight_kg=entry.weight_kg)


@router.delete("/weight/{date}", status_code=204)
def delete_weigh_in(date: datetime.date, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    deleted = db.query(WeightEntry).filter(WeightEntry.user_id == user.id, WeightEntry.date == date).delete()
    if not deleted:
        raise HTTPException(status_code=404, detail="No weigh-in on that day")
    db.commit()
