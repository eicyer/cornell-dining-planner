#!/bin/bash
# Automatic daily refresh of dining-hall menu + nutrition data, run via cron
# (see README "Local dev setup" for the manual equivalent of these two
# commands). scrape_menus must run before enrich_items — enrichment reads
# the menu items scrape_menus just wrote. Both jobs are idempotent/
# diff-based, so re-running daily is always safe (docs/adr/0002, 0003).
#
# Install: crontab -e, then add a line like
#   0 5 * * * /Users/emiricyer/Desktop/cornell-dining-planner/scripts/daily_refresh.sh
# (5am local time daily — adjust to taste). Logs land in ./logs/, one file
# per day, so a cron failure is inspectable after the fact instead of
# vanishing into cron's discarded output.

set -euo pipefail

# cron runs with a minimal PATH that typically omits /usr/local/bin, where
# `docker` lives on this machine (`which docker` → /usr/local/bin/docker) —
# without this, "docker compose up -d" below fails silently under cron even
# though the script works fine when run by hand from a normal shell.
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

  echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') daily refresh finished OK ==="
} >> "$LOG_FILE" 2>&1
