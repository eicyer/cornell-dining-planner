from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import User, UserPreference
from app.db.session import get_db
from app.services.llm_enrichment import ALLERGENS, DIET_TAGS
from app.services.preference_parsing import parse_preferences
from app.services.llm_enrichment import make_client as make_llm_client

router = APIRouter()


class PreferencesIn(BaseModel):
    calorie_goal: int
    protein_goal_g: int
    carb_goal_g: int
    fat_goal_g: int
    meals_per_day: int = 3
    diet_restrictions: list[str] = []
    allergens: list[str] = []
    liked_foods_text: str | None = None
    disliked_foods_text: str | None = None

    @field_validator("diet_restrictions")
    @classmethod
    def _validate_diet_restrictions(cls, v: list[str]) -> list[str]:
        invalid = set(v) - set(DIET_TAGS)
        if invalid:
            raise ValueError(f"Unknown diet_restrictions {invalid}, must be a subset of {DIET_TAGS}")
        return v

    @field_validator("allergens")
    @classmethod
    def _validate_allergens(cls, v: list[str]) -> list[str]:
        invalid = set(v) - set(ALLERGENS)
        if invalid:
            raise ValueError(f"Unknown allergens {invalid}, must be a subset of {ALLERGENS}")
        return v


class PreferencesOut(BaseModel):
    calorie_goal: int
    protein_goal_g: int
    carb_goal_g: int
    fat_goal_g: int
    meals_per_day: int
    diet_restrictions: list[str]
    allergens: list[str]
    liked_foods_text: str | None
    disliked_foods_text: str | None
    liked_tags: list[str]
    disliked_tags: list[str]


@router.get("/preferences", response_model=PreferencesOut)
def get_preferences(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).one_or_none()
    if prefs is None:
        raise HTTPException(status_code=404, detail="No preferences set yet")
    return prefs


@router.put("/preferences", response_model=PreferencesOut)
async def put_preferences(
    body: PreferencesIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).one_or_none()
    if prefs is None:
        prefs = UserPreference(user_id=user.id)
        db.add(prefs)

    prefs.calorie_goal = body.calorie_goal
    prefs.protein_goal_g = body.protein_goal_g
    prefs.carb_goal_g = body.carb_goal_g
    prefs.fat_goal_g = body.fat_goal_g
    prefs.meals_per_day = body.meals_per_day
    prefs.diet_restrictions = body.diet_restrictions
    prefs.allergens = body.allergens
    prefs.liked_foods_text = body.liked_foods_text
    prefs.disliked_foods_text = body.disliked_foods_text

    liked_tags, disliked_tags = await parse_preferences(
        make_llm_client(), body.liked_foods_text, body.disliked_foods_text
    )
    prefs.liked_tags = liked_tags
    prefs.disliked_tags = disliked_tags

    db.commit()
    db.refresh(prefs)
    return prefs
