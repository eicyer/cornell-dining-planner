import asyncio
import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.db.models import CraftedMealsCache, DietTag, Eatery, MenuEvent, MenuItem, NutritionMatch, User, UserPreference
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

# Canonical serving order for a day, used to figure out which meal periods
# still lie ahead of "now" at a given eatery — e.g. if Lunch is current,
# only Dinner (not Breakfast) counts as "next". Unknown period names (not in
# this list) are treated as coming after all known ones, in their original
# order, rather than dropped.
MEAL_PERIOD_ORDER = ["Breakfast", "Brunch", "Lunch", "Late Lunch", "Dinner"]


def pick_meal_period(available: list[str]) -> str | None:
    """Returns the period matching *this hour*, or None if nothing being
    served today fits — e.g. an eatery whose only event today is Dinner
    shouldn't be labeled "Dinner" at 9am just because that's all there is.
    Callers that want "whatever's on offer" regardless of hour should use
    next_meal_periods(available, None) instead of guessing here."""
    if not available:
        return None
    hour = datetime.datetime.now().hour
    preference = next(pref for cutoff, pref in MEAL_PERIOD_PREFERENCE_BY_HOUR if hour < cutoff)
    for name in preference:
        if name in available:
            return name
    return None


def closed_reason(available: list[str]) -> str:
    return "Closed today" if not available else "Not serving right now"


def _ordered_meal_periods(available: list[str]) -> list[str]:
    seen = dict.fromkeys(available)  # de-dupe, preserve first-seen order
    known = [p for p in MEAL_PERIOD_ORDER if p in seen]
    unknown = [p for p in seen if p not in MEAL_PERIOD_ORDER]
    return known + unknown


def next_meal_periods(available: list[str], current: str | None) -> list[str]:
    """Periods after `current` in serving order. When `current` is None
    (pick_meal_period found nothing matching this hour), every period still
    on offer today counts as "next" — there's no "now" to be after."""
    ordered = _ordered_meal_periods(available)
    if current is None or current not in ordered:
        return ordered
    return ordered[ordered.index(current) + 1 :]


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


class NextMealOut(BaseModel):
    meal_period: str
    # A single best pick per upcoming period (like EateryCraftedOut.crafted_meal
    # for the today-list), not N_EATERY_DETAIL_CANDIDATES options — this is a
    # preview of what's coming, not the primary pick-one interaction.
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
    # Later meal periods still being served at this eatery today, in serving
    # order — see next_meal_periods. Empty once the current pick is the last
    # period of the day.
    next_meals: list[NextMealOut] = []


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


def _ranked_candidates_for_menu_event(
    menu_event: MenuEvent,
    target: Target,
    constraints: HardConstraints,
    nutrition_by_name: dict[str, NutritionMatch],
    diet_by_name: dict[str, DietTag],
    prefs: UserPreference,
    db: Session,
    n_candidates: int,
) -> tuple[list[MealCandidate], str | None]:
    """Returns (ranked_candidates, reason_unavailable) — exactly one is
    populated. Shared by every caller that builds a candidate set for one
    specific menu event (a single eatery + meal period), whether that's
    "now" or a later period today, so they can't drift on how it's built."""
    menu_items = db.query(MenuItem).filter(MenuItem.menu_event_id == menu_event.id).all()
    item_nutritions = _build_item_nutritions(menu_items, nutrition_by_name, diet_by_name)

    candidates = generate_candidates(item_nutritions, target, constraints, n_candidates=n_candidates)
    if not candidates:
        return [], "No items fit your dietary restrictions today"

    ranked = rank_candidates(candidates, prefs.liked_tags, prefs.disliked_tags, prefs.eating_styles)
    return ranked, None


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
    """Returns (meal_period, ranked_candidates, reason_unavailable) for the
    *current* meal period — exactly one of ranked_candidates/reason_unavailable
    is populated. Shared by both the today-list summary and the eatery-detail
    options endpoints so they can't drift on how "now" is picked."""
    menu_events = db.query(MenuEvent).filter(MenuEvent.eatery_id == eatery.id, MenuEvent.date == today).all()
    periods = [e.meal_period for e in menu_events]
    meal_period = pick_meal_period(periods)
    if meal_period is None:
        return None, [], closed_reason(periods)

    menu_event = next(e for e in menu_events if e.meal_period == meal_period)
    ranked, reason = _ranked_candidates_for_menu_event(
        menu_event, target, constraints, nutrition_by_name, diet_by_name, prefs, db, n_candidates
    )
    return meal_period, ranked, reason


