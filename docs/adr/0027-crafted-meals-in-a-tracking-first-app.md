# Crafted Meals in a tracking-first app: sized to what's left today, optional surveys

The tracking pivot (wayfinder map #49) keeps Crafted Meals but makes them secondary to the Diary. Three things about them only made sense when recommendations were the product: every meal is sized to `daily goal ÷ meals_per_day` regardless of what's been eaten (ADR 0008 called this an MVP simplification to revisit "once logging is wired in"); onboarding forces the Food Preference Survey before the user sees anything; and the Diary carries a "You tend to like / avoid" taste profile that only matters to recommendations. This ADR decides how Crafted Meals behave; where they appear in navigation is wayfinder #57's call.

## Decision

**Crafted Meals are sized to what's left of today, once the user has logged anything today** (supersedes ADR 0008's flat split for that case).

- *Eaten today* = Logged Meals + Quick Add Entries (ADR 0024).
- *Budget* = daily goal, plus counted exercise (ADR 0025).
- *Remaining* = Budget − Eaten, per macro.
- *Meals left* = the main Meal Sections (Breakfast, Lunch, Dinner) from the requested period's section through Dinner that have nothing logged yet, at least 1. Late Night (Snacks) counts as 1.
- *Target* = Remaining ÷ Meals left, **clamped to 50–150% of the flat per-meal target** (goal ÷ meals_per_day) for every macro. The lower bound keeps the app from suggesting a sliver of a meal when the budget is nearly spent (a wellbeing default, not a nutrition rule). The upper bound stops a missed log from producing a giant plate.
- Before anything is logged today, the flat ADR 0008 target still applies. An unlogged breakfast is indistinguishable from a skipped one, and a 150% lunch for someone who just didn't log is the wrong default.

**Resizing is deterministic and per request; the daily precompute stands (ADR 0019).** The cached day still decides *which* items each Crafted Meal holds, plus its LLM name and rationale. At request time the optimizer's existing portion solver (`solve_portions`) re-sizes those same items to the remaining-budget target. No LLM call, no cache invalidation on logging, and the LLM still never touches a number (ADR 0003). If re-solving fails for a meal (e.g. a fixed-serving plate already exceeds the target), the precomputed portions are kept.

**The responses say what they were sized to.** `/menus/today/crafted` and `/menus/today/crafted/{eatery_id}` return the per-meal `target` and whether it was `sized_to_remaining`. The client stops computing its own `goal ÷ meals_per_day`, so the card's target bars match the server.

**Every entry point survives:** the Today list, Eatery Detail's options and the next-meals preview. Placement is #57's call, and #58 decides whether a Meal Section's add flow leads with a suggestion.

**Preference surveys leave required onboarding.** A new user goes Preferences → app; the Food Preference Survey is no longer forced. All three surveys (Food Preference, Station, Meal Preference) stay reachable from the same places as today. Recommendations work without them (Soft Preferences only rank; ADR 0009).

**The taste profile moves off the Diary** to the Today list, as "Suggestions lean toward … / away from …". The Diary is about what was eaten.

## Alternatives considered

- **Keep the flat split.** Simplest, but a tracker that knows you've eaten 1,800 of 2,000 calories and still suggests a 700-calorie dinner contradicts its own Remaining figure.
- **Re-run the full pipeline (candidates + LLM polish) on every log.** The most accurate, but it puts an LLM round trip and a cache rebuild behind every Diary edit, and runs straight into ADR 0019's cost and timing problems. Rejected for re-portioning the precomputed items.
- **Size to remaining before anything is logged** (treat every empty section as uneaten). Punishes users who don't log breakfast with oversized lunches. Rejected.
- **No lower clamp** ("you have 120 cal left, here's a 120-cal dinner"). Arithmetically honest, but a student-wellbeing risk. Rejected.
- **Drop the surveys entirely.** They're the main signal for Soft Preferences and cheap to keep reachable. Kept, just not forced.

## Consequences

- New service `app/services/remaining_budget.py`, used by both crafted-meal endpoints. ADR 0008 is superseded for the logged-today case.
- `meals_per_day` keeps one job: the flat target before anything is logged, and the clamp bounds.
- Logging no longer has any effect on the crafted-meals cache, so ADR 0017's invalidation rules are unchanged.
- The precompute still runs for every onboarded user every day. Restricting it to recently active users is a cost optimization for the backlog, not a behaviour change.
