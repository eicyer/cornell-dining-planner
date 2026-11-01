# Add-food flow: section-aware hall picker, one-tap add at one portion, recents matched on today's menu

The tracking pivot (wayfinder map #49) needs a fast path from a Diary Meal Section's "+ Log" to food in that section. Since ADR 0029, "+ Log" just opens the Menus tab, so the user picks a hall, scrolls past a suggested plate, opens "+ Add another item", ticks items with steppers, and taps Log. MyFitnessPal's bar is that a recent food takes about two taps.

## Decision

**"+ Log {section}" opens an Add Food screen for that section and today**, pushed over the Diary.

**Only menus that map to the section are offered** (ADR 0023): Lunch shows halls serving Brunch, Lunch or Late Lunch; Snacks shows Late Night. The menus API now returns each Menu Event's `meal_section`, so the client never maps meal periods itself.

**Defaulting:** the hall the user last logged from *for this section*, if it's serving that section today; otherwise the first hall that is. The hall list is a row of chips; if a hall serves more than one matching period (e.g. Lunch and Late Lunch), period tabs appear.

**Browse by station, with search inside the hall.** Items are grouped by station (the menu's categories), with a search field that filters the selected hall's menu by name. Cross-hall search is deferred: with ~10 halls it's mostly a different screen, and it would reopen the "global +" question (ADR 0029).

**One-tap add at one portion.** Each row's "+" logs the item immediately at **one portion unit** of that food (`getPortionUnit`: a cup, a scoop, a piece; admin-overridable per ADR 0022). Tapping "+" again adds another portion, which is just ADR 0023's seconds rule. Each add appends to that hall's Logged Meal for the period. A confirmation bar reads "Added to your Okenshields lunch" with **Undo**, which takes back exactly the last add. Finer portion edits happen on the Diary's existing meal editor. There's no select-several-then-confirm step: every tap is saved, so leaving the screen never loses anything.

**Recents, matched by name on today's menu.** A "Had before" group at the top lists items the user logged in the last 30 days *that are on the selected menu today*, and one tap adds them at the grams the user last logged. Recent items not on today's menu are hidden, not greyed out: they can't be logged (ADR 0004) and would only add noise. Matching is by exact item name within the selected hall and period, which is how Cornell names repeat across days.

**Deferred to later (not v1):**
- *Copy meal / repeat yesterday*: it has the same off-menu problem and needs its own "3 of 4 items available" UX.
- *Saved meals*: graduates from the map's fog to the backlog as a post-v1 item, depending on how often recents fall short.
- *Cross-hall search.*

**Quick Add stays on the section** (ADR 0024). Add Food is only for menu food.

**Tap budget:** a recent item is 2 taps ("+ Log lunch", then "+"). A fresh item at the default hall is 2, and at another hall 3 (plus a chip tap), within the ≤2 / ≤4 targets.

## Alternatives considered

- **Select several items, then confirm** (today's Eatery Detail build). Fewer requests, but it's the step that loses work when the user backs out, and it costs a tap for every meal. Rejected for immediate adds with Undo.
- **One-tap at a fixed 100 g.** Simple, but 100 g of soup and 100 g of cookies are wildly different portions. One portion unit is what the stepper already pictures.
- **Grey out unavailable recents.** Shows history the user can't act on. Rejected.
- **Match recents across halls by name** ("the pasta you had at Okenshields is at RPCC today"). Useful, but it competes with the hall picker. Revisit with cross-hall search.
- **Default to whichever hall is open now.** We don't store serving times (ADR 0005/0008), and the last-used hall for the section is a better guess for habitual students.

## Consequences

- `GET /menus/today` adds `meal_section` to each Menu Event. New `GET /logged-meals/recents` returns the last-logged grams per item name (last 30 days) and the last eatery per Meal Section.
- `POST /logged-meals` and the PATCH/DELETE edit endpoints are unchanged; Undo is a PATCH (or DELETE when the meal empties).
- The Diary refetches when it regains focus, since food is now added on a pushed screen.
- Eatery Detail (reached from Menus) keeps its Crafted Meal options and hand-built plate.
