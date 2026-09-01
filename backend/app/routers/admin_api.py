"""JSON API behind the admin panel — see docs/adr/0016. Every route is
gated by get_current_admin (exactly one operator, settings.admin_email).

Lets the admin browse/search every distinct food (NutritionMatch + DietTag,
keyed by item_name) and correct the per-100g macros/labels the app actually
runs on. Portion size is deliberately read-only here — see
app.services.portion_display.
"""

from __future__ import annotations

import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.deps import get_current_admin
from app.core.rate_limit import limiter
from app.db.models import CommonFood, DietTag, NutritionMatch, NutritionSource, User
from app.db.session import get_db
from app.services.llm_enrichment import ALLERGENS, DIET_TAGS
from app.services.portion_display import get_portion_display

router = APIRouter(prefix="/admin/api", tags=["admin"])

# A confidence below this, or an LLM-estimated source, or missing sugar/fiber
# marks a food "needs attention" in the list view — the panel's main
# find-the-mistakes signal.
LOW_CONFIDENCE_THRESHOLD = 0.6

# Protein/carbs ~4 cal/g, fat ~9 cal/g (Atwater factors) — calories_per_100g
# should roughly equal that sum. Tolerance is loose (not the label-accuracy
# standard ~10%) because these are dining-hall estimates, not lab values.
MACRO_CALORIE_MISMATCH_TOLERANCE = 0.15


class FoodOut(BaseModel):
    item_name: str
    source: str
    calories_per_100g: float
    protein_g_per_100g: float
    carbs_g_per_100g: float
    fat_g_per_100g: float
    sugar_g_per_100g: float | None
    fiber_g_per_100g: float | None
    confidence_score: float
    diet_tags: list[str]
    likely_allergens: list[str]
    resolved_at: datetime.datetime
    # Read-only, computed from app.services.portion_display — never editable
    # here, see docs/adr/0007/0016.
    portion_unit: str
    portion_grams_per_unit: float
    portion_label: str
    # Read-only, computed — the per-100g macros scaled to one real-world
    # portion, so a reviewer unfamiliar with a dish can sanity-check against
    # something picturable instead of an abstract "per 100g" density.
    portion_calories: float
    portion_protein_g: float
    portion_carbs_g: float
    portion_fat_g: float
    # Read-only, computed — Atwater-factor cross-check between the macros and
    # the listed calorie figure (see MACRO_CALORIE_MISMATCH_TOLERANCE).
    expected_calories_per_100g: float
    calorie_mismatch: bool
    needs_attention: bool


class FoodListOut(BaseModel):
    items: list[FoodOut]
    total: int
    page: int
    page_size: int


class FoodUpdateIn(BaseModel):
    item_name: str
    source: Literal["usda", "llm_estimate"]
    calories_per_100g: float = Field(ge=0)
    protein_g_per_100g: float = Field(ge=0)
    carbs_g_per_100g: float = Field(ge=0)
    fat_g_per_100g: float = Field(ge=0)
    sugar_g_per_100g: float | None = Field(default=None, ge=0)
    fiber_g_per_100g: float | None = Field(default=None, ge=0)
    confidence_score: float = Field(ge=0, le=1)
    diet_tags: list[str] = []
    likely_allergens: list[str] = []

    @field_validator("diet_tags")
    @classmethod
    def _validate_diet_tags(cls, v: list[str]) -> list[str]:
        invalid = set(v) - set(DIET_TAGS)
        if invalid:
            raise ValueError(f"Unknown diet_tags {invalid}, must be a subset of {DIET_TAGS}")
        return v

    @field_validator("likely_allergens")
    @classmethod
    def _validate_likely_allergens(cls, v: list[str]) -> list[str]:
        invalid = set(v) - set(ALLERGENS)
        if invalid:
            raise ValueError(f"Unknown likely_allergens {invalid}, must be a subset of {ALLERGENS}")
        return v


def _expected_calories_per_100g(protein_g: float, carbs_g: float, fat_g: float) -> float:
    """Atwater factors: protein/carbs ~4 cal/g, fat ~9 cal/g."""
    return protein_g * 4 + carbs_g * 4 + fat_g * 9


def _calorie_mismatch(calories: float, expected: float) -> bool:
    if calories <= 0:
        return expected > 0
    return abs(expected - calories) / calories > MACRO_CALORIE_MISMATCH_TOLERANCE


