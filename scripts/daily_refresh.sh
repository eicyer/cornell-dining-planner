#!/bin/bash
# Automatic daily refresh of dining-hall menu + nutrition + crafted-meal
# data (see README "Local dev setup" for the manual equivalent of these
# commands). Order matters: scrape_menus must run before enrich_items
# (enrichment reads the menu items scrape_menus just wrote), which must run
# before craft_daily_meals (candidate generation reads the nutrition/diet
# data enrich_items just wrote). All three jobs are idempotent/diff-based,
# so re-running daily is always safe (docs/adr/0002, 0003, 0017).
#
# Install (see docs/adr/0019 for why launchd over crontab): copy
#   scripts/com.cornell-dining-planner.daily-refresh.plist to
#   ~/Library/LaunchAgents/, then:
#     launchctl load ~/Library/LaunchAgents/com.cornell-dining-planner.daily-refresh.plist
# Logs land in ./logs/, one file per day, so a failure is inspectable after
# the fact instead of vanishing into launchd's discarded output.

set -euo pipefail

# cron/launchd both run with a minimal PATH that typically omits
# /usr/local/bin, where `docker` lives on this machine (`which docker` →
# /usr/local/bin/docker) — without this, "docker compose up -d" below fails
# silently even though the script works fine run by hand from a normal shell.
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs"
LOG_FILE="$LOG_DIR/daily_refresh_$(date +%Y-%m-%d).log"
mkdir -p "$LOG_DIR"

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') starting daily refresh ==="

  cd "$REPO_ROOT"
  docker compose up -d

  cd "$REPO_ROOT/backend"
  "$REPO_ROOT/backend/.venv/bin/python" -m app.jobs.scrape_menus
  "$REPO_ROOT/backend/.venv/bin/python" -m app.jobs.enrich_items
  "$REPO_ROOT/backend/.venv/bin/python" -m app.jobs.craft_daily_meals

  echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') daily refresh finished OK ==="
} >> "$LOG_FILE" 2>&1
