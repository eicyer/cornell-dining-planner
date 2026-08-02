# Craft meals with a deterministic optimizer; use the LLM only to polish output

A Crafted Meal must hit a user's calorie/macro targets and respect hard constraints (allergens, diet tags from [[0002-enrichment-pipeline]], disliked foods). We considered asking an LLM to assemble the meal directly, which handles nuanced soft preferences well but can't be trusted to get arithmetic right — a meal claiming 650 kcal / 40g protein could be meaningfully wrong if the LLM is doing the composition.

Decision: a deterministic constraint/combinatorial optimizer selects item combinations from an eatery's available items for a given Menu Event, using cached nutrition data, and enforces hard constraints exactly. The LLM only touches output after the fact — naming the meal, writing a short rationale, and breaking ties between near-equal candidates using soft preferences. Macro totals always come from arithmetic over real (cached) nutrition data, never from LLM estimation at suggestion time.
