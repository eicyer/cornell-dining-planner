# Diary days are split into four Meal Sections derived from the Menu Event; one Logged Meal per Menu Event

The tracking-first pivot (wayfinder map #49) models the Diary on MyFitnessPal's Today screen, where a day is split into meal sections that each have their own "Log" button and totals. Today's Diary has no sections: it shows one card per Logged Meal in creation order, and every "Log this meal" tap creates a new Logged Meal, even for the same Menu Event. Cornell's feed uses six meal periods across the AYCE dining rooms (Breakfast, Brunch, Lunch, Late Lunch, Dinner, Late Night; Brunch is weekend-only, and Late Lunch and Late Night run at two halls each), so the period names can't be used as sections directly without the Diary's layout changing from day to day.

## Decision

**Four fixed Meal Sections: Breakfast, Lunch, Dinner, Snacks.** Every Diary day shows all four, in that order, whether or not they have anything logged.

**A Logged Meal's Meal Section is always derived from its Menu Event's `meal_period`. The user never picks or changes it:**

| Menu Event `meal_period` | Meal Section |
|---|---|
| Breakfast | Breakfast |
| Brunch, Lunch, Late Lunch | Lunch |
| Dinner | Dinner |
| Late Night | Snacks |

A meal period missing from the table (the feed adds a new one) defaults to Snacks and should be added here. Since the section is derived, a section's "Log" button narrows the menus offered to the periods that map to it: Lunch offers Brunch, Lunch and Late Lunch menus, and Snacks offers Late Night menus. A Dinner-menu item eaten late at night therefore counts as Dinner, which is an accepted cost of having no override. Quick Add entries have no Menu Event, so their section rule belongs to the Quick Add ADR (#53).

**One Logged Meal per (user, Menu Event).** Logging items from a Menu Event the user already has a Logged Meal for appends them to that meal instead of creating a second one. Adding an item that's already in the meal adds its grams to the existing line ("seconds" grow the portion; they don't duplicate the line). A Meal Section can hold several Logged Meals: lunch at Okenshields plus Late Lunch at another hall is two Logged Meals in Lunch. The Diary renders each section as a flat list of foods grouped under a small eatery label per Logged Meal, with a total for the section.

Unchanged: server-side validation against the live menu and recomputation from per-100g data (ADR 0004), the existing edit/delete endpoints, and the per-Logged-Meal `liked` rating.

## Alternatives considered

- **Cornell's meal periods as sections.** More faithful to the dining halls, but the Diary's layout changes every day (Brunch only on weekends, Late Night only for some users). That makes empty sections, per-section goals and streak rules awkward. Rejected.
- **Fixed four + Late Night.** A dedicated slot for late-night eating at the halls that offer it. Rejected as a fifth section that's usually empty for most users.
- **User picks the section, with a smart default** (e.g. a Dinner-menu cookie logged under Snacks). More accurate to when food was eaten, but the user chose the simpler rule: the section always follows the menu, with no override UI and no stored section field to keep consistent.
- **Per-food diary entries (MyFitnessPal's model).** The closest to the benchmark, but it needs a data migration and a reworked edit API, and the per-meal `liked` rating loses its meaning. One Logged Meal per Menu Event already shows as a list of foods.
- **A new Logged Meal per "Log" tap (status quo).** A section fills up with near-duplicate cards from the same hall and period.

## Consequences

- `POST /logged-meals` becomes an upsert on (user, menu_event): it merges items and sums grams for repeated names. Existing data may already contain several Logged Meals for one Menu Event, so the build backlog needs a one-time merge (or the read path tolerates it). That's tracked in the map's "migrating existing Logged Meals" fog.
- The meal-period → Meal Section mapping is needed by both the backend (summary/section totals) and the frontend (narrowing menus from a section's "Log"). It lives in one place in the backend and is exposed through the API, rather than duplicated as a hand-synced constant.
- Per-section calorie goals, streak rules ("all main sections logged?") and Quick Add placement can all rely on a stable set of four sections.
