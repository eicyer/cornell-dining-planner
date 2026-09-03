#!/bin/sh
# Railway cron entrypoint for the production menu refresh — see
# docs/adr/0021-production-menu-refresh-cron.md. Set as the Start Command
# on the `cornell-dining-planner-refresh` service, which has no other job:
# it runs this to completion on a schedule and exits (Railway's cron
# model), rather than staying up like the web service does.
#
# Order matters, same reasoning as scripts/daily_refresh.sh (the local dev
# equivalent): scrape_menus must run before enrich_items (enrichment reads
# the menu items scrape_menus just wrote), which must run before
# craft_daily_meals (candidate generation reads the nutrition/diet data
# enrich_items just wrote). All three are idempotent/diff-based (docs/adr/
# 0002, 0003, 0017), so re-running on every scheduled tick is always safe.
#
# Unlike daily_refresh.sh, no `docker compose up -d` or `.venv/bin/python`
# — this runs inside the same container image as the web service
# (same Dockerfile, just a different Start Command), so the DB is already
# reachable over Railway's private network and `python`/`app` are already
# on PATH.
set -eu

python -m app.jobs.scrape_menus
python -m app.jobs.enrich_items
python -m app.jobs.craft_daily_meals
