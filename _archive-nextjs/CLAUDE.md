# Cornell Dining Meal Planner — CLAUDE.md

This is the source-of-truth for the project. Read this before making any changes.

---

## Project Overview

A meal planning app for Cornell students that:
- Pulls live menus from Cornell Dining's public API (updates weekly)
- Enriches menu items with calorie/macro estimates via USDA → Nutritionix → Claude fallback
- Learns user dietary preferences (calorie goals, macros, restrictions, liked/disliked foods)
- Suggests complete, personalized meals for any dining hall using Claude AI
- Lets users log meals manually (MyFitnessPal-style) with running macro totals
- Works on desktop (web) and mobile (PWA / add-to-homescreen)

**Priority: ship fast, personal use first. No over-engineering.**

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | Full-stack, API routes, RSC |
| Styling | Tailwind CSS v4 + shadcn/ui | Component library via Radix UI |
| Database | Supabase (Postgres) | Auth + DB + Row Level Security |
| LLM | Claude API (`claude-haiku-4-5` default, `claude-sonnet-4-5` for complex) | Meal suggestions + calorie estimation fallback |
| Nutrition DB | USDA FoodData Central API (free) | Primary nutrition lookup |
| Nutrition fallback | Nutritionix API | Secondary lookup (500 req/day free) |
| State management | Zustand | Client-side user prefs + meal log state |
| Validation | Zod | API route input validation |
| Deployment | Vercel | Free hobby tier, cron jobs |
| Mobile | PWA (manifest + service worker) | Add to homescreen, offline menu cache |

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only, never expose to client

# Anthropic
ANTHROPIC_API_KEY=

# Nutrition APIs
USDA_API_KEY=                     # get free at https://fdc.nal.usda.gov/api-guide.html
NUTRITIONIX_APP_ID=               # get free at https://www.nutritionix.com/business/api
NUTRITIONIX_API_KEY=

# Cron security
CRON_SECRET=                      # random string, used to protect /api/cron routes
```

---

## Cornell Dining API

Base URL: `https://now.dining.cornell.edu/api/1.0/dining`

Key endpoints:
```
GET /eateries.json          → all eateries, hours, menus, items for today
```

**Response shape (simplified):**
```typescript
{
  eateries: [{
    id: number
    name: string
    location: string
    operatingHours: [{ weekday: string, events: [{ start, end, menu: { items: [...] } }] }]
    diningItems: [{
      item: string,         // item name
      healthy: boolean,
      icons: string[]       // dietary icons: "veg", "vegan", "gluten-free" etc.
    }]
  }]
}
```

Some items include nutrition data, most don't — that's where enrichment runs.

---

## Database Schema

See `supabase/migrations/` for full SQL. Summary:

```
eateries          → dining hall info (id, name, location, hours_json)
menu_items        → enriched items (name, eatery_id, date, meal_period, calories, protein, carbs, fat, fiber, nutrition_source, confidence_score)
users             → auth users (managed by Supabase Auth)
user_preferences  → calorie_goal, protein_goal, carb_goal, fat_goal, liked_foods[], disliked_foods[], dietary_restrictions[], meal_count
logged_meals      → date, meal_period, eatery_id, items_json, totals
```

`nutrition_source` enum: `'cornell_api' | 'usda' | 'nutritionix' | 'llm_estimate'`
`confidence_score`: 0.0–1.0 (lower = less certain, shown as "estimated" in UI)

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    ← Landing: all dining halls + top meal suggestions
│   ├── onboarding/page.tsx         ← First-time preference survey (5 questions)
│   ├── eatery/[id]/page.tsx        ← Full menu + custom meal builder
│   ├── log/page.tsx                ← Daily meal log + macro progress
│   └── api/
│       ├── cron/sync/route.ts      ← Weekly Cornell menu sync (Vercel cron)
│       ├── menus/route.ts          ← GET today's menus for all/one eatery
│       ├── suggestions/route.ts    ← POST: generate meal suggestions via Claude
│       ├── nutrition/route.ts      ← POST: enrich single item with nutrition
│       └── user/
│           ├── prefs/route.ts      ← GET/PUT user preferences
│           └── meals/route.ts      ← GET/POST logged meals
├── components/
│   ├── ui/                         ← shadcn/ui primitives (Button, Card, etc.)
│   ├── dining/
│   │   ├── EateryCard.tsx          ← Dining hall card with top suggestions preview
│   │   ├── EateryList.tsx          ← Grid of all dining halls
│   │   └── MenuItemRow.tsx         ← Single menu item with nutrition badge
│   ├── meal/
│   │   ├── MealSuggestion.tsx      ← Suggested meal combo card
│   │   ├── MealBuilder.tsx         ← Click-to-add meal builder
│   │   └── MacroRings.tsx          ← Circular progress for cal/protein/carbs/fat
│   └── onboarding/
│       └── PreferenceForm.tsx      ← Multi-step survey form
├── lib/
│   ├── cornell-api.ts              ← Fetch + parse Cornell Dining API
│   ├── nutrition.ts                ← USDA → Nutritionix → Claude enrichment pipeline
│   ├── suggestions.ts             ← Claude meal suggestion prompt builder
│   ├── supabase/
│   │   ├── client.ts               ← Browser Supabase client
│   │   └── server.ts               ← Server Supabase client (SSR)
│   └── utils.ts                    ← cn(), formatCalories(), etc.
├── hooks/
│   ├── useUserPrefs.ts             ← Fetch/update user preferences
│   └── useTodayMenus.ts            ← Fetch today's menus with SWR
├── store/
│   └── mealLog.ts                  ← Zustand store for in-progress meal log
└── types/
    └── index.ts                    ← All shared TypeScript types
