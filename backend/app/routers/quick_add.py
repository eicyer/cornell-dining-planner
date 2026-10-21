import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import QuickAddEntry, User
from app.db.session import get_db
from app.services.meal_sections import MealSection

router = APIRouter()

# Sanity bounds, not nutrition checks: Quick Add numbers are the user's own
# (docs/adr/0024), so the server only rejects what can't be a real entry.
MAX_CALORIES = 5000
MAX_MACRO_G = 500


def _blank_to_none(name: str | None) -> str | None:
    name = (name or "").strip()
    return name or None


class QuickAddIn(BaseModel):
    date: datetime.date | None = None
    meal_section: MealSection
    name: str | None = Field(default=None, max_length=80)
    calories: float = Field(gt=0, le=MAX_CALORIES)
    protein_g: float = Field(default=0, ge=0, le=MAX_MACRO_G)
    carbs_g: float = Field(default=0, ge=0, le=MAX_MACRO_G)
    fat_g: float = Field(default=0, ge=0, le=MAX_MACRO_G)

    _strip_name = field_validator("name")(_blank_to_none)


class QuickAddUpdate(BaseModel):
    """Only fields actually sent are applied, as with LoggedMealUpdate.
    The date can't change; moving an entry to another day is delete + add."""

    meal_section: MealSection | None = None
    name: str | None = Field(default=None, max_length=80)
    calories: float | None = Field(default=None, gt=0, le=MAX_CALORIES)
    protein_g: float | None = Field(default=None, ge=0, le=MAX_MACRO_G)
    carbs_g: float | None = Field(default=None, ge=0, le=MAX_MACRO_G)
    fat_g: float | None = Field(default=None, ge=0, le=MAX_MACRO_G)

    _strip_name = field_validator("name")(_blank_to_none)


class QuickAddOut(BaseModel):
    id: int
    date: datetime.date
    meal_section: MealSection
    name: str | None
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float


def _to_out(entry: QuickAddEntry) -> QuickAddOut:
    return QuickAddOut(
        id=entry.id,
        date=entry.date,
        meal_section=entry.meal_section,
        name=entry.name,
        calories=entry.calories,
        protein_g=entry.protein_g,
        carbs_g=entry.carbs_g,
        fat_g=entry.fat_g,
    )


def _get_own_entry(db: Session, entry_id: int, user: User) -> QuickAddEntry:
    # Someone else's entry 404s rather than 403s so ids can't be probed.
    entry = db.get(QuickAddEntry, entry_id)
    if entry is None or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Quick Add entry not found")
    return entry


@router.post("/quick-add", response_model=QuickAddOut)
def create_quick_add(body: QuickAddIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    date = body.date or datetime.date.today()
    if date > datetime.date.today():
        raise HTTPException(status_code=400, detail="Can't log food for a future day")

    entry = QuickAddEntry(
        user_id=user.id,
        date=date,
        meal_section=body.meal_section,
        name=body.name,
        calories=body.calories,
        protein_g=body.protein_g,
        carbs_g=body.carbs_g,
        fat_g=body.fat_g,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _to_out(entry)


@router.get("/quick-add", response_model=list[QuickAddOut])
def list_quick_add(
    date: datetime.date | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    target_date = date or datetime.date.today()
    entries = (
        db.query(QuickAddEntry)
        .filter(QuickAddEntry.user_id == user.id, QuickAddEntry.date == target_date)
        .order_by(QuickAddEntry.created_at)
        .all()
    )
    return [_to_out(e) for e in entries]


@router.patch("/quick-add/{entry_id}", response_model=QuickAddOut)
def update_quick_add(
    entry_id: int, body: QuickAddUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    entry = _get_own_entry(db, entry_id, user)
    for field in body.model_fields_set:
        value = getattr(body, field)
        # Name is the only field that can be cleared; null elsewhere means
        # "not sent" in spirit, and calories can never be unset.
        if value is None and field != "name":
            raise HTTPException(status_code=400, detail=f"{field} can't be null")
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return _to_out(entry)


@router.delete("/quick-add/{entry_id}", status_code=204)
def delete_quick_add(entry_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_get_own_entry(db, entry_id, user))
    db.commit()
