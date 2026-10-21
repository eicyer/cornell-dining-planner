# Quick Add Entries: user-entered calories for food outside the dining halls (supersedes 0004)

ADR 0004 scoped tracking to dining-hall food: a Logged Meal can only hold Menu Items from the live feed, and the server recomputes all nutrition from cached per-100g data. That was right for a recommendation-first app. For a tracker (wayfinder map #49) it leaves a hole in every day the student eats anywhere else (a café, a bagel, a late-night slice), and the Diary's "Remaining" figure becomes fiction. MyFitnessPal's answer is a full food database; ours, decided while charting the map, is **Quick Add**: type the calories (and optionally macros) yourself. A general food database, barcode scanning and recipes stay out of scope.

## Decision

**A Quick Add Entry is its own record, not a kind of Logged Meal.** It lives in a separate `quick_add_entries` table with:

| Field | Rule |
|---|---|
| `date` | Required. Any day up to today (forgotten snacks get backfilled), never the future. |
| `meal_section` | Required, one of the four Meal Sections. It's whichever section's "Quick add" was tapped, and the user can change it. |
| `name` | Optional, at most 80 characters. Shown as "Quick Add" when blank. |
| `calories` | Required, 1–5000. |
| `protein_g`, `carbs_g`, `fat_g` | Optional, each 0–500. Omitted counts as 0. |

**The trust exception is scoped to that table.** ADR 0004's rule still holds for every Logged Meal: items must be on the Menu Event's live menu, and nutrition is recomputed server-side from per-100g data. A Quick Add Entry is the user's own statement about food the app has no data for, so its numbers are stored as entered, within the bounds above. They are never written into the nutrition cache, never attributed to a Menu Item, and never feed Soft Preferences (no `liked` rating). The macros aren't checked against the calories, as in MyFitnessPal.

**The Meal Section is chosen, not derived.** ADR 0023 derives a Logged Meal's section from its Menu Event; a Quick Add Entry has no Menu Event, so the section is the one whose "Quick add" was tapped, editable afterwards.

**Quick Add counts everywhere a day's totals do:** the Diary's Goal − Food = Remaining, the section totals, and the 7-day summary. When Crafted Meals start sizing to what's left of today's budget (wayfinder #56), Quick Add calories count toward what's been eaten.

**One-off in v1.** Entries can be edited and deleted but not re-logged from a recents list. Recents, favorites and copy-meal belong to the add-food flow (wayfinder #58), which can include Quick Add Entries.

## Alternatives considered

- **Quick Add as a Logged Meal with no Menu Event and a `source` column.** One table and one list endpoint, but every Logged Meal code path (recomputation, menu validation, the unique (user, Menu Event) constraint, ratings) would need a "unless it's Quick Add" branch, and the CLAUDE.md invariant would turn from a rule into a convention. Rejected.
- **Calories only, no macros.** Simpler form, but the Diary shows protein/carbs/fat bars and a 600-calorie café sandwich would read as zero protein. Macros stay optional.
- **Required name.** Slows the one thing Quick Add is for. MyFitnessPal leaves it optional too.
- **Section derived from the time of day.** Breaks backfilling (a snack logged the next morning would land in Breakfast). Rejected in favour of the tapped section.
- **A food database.** Out of scope for this effort (see map #49).

## Consequences

- `CLAUDE.md`'s "logged-meal nutrition is always recomputed server-side" invariant stays true as written; it gains one sentence pointing here for the Quick Add exception.
- New endpoints: `POST/GET /quick-add`, `PATCH/DELETE /quick-add/{id}`. `GET /logged-meals/summary` adds Quick Add calories and macros into each day's totals.
- The Diary renders Quick Add Entries inside their Meal Section, under the Logged Meals, and every section (on any non-future day) gets a "Quick add" action.
