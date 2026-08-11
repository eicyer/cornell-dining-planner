import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import DietTag, Eatery, MenuEvent, MenuItem, NutritionMatch, User, UserPreference
from app.db.session import get_db
from app.services.customizable_items import plate_grams_for, variant_names
from app.services.llm_enrichment import make_client as make_llm_client
from app.services.meal_crafting import (
    HardConstraints,
    ItemNutrition,
    MealCandidate,
    Target,
    generate_candidates,
    per_meal_target,
)
from app.services.meal_polish import polish_meal, polish_meals
from app.services.preference_scoring import rank_candidates

router = APIRouter()

# We don't store real event start/end times (see docs/adr/0005-eatery-scope.md
# — out of scope for the "today only" MVP), so this maps wall-clock time to
# whichever meal period is typically being served then. A heuristic, not a
# real schedule lookup — revisit if event timestamps ever get persisted.
MEAL_PERIOD_PREFERENCE_BY_HOUR = [
    (10, ["Breakfast", "Brunch"]),
    (14, ["Lunch", "Brunch", "Late Lunch"]),
    (16, ["Late Lunch", "Lunch"]),
    (24, ["Dinner"]),
]


def pick_meal_period(available: list[str]) -> str | None:
    if not available:
        return None
    hour = datetime.datetime.now().hour
    preference = next(pref for cutoff, pref in MEAL_PERIOD_PREFERENCE_BY_HOUR if hour < cutoff)
    for name in preference:
        if name in available:
            return name
    return available[0]


class CraftedItemOut(BaseModel):
    name: str
    category: str
    grams: float
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    sugar_g: float
    fiber_g: float
    role: str | None


class CraftedMealOut(BaseModel):
    name: str
    rationale: str
    items: list[CraftedItemOut]
    totals: dict[str, float]


class EateryCraftedOut(BaseModel):
    id: int
    name: str
    campus_area: str | None
    meal_period: str | None
    crafted_meal: CraftedMealOut | None
    reason_unavailable: str | None = None


class EateryCraftedOptionsOut(BaseModel):
    id: int
    name: str
    campus_area: str | None
    meal_period: str | None
    # Up to N_EATERY_DETAIL_CANDIDATES options, best-ranked first — see
    # crafted_meals_for_eatery. Unlike EateryCraftedOut.crafted_meal (one
    # pick for the today-list summary), the eatery-detail screen wants
    # several options to choose from even if the lower-ranked ones fit the
    # target/preferences less well.
    crafted_meals: list[CraftedMealOut]
    reason_unavailable: str | None = None


# How many ranked candidates the eatery-detail screen offers as options.
# Deliberately shows all of them (not just the single best fit, like the
# today-list summary does) — a user tapping into one dining hall wants
# choices to pick from, even if #2/#3 fit their macro target or Soft
# Preferences less well than #1 would.
N_EATERY_DETAIL_CANDIDATES = 3


def _build_item_nutritions(
    menu_items: list[MenuItem], nutrition_by_name: dict[str, NutritionMatch], diet_by_name: dict[str, DietTag]
) -> list[ItemNutrition]:
    item_nutritions: list[ItemNutrition] = []
    for item in menu_items:
        # A customizable item (see app.services.customizable_items) expands
        # into one ItemNutrition per protein variant here — the raw feed
        # name alone never has a Nutrition Match, only its variants do.
        for name in variant_names(item.name):
            nutrition = nutrition_by_name.get(name)
            if nutrition is None:
                continue
            diet_tag = diet_by_name.get(name)
            item_nutritions.append(
                ItemNutrition(
                    name=name,
                    category=item.category,
                    calories_per_100g=nutrition.calories_per_100g,
                    protein_g_per_100g=nutrition.protein_g_per_100g,
                    carbs_g_per_100g=nutrition.carbs_g_per_100g,
                    fat_g_per_100g=nutrition.fat_g_per_100g,
                    diet_tags=diet_tag.diet_tags if diet_tag else [],
                    likely_allergens=diet_tag.likely_allergens if diet_tag else [],
                    fixed_serving_grams=plate_grams_for(name),
                    sugar_g_per_100g=nutrition.sugar_g_per_100g or 0.0,
                    fiber_g_per_100g=nutrition.fiber_g_per_100g or 0.0,
                )
            )
    return item_nutritions


