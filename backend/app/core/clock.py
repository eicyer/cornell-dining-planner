"""Ithaca-local time — the single source of truth for "today" and "now".

Cornell's dining feed reports dates and operating hours in Ithaca's local
time, so anything that compares against those (menu lookups, meal-period
selection) must anchor to this zone rather than the server's. A server
running in UTC (e.g. a Docker/cloud host) rolls over to the next calendar
day hours before Ithaca does, which otherwise makes every eatery look
closed until midnight Eastern.
"""

import datetime
from zoneinfo import ZoneInfo

ITHACA_TZ = ZoneInfo("America/New_York")


def ithaca_now() -> datetime.datetime:
    return datetime.datetime.now(ITHACA_TZ)


def ithaca_today() -> datetime.date:
    return ithaca_now().date()
