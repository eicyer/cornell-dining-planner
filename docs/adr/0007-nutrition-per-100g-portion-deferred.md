# Store nutrition per 100g; defer portion size to personalization

The original enrichment design (see [[0001-nutrition-data-source]], [[0002-enrichment-pipeline]]) asked the LLM to output calories/macros for "a single standard dining-hall portion." In practice this meant the LLM silently decided a gram weight for every item with no way to inspect, audit, or vary that assumption — and it re-guessed numbers even for items with a solid USDA match, quietly undermining the "USDA primary" half of ADR-0001.

The real problem: a standard portion isn't actually standard. It should eventually depend on the user's calorie/macro goals (Phase 2 personalization, see [[0003-meal-crafting-algorithm]]) — a 3,000 kcal/day target and a 1,800 kcal/day target shouldn't get the same scoop of rice.

Decision: `NutritionMatch` stores nutrition density per 100g, not per portion. When USDA has a match, its per-100g numbers are used directly with no LLM involvement in the numbers at all — the LLM's job is narrowed to diet/allergen tagging only. When USDA has no match, the LLM estimates per-100g macros (nutrition-label framing, not "portion" framing) as well as diet tags. Portion size — how many grams of a given item a specific user should get — is entirely deferred to the meal-crafting optimizer in Phase 2, which will compute it from the user's calorie/macro targets rather than from a fixed assumption baked in at enrichment time.

Consequence: the bare landing page (Phase 1) now displays "X cal/100g" rather than a plausible-looking but meaningless portion calorie count. That's an intentional, honest regression in display polish until Phase 2 lands.
