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
The mapping from a Menu Item to its calorie/macro density **per 100g** — from a USDA FoodData Central entry when matched (used directly, not re-estimated), or an LLM estimate when not. Deliberately not a portion/serving value — see [[0007-nutrition-per-100g-portion-deferred]]. Cached once resolved so it isn't recomputed on every read.
_Avoid_: Nutrition lookup, food match, portion (this is a density, not a serving size)

**Crafted Meal**:
A system-suggested combination of Menu Items from a single eatery/Menu Event, selected to fit a user's calorie/macro/preference targets.
_Avoid_: Suggested meal, recommendation

**Diet Tag**:
An LLM-inferred label on a Menu Item (vegan, vegetarian, gluten-free, common allergens) derived from its name and eatery context, since the dining feed carries no dietary data itself. Cached alongside its Nutrition Match.
_Avoid_: Dietary info, allergen data

**Hard Constraint**:
A user requirement a Crafted Meal must satisfy exactly (allergens, diet tags). Enforced by the optimizer, never relaxed for a "close enough" suggestion.
_Avoid_: Filter, restriction

**Soft Preference**:
A user preference used only to rank or break ties between candidate meals that already satisfy all Hard Constraints — liked/disliked foods, and "prefer whole & minimally processed foods." Never enforced as a filter (a disliked food can still appear if nothing else fits the macro target). Scored deterministically first (substring/category matching, see [[0009-deterministic-preference-preranking]]), then the LLM polish step picks among the top-ranked candidates and writes the name/rationale — never the optimizer.
_Avoid_: Preference (too broad — use this term only for the tie-breaking kind)

**Activity Level**:
A user's self-reported exercise frequency (sedentary through very active), used as the multiplier from BMR to TDEE in Recommended Targets. Input to Recommended Targets only.
_Avoid_: none

**Health Goal**:
A user's stated intent for total daily calories — lose weight, maintain weight, or gain weight. Input to Recommended Targets; shifts the calorie target by a fixed, safety-bounded percentage of TDEE and sets the protein-per-kg used in the macro split. Independent of Macro Style and Diet Restriction.
_Avoid_: Goal (too broad), diet (that's Diet Restriction, a different thing)

**Macro Style**:
A user's preference for how calories are split across protein/carb/fat — "Balanced" (the default split) or "Lower carb" (a higher fat share, carbs shrink to fill what's left; protein is unchanged). Input to Recommended Targets only; never filters or influences which foods a Crafted Meal can contain — that's Diet Restriction's job.
_Avoid_: Diet, eating style (that phrase already means Diet Restriction in this app)

**Recommended Targets**:
The calorie/protein/carb/fat numbers computed from a user's age, sex, height, weight, Activity Level, Health Goal, and Macro Style via the Mifflin-St Jeor BMR formula, clamped to safety bounds (never below 1200–1500 cal, never above 4500 cal). One of two ways a user's daily targets get set — see Target Mode.
_Avoid_: TDEE (that's one intermediate number in the calculation, not the final targets)

**Target Mode**:
Whether a user's current daily calorie/macro targets came from Recommended Targets or were typed in directly. Purely informational — manual entry is always available and always overrides whatever was last recommended; Target Mode just lets the preferences form default back to the right tab on re-open.
_Avoid_: none

**Logged Meal**:
A record that a user actually ate a specific set of dining-hall Menu Items at a given eatery/Menu Event, created by accepting a Crafted Meal or manually assembling items. The unit daily/weekly totals are computed from. Scoped to dining-hall food only — not a general food diary.
_Avoid_: Diary entry, food log entry
