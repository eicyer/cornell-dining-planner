# Cornell Meal Planner

Helps Cornell students plan meals in dining halls that fit their diet, using real dining-hall menu data plus estimated nutrition, so they don't have to manually copy-paste menus into an LLM or make spontaneous, decision-fatigued choices.

## Language

**Eatery**:
A Cornell dining location as returned by the dining API, tagged with an eateryType ("dining room", "cafe", "food court", "cart", "coffee shop", "convenience store"). MVP scope is limited to "dining room" (all-you-care-to-eat) eateries only — see [[0005-eatery-scope]].
_Avoid_: Dining hall (fine as a synonym for "dining room"-type Eatery, but don't use it for the general concept)

**Menu Event**:
A single meal period (e.g. Breakfast, Lunch, Late Lunch, Brunch) served at one eatery on one date. The unit that groups menu categories/items together.
_Avoid_: Meal period (used interchangeably, but "Menu Event" is the API/data term), service

**Menu Item**:
A single dish as named in the dining API feed (e.g. "Grilled Broccoli"). Distinct from a Nutrition Item — the two are matched, not identical.
_Avoid_: Dish, food

**Nutrition Match**:
The mapping from a Menu Item to a USDA FoodData Central entry (or LLM-estimated fallback) that supplies its calorie/macro values for a standardized portion. Cached once resolved so it isn't recomputed on every read.
_Avoid_: Nutrition lookup, food match

**Crafted Meal**:
A system-suggested combination of Menu Items from a single eatery/Menu Event, selected to fit a user's calorie/macro/preference targets.
_Avoid_: Suggested meal, recommendation

**Diet Tag**:
An LLM-inferred label on a Menu Item (vegan, vegetarian, gluten-free, common allergens) derived from its name and eatery context, since the dining feed carries no dietary data itself. Cached alongside its Nutrition Match.
_Avoid_: Dietary info, allergen data

**Hard Constraint**:
A user requirement a Crafted Meal must satisfy exactly (allergens, diet tags, disliked foods, calorie ceiling). Enforced by the optimizer, never relaxed for a "close enough" suggestion.
_Avoid_: Filter, restriction

**Soft Preference**:
A user preference used only to rank or break ties between candidate meals that already satisfy all Hard Constraints (e.g. liked foods). Handled by the LLM polish step, not the optimizer.
_Avoid_: Preference (too broad — use this term only for the tie-breaking kind)

**Logged Meal**:
A record that a user actually ate a specific set of dining-hall Menu Items at a given eatery/Menu Event, created by accepting a Crafted Meal or manually assembling items. The unit daily/weekly totals are computed from. Scoped to dining-hall food only — not a general food diary.
_Avoid_: Diary entry, food log entry
