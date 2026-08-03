# Cornell Dining Meal Planner

See `CONTEXT.md` for domain vocabulary and `docs/adr/` for architecture decisions and why they were made.

## Local dev setup

Ports are non-default on this machine because 5432 and 8000 are already taken by another project (`nabiz-kargo-db-1`, OrbStack) — don't reuse those.

### Backend (FastAPI)

```bash
docker compose up -d              # Postgres on localhost:5433
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head               # create/update schema
uvicorn app.main:app --port 8001 --reload
curl http://localhost:8001/health
```

To pull real menu data (10 AYCE dining halls only, see `docs/adr/0005-eatery-scope.md`) and enrich it with nutrition/diet data (USDA + Claude, see `docs/adr/0001`/`0002`), run in order:

```bash
python -m app.jobs.scrape_menus     # raw menus into Postgres
python -m app.jobs.enrich_items     # USDA + LLM enrichment, only for items not already cached
curl http://localhost:8001/menus/today | python3 -m json.tool
```

Both jobs are idempotent/diff-based — safe to re-run daily. `enrich_items` needs `ANTHROPIC_API_KEY` and `USDA_API_KEY` set in `.env.local` (already there). Note: USDA's free-tier API is occasionally flaky (transient 400s) — the client retries and falls back to LLM-only estimation automatically, so this shouldn't block the pipeline.

Google OAuth requires filling in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env.local` — create credentials at https://console.cloud.google.com/apis/credentials (OAuth client, type "Web application", redirect URI `http://localhost:8001/auth/callback`). Without them, `/auth/login` will fail but the rest of the API still works. After login, the callback redirects to `FRONTEND_URL` (defaults to the Expo web dev server).

**Testing auth-required endpoints (`/preferences`, `/menus/today/crafted`) without real OAuth credentials**: use `TestClient` with a dependency override instead of going through a real login —

```python
from fastapi.testclient import TestClient
from app.main import app
from app.core.deps import get_current_user
from app.db.models import User
from app.db.session import SessionLocal

db = SessionLocal()
test_user = db.query(User).filter(User.google_sub == 'test-sub-phase2').one()  # created during Phase 2 verification
app.dependency_overrides[get_current_user] = lambda: test_user
client = TestClient(app)
print(client.get('/menus/today/crafted').json())
```

### Frontend (Expo / React Native / React Native Web)

Needs Node 20+ (Expo's CLI breaks on Node 18 — `frontend/.nvmrc` pins this):

```bash
cd frontend
nvm use               # picks up .nvmrc
npm run web            # desktop, in browser — fetches from http://localhost:8001
npm run ios            # requires Xcode + iOS simulator; edit API_BASE in App.tsx to your LAN IP first
```

The backend must be running with CORS enabled for `http://localhost:8081` (already configured in `app/main.py`) for the web app to fetch menus.

## Status

**Phase 0** (foundation): backend skeleton + migrations + health check, local Postgres, Google OAuth routes scaffolded (needs real credentials), Expo + react-native-web project, daily scrape job.

**Phase 1** (data pipeline): USDA FoodData Central lookup (`app/services/usda.py`), Claude-based nutrition/diet enrichment (`app/services/llm_enrichment.py`), the batch job tying them together with diff logic (`app/jobs/enrich_items.py`), and a bare landing page showing real dining hall menus with calories end to end. Nutrition is stored **per 100g**, not per portion — portion size is deferred to Phase 2 personalization, see `docs/adr/0007`. When USDA has a match its numbers are used directly (no LLM re-guessing); the LLM only estimates macros when USDA has nothing, and always handles diet/allergen tagging. Verified against live data: 255 distinct items enriched, 230 USDA-grounded and 25 LLM-fallback, 0 failures.

**Phase 2** (preferences + meal crafting): `GET`/`PUT /preferences` (calorie/macro goals, structured diet/allergen Hard Constraints, free-text likes/dislikes parsed into Soft Preference tags by `app/services/preference_parsing.py`). Meal crafting (`app/services/meal_crafting.py`) is a deterministic bounded-least-squares optimizer — it filters items by Hard Constraints, generates a few candidate item combinations per eatery, and solves per-item portion grams (not a fixed assumption, see `docs/adr/0007`) against the user's per-meal macro target. The LLM only touches output afterward (`app/services/meal_polish.py`): picking among candidates using Soft Preferences, naming the meal, writing a one-line rationale — it never adjusts the numbers, per `docs/adr/0003`. `GET /menus/today/crafted` ties it together per dining hall. Frontend now gates on login → preferences survey → crafted meals landing page (`App.tsx`, `PreferencesForm.tsx`, `CraftedMealsList.tsx`). Verified end to end against live scraped/enriched data via `TestClient` (see testing note above) — dairy-allergen exclusion, vegan-only filtering, and preference-aware naming ("Spicy Asian Chicken & Tofu Curry Bowl") all confirmed working. `docs/adr/0008` records two deliberate MVP simplifications: per-meal targets are daily goals ÷ a flat `meals_per_day`, and which meal period to craft for uses a wall-clock heuristic rather than real event timestamps.

See `docs/adr/` for the phased plan (`0006-stack-migration-from-nextjs.md` has the most recent context). Not yet deployed anywhere — Railway/Render deployment needs your account, so that's a manual step when you're ready.