def _ranked_candidates_for_eatery(
    eatery: Eatery,
    today: datetime.date,
    target: Target,
    constraints: HardConstraints,
    nutrition_by_name: dict[str, NutritionMatch],
    diet_by_name: dict[str, DietTag],
    prefs: UserPreference,
    db: Session,
    n_candidates: int,
) -> tuple[str | None, list[MealCandidate], str | None]:
    """Returns (meal_period, ranked_candidates, reason_unavailable) — exactly
    one of ranked_candidates/reason_unavailable is populated. Shared by both
    the today-list summary and the eatery-detail options endpoints so they
    can't drift on how a candidate set gets built."""
    menu_events = db.query(MenuEvent).filter(MenuEvent.eatery_id == eatery.id, MenuEvent.date == today).all()
    meal_period = pick_meal_period([e.meal_period for e in menu_events])
    if meal_period is None:
        return None, [], "Closed today"

    menu_event = next(e for e in menu_events if e.meal_period == meal_period)
    menu_items = db.query(MenuItem).filter(MenuItem.menu_event_id == menu_event.id).all()
    item_nutritions = _build_item_nutritions(menu_items, nutrition_by_name, diet_by_name)

    candidates = generate_candidates(item_nutritions, target, constraints, n_candidates=n_candidates)
    if not candidates:
        return meal_period, [], "No items fit your dietary restrictions today"

    ranked = rank_candidates(candidates, prefs.liked_tags, prefs.disliked_tags, prefs.eating_styles)
    return meal_period, ranked, None


@router.get("/menus/today/crafted", response_model=list[EateryCraftedOut])
async def crafted_meals_today(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[EateryCraftedOut]:
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).one_or_none()
    if prefs is None:
        raise HTTPException(status_code=404, detail="Set your preferences first (PUT /preferences)")

    today = datetime.date.today()
    nutrition_by_name = {n.item_name: n for n in db.query(NutritionMatch).all()}
    diet_by_name = {d.item_name: d for d in db.query(DietTag).all()}

    target = per_meal_target(prefs.calorie_goal, prefs.protein_goal_g, prefs.carb_goal_g, prefs.fat_goal_g, prefs.meals_per_day)
    constraints = HardConstraints(required_diet_tags=prefs.diet_restrictions, excluded_allergens=prefs.allergens)

    eateries = db.query(Eatery).filter(Eatery.eatery_type == "dining room").order_by(Eatery.name).all()
    llm_client = make_llm_client()

    out: list[EateryCraftedOut] = []
    for eatery in eateries:
        meal_period, ranked, reason = _ranked_candidates_for_eatery(
            eatery, today, target, constraints, nutrition_by_name, diet_by_name, prefs, db,
            n_candidates=N_EATERY_DETAIL_CANDIDATES,
        )
        if reason is not None:
            out.append(
                EateryCraftedOut(
                    id=eatery.id, name=eatery.name, campus_area=eatery.campus_area,
                    meal_period=meal_period, crafted_meal=None, reason_unavailable=reason,
                )
            )
            continue

        polished = await polish_meal(llm_client, ranked, target, prefs.liked_tags, prefs.disliked_tags)
        chosen = ranked[polished.candidate_index]

        out.append(
            EateryCraftedOut(
                id=eatery.id, name=eatery.name, campus_area=eatery.campus_area, meal_period=meal_period,
                crafted_meal=CraftedMealOut(
                    name=polished.name,
                    rationale=polished.rationale,
                    items=[CraftedItemOut(**vars(i)) for i in chosen.items],
                    totals=chosen.totals,
                ),
            )
        )

    return out


@router.get("/menus/today/crafted/{eatery_id}", response_model=EateryCraftedOptionsOut)
async def crafted_meals_for_eatery(
    eatery_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> EateryCraftedOptionsOut:
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).one_or_none()
    if prefs is None:
        raise HTTPException(status_code=404, detail="Set your preferences first (PUT /preferences)")

    eatery = db.query(Eatery).filter(Eatery.id == eatery_id).one_or_none()
    if eatery is None:
        raise HTTPException(status_code=404, detail="Eatery not found")

    today = datetime.date.today()
    nutrition_by_name = {n.item_name: n for n in db.query(NutritionMatch).all()}
    diet_by_name = {d.item_name: d for d in db.query(DietTag).all()}
    target = per_meal_target(prefs.calorie_goal, prefs.protein_goal_g, prefs.carb_goal_g, prefs.fat_goal_g, prefs.meals_per_day)
    constraints = HardConstraints(required_diet_tags=prefs.diet_restrictions, excluded_allergens=prefs.allergens)

    meal_period, ranked, reason = _ranked_candidates_for_eatery(
        eatery, today, target, constraints, nutrition_by_name, diet_by_name, prefs, db,
        n_candidates=N_EATERY_DETAIL_CANDIDATES,
    )
    if reason is not None:
        return EateryCraftedOptionsOut(
            id=eatery.id, name=eatery.name, campus_area=eatery.campus_area,
            meal_period=meal_period, crafted_meals=[], reason_unavailable=reason,
        )

    llm_client = make_llm_client()
    polished = await polish_meals(llm_client, ranked, target, prefs.liked_tags, prefs.disliked_tags)

    return EateryCraftedOptionsOut(
        id=eatery.id, name=eatery.name, campus_area=eatery.campus_area, meal_period=meal_period,
        crafted_meals=[
            CraftedMealOut(
                name=p.name, rationale=p.rationale,
                items=[CraftedItemOut(**vars(i)) for i in c.items],
                totals=c.totals,
            )
            for c, p in zip(ranked, polished)
        ],
    )
