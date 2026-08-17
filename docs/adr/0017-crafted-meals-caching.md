# Cache GET /menus/today/crafted per (user, date) and parallelize its LLM calls

`crafted_meals_today` (`app.routers.crafted_meals`) recomputes the full candidate set and calls the LLM polish step ([[0003-meal-crafting-algorithm]]) once per dining-room eatery on every request, in a plain sequential `for` loop. With ~10 dining rooms this meant every screen load/refresh paid for ~10 back-to-back LLM round trips, even though the two things the result actually depends on — today's menu data and the user's preferences — change at most once a day (the 5am `scripts/daily_refresh.sh` cron) or on an explicit preference edit.

Two independent fixes, applied together:

- **Parallelize**: the per-eatery `polish_meal` calls now run concurrently via `asyncio.gather` instead of one at a time. This helps every cache-miss request, including the first request of the day.
- **Cache**: a new `CraftedMealsCache` table (`app.db.models`) stores the serialized response body keyed by `(user_id, date)`. A hit skips the optimizer and every LLM call entirely. Keyed by date rather than a TTL — a new day naturally misses without any cleanup logic, since `daily_refresh.sh` only ever adds new `MenuEvent`/`MenuItem` rows for the new date. Explicitly invalidated (row deleted) wherever `UserPreference` is written — `put_preferences`, `submit_food_survey`, `submit_station_survey` in `app.routers.preferences` — since that's the only way this day's result can legitimately change.

Considered an in-process (per-worker) cache instead of a DB table; rejected because it wouldn't survive a backend restart or be shared across workers, both of which would silently reintroduce the slow path.

The single-eatery endpoint (`crafted_meals_for_eatery`, used by the eatery-detail "3 options" screen) is unaffected — it only ever does one eatery's worth of work per request, so the sequential-loop cost never applied there.
