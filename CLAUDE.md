# Cornell Dining Planner

FastAPI backend (`backend/`) + Expo/React Native Web frontend (`frontend/`). See `README.md` for full setup, `CONTEXT.md` for domain vocabulary, `docs/adr/` for architecture decisions and why they were made — **check `docs/adr/` before making an architectural call, and write a new ADR (context, alternatives considered, decision, why) instead of deciding inline.** There are 19 of these; they're the real spec for this project.

## Environment quirks

- Non-default ports: Postgres on `5433`, backend API on `8001` — `5432`/`8000` are taken by another project on this machine. Don't reuse them.
- Frontend needs Node 20+ (`cd frontend && nvm use` — Expo's CLI breaks on Node 18).
- `frontend/CLAUDE.md` → `AGENTS.md`: Expo has changed significantly since training data; read the versioned docs at the linked URL before writing frontend code, don't rely on prior Expo knowledge.

## Commands

Backend (`cd backend`, `source .venv/bin/activate`):
```
docker compose up -d                    # Postgres, from repo root
alembic upgrade head                    # after any model change
uvicorn app.main:app --port 8001 --reload
python -m pytest tests/ -v              # full suite (CI only gates on tests/security/, see .github/workflows/ci.yml)
```
Testing auth-required endpoints (`/preferences`, `/menus/today/crafted`) without real OAuth: override `get_current_user` on a `TestClient` — don't try to go through real login. Exact pattern is in `README.md` under "Local dev setup".

Frontend (`cd frontend`):
```
npm run web            # desktop browser, fetches http://localhost:8001
npx tsc --noEmit        # typecheck — the only automated frontend check right now, no test runner is configured yet
```

Data pipeline (idempotent/diff-based, safe to re-run daily — already cron'd via `scripts/daily_refresh.sh`):
```
python -m app.jobs.scrape_menus
python -m app.jobs.enrich_items         # needs ANTHROPIC_API_KEY + USDA_API_KEY
```

## Architecture invariants (breaking these silently breaks a documented decision)

- Nutrition is stored **per 100g**, never per portion — portion sizing happens only at meal-crafting time. (`docs/adr/0007`)
- `app/services/meal_crafting.py` is a deterministic bounded-least-squares optimizer. The LLM (`meal_polish.py`) only picks among already-generated candidates, names the meal, and writes a rationale — it **never** adjusts calorie/macro numbers. (`docs/adr/0003`)
- Soft Preferences (liked/disliked tags) only ever *rank* candidates; Hard Constraints (allergens/diet) are the only thing that *excludes* an item. Don't let a Soft Preference become a filter. (`CONTEXT.md`, `docs/adr/0009`)
- When USDA has a match, use its numbers directly — no LLM re-estimation. The LLM only estimates macros when USDA has nothing, and always still does diet/allergen tagging. (`docs/adr/0001`, `0002`)
- Logged-meal nutrition is always recomputed server-side from cached per-100g data — never trust client-sent numbers. Items must actually be on that eatery's live menu for that date/meal_period. (`docs/adr/0004`)
- MVP scope is AYCE `"dining room"` eateries only — don't add other `eateryType`s without a new ADR. (`docs/adr/0005`)

## Repo etiquette

- Commits are authored as `eicyer` (local git config override already set in this checkout — don't touch it, global or otherwise). Commit small and often as work progresses, not one batched commit at the end. Imperative-mood title; short body bullets only when the why isn't obvious from the diff. (`CONTRIBUTING.md`)
- Domain terms (Eatery, Menu Event, Crafted Meal, Hard/Soft Preference, Plate Role, etc.) are defined in `CONTEXT.md` — use them exactly as defined there, and add new terms when you introduce a new concept.
