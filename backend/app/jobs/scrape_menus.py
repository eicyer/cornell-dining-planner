"""Daily scrape of Cornell's dining feed into raw Eatery/MenuEvent/MenuItem rows.

No nutrition/diet enrichment happens here — see docs/adr/0002-enrichment-pipeline.md.
Scope is limited to "dining room" (AYCE) eateries — see docs/adr/0005-eatery-scope.md.

Run manually with: python -m app.jobs.scrape_menus
"""

from __future__ import annotations

import datetime
import logging

import httpx
from sqlalchemy.orm import Session

from app.db.models import Eatery, MenuEvent, MenuItem
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

EATERIES_URL = "https://admin-now.dining.cornell.edu/api/1.0/dining/eateries.json"
DINING_ROOM_TYPE = "dining room"


class ScrapeError(RuntimeError):
    """Raised when the feed is unreachable or its shape doesn't match expectations."""


def fetch_eateries() -> list[dict]:
    response = httpx.get(EATERIES_URL, timeout=30.0, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()
    payload = response.json()

    try:
        eateries = payload["data"]["eateries"]
    except (KeyError, TypeError) as exc:
        raise ScrapeError(f"Unexpected feed shape from {EATERIES_URL}: missing data.eateries") from exc

    if not eateries:
        raise ScrapeError(f"Feed at {EATERIES_URL} returned zero eateries — refusing to proceed")

    return eateries


def is_dining_room(eatery: dict) -> bool:
    return any(
        t.get("descrshort", "").lower() == DINING_ROOM_TYPE for t in eatery.get("eateryTypes", [])
    )


def upsert_eatery(db: Session, raw: dict) -> Eatery:
    eatery = db.query(Eatery).filter(Eatery.cornell_id == raw["id"]).one_or_none()
    if eatery is None:
        eatery = Eatery(cornell_id=raw["id"])
        db.add(eatery)

    eatery.slug = raw["slug"]
    eatery.name = raw["name"]
    eatery.eatery_type = DINING_ROOM_TYPE
    eatery.campus_area = (raw.get("campusArea") or {}).get("descrshort")
    return eatery


def upsert_menu_event(
    db: Session, eatery: Eatery, date: datetime.date, meal_period: str
) -> MenuEvent:
    menu_event = (
        db.query(MenuEvent)
        .filter(
            MenuEvent.eatery_id == eatery.id,
            MenuEvent.date == date,
            MenuEvent.meal_period == meal_period,
        )
        .one_or_none()
    )
    if menu_event is None:
        menu_event = MenuEvent(eatery=eatery, date=date, meal_period=meal_period)
        db.add(menu_event)
        db.flush()
    return menu_event


def replace_menu_items(db: Session, menu_event: MenuEvent, categories: list[dict]) -> int:
    db.query(MenuItem).filter(MenuItem.menu_event_id == menu_event.id).delete()

    count = 0
    for category in categories:
        category_name = category.get("category", "").strip()
        for item in category.get("items", []):
            name = item.get("item", "").strip()
            if not name:
                continue
            db.add(
                MenuItem(
                    menu_event=menu_event,
                    category=category_name,
                    name=name,
                    sort_idx=item.get("sortIdx", 0),
                )
            )
            count += 1
    return count


def scrape() -> dict:
    eateries_raw = fetch_eateries()
    dining_rooms = [e for e in eateries_raw if is_dining_room(e)]
    logger.info("Fetched %d eateries, %d are dining rooms", len(eateries_raw), len(dining_rooms))

    db = SessionLocal()
    eateries_synced = 0
    menu_events_synced = 0
    items_synced = 0

    try:
        for raw_eatery in dining_rooms:
            eatery = upsert_eatery(db, raw_eatery)
            db.flush()
            eateries_synced += 1

            for day in raw_eatery.get("operatingHours", []):
                date_str = day.get("date")
                if not date_str:
                    continue
                date = datetime.date.fromisoformat(date_str)

                for event in day.get("events", []):
                    menu = event.get("menu") or []
                    if not menu:
                        continue
                    meal_period = event.get("descr", "").strip()
                    if not meal_period:
                        continue

                    menu_event = upsert_menu_event(db, eatery, date, meal_period)
                    items_synced += replace_menu_items(db, menu_event, menu)
                    menu_events_synced += 1

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    result = {
        "eateries_synced": eateries_synced,
        "menu_events_synced": menu_events_synced,
        "items_synced": items_synced,
    }
    logger.info("Scrape complete: %s", result)
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    scrape()
