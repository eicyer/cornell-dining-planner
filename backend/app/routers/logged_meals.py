import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import Eatery, LoggedMeal, MenuEvent, MenuItem, NutritionMatch, User, UserPreference
from app.db.session import get_db

router = APIRouter()


class LoggedMealItemIn(BaseModel):
    name: str
    grams: float


class LoggedMealIn(BaseModel):
    eatery_id: int
    meal_period: str
    date: datetime.date | None = None
    items: list[LoggedMealItemIn]
    liked: bool | None = None


class LoggedMealItemOut(BaseModel):
    name: str
    category: str
    grams: float
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float


class LoggedMealOut(BaseModel):
    id: int
    date: datetime.date
    eatery_id: int
    eatery_name: str
    meal_period: str
    items: list[LoggedMealItemOut]
    totals: dict[str, float]
    liked: bool | None


class RatingIn(BaseModel):
    liked: bool | None


class DaySummary(BaseModel):
    date: datetime.date
    totals: dict[str, float]
    goal: dict[str, float]


def _totals_from_items(items: list[LoggedMealItemOut]) -> dict[str, float]:
    totals = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
    for item in items:
        totals["calories"] += item.calories
        totals["protein_g"] += item.protein_g
        totals["carbs_g"] += item.carbs_g
        totals["fat_g"] += item.fat_g
    return totals


def _to_out(db: Session, meal: LoggedMeal) -> LoggedMealOut:
    eatery_id, eatery_name, meal_period = 0, "Unknown", ""
    if meal.menu_event_id is not None:
        menu_event = db.get(MenuEvent, meal.menu_event_id)
        if menu_event is not None:
            meal_period = menu_event.meal_period
            eatery = db.get(Eatery, menu_event.eatery_id)
            if eatery is not None:
                eatery_id, eatery_name = eatery.id, eatery.name

    return LoggedMealOut(
        id=meal.id,
        date=meal.date,
        eatery_id=eatery_id,
        eatery_name=eatery_name,
        meal_period=meal_period,
        items=[LoggedMealItemOut(**i) for i in meal.items],
        totals=meal.totals,
        liked=meal.liked,
    )


@router.post("/logged-meals", response_model=LoggedMealOut)
def log_meal(body: LoggedMealIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Only items actually on the given eatery/date/meal_period's menu can be
    logged — see docs/adr/0004 (dining-hall food only). Nutrition is always
    recomputed server-side from cached per-100g data, never trusted from the
    client, matching the arithmetic-not-LLM-or-client principle used
    throughout (docs/adr/0003, 0007)."""
    date = body.date or datetime.date.today()

    eatery = db.get(Eatery, body.eatery_id)
    if eatery is None:
        raise HTTPException(status_code=404, detail="Eatery not found")

    menu_event = (
        db.query(MenuEvent)
        .filter(MenuEvent.eatery_id == body.eatery_id, MenuEvent.date == date, MenuEvent.meal_period == body.meal_period)
        .one_or_none()
    )
    if menu_event is None:
        raise HTTPException(status_code=404, detail="No menu found for that eatery/date/meal period")

    if not body.items:
        raise HTTPException(status_code=400, detail="Must log at least one item")

    menu_items = db.query(MenuItem).filter(MenuItem.menu_event_id == menu_event.id).all()
    menu_items_by_name = {i.name: i for i in menu_items}

    nutrition_by_name = {
        n.item_name: n
        for n in db.query(NutritionMatch).filter(NutritionMatch.item_name.in_([i.name for i in body.items])).all()
    }

    computed_items: list[LoggedMealItemOut] = []
    for item_in in body.items:
        menu_item = menu_items_by_name.get(item_in.name)
        if menu_item is None:
            raise HTTPException(status_code=400, detail=f"{item_in.name!r} is not on this menu")
        nutrition = nutrition_by_name.get(item_in.name)
        if nutrition is None:
            raise HTTPException(status_code=400, detail=f"No nutrition data cached for {item_in.name!r}")
        if item_in.grams <= 0:
            raise HTTPException(status_code=400, detail=f"grams must be positive for {item_in.name!r}")

        scale = item_in.grams / 100
        computed_items.append(
            LoggedMealItemOut(
                name=item_in.name,
                category=menu_item.category,
                grams=item_in.grams,
                calories=nutrition.calories_per_100g * scale,
                protein_g=nutrition.protein_g_per_100g * scale,
                carbs_g=nutrition.carbs_g_per_100g * scale,
                fat_g=nutrition.fat_g_per_100g * scale,
            )
        )

    meal = LoggedMeal(
        user_id=user.id,
        menu_event_id=menu_event.id,
        date=date,
        items=[i.model_dump() for i in computed_items],
        totals=_totals_from_items(computed_items),
        liked=body.liked,
    )
    db.add(meal)
    db.commit()
    db.refresh(meal)

    return _to_out(db, meal)


@router.patch("/logged-meals/{meal_id}", response_model=LoggedMealOut)
def rate_meal(meal_id: int, body: RatingIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    meal = db.get(LoggedMeal, meal_id)
    if meal is None or meal.user_id != user.id:
        raise HTTPException(status_code=404, detail="Logged meal not found")

    meal.liked = body.liked
    db.commit()
    db.refresh(meal)
    return _to_out(db, meal)


@router.get("/logged-meals", response_model=list[LoggedMealOut])
def list_logged_meals(
    date: datetime.date | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    target_date = date or datetime.date.today()
    meals = (
        db.query(LoggedMeal)
        .filter(LoggedMeal.user_id == user.id, LoggedMeal.date == target_date)
        .order_by(LoggedMeal.created_at)
        .all()
    )
    return [_to_out(db, m) for m in meals]


@router.get("/logged-meals/summary", response_model=list[DaySummary])
def logged_meals_summary(days: int = 7, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).one_or_none()
    if prefs is None:
        raise HTTPException(status_code=404, detail="Set your preferences first (PUT /preferences)")

    goal = {
        "calories": float(prefs.calorie_goal),
        "protein_g": float(prefs.protein_goal_g),
        "carbs_g": float(prefs.carb_goal_g),
        "fat_g": float(prefs.fat_goal_g),
    }

    start_date = datetime.date.today() - datetime.timedelta(days=days - 1)
    meals = (
        db.query(LoggedMeal)
        .filter(LoggedMeal.user_id == user.id, LoggedMeal.date >= start_date)
        .all()
    )

    totals_by_date: dict[datetime.date, dict[str, float]] = {}
    for meal in meals:
        day_totals = totals_by_date.setdefault(meal.date, {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0})
        for key in day_totals:
            day_totals[key] += meal.totals.get(key, 0.0)

    out = []
    for i in range(days):
        d = start_date + datetime.timedelta(days=i)
        out.append(DaySummary(date=d, totals=totals_by_date.get(d, {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}), goal=goal))
    return out