def _food_out(nutrition: NutritionMatch, diet: DietTag | None) -> FoodOut:
    portion = get_portion_display(nutrition.item_name)
    portion_scale = portion.grams_per_unit / 100
    expected_calories = _expected_calories_per_100g(
        nutrition.protein_g_per_100g, nutrition.carbs_g_per_100g, nutrition.fat_g_per_100g
    )
    mismatch = _calorie_mismatch(nutrition.calories_per_100g, expected_calories)
    needs_attention = (
        nutrition.source == NutritionSource.llm_estimate
        or nutrition.confidence_score < LOW_CONFIDENCE_THRESHOLD
        or nutrition.sugar_g_per_100g is None
        or nutrition.fiber_g_per_100g is None
        or mismatch
    )
    return FoodOut(
        item_name=nutrition.item_name,
        source=nutrition.source.value,
        calories_per_100g=nutrition.calories_per_100g,
        protein_g_per_100g=nutrition.protein_g_per_100g,
        carbs_g_per_100g=nutrition.carbs_g_per_100g,
        fat_g_per_100g=nutrition.fat_g_per_100g,
        sugar_g_per_100g=nutrition.sugar_g_per_100g,
        fiber_g_per_100g=nutrition.fiber_g_per_100g,
        confidence_score=nutrition.confidence_score,
        diet_tags=diet.diet_tags if diet else [],
        likely_allergens=diet.likely_allergens if diet else [],
        resolved_at=nutrition.resolved_at,
        portion_unit=portion.unit,
        portion_grams_per_unit=portion.grams_per_unit,
        portion_label=portion.label,
        portion_calories=round(nutrition.calories_per_100g * portion_scale, 1),
        portion_protein_g=round(nutrition.protein_g_per_100g * portion_scale, 1),
        portion_carbs_g=round(nutrition.carbs_g_per_100g * portion_scale, 1),
        portion_fat_g=round(nutrition.fat_g_per_100g * portion_scale, 1),
        expected_calories_per_100g=round(expected_calories, 1),
        calorie_mismatch=mismatch,
        needs_attention=needs_attention,
    )


