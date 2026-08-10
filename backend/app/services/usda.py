"""USDA FoodData Central lookup — primary nutrition source, see docs/adr/0001.

Only queries dataTypes whose foodNutrients are reported per 100g (Survey/FNDDS,
Foundation, SR Legacy). "Branded" is deliberately excluded: its nutrients are
per-serving-size, a different unit basis that would silently corrupt the 100g
convention used everywhere else here.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# USDA's free-tier key throttles bursts with a bare "400 Bad Request" from
# nginx (no JSON body), not a 429 — indistinguishable from a real bad request
# except empirically. It's a burst limit, not just a per-request fluke: firing
# a handful of requests back to back trips it even with per-request retries,
# so every request (across all calls, not just retries) is paced globally.
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 2.0
MIN_REQUEST_INTERVAL_SECONDS = 1.0

_rate_limit_lock = asyncio.Lock()
_last_request_at = 0.0


async def _pace_request() -> None:
    global _last_request_at
    async with _rate_limit_lock:
        wait = _last_request_at + MIN_REQUEST_INTERVAL_SECONDS - asyncio.get_event_loop().time()
        if wait > 0:
            await asyncio.sleep(wait)
        _last_request_at = asyncio.get_event_loop().time()

SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"

NUTRIENT_IDS = {
    "calories": 1008,
    "protein_g": 1003,
    "carbs_g": 1005,
    "fat_g": 1004,
    "fiber_g": 1079,
}

# Total sugars moved to nutrient ID 2000 ("Sugars, total including NLEA") in
# USDA's newer Survey/Foundation data; SR Legacy (the older fallback tier —
# see DATA_TYPE_TIERS) still reports it under the legacy ID 1063 ("Sugars,
# Total"). Tried in order rather than a single ID like the other nutrients
# above, since which one a given match actually has depends on which tier
# matched it.
SUGAR_NUTRIENT_IDS = [2000, 1063]

# Tried in order; Survey (FNDDS) is USDA's "as prepared/consumed" dish-level
# data — the closest match to a dining hall item. Foundation/SR Legacy are
# raw-ingredient fallbacks.
DATA_TYPE_TIERS = [["Survey (FNDDS)"], ["Foundation", "SR Legacy"]]


@dataclass
class UsdaMatch:
    fdc_id: int
    description: str
    data_type: str
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    sugar_g: float
    fiber_g: float


def _extract_sugar(nutrients: dict[int, float | None]) -> float:
    for nutrient_id in SUGAR_NUTRIENT_IDS:
        if nutrient_id in nutrients:
            return nutrients[nutrient_id] or 0.0
    return 0.0


def _extract_match(food: dict) -> UsdaMatch | None:
    nutrients = {n["nutrientId"]: n.get("value") for n in food.get("foodNutrients", [])}
    if NUTRIENT_IDS["calories"] not in nutrients:
        return None

    return UsdaMatch(
        fdc_id=food["fdcId"],
        description=food["description"],
        data_type=food["dataType"],
        calories=nutrients.get(NUTRIENT_IDS["calories"]) or 0.0,
        protein_g=nutrients.get(NUTRIENT_IDS["protein_g"]) or 0.0,
        carbs_g=nutrients.get(NUTRIENT_IDS["carbs_g"]) or 0.0,
        fat_g=nutrients.get(NUTRIENT_IDS["fat_g"]) or 0.0,
        sugar_g=_extract_sugar(nutrients),
        fiber_g=nutrients.get(NUTRIENT_IDS["fiber_g"]) or 0.0,
    )


def _sanitize_query(item_name: str) -> str:
    """USDA's WAF hard-blocks a literal '%27' in the URL (httpx's default
    percent-encoding for apostrophes), independent of retries — e.g. "Chef's
    Choice Pasta" 400s every time. Dropping apostrophes avoids tripping it;
    search is fuzzy/keyword-based so "Chefs Choice Pasta" matches just as well.
    """
    return item_name.replace("'", "").replace("’", "")


async def search_food(client: httpx.AsyncClient, item_name: str) -> UsdaMatch | None:
    """Best-effort top match for item_name, per 100g.

    Returns None both when nothing usable was found AND when USDA's API itself
    fails after retries — callers treat both identically by falling back to
    LLM estimation (see docs/adr/0001), so a flaky upstream degrades gracefully
    instead of taking the whole enrichment job down.
    """
    if not settings.usda_api_key:
        return None

    query = _sanitize_query(item_name)
    try:
        for data_types in DATA_TYPE_TIERS:
            response = await _get_with_retry(
                client,
                params={
                    "query": query,
                    "pageSize": 1,
                    "api_key": settings.usda_api_key,
                    "dataType": data_types,
                },
            )
            foods = response.json().get("foods", [])
            if not foods:
                continue

            match = _extract_match(foods[0])
            if match is not None:
                return match
    except httpx.HTTPError:
        logger.warning("USDA lookup failed for %r, falling back to LLM estimate", item_name)
        return None

    return None


async def _get_with_retry(client: httpx.AsyncClient, params: dict) -> httpx.Response:
    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        await _pace_request()
        response = await client.get(SEARCH_URL, params=params, timeout=15.0)
        if response.status_code < 400:
            return response
        last_error = httpx.HTTPStatusError(
            f"USDA search failed ({response.status_code})", request=response.request, response=response
        )
        await asyncio.sleep(RETRY_BACKOFF_SECONDS * (attempt + 1))

    assert last_error is not None
    raise last_error
