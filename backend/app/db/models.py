from __future__ import annotations

import datetime
import enum

from sqlalchemy import (
    ARRAY,
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class NutritionSource(str, enum.Enum):
    usda = "usda"
    llm_estimate = "llm_estimate"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    google_sub: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )

    preferences: Mapped["UserPreference"] = relationship(back_populates="user", uselist=False)


class UserPreference(Base):
    """Diet/allergens are Hard Constraints (structured); likes/dislikes are Soft
    Preferences (free text + LLM-parsed tags). See docs/adr/0003, 0005 conventions
    documented in CONTEXT.md."""

    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)

    calorie_goal: Mapped[int] = mapped_column(Integer)
    protein_goal_g: Mapped[int] = mapped_column(Integer)
    carb_goal_g: Mapped[int] = mapped_column(Integer)
    fat_goal_g: Mapped[int] = mapped_column(Integer)

    diet_restrictions: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    allergens: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)

    liked_foods_text: Mapped[str | None] = mapped_column(String, nullable=True)
    disliked_foods_text: Mapped[str | None] = mapped_column(String, nullable=True)
    liked_tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    disliked_tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)

    user: Mapped["User"] = relationship(back_populates="preferences")


class Eatery(Base):
    """MVP scope is 'dining room' (AYCE) eateries only — see docs/adr/0005-eatery-scope.md."""

    __tablename__ = "eateries"

    id: Mapped[int] = mapped_column(primary_key=True)
    cornell_id: Mapped[int] = mapped_column(Integer, unique=True)
    slug: Mapped[str] = mapped_column(String, unique=True)
    name: Mapped[str] = mapped_column(String)
    eatery_type: Mapped[str] = mapped_column(String)
    campus_area: Mapped[str | None] = mapped_column(String, nullable=True)

    menu_events: Mapped[list["MenuEvent"]] = relationship(back_populates="eatery")


class MenuEvent(Base):
    """A single meal period (Breakfast/Lunch/...) at one eatery on one date."""

    __tablename__ = "menu_events"
    __table_args__ = (UniqueConstraint("eatery_id", "date", "meal_period"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    eatery_id: Mapped[int] = mapped_column(ForeignKey("eateries.id"))
    date: Mapped[datetime.date] = mapped_column(Date)
    meal_period: Mapped[str] = mapped_column(String)

    eatery: Mapped["Eatery"] = relationship(back_populates="menu_events")
    items: Mapped[list["MenuItem"]] = relationship(back_populates="menu_event")


class MenuItem(Base):
    __tablename__ = "menu_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    menu_event_id: Mapped[int] = mapped_column(ForeignKey("menu_events.id"))
    category: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    sort_idx: Mapped[int] = mapped_column(Integer, default=0)

    menu_event: Mapped["MenuEvent"] = relationship(back_populates="items")


class NutritionMatch(Base):
    """Cached nutrition density for a normalized item name, per 100g — see
    docs/adr/0001, 0002, 0007. Deliberately NOT a portion/serving value: actual
    portion size is a personalization decision (Phase 2), not baked in here."""

    __tablename__ = "nutrition_matches"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_name: Mapped[str] = mapped_column(String, unique=True, index=True)

    source: Mapped[NutritionSource] = mapped_column(Enum(NutritionSource))
    usda_fdc_id: Mapped[str | None] = mapped_column(String, nullable=True)

    calories_per_100g: Mapped[float] = mapped_column(Float)
    protein_g_per_100g: Mapped[float] = mapped_column(Float)
    carbs_g_per_100g: Mapped[float] = mapped_column(Float)
    fat_g_per_100g: Mapped[float] = mapped_column(Float)
    confidence_score: Mapped[float] = mapped_column(Float, default=1.0)

    resolved_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )


class DietTag(Base):
    """LLM-inferred diet/allergen tags for a normalized item name — informational
    only, not an authoritative allergen guarantee. See docs/adr/0002."""

    __tablename__ = "diet_tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_name: Mapped[str] = mapped_column(String, unique=True, index=True)

    diet_tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    likely_allergens: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)

    resolved_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )


class LoggedMeal(Base):
    """Dining-hall food only — not a general food diary. See docs/adr/0004."""

    __tablename__ = "logged_meals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    menu_event_id: Mapped[int | None] = mapped_column(ForeignKey("menu_events.id"), nullable=True)
    date: Mapped[datetime.date] = mapped_column(Date)

    items: Mapped[dict] = mapped_column(JSON)
    totals: Mapped[dict] = mapped_column(JSON)
    liked: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )
