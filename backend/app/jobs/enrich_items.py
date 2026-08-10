"""Batch enrichment: USDA lookup + LLM nutrition/diet tagging for menu items
that don't have cached results yet. Runs after the scrape job — see
docs/adr/0002-enrichment-pipeline.md. Diff logic means this only ever pays
USDA/LLM cost for genuinely new item names, not on every run.

Run manually with: python -m app.jobs.enrich_items
"""

from __future__ import annotations

import asyncio
import logging
import sys

import httpx
from sqlalchemy.orm import Session

from app.db.models import DietTag, Eatery, MenuEvent, MenuItem, NutritionMatch, NutritionSource
from app.db.session import SessionLocal
from app.services import usda
from app.services.customizable_items import variant_names
from app.services.llm_enrichment import EnrichmentResult, enrich_item, make_client

logger = logging.getLogger(__name__)

# Only 104West! among the 10 AYCE dining rooms is a certified kosher/halal
# hall (see docs/adr/0005-eatery-scope.md) — used to give the LLM diet-tagging
# context. Not modeled as an Eatery column since it's the only one that matters
# for MVP; revisit if more halls need dietary-certification context.
KOSHER_HALLS = {"104West!"}

CONCURRENCY = 5


def find_unenriched_items(db: Session) -> list[tuple[str, str, str]]:
    """Distinct (item_name, category, eatery_name) for items with no cached
    NutritionMatch yet. One representative category/eatery per item name.

    Customizable items (see app.services.customizable_items) never appear in
    the feed under their variant names, so a raw name notin_() filter against
    NutritionMatch would never see them as "already enriched." Instead, every
    raw name is expanded to its variant names first (a no-op for ordinary
    items) and the enriched check happens after expansion, in Python."""
    enriched_names = {name for (name,) in db.query(NutritionMatch.item_name).all()}

    rows = (
        db.query(MenuItem.name, MenuItem.category, Eatery.name)
        .join(MenuEvent, MenuItem.menu_event_id == MenuEvent.id)
        .join(Eatery, MenuEvent.eatery_id == Eatery.id)
        .distinct(MenuItem.name)
        .all()
    )

    unenriched: list[tuple[str, str, str]] = []
    for name, category, eatery_name in rows:
        for variant in variant_names(name):
            if variant not in enriched_names:
                unenriched.append((variant, category, eatery_name))
    return unenriched


async def enrich_one(
    semaphore: asyncio.Semaphore,
    http_client: httpx.AsyncClient,
    llm_client,
    item_name: str,
    category: str,
    eatery_name: str,
) -> tuple[str, EnrichmentResult | None]:
    async with semaphore:
        usda_match = await usda.search_food(http_client, item_name)
        result = await enrich_item(
            llm_client, item_name, category, eatery_name, eatery_name in KOSHER_HALLS, usda_match
        )
        return item_name, result


def save_result(db: Session, item_name: str, result: EnrichmentResult) -> None:
    """Upsert, not insert-only — item_name is unique, and re-enrichment (e.g.
    after a schema/prompt change) must be safe to re-run without hitting a
    unique constraint violation on rows enriched by a previous run."""
    nutrition = db.query(NutritionMatch).filter(NutritionMatch.item_name == item_name).one_or_none()
    if nutrition is None:
        nutrition = NutritionMatch(item_name=item_name)
        db.add(nutrition)
    nutrition.source = NutritionSource(result.source)
    nutrition.calories_per_100g = result.calories_per_100g
    nutrition.protein_g_per_100g = result.protein_g_per_100g
    nutrition.carbs_g_per_100g = result.carbs_g_per_100g
    nutrition.fat_g_per_100g = result.fat_g_per_100g
    nutrition.confidence_score = result.confidence

    diet_tag = db.query(DietTag).filter(DietTag.item_name == item_name).one_or_none()
    if diet_tag is None:
        diet_tag = DietTag(item_name=item_name)
        db.add(diet_tag)
    diet_tag.diet_tags = result.diet_tags
    diet_tag.likely_allergens = result.likely_allergens


async def enrich() -> dict:
    db = SessionLocal()
    try:
        items = find_unenriched_items(db)
    finally:
        db.close()

    logger.info("%d item(s) need enrichment", len(items))
    if not items:
        return {"enriched": 0, "failed": 0}

    semaphore = asyncio.Semaphore(CONCURRENCY)
    llm_client = make_client()

    async with httpx.AsyncClient() as http_client:
        tasks = [
            enrich_one(semaphore, http_client, llm_client, name, category, eatery_name)
            for name, category, eatery_name in items
        ]
        results = await asyncio.gather(*tasks)

    db = SessionLocal()
    enriched = 0
    failed = 0
    try:
        for item_name, result in results:
            if result is None:
                failed += 1
                logger.warning("Skipping %r — enrichment failed", item_name)
                continue
            save_result(db, item_name, result)
            enriched += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    summary = {"enriched": enriched, "failed": failed}
    logger.info("Enrichment complete: %s", summary)
    return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    result = asyncio.run(enrich())
    # A partial failure rate is expected/tolerated (USDA's free tier is
    # occasionally flaky, see README) and already falls back gracefully —
    # but zero successes despite items needing enrichment means something
    # systemic is broken (e.g. an expired/out-of-credit API key), which
    # would otherwise exit 0 and run silently, invisible to cron, forever.
    if result["failed"] > 0 and result["enriched"] == 0:
        logging.error("All %d item(s) failed enrichment — check ANTHROPIC_API_KEY/USDA_API_KEY validity and credit balance.", result["failed"])
        sys.exit(1)
