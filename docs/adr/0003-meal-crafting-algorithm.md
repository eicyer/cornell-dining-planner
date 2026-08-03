# Craft meals with a deterministic optimizer; use the LLM only to polish output

A Crafted Meal must hit a user's calorie/macro targets and respect hard constraints (allergens, diet tags from [[0002-enrichment-pipeline]], disliked foods). We considered asking an LLM to assemble the meal directly, which handles nuanced soft preferences well but can't be trusted to get arithmetic right — a meal claiming 650 kcal / 40g protein could be meaningfully wrong if the LLM is doing the composition.

Decision: a deterministic constraint/combinatorial optimizer selects item combinations from an eatery's available items for a given Menu Event, using cached nutrition data, and enforces hard constraints exactly. The LLM only touches output after the fact — naming the meal, writing a short rationale, and breaking ties between near-equal candidates using soft preferences. Macro totals always come from arithmetic over real (cached) nutrition data, never from LLM estimation at suggestion time.

## Known limitation: not yet validated past personal-use scale

Unlike enrichment (which is diff-based and only costs LLM calls for genuinely new menu items), the polish step in `app/services/meal_polish.py` runs **once per eatery per crafted-meals request** — it's on the request path, not cached. At personal-use volume this is negligible (a few cents a month at Haiku 4.5 pricing). Before scaling past that, revisit:

- **Anthropic rate limits** (RPM/TPM on the account's tier) — many concurrent users loading the landing page simultaneously means many concurrent polish calls; no request-side batching or queuing exists yet.
- **Cost scaling** — linear in (users × dining-hall-views), unlike enrichment's cost which is bounded by menu churn regardless of traffic.
- **Availability dependency** — if the Anthropic API is slow or down, `polish_meal` falls back to the first candidate with a generic name/no rationale (see the `except Exception` branch), so crafting degrades gracefully rather than failing outright — but that fallback path itself hasn't been load-tested.

None of this blocks personal use; it's a checklist for whenever real multi-user traffic becomes a possibility.
