import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.db.models import (
    ActivityLevel,
    CraftedMealsCache,
    DietTag,
    Eatery,
    HealthGoal,
    MacroStyle,
    MenuEvent,
    MenuItem,
    Sex,
    TargetMode,
    User,
    UserPreference,
)
from app.db.session import get_db
from app.services.customizable_items import variant_names
from app.services.eating_styles import EATING_STYLES
from app.services.food_survey import SurveyResponse, build_survey, merge_tags, score_survey
from app.services.llm_enrichment import ALLERGENS, DIET_TAGS
from app.services.preference_parsing import parse_preferences
from app.services.station_survey import StationItem, build_station_survey
from app.services.tdee import recommend_targets
from app.services.llm_enrichment import make_client as make_llm_client

router = APIRouter()


def _invalidate_crafted_meals_cache(db: Session, user_id: int) -> None:
    """Marks this user's cached GET /menus/today/crafted result stale (see
    docs/adr/0017) — call before every commit that changes UserPreference,
    since preferences are the only thing that can make today's cached
    result stale mid-day. Marks stale rather than deleting so the row's
    build_count survives the edit — see app.routers.crafted_meals's daily
    rebuild cap, which needs that count to keep bounding LLM spend across
    repeated edit/invalidate cycles, not reset on every one. Covers all
    dates, not just today, in case the server's day has rolled over since
    the row was written."""
    db.query(CraftedMealsCache).filter(CraftedMealsCache.user_id == user_id).update(
        {"stale": True}, synchronize_session=False
    )


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
    macro_style: MacroStyle | None = None
    target_mode: TargetMode = TargetMode.manual

    liked_foods_text: str | None = None
    disliked_foods_text: str | None = None
    # Soft Preference, scored deterministically before the LLM polish step —
    # see docs/adr/0009-deterministic-preference-preranking and
    # docs/adr/0015-eating-styles-registry.
    eating_styles: list[str] = []

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

    @field_validator("eating_styles")
    @classmethod
    def _validate_eating_styles(cls, v: list[str]) -> list[str]:
        invalid = set(v) - set(EATING_STYLES)
        if invalid:
            raise ValueError(f"Unknown eating_styles {invalid}, must be a subset of {EATING_STYLES}")
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
    macro_style: MacroStyle | None
    target_mode: TargetMode
    liked_foods_text: str | None
    disliked_foods_text: str | None
    liked_tags: list[str]
    disliked_tags: list[str]
    eating_styles: list[str]
    food_survey_completed: bool


class RecommendTargetsIn(BaseModel):
    age: int = Field(ge=13, le=100)
    sex: Sex
    height_cm: float = Field(ge=120, le=230)
    weight_kg: float = Field(ge=30, le=300)
    activity_level: ActivityLevel
    health_goal: HealthGoal
    macro_style: MacroStyle = MacroStyle.balanced


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
        macro_style=body.macro_style,
    )
    return RecommendTargetsOut(**vars(result))


@router.get("/preferences", response_model=PreferencesOut)
def get_preferences(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).one_or_none()
    if prefs is None:
        raise HTTPException(status_code=404, detail="No preferences set yet")
    return prefs


@router.put("/preferences", response_model=PreferencesOut)
@limiter.limit("10/minute")
async def put_preferences(
    request: Request, body: PreferencesIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
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
    prefs.macro_style = body.macro_style
    prefs.target_mode = body.target_mode
    prefs.liked_foods_text = body.liked_foods_text
    prefs.disliked_foods_text = body.disliked_foods_text
    prefs.eating_styles = body.eating_styles

    liked_tags, disliked_tags = await parse_preferences(
        make_llm_client(), body.liked_foods_text, body.disliked_foods_text
    )
    prefs.liked_tags = liked_tags
    prefs.disliked_tags = disliked_tags

    _invalidate_crafted_meals_cache(db, user.id)
    db.commit()
    db.refresh(prefs)
    return prefs


# --- Food Preference Survey — see docs/adr/0011-food-preference-survey ---


class FoodSurveyItemOut(BaseModel):
    id: str
    name: str
    image_url: str | None = None


class FoodSurveyPairOut(BaseModel):
    id: str
    item_a: FoodSurveyItemOut
    item_b: FoodSurveyItemOut


class FoodSurveyOut(BaseModel):
    pairs: list[FoodSurveyPairOut]


class FoodSurveyResponseIn(BaseModel):
    pair_id: str
    choice: Literal["a", "b", "skip"]


class FoodSurveySubmitIn(BaseModel):
    responses: list[FoodSurveyResponseIn] = Field(min_length=0, max_length=10)


def _get_prefs_or_404(user: User, db: Session) -> UserPreference:
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).one_or_none()
    if prefs is None:
        raise HTTPException(status_code=404, detail="Save diet/allergen preferences first")
    return prefs


