import datetime
from itertools import groupby

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.models import DietTag, Eatery, MenuEvent, MenuItem, NutritionMatch
from app.db.session import get_db

router = APIRouter()


class NutritionOut(BaseModel):
    """Per 100g, not per portion — actual serving size is a personalization
    decision made in Phase 2, not baked in here. See docs/adr/0007."""

    calories_per_100g: float
    protein_g_per_100g: float
    carbs_g_per_100g: float
    fat_g_per_100g: float
    confidence: float
    source: str


class ItemOut(BaseModel):
    name: str
    nutrition: NutritionOut | None
    diet_tags: list[str]
    likely_allergens: list[str]


class CategoryOut(BaseModel):
    category: str
    items: list[ItemOut]


class MenuEventOut(BaseModel):
    meal_period: str
    categories: list[CategoryOut]


class EateryOut(BaseModel):
    id: int
    name: str
    campus_area: str | None
    menu_events: list[MenuEventOut]


@router.get("/menus/today", response_model=list[EateryOut])
def menus_today(db: Session = Depends(get_db)) -> list[EateryOut]:
    today = datetime.date.today()

    nutrition_by_name = {n.item_name: n for n in db.query(NutritionMatch).all()}
    diet_by_name = {d.item_name: d for d in db.query(DietTag).all()}

    eateries = db.query(Eatery).filter(Eatery.eatery_type == "dining room").order_by(Eatery.name).all()

    out: list[EateryOut] = []
    for eatery in eateries:
        menu_events = (
            db.query(MenuEvent)
            .filter(MenuEvent.eatery_id == eatery.id, MenuEvent.date == today)
            .order_by(MenuEvent.meal_period)
            .all()
        )

        event_outs: list[MenuEventOut] = []
        for event in menu_events:
            items = (
                db.query(MenuItem)
                .filter(MenuItem.menu_event_id == event.id)
                .order_by(MenuItem.category, MenuItem.sort_idx)
                .all()
            )

            category_outs = [
                CategoryOut(
                    category=category,
                    items=[
                        ItemOut(
                            name=item.name,
                            nutrition=(
                                NutritionOut(
                                    calories_per_100g=n.calories_per_100g,
                                    protein_g_per_100g=n.protein_g_per_100g,
                                    carbs_g_per_100g=n.carbs_g_per_100g,
                                    fat_g_per_100g=n.fat_g_per_100g,
                                    confidence=n.confidence_score,
                                    source=n.source.value,
                                )
                                if (n := nutrition_by_name.get(item.name))
                                else None
                            ),
                            diet_tags=(d.diet_tags if (d := diet_by_name.get(item.name)) else []),
                            likely_allergens=(d.likely_allergens if (d := diet_by_name.get(item.name)) else []),
                        )
                        for item in category_items
                    ],
                )
                for category, category_items in groupby(items, key=lambda i: i.category)
            ]

            event_outs.append(MenuEventOut(meal_period=event.meal_period, categories=category_outs))

        out.append(
            EateryOut(id=eatery.id, name=eatery.name, campus_area=eatery.campus_area, menu_events=event_outs)
        )

    return out
