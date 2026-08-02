# Meal tracking is scoped to dining-hall food only

"MyFitnessPal-like" tracking could reasonably mean a full food diary covering anything eaten. We're not building that.

Decision: a Logged Meal can only be composed of Menu Items from the dining feed (via a Crafted Meal or manual selection) — there is no free-text or arbitrary-food logging in MVP. Daily/weekly totals only reflect dining-hall food. This keeps tracking tightly coupled to the core problem (dining-hall decision fatigue) instead of growing into a general-purpose food-logging product with its own search/entry UX.
