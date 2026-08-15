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


class Sex(str, enum.Enum):
    """Biological sex, used only as a coefficient in the Mifflin-St Jeor BMR
    formula — see app.services.tdee."""

    male = "male"
    female = "female"


class ActivityLevel(str, enum.Enum):
    sedentary = "sedentary"
    light = "light"
    moderate = "moderate"
    active = "active"
    very_active = "very_active"


class HealthGoal(str, enum.Enum):
    lose_weight = "lose_weight"
    maintain_weight = "maintain_weight"
    gain_weight = "gain_weight"


class MacroStyle(str, enum.Enum):
    """How calories are split across protein/carb/fat in Recommended Targets
    — see app.services.tdee. Never filters foods; that's diet_restrictions.
    keto and high_protein are deliberate exceptions to the "no extremes"
    stance the other two styles hold to — see app.services.tdee."""

    balanced = "balanced"
    lower_carb = "lower_carb"
    keto = "keto"
    high_protein = "high_protein"


class TargetMode(str, enum.Enum):
    """Whether the current calorie/macro goals came from the TDEE
    recommender or were typed in directly — see app.services.tdee."""

    recommended = "recommended"
    manual = "manual"


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
    # Goals above are daily; meal crafting needs a per-meal slice of them.
    # A flat divisor is a deliberate MVP simplification, not a real model of
    # how someone eats across a day — see docs/adr/0008-meal-crafting-target.
    meals_per_day: Mapped[int] = mapped_column(Integer, default=3)

    diet_restrictions: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    allergens: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)

    # Body/activity profile — inputs to the TDEE recommender (app.services.tdee),
    # not used anywhere else. Nullable: a user who only ever enters targets
    # manually never has to provide these.
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sex: Mapped[Sex | None] = mapped_column(Enum(Sex), nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    activity_level: Mapped[ActivityLevel | None] = mapped_column(Enum(ActivityLevel), nullable=True)
    health_goal: Mapped[HealthGoal | None] = mapped_column(Enum(HealthGoal), nullable=True)
    macro_style: Mapped[MacroStyle | None] = mapped_column(Enum(MacroStyle), nullable=True)
    # Recorded so re-opening the edit form can default back to whichever mode
    # produced the saved targets, instead of always assuming manual entry.
    target_mode: Mapped[TargetMode] = mapped_column(Enum(TargetMode), default=TargetMode.manual)

    liked_foods_text: Mapped[str | None] = mapped_column(String, nullable=True)
    disliked_foods_text: Mapped[str | None] = mapped_column(String, nullable=True)
    liked_tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    disliked_tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    # Soft Preference, scored deterministically in app.services.preference_scoring
    # — see docs/adr/0009-deterministic-preference-preranking and
    # docs/adr/0015-eating-styles-registry. Multi-select, validated against
    # app.services.eating_styles.EATING_STYLES. Replaces the old
    # prefer_whole_foods boolean ("whole_foods_focus" is now one entry here).
    eating_styles: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)

    # Whether the pairwise food survey (app.services.food_survey) has been
    # completed — see docs/adr/0011-food-preference-survey. Its results merge
    # into liked_tags/disliked_tags above, not a separate field.
    food_survey_completed: Mapped[bool] = mapped_column(Boolean, default=False)

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
    # Nullable, unlike the four macros above: added after those were already
    # populated for every existing item, so old rows start out without them
    # — app.jobs.enrich_items backfills them the same way it enriches a
    # brand-new item name. See docs/adr/0014-sugar-fiber-tracking.
    sugar_g_per_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
    fiber_g_per_100g: Mapped[float | None] = mapped_column(Float, nullable=True)
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


class CraftedMealsCache(Base):
    """Cached response body of GET /menus/today/crafted for one user on one
    date — see docs/adr/0017. The crafted-meals computation re-runs the
    optimizer and an LLM polish call per eatery, so without this every page
    load/refresh re-does that work even though the inputs (today's menu +
    this user's preferences) are unchanged between requests. Invalidated
    explicitly wherever UserPreference is written (app.routers.preferences)
    rather than on a TTL, since preference edits are the only thing that can
    change the result mid-day."""

    __tablename__ = "crafted_meals_cache"
    __table_args__ = (UniqueConstraint("user_id", "date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    date: Mapped[datetime.date] = mapped_column(Date)
    payload: Mapped[list] = mapped_column(JSON)

    created_at: Mapped[datetime.datetime] = mapped_column(
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
