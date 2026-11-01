"""replace_menu_items drops a dish the feed repeats within one station,
but keeps the same dish listed under two stations (issue #130)."""

import datetime

import pytest

from app.db.models import Eatery, MenuEvent, MenuItem
from app.db.session import SessionLocal
from app.jobs.scrape_menus import replace_menu_items


@pytest.fixture
def menu_event():
    db = SessionLocal()
    eatery = Eatery(cornell_id=-9130, slug="pytest-dup-eatery", name="Pytest Dup Eatery", eatery_type="dining room")
    db.add(eatery)
    db.flush()
    event = MenuEvent(eatery_id=eatery.id, date=datetime.date.today(), meal_period="Lunch")
    db.add(event)
    db.commit()
    try:
        yield db, event
    finally:
        db.rollback()
        db.query(MenuItem).filter(MenuItem.menu_event_id == event.id).delete()
        db.query(MenuEvent).filter(MenuEvent.id == event.id).delete()
        db.query(Eatery).filter(Eatery.id == eatery.id).delete()
        db.commit()
        db.close()


def test_repeat_within_a_station_is_dropped_but_other_stations_kept(menu_event):
    db, event = menu_event
    count = replace_menu_items(
        db,
        event,
        [
            {"category": "Desserts", "items": [{"item": "Cookies"}, {"item": "Cookies"}, {"item": "Fresh Fruit"}]},
            {"category": "Salad", "items": [{"item": "Fresh Fruit"}]},
        ],
    )
    db.commit()

    rows = db.query(MenuItem.category, MenuItem.name).filter(MenuItem.menu_event_id == event.id).all()
    assert count == 3
    assert sorted(rows) == [("Desserts", "Cookies"), ("Desserts", "Fresh Fruit"), ("Salad", "Fresh Fruit")]