@router.get("/menus/today/crafted", response_model=list[EateryCraftedOut])
@limiter.limit("20/minute")
async def crafted_meals_today(
    request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[EateryCraftedOut]:
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user.id).one_or_none()
    if prefs is None:
        raise HTTPException(status_code=404, detail="Set your preferences first (PUT /preferences)")

    today = datetime.date.today()

    # Same menu + same preferences => same result, so a same-day repeat
    # request skips the optimizer and every LLM call entirely — see
    # docs/adr/0017. Invalidated wherever UserPreference is written
    # (app.routers.preferences), so a stale hit here can't outlive an edit.
    cached = (
        db.query(CraftedMealsCache)
        .filter(CraftedMealsCache.user_id == user.id, CraftedMealsCache.date == today)
        .one_or_none()
    )
    if cached is not None:
        return cached.payload

    nutrition_by_name = {n.item_name: n for n in db.query(NutritionMatch).all()}
    diet_by_name = {d.item_name: d for d in db.query(DietTag).all()}

    target = per_meal_target(prefs.calorie_goal, prefs.protein_goal_g, prefs.carb_goal_g, prefs.fat_goal_g, prefs.meals_per_day)
    constraints = HardConstraints(required_diet_tags=prefs.diet_restrictions, excluded_allergens=prefs.allergens)

    eateries = db.query(Eatery).filter(Eatery.eatery_type == "dining room").order_by(Eatery.name).all()
    llm_client = make_llm_client()

    # Candidate generation is local (DB + in-memory ranking, no network
    # calls), so it stays a plain loop.
    per_eatery = [
        (eatery, *_ranked_candidates_for_eatery(
            eatery, today, target, constraints, nutrition_by_name, diet_by_name, prefs, db,
            n_candidates=N_EATERY_DETAIL_CANDIDATES,
        ))
        for eatery in eateries
    ]  # list[(eatery, meal_period, ranked, reason)]

    # The polish step is the only network I/O — run every eatery's call
    # concurrently instead of one at a time (see docs/adr/0017), so a cache
    # miss costs one LLM round trip's worth of wall-clock time, not one per
    # eatery.
    needs_polish = [(eatery, ranked) for eatery, _, ranked, reason in per_eatery if reason is None]
    polished_list = await asyncio.gather(
        *[polish_meal(llm_client, ranked, target, prefs.liked_tags, prefs.disliked_tags) for _, ranked in needs_polish]
    )
    polished_by_eatery_id = {eatery.id: polished for (eatery, _), polished in zip(needs_polish, polished_list)}

    out: list[EateryCraftedOut] = []
    for eatery, meal_period, ranked, reason in per_eatery:
        if reason is not None:
            out.append(
                EateryCraftedOut(
                    id=eatery.id, name=eatery.name, campus_area=eatery.campus_area,
                    meal_period=meal_period, crafted_meal=None, reason_unavailable=reason,
                )
            )
            continue

        polished = polished_by_eatery_id[eatery.id]
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

    db.add(CraftedMealsCache(user_id=user.id, date=today, payload=[e.model_dump() for e in out]))
    db.commit()

    return out


@router.get("/menus/today/crafted/{eatery_id}", response_model=EateryCraftedOptionsOut)
@limiter.limit("20/minute")
async def crafted_meals_for_eatery(
    request: Request, eatery_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
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

    menu_events = db.query(MenuEvent).filter(MenuEvent.eatery_id == eatery.id, MenuEvent.date == today).all()
    periods = [e.meal_period for e in menu_events]
    meal_period = pick_meal_period(periods)

    llm_client = make_llm_client()

    crafted_meals: list[CraftedMealOut] = []
    reason: str | None
    if meal_period is None:
        reason = closed_reason(periods)
    else:
        menu_event = next(e for e in menu_events if e.meal_period == meal_period)
        ranked, reason = _ranked_candidates_for_menu_event(
            menu_event, target, constraints, nutrition_by_name, diet_by_name, prefs, db,
            n_candidates=N_EATERY_DETAIL_CANDIDATES,
        )
        if reason is None:
            polished = await polish_meals(llm_client, ranked, target, prefs.liked_tags, prefs.disliked_tags)
            crafted_meals = [
                CraftedMealOut(
                    name=p.name, rationale=p.rationale,
                    items=[CraftedItemOut(**vars(i)) for i in c.items],
                    totals=c.totals,
                )
                for c, p in zip(ranked, polished)
            ]

    next_meals: list[NextMealOut] = []
    for period in next_meal_periods(periods, meal_period):
        next_event = next(e for e in menu_events if e.meal_period == period)
        next_ranked, next_reason = _ranked_candidates_for_menu_event(
            next_event, target, constraints, nutrition_by_name, diet_by_name, prefs, db,
            n_candidates=N_EATERY_DETAIL_CANDIDATES,
        )
        if next_reason is not None:
            next_meals.append(NextMealOut(meal_period=period, crafted_meal=None, reason_unavailable=next_reason))
            continue

        next_polished = await polish_meal(llm_client, next_ranked, target, prefs.liked_tags, prefs.disliked_tags)
        chosen = next_ranked[next_polished.candidate_index]
        next_meals.append(
            NextMealOut(
                meal_period=period,
                crafted_meal=CraftedMealOut(
                    name=next_polished.name,
                    rationale=next_polished.rationale,
                    items=[CraftedItemOut(**vars(i)) for i in chosen.items],
                    totals=chosen.totals,
                ),
            )
        )

    return EateryCraftedOptionsOut(
        id=eatery.id, name=eatery.name, campus_area=eatery.campus_area, meal_period=meal_period,
        crafted_meals=crafted_meals, reason_unavailable=reason, next_meals=next_meals,
    )
