from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import ActivityLevel, HealthGoal, Sex, TargetMode, User, UserPreference
from app.db.session import get_db
from app.services.llm_enrichment import ALLERGENS, DIET_TAGS
from app.services.preference_parsing import parse_preferences
from app.services.tdee import recommend_targets
from app.services.llm_enrichment import make_client as make_llm_client

router = APIRouter()

# Hard bounds enforced on every save, whether the targets came from the TDEE
# recommender or were typed in by hand — "no extremes" has to hold either
# way. Wider than the recommender's own safe defaults (a real athlete's
# manually-entered numbers can legitimately sit outside those), but still
# firmly rules out crash-diet or reckless-surplus values.
CALORIE_GOAL_BOUNDS = (1000, 6000)
PROTEIN_GOAL_G_BOUNDS = (20, 400)
CARB_GOAL_G_BOUNDS = (0, 800)
FAT_GOAL_G_BOUNDS = (15, 300)


class PreferencesIn(BaseModel):
    calorie_goal: int = Field(ge=CALORIE_GOAL_BOUNDS[0], le=CALORIE_GOAL_BOUNDS[1])
    protein_goal_g: int = Field(ge=PROTEIN_GOAL_G_BOUNDS[0], le=PROTEIN_GOAL_G_BOUNDS[1])
    carb_goal_g: int = Field(ge=CARB_GOAL_G_BOUNDS[0], le=CARB_GOAL_G_BOUNDS[1])
    fat_goal_g: int = Field(ge=FAT_GOAL_G_BOUNDS[0], le=FAT_GOAL_G_BOUNDS[1])
    meals_per_day: int = Field(default=3, ge=1, le=6)
    diet_restrictions: list[str] = []
    allergens: list[str] = []

    # Body/activity profile — only needed for the "recommend for me" path;
    # a pure manual-entry user can leave these unset.
    age: int | None = Field(default=None, ge=13, le=100)
    sex: Sex | None = None
    height_cm: float | None = Field(default=None, ge=120, le=230)
    weight_kg: float | None = Field(default=None, ge=30, le=300)
    activity_level: ActivityLevel | None = None
    health_goal: HealthGoal | None = None
    target_mode: TargetMode = TargetMode.manual

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
    age: int | None
    sex: Sex | None
    height_cm: float | None
    weight_kg: float | None
    activity_level: ActivityLevel | None
    health_goal: HealthGoal | None
    target_mode: TargetMode
    liked_foods_text: str | None
    disliked_foods_text: str | None
    liked_tags: list[str]
    disliked_tags: list[str]


class RecommendTargetsIn(BaseModel):
    age: int = Field(ge=13, le=100)
    sex: Sex
    height_cm: float = Field(ge=120, le=230)
    weight_kg: float = Field(ge=30, le=300)
    activity_level: ActivityLevel
    health_goal: HealthGoal


class RecommendTargetsOut(BaseModel):
    bmr: int
    tdee: int
    calorie_goal: int
    protein_goal_g: int
    carb_goal_g: int
    fat_goal_g: int


@router.post("/preferences/recommend-targets", response_model=RecommendTargetsOut)
def recommend_targets_endpoint(
    body: RecommendTargetsIn, user: User = Depends(get_current_user)
) -> RecommendTargetsOut:
    result = recommend_targets(
        sex=body.sex,
        weight_kg=body.weight_kg,
        height_cm=body.height_cm,
        age=body.age,
        activity_level=body.activity_level,
        health_goal=body.health_goal,
    )
    return RecommendTargetsOut(**vars(result))


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
    prefs.age = body.age
    prefs.sex = body.sex
    prefs.height_cm = body.height_cm
    prefs.weight_kg = body.weight_kg
    prefs.activity_level = body.activity_level
    prefs.health_goal = body.health_goal
    prefs.target_mode = body.target_mode
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