@router.get("/foods", response_model=FoodListOut)
def list_foods(
    q: str | None = None,
    source: Literal["usda", "llm_estimate"] | None = None,
    needs_attention: bool | None = None,
    sort: Literal["name", "confidence_asc", "resolved_desc"] = "name",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> FoodListOut:
    query = db.query(NutritionMatch)
    if q:
        query = query.filter(NutritionMatch.item_name.ilike(f"%{q}%"))
    if source:
        query = query.filter(NutritionMatch.source == NutritionSource(source))
    nutrition_rows = query.all()

    diet_by_name = {
        d.item_name: d
        for d in db.query(DietTag)
        .filter(DietTag.item_name.in_([r.item_name for r in nutrition_rows]))
        .all()
    } if nutrition_rows else {}

    foods = [_food_out(r, diet_by_name.get(r.item_name)) for r in nutrition_rows]

    if needs_attention is not None:
        foods = [f for f in foods if f.needs_attention == needs_attention]

    if sort == "confidence_asc":
        foods.sort(key=lambda f: f.confidence_score)
    elif sort == "resolved_desc":
        foods.sort(key=lambda f: f.resolved_at, reverse=True)
    else:
        foods.sort(key=lambda f: f.item_name.lower())

    total = len(foods)
    start = (page - 1) * page_size
    page_items = foods[start : start + page_size]
    return FoodListOut(items=page_items, total=total, page=page, page_size=page_size)


@router.get("/foods/detail", response_model=FoodOut)
def get_food_detail(
    item_name: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> FoodOut:
    nutrition = db.query(NutritionMatch).filter(NutritionMatch.item_name == item_name).one_or_none()
    if nutrition is None:
        raise HTTPException(status_code=404, detail="Food not found")
    diet = db.query(DietTag).filter(DietTag.item_name == item_name).one_or_none()
    return _food_out(nutrition, diet)


@router.put("/foods/detail", response_model=FoodOut)
@limiter.limit("30/minute")
def update_food_detail(
    request: Request,
    body: FoodUpdateIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> FoodOut:
    """Upsert both rows by item_name — mirrors app.jobs.enrich_items.save_result's
    get-or-create pattern, so a manual correction and a re-enrichment run stay
    safe to interleave."""
    nutrition = db.query(NutritionMatch).filter(NutritionMatch.item_name == body.item_name).one_or_none()
    if nutrition is None:
        nutrition = NutritionMatch(item_name=body.item_name)
        db.add(nutrition)
    nutrition.source = NutritionSource(body.source)
    nutrition.calories_per_100g = body.calories_per_100g
    nutrition.protein_g_per_100g = body.protein_g_per_100g
    nutrition.carbs_g_per_100g = body.carbs_g_per_100g
    nutrition.fat_g_per_100g = body.fat_g_per_100g
    nutrition.sugar_g_per_100g = body.sugar_g_per_100g
    nutrition.fiber_g_per_100g = body.fiber_g_per_100g
    nutrition.confidence_score = body.confidence_score
    nutrition.resolved_at = datetime.datetime.utcnow()

    diet = db.query(DietTag).filter(DietTag.item_name == body.item_name).one_or_none()
    if diet is None:
        diet = DietTag(item_name=body.item_name)
        db.add(diet)
    diet.diet_tags = body.diet_tags
    diet.likely_allergens = body.likely_allergens

    db.commit()
    db.refresh(nutrition)
    db.refresh(diet)
    return _food_out(nutrition, diet)


# --- Common Foods catalog — see docs/adr/0020. A hand-curated reference of
# typical breakfast/lunch/dinner protein/vegetable/carb foods, editable here
# and consumed by app.services.meal_preference_survey. Unlike NutritionMatch
# above, rows don't need to match anything on a live menu. ---


class CommonFoodOut(BaseModel):
    id: int
    name: str
    meal_period: str
    role: str
    subtype: str
    tags: list[str]
    diet_tags: list[str]
    allergens: list[str]
    active: bool
    updated_at: datetime.datetime


class CommonFoodIn(BaseModel):
    name: str = Field(min_length=1)
    meal_period: Literal["breakfast", "lunch", "dinner"]
    role: Literal["protein", "vegetable", "carb"]
    subtype: str = Field(min_length=1)
    tags: list[str] = []
    diet_tags: list[str] = []
    allergens: list[str] = []
    active: bool = True

    @field_validator("diet_tags")
    @classmethod
    def _validate_diet_tags(cls, v: list[str]) -> list[str]:
        invalid = set(v) - set(DIET_TAGS)
        if invalid:
            raise ValueError(f"Unknown diet_tags {invalid}, must be a subset of {DIET_TAGS}")
        return v

    @field_validator("allergens")
    @classmethod
    def _validate_allergens(cls, v: list[str]) -> list[str]:
        invalid = set(v) - set(ALLERGENS)
        if invalid:
            raise ValueError(f"Unknown allergens {invalid}, must be a subset of {ALLERGENS}")
        return v


def _common_food_out(food: CommonFood) -> CommonFoodOut:
    return CommonFoodOut(
        id=food.id, name=food.name, meal_period=food.meal_period, role=food.role, subtype=food.subtype,
        tags=food.tags, diet_tags=food.diet_tags, allergens=food.allergens, active=food.active,
        updated_at=food.updated_at,
    )


@router.get("/common-foods", response_model=list[CommonFoodOut])
def list_common_foods(
    meal_period: Literal["breakfast", "lunch", "dinner"] | None = None,
    role: Literal["protein", "vegetable", "carb"] | None = None,
    active: bool | None = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> list[CommonFoodOut]:
    query = db.query(CommonFood)
    if meal_period:
        query = query.filter(CommonFood.meal_period == meal_period)
    if role:
        query = query.filter(CommonFood.role == role)
    if active is not None:
        query = query.filter(CommonFood.active == active)
    foods = query.order_by(CommonFood.meal_period, CommonFood.role, CommonFood.subtype, CommonFood.name).all()
    return [_common_food_out(f) for f in foods]


@router.post("/common-foods", response_model=CommonFoodOut)
@limiter.limit("30/minute")
def create_common_food(
    request: Request, body: CommonFoodIn, db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)
) -> CommonFoodOut:
    food = CommonFood(**body.model_dump())
    db.add(food)
    db.commit()
    db.refresh(food)
    return _common_food_out(food)


@router.put("/common-foods/{food_id}", response_model=CommonFoodOut)
@limiter.limit("30/minute")
def update_common_food(
    request: Request,
    food_id: int,
    body: CommonFoodIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> CommonFoodOut:
    food = db.get(CommonFood, food_id)
    if food is None:
        raise HTTPException(status_code=404, detail="Common food not found")
    for key, value in body.model_dump().items():
        setattr(food, key, value)
    food.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(food)
    return _common_food_out(food)