@router.get("/preferences/food-survey", response_model=FoodSurveyOut)
def get_food_survey(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> FoodSurveyOut:
    prefs = _get_prefs_or_404(user, db)
    pairs = build_survey(prefs.diet_restrictions, prefs.allergens)
    return FoodSurveyOut(
        pairs=[
            FoodSurveyPairOut(
                id=p.id,
                item_a=FoodSurveyItemOut(id=p.item_a.id, name=p.item_a.name, image_url=p.item_a.image_url),
                item_b=FoodSurveyItemOut(id=p.item_b.id, name=p.item_b.name, image_url=p.item_b.image_url),
            )
            for p in pairs
        ]
    )


@router.post("/preferences/food-survey", response_model=PreferencesOut)
def submit_food_survey(
    body: FoodSurveySubmitIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    prefs = _get_prefs_or_404(user, db)
    liked, disliked = score_survey([SurveyResponse(pair_id=r.pair_id, choice=r.choice) for r in body.responses])
    prefs.liked_tags, prefs.disliked_tags = merge_tags(prefs.liked_tags, prefs.disliked_tags, liked, disliked)
    prefs.food_survey_completed = True

    _invalidate_crafted_meals_cache(db, user.id)
    db.commit()
    db.refresh(prefs)
    return prefs


# --- Station Survey — compare today's actual staple-station options at one
# eatery (Grill/Pizza/Chef's Table), see docs/adr/0013. Separate from the
# one-time Food Preference Survey above: repeatable, eatery-scoped, and
# never sets food_survey_completed. ---


def _todays_station_items(db: Session, eatery_id: int) -> list[StationItem]:
    """Every distinct item name across *all* of today's menu events at this
    eatery (not just the current meal period — Grill/Pizza staples often
    span breakfast/lunch/dinner), with cached diet tags attached. Items with
    no DietTag row yet are skipped rather than assumed compatible, same
    caution app.routers.crafted_meals already applies to missing nutrition
    data."""
    today = datetime.date.today()
    menu_event_ids = [
        e.id for e in db.query(MenuEvent.id).filter(MenuEvent.eatery_id == eatery_id, MenuEvent.date == today).all()
    ]
    if not menu_event_ids:
        return []

    menu_items = db.query(MenuItem).filter(MenuItem.menu_event_id.in_(menu_event_ids)).all()
    diet_by_name = {d.item_name: d for d in db.query(DietTag).all()}

    by_name: dict[str, StationItem] = {}
    for item in menu_items:
        for name in variant_names(item.name):
            diet_tag = diet_by_name.get(name)
            if diet_tag is None or name in by_name:
                continue
            by_name[name] = StationItem(
                name=name, category=item.category,
                diet_tags=diet_tag.diet_tags, allergens=diet_tag.likely_allergens,
            )
    return list(by_name.values())


class StationSurveyOut(BaseModel):
    eatery_id: int
    eatery_name: str
    pairs: list[FoodSurveyPairOut]


class StationSurveySubmitIn(BaseModel):
    responses: list[FoodSurveyResponseIn] = Field(min_length=0, max_length=10)


@router.get("/preferences/station-survey/{eatery_id}", response_model=StationSurveyOut)
def get_station_survey(
    eatery_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> StationSurveyOut:
    prefs = _get_prefs_or_404(user, db)
    eatery = db.get(Eatery, eatery_id)
    if eatery is None:
        raise HTTPException(status_code=404, detail="Eatery not found")

    items = _todays_station_items(db, eatery_id)
    pairs = build_station_survey(eatery_id, items, prefs.diet_restrictions, prefs.allergens)
    return StationSurveyOut(
        eatery_id=eatery_id,
        eatery_name=eatery.name,
        pairs=[
            FoodSurveyPairOut(
                id=p.id,
                item_a=FoodSurveyItemOut(id=p.item_a.id, name=p.item_a.name),
                item_b=FoodSurveyItemOut(id=p.item_b.id, name=p.item_b.name),
            )
            for p in pairs
        ],
    )


@router.post("/preferences/station-survey/{eatery_id}", response_model=PreferencesOut)
def submit_station_survey(
    eatery_id: int, body: StationSurveySubmitIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    prefs = _get_prefs_or_404(user, db)
    items = _todays_station_items(db, eatery_id)
    # Re-derived, not looked up from GET-time state (there is none) — see
    # build_station_survey's determinism contract.
    pairs = build_station_survey(eatery_id, items, prefs.diet_restrictions, prefs.allergens)
    pairs_by_id = {p.id: p for p in pairs}

    liked, disliked = score_survey(
        [SurveyResponse(pair_id=r.pair_id, choice=r.choice) for r in body.responses], pairs_by_id=pairs_by_id
    )
    prefs.liked_tags, prefs.disliked_tags = merge_tags(prefs.liked_tags, prefs.disliked_tags, liked, disliked)

    _invalidate_crafted_meals_cache(db, user.id)
    db.commit()
    db.refresh(prefs)
    return prefs