```

---

## Key Flows

### 1. Weekly Menu Sync (Cron)
```
Vercel Cron (Mon 6am) → GET /api/cron/sync
  → fetch Cornell API
  → for each new item:
      1. lookup USDA FoodData Central (fuzzy name match)
      2. if no match → Nutritionix
      3. if no match → Claude estimate (prompt below)
  → upsert into menu_items table
```

**Claude calorie estimation prompt:**
```
You are a nutrition expert. Estimate the calories and macros for a
standard single-serving dining hall portion of: "{item_name}"
Respond ONLY with valid JSON: {"calories": int, "protein_g": float, "carbs_g": float, "fat_g": float, "fiber_g": float, "confidence": float (0-1)}
```

### 2. Meal Suggestion Flow
```
User selects dining hall + meal period
  → /api/suggestions POST { eatery_id, meal_period, user_prefs }
  → Claude receives: today's menu items (with nutrition) + user goals
  → Returns 3-5 meal combos hitting calorie/macro targets
  → Rendered as MealSuggestion cards
```

**Suggestion prompt structure:**
```
System: You are a meal planning assistant for Cornell dining halls.
        Always return valid JSON only.

User: Today's menu at {eatery_name}:
{items_json}

User goals: {calorie_goal} cal, {protein_goal}g protein
Restrictions: {dietary_restrictions}
Likes: {liked_foods} | Dislikes: {disliked_foods}

Generate 3 complete meal combinations using ONLY items from the menu above.
Each meal must be within 100 calories of the goal and hit protein target.
Return: [{name, items: [{item_name, calories, protein, carbs, fat}], totals: {calories, protein, carbs, fat}, reason}]
```

### 3. Manual Meal Logging
```
User on /eatery/[id]:
  → Clicks items to add to "My Meal" tray
  → Running cal/macro totals update in real time (Zustand)
  → User clicks "Log Meal" → POST /api/user/meals
  → Reflected in /log page macro rings
```

---

## Nutrition Enrichment Pipeline

Located in `src/lib/nutrition.ts`:

```typescript
async function enrichItem(itemName: string): Promise<NutritionData> {
  // 1. Try USDA FoodData Central
  const usda = await lookupUSDA(itemName)
  if (usda && usda.confidence > 0.7) return { ...usda, source: 'usda' }

  // 2. Try Nutritionix
  const nix = await lookupNutritionix(itemName)
  if (nix) return { ...nix, source: 'nutritionix' }

  // 3. Claude estimation fallback
  return await estimateWithClaude(itemName)
}
```

All results cached forever in DB — enrichment only runs once per unique item name.

---

## UI/UX Principles

- **Calorie-first design**: calories are always the biggest number on any card
- **Confidence indicators**: items with `confidence < 0.7` show "~estimated" badge
- **Portion multipliers**: every logged item has 0.5x / 1x / 1.5x / 2x selector
- **Macro color coding**: protein = blue, carbs = amber, fat = rose (consistent everywhere)
- **Mobile-first layout**: all pages designed for 375px first, then desktop
- **No loading spinners on menus**: use React Server Components + static generation, only suggestions are dynamic

---

## Development Phases

### Phase 1 — Data + Basic Viewer (Days 1–5)
- [ ] Supabase project setup + schema migration
- [ ] `lib/cornell-api.ts` — fetch and parse Cornell API
- [ ] `lib/nutrition.ts` — USDA lookup + Claude fallback
- [ ] `/api/cron/sync` — store menus in Supabase
- [ ] Basic `/` page — list all eateries + today's menu items with calories

### Phase 2 — Personalization + Suggestions (Days 6–10)
- [ ] Supabase Auth (magic link email)
- [ ] `/onboarding` — 5-question preference survey
- [ ] `lib/suggestions.ts` — Claude meal suggestion logic
- [ ] `/api/suggestions` — suggestion endpoint
- [ ] Landing page `EateryCard` — show top 2 suggestions per hall

### Phase 3 — Meal Logging + Polish (Days 11–15)
- [ ] `MealBuilder` component — click to add items
- [ ] `/api/user/meals` — log meals endpoint
- [ ] `/log` page — daily macro rings + meal history
- [ ] PWA manifest + icons + service worker
- [ ] Mobile layout polish

### Phase 4 — Desktop Widget (Optional)
- [ ] Tauri v2 shell wrapping the web app
- [ ] macOS menu bar widget with today's top suggestion

---

## Vercel Cron Config

In `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 6 * * 1"
    }
  ]
}
```
Cron route must check `Authorization: Bearer ${CRON_SECRET}` header.

---

## Cost at MVP Scale (Personal Use)

| Service | Cost |
|---|---|
| Vercel (hobby) | Free |
| Supabase (free tier) | Free |
| USDA FoodData Central | Free |
| Nutritionix (≤500 req/day) | Free |
| Claude API (~50 suggestions/month + enrichment) | ~$1-2/month |
| **Total** | **~$2/month** |

---

## Commands

```bash
npm run dev          # start dev server (localhost:3000)
npm run build        # production build
npm run lint         # ESLint
npx supabase start   # local Supabase (requires Supabase CLI)
npx supabase db push # push schema migrations
```

---

## Key External Docs

- Cornell Dining API: `https://now.dining.cornell.edu/api/1.0/dining/eateries.json`
- USDA FoodData Central: `https://fdc.nal.usda.gov/api-guide.html`
- Nutritionix API: `https://docs.nutritionix.com/`
- Supabase SSR docs: `https://supabase.com/docs/guides/auth/server-side/nextjs`
- shadcn/ui: `https://ui.shadcn.com/docs`
- Claude API: `https://docs.anthropic.com/`
