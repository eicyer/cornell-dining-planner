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

Google OAuth requires filling in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env.local` — create credentials at https://console.cloud.google.com/apis/credentials (OAuth client, type "Web application", redirect URI `http://localhost:8001/auth/callback`). Without them, `/auth/login` will fail but the rest of the API still works.

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

**Phase 1** (data pipeline): USDA FoodData Central lookup (`app/services/usda.py`), Claude-based nutrition/diet enrichment (`app/services/llm_enrichment.py`), the batch job tying them together with diff logic (`app/jobs/enrich_items.py`), and a bare landing page (`frontend/App.tsx`) showing real dining hall menus with calories end to end. Verified against live data: 255 distinct items enriched, 222 USDA-grounded and 33 LLM-fallback, 0 failures.

See `docs/adr/` for the phased plan (`0006-stack-migration-from-nextjs.md` has the most recent context). Not yet deployed anywhere — Railway/Render deployment needs your account, so that's a manual step when you're ready.
