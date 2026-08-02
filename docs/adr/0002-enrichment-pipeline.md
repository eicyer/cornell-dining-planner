# Enrich menu items in a batch job triggered by the scrape, not on request

The dining feed updates roughly weekly and gives no nutrition or dietary/allergen data — only item names. Every new Menu Item needs a USDA/LLM nutrition match ([[0001-nutrition-data-source]]) and an LLM-inferred diet/allergen tag set (vegan/vegetarian/gluten-free/common allergens, using the item name plus eatery context, e.g. 104West! is kosher).

Decision: run enrichment as a background job after each scrape. Diff incoming Menu Items against known ones; only run USDA/LLM calls for genuinely new item names. Cache both nutrition and diet tags per item indefinitely (until manually invalidated). This keeps LLM/API calls rare (bounded by menu churn, not by traffic) and keeps user-facing requests off the LLM call path entirely — nobody waits on a live match while browsing a dining hall page.
