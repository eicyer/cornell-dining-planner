# Cornell Dining Meal Planner

See `CONTEXT.md` for domain vocabulary and `docs/adr/` for architecture decisions and why they were made.

## Local dev setup

Copy `.env.example` to `.env.local` (root) and fill in real values — that file documents every var the backend reads, including which ones are required before `ENVIRONMENT=production` will boot (see `backend/app/core/config.py`).

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

**Phase 2** (preferences + meal crafting): `GET`/`PUT /preferences` (calorie/macro goals, structured diet/allergen Hard Constraints, free-text likes/dislikes parsed into Soft Preference tags by `app/services/preference_parsing.py`). Meal crafting (`app/services/meal_crafting.py`) is a deterministic bounded-least-squares optimizer — it filters items by Hard Constraints, generates a few candidate item combinations per eatery, and solves per-item portion grams (not a fixed assumption, see `docs/adr/0007`) against the user's per-meal macro target. The LLM only touches output afterward (`app/services/meal_polish.py`): picking among candidates using Soft Preferences, naming the meal, writing a one-line rationale — it never adjusts the numbers, per `docs/adr/0003` (scaling caveats for that LLM call noted inline in the ADR). `GET /menus/today/crafted` ties it together per dining hall. Frontend gates on login → preferences survey → crafted meals landing page (`App.tsx`, `PreferencesForm.tsx`, `CraftedMealsList.tsx`). Verified end to end against live scraped/enriched data via `TestClient` (see testing note above) — dairy-allergen exclusion, vegan-only filtering, and preference-aware naming ("Spicy Asian Chicken & Tofu Curry Bowl") all confirmed working. `docs/adr/0008` records two deliberate MVP simplifications: per-meal targets are daily goals ÷ a flat `meals_per_day`, and which meal period to craft for uses a wall-clock heuristic rather than real event timestamps.

**Phase 3** (manual builder + logging): `app/routers/logged_meals.py` — `POST /logged-meals` accepts `{eatery_id, meal_period, items: [{name, grams}]}` and always recomputes nutrition server-side from cached per-100g data (never trusts client-sent numbers, same principle as crafting/enrichment); items must actually be on that eatery's menu for that date/meal_period, enforcing the dining-hall-only scope from `docs/adr/0004`. `PATCH /logged-meals/{id}` sets the thumbs up/down `liked` field (the schema already had it, unused until now). `GET /logged-meals` lists a day's log; `GET /logged-meals/summary` returns daily totals vs. goals over a date range. Frontend: `EateryDetailScreen.tsx` is the manual "MyFitnessPal-style" builder (per-item gram entry, live running totals, tap Log Meal); `CraftedMealsList.tsx` got a one-tap "Log this meal" button per crafted meal; `DiaryScreen.tsx` shows today's logged meals with rating buttons, a progress-bar view of today vs. goals, and the last 7 days. Verified end to end against live data — manual logging, menu-membership validation (rejects items not on that day's menu), rating, and the summary aggregation all confirmed correct.

See `docs/adr/` for the phased plan (`0006-stack-migration-from-nextjs.md` has the most recent context). Not yet deployed anywhere — Railway/Render deployment needs your account, so that's a manual step when you're ready.

## Deploying

`backend/Dockerfile` builds the API as a non-root container (`docker build -t cornell-dining-backend backend`); every secret (`SESSION_SECRET`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`/`SECRET`, `ANTHROPIC_API_KEY`, `USDA_API_KEY`, `CORS_ALLOWED_ORIGINS`, `ALLOWED_HOSTS`, `ENVIRONMENT=production`) is set at the hosting platform's env-var UI, never baked into the image — `.env.example` is the checklist. Before flipping DNS live:

1. **Same-site topology**: put the frontend and backend on the same registrable domain (e.g. `app.<domain>` / `api.<domain>`) so `SameSite=Lax` session cookies keep working the way they do on `localhost` today — see `docs/adr/0018-session-cookie-and-csrf-hardening.md`.
2. Confirm HTTPS termination in front of the backend, and that `Set-Cookie` on `/auth/callback` actually carries `Secure` against the real prod URL (it's gated on `ENVIRONMENT=production`, see `app/main.py`).
3. Confirm `backend/tests/security/` and `pip-audit`/`npm audit` are green in CI (`.github/workflows/ci.yml`) on the deploy branch.
4. Update the Google OAuth app's authorized redirect URI from `http://localhost:8001/auth/callback` to the production callback URL.
5. Deploy to a Railway/Render preview/staging environment first and run through 1–4 against that URL before promoting to production.

**Security hardening** (`docs/adr/0018-session-cookie-and-csrf-hardening.md`): fail-fast production config, session-cookie/CSRF hardening, env-driven CORS + `TrustedHostMiddleware`, CSP/security-headers middleware (nonce-based, no `unsafe-inline`), rate limiting on the OAuth and LLM-backed routes, bounded LLM-tag output, a `backend/tests/security/` regression suite, Dependabot, and a hash-pinned backend lockfile (`backend/requirements.in` → `requirements.txt`). Two known, accepted-risk gaps, both documented rather than silently left: `starlette` 0.38.6 has unpatched CVEs but is capped by `fastapi==0.115.0`'s own `<0.39.0` constraint — fixing it means upgrading FastAPI, deferred as its own change (see `backend/requirements.in`); and `frontend/package-lock.json` carries ~18 `npm audit` findings (0 critical) confined to Expo/Metro's build tooling (image parsing, dev-server deps), whose only fixes are a semver-major Expo/React Native downgrade — left for Dependabot to propose as a reviewed PR rather than force-applied here.
