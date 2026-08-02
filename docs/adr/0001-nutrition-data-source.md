# Use USDA FoodData Central for nutrition data, not the dining site's own nutrition system

Cornell dining publishes menus at `now.dining.cornell.edu` via a clean public JSON feed (`admin-now.dining.cornell.edu/api/1.0/dining/eateries.json`), but that feed carries no calorie/macro data. Cornell also runs a CBORD NetNutrition instance (`netnutrition.dining.cornell.edu`) that looks purpose-built for this, but its API returns empty data for Cornell's units — it isn't actually populated. We confirmed this by hitting `GetLocations` and `GetUnits` directly; both returned empty.

Decision: match each Menu Item to a USDA FoodData Central entry for a standardized portion, cache the match once resolved, and fall back to an LLM estimate (and LLM-assisted matching for ambiguous names) when no confident USDA match exists. Rejected NetNutrition as a source entirely since it has no real data to scrape.
