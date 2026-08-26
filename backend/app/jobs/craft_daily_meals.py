"""Daily precompute of crafted-meal options for every onboarded user, across
every eatery and every meal period served today — not just whichever period
is "current" when this runs. Populating app.db.models.CraftedMealsCache here
(rather than lazily on a user's first request of the day) is what lets
/menus/today/crafted correctly show Dinner options once it's dinner time,
Breakfast options in the morning, etc., all from one precompute — see
app.routers.crafted_meals.build_daily_crafted.

Must run after scrape_menus (needs today's MenuEvent rows) and enrich_items
(candidate generation needs NutritionMatch/DietTag rows) — see
scripts/daily_refresh.sh.

Run manually with: python -m app.jobs.craft_daily_meals
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy.orm import Session

from app.core.clock import ithaca_today
from app.db.models import CraftedMealsCache, User, UserPreference
from app.db.session import SessionLocal
from app.routers.crafted_meals import EateryDailyCraftedOut, build_daily_crafted

logger = logging.getLogger(__name__)


def users_needing_todays_cache(db: Session) -> list[tuple[User, UserPreference]]:
    """Every onboarded user (has UserPreference — see docs/adr/0017's same
    precondition on the API side) who doesn't already have today's cache
    row. Idempotent like scrape_menus/enrich_items: safe to re-run without
    redoing (and re-billing LLM calls for) users already covered today."""
    today = ithaca_today()
    already_cached_user_ids = {
        user_id for (user_id,) in db.query(CraftedMealsCache.user_id).filter(CraftedMealsCache.date == today).all()
    }
    rows = (
        db.query(User, UserPreference)
        .join(UserPreference, UserPreference.user_id == User.id)
        .filter(User.id.notin_(already_cached_user_ids))
        .all()
    )
    return list(rows)


async def craft_daily_meals() -> dict:
    db = SessionLocal()
    today = ithaca_today()
    users_done = 0
    users_failed = 0

    try:
        targets = users_needing_todays_cache(db)
        for user, prefs in targets:
            try:
                daily: list[EateryDailyCraftedOut] = await build_daily_crafted(user, prefs, today, db)
                # build_count=1: this counts as this user's first build of
                # the day against app.routers.crafted_meals.MAX_BUILDS_PER_DAY,
                # same as the lazy on-demand path's first build would.
                db.add(CraftedMealsCache(user_id=user.id, date=today, payload=[e.model_dump() for e in daily], build_count=1))
                db.commit()
                users_done += 1
            except Exception:
                db.rollback()
                users_failed += 1
                logger.exception("Failed to build today's crafted meals for user_id=%s", user.id)
    finally:
        db.close()

    result = {"users_done": users_done, "users_failed": users_failed}
    logger.info("Daily crafted-meals precompute complete: %s", result)
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(craft_daily_meals())
