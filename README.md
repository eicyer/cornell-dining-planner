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

To pull real menu data (10 AYCE dining halls only, see `docs/adr/0005-eatery-scope.md`):

```bash
python -m app.jobs.scrape_menus
```

Google OAuth requires filling in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env.local` — create credentials at https://console.cloud.google.com/apis/credentials (OAuth client, type "Web application", redirect URI `http://localhost:8001/auth/callback`). Without them, `/auth/login` will fail but the rest of the API still works.

### Frontend (Expo / React Native / React Native Web)

Needs Node 20+ (Expo's CLI breaks on Node 18 — `frontend/.nvmrc` pins this):

```bash
cd frontend
nvm use               # picks up .nvmrc
npm run web            # desktop, in browser
npm run ios            # requires Xcode + iOS simulator
```

## Status

Phase 0 (foundation) complete: backend skeleton + migrations + health check, local Postgres, Google OAuth routes scaffolded (needs real credentials), Expo + react-native-web project, daily scrape job pulling real menu data end to end. See `docs/adr/` for the phased plan (`0006-stack-migration-from-nextjs.md` has the most recent context). Not yet deployed anywhere — Railway/Render deployment needs your account, so that's a manual step when you're ready.
