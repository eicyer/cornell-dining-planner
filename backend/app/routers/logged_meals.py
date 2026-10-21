import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import Eatery, LoggedMeal, MenuEvent, MenuItem, NutritionMatch, QuickAddEntry, User, UserPreference
from app.db.session import get_db
from app.services.meal_sections import MealSection, meal_section_for

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
    # Derived from meal_period on every read, never stored (docs/adr/0023).
    meal_section: MealSection
    items: list[LoggedMealItemOut]
    totals: dict[str, float]
    liked: bool | None


class LoggedMealUpdate(BaseModel):
    """Every field is optional — only the ones actually sent are applied
    (so `{"liked": null}` clears a rating, while omitting `liked` leaves it
    alone). Eatery/date/meal_period can't change: an edit corrects what was
    eaten at that Menu Event, it doesn't move the meal to another one."""

    liked: bool | None = None
    items: list[LoggedMealItemIn] | None = None


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
        meal_section=meal_section_for(meal_period),
        items=[LoggedMealItemOut(**i) for i in meal.items],
        totals=meal.totals,
        liked=meal.liked,
    )


def _merge_items(existing: list[dict], items_in: list[LoggedMealItemIn]) -> list[LoggedMealItemIn]:
    """Existing items first in their original order, then new names in the
    order sent; a name already present has the new grams added to it.
    Only names and grams carry over — nutrition is recomputed from scratch."""
    grams_by_name = {i["name"]: i["grams"] for i in existing}
    for item_in in items_in:
        grams_by_name[item_in.name] = grams_by_name.get(item_in.name, 0) + item_in.grams
    return [LoggedMealItemIn(name=name, grams=grams) for name, grams in grams_by_name.items()]


def _compute_items(db: Session, menu_event: MenuEvent, items_in: list[LoggedMealItemIn]) -> list[LoggedMealItemOut]:
    """Validates items against the Menu Event's live menu and recomputes
    their nutrition from cached per-100g data — shared by logging and
    editing so neither path ever trusts client-sent numbers (docs/adr/0004)."""
    if not items_in:
        raise HTTPException(status_code=400, detail="Must log at least one item")

    menu_items = db.query(MenuItem).filter(MenuItem.menu_event_id == menu_event.id).all()
    menu_items_by_name = {i.name: i for i in menu_items}

    nutrition_by_name = {
        n.item_name: n
        for n in db.query(NutritionMatch).filter(NutritionMatch.item_name.in_([i.name for i in items_in])).all()
    }

    computed_items: list[LoggedMealItemOut] = []
    for item_in in items_in:
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

    return computed_items


@router.post("/logged-meals", response_model=LoggedMealOut)
def log_meal(body: LoggedMealIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return _log_meal(body, user, db)
    except IntegrityError:
        # A concurrent first log for the same Menu Event won the unique
        # (user_id, menu_event_id) race — retry once, which now appends to it.
        db.rollback()
        return _log_meal(body, user, db)


def _log_meal(body: LoggedMealIn, user: User, db: Session) -> LoggedMealOut:
    """Only items actually on the given eatery/date/meal_period's menu can be
    logged — see docs/adr/0004 (dining-hall food only). Nutrition is always
    recomputed server-side from cached per-100g data, never trusted from the
    client, matching the arithmetic-not-LLM-or-client principle used
    throughout (docs/adr/0003, 0007).

    At most one Logged Meal exists per user per Menu Event (docs/adr/0023):
    logging again from the same Menu Event appends to it, and an item it
    already holds has its grams grown rather than getting a second line."""
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

    meal = (
        db.query(LoggedMeal)
        .filter(LoggedMeal.user_id == user.id, LoggedMeal.menu_event_id == menu_event.id)
        .with_for_update()
        .one_or_none()
    )
    items_in = body.items if meal is None else _merge_items(meal.items, body.items)
    computed_items = _compute_items(db, menu_event, items_in)

    if meal is None:
        meal = LoggedMeal(user_id=user.id, menu_event_id=menu_event.id, date=date, liked=body.liked)
        db.add(meal)
    elif "liked" in body.model_fields_set:
        meal.liked = body.liked
    meal.items = [i.model_dump() for i in computed_items]
    meal.totals = _totals_from_items(computed_items)
    db.commit()
    db.refresh(meal)

    return _to_out(db, meal)


def _get_own_meal(db: Session, meal_id: int, user: User) -> LoggedMeal:
    # Someone else's meal 404s rather than 403s so ids can't be probed.
    meal = db.get(LoggedMeal, meal_id)
    if meal is None or meal.user_id != user.id:
        raise HTTPException(status_code=404, detail="Logged meal not found")
    return meal


@router.patch("/logged-meals/{meal_id}", response_model=LoggedMealOut)
def update_meal(
    meal_id: int, body: LoggedMealUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    meal = _get_own_meal(db, meal_id, user)

    if "liked" in body.model_fields_set:
        meal.liked = body.liked

    if "items" in body.model_fields_set:
        menu_event = db.get(MenuEvent, meal.menu_event_id) if meal.menu_event_id is not None else None
        if menu_event is None:
            raise HTTPException(status_code=400, detail="This meal's menu is no longer available to edit against")
        # An empty list is rejected rather than treated as "remove
        # everything" — deleting the meal is its own explicit action.
        computed_items = _compute_items(db, menu_event, body.items or [])
        meal.items = [i.model_dump() for i in computed_items]
        meal.totals = _totals_from_items(computed_items)

    db.commit()
    db.refresh(meal)
    return _to_out(db, meal)


@router.delete("/logged-meals/{meal_id}", status_code=204)
def delete_meal(meal_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_get_own_meal(db, meal_id, user))
    db.commit()


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

    # Quick Add Entries count toward a day's totals like any food eaten
    # (docs/adr/0024); they just aren't Logged Meals.
    quick_adds = (
        db.query(QuickAddEntry)
        .filter(QuickAddEntry.user_id == user.id, QuickAddEntry.date >= start_date)
        .all()
    )

    totals_by_date: dict[datetime.date, dict[str, float]] = {}
    for meal in meals:
        day_totals = totals_by_date.setdefault(meal.date, {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0})
        for key in day_totals:
            day_totals[key] += meal.totals.get(key, 0.0)
    for entry in quick_adds:
        day_totals = totals_by_date.setdefault(entry.date, {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0})
        for key in day_totals:
            day_totals[key] += getattr(entry, key)

    out = []
    for i in range(days):
        d = start_date + datetime.timedelta(days=i)
        out.append(DaySummary(date=d, totals=totals_by_date.get(d, {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}), goal=goal))
    return out
