"""Eating Style vocabulary — see docs/adr/0015-eating-styles-registry.

Mirrors app.services.llm_enrichment's DIET_TAGS/ALLERGENS pattern: a fixed
list, multi-select, validated server-side in app.routers.preferences. Unlike
those two, Eating Style is never a Hard Constraint — every entry here is
soft-rank-only, read by app.services.preference_scoring to reorder Crafted
Meal candidates that already satisfy diet_restrictions/allergens. It never
excludes a candidate outright, same contract as liked/disliked tags and the
former "prefer whole & minimally processed foods" toggle this replaces.
"""

from __future__ import annotations

EATING_STYLES = ["low_sugar", "high_fiber", "whole_foods_focus"]
