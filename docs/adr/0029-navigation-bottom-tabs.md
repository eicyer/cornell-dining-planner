# Navigation: Diary is home, four bottom tabs, no global "+"

The tracking pivot (wayfinder map #49) needs a navigation structure that puts the Diary first. Today the app lands on "Today's Meals For You" (the Crafted Meals list), and a masthead `TopNav` carries two sections (Today, Diary; Progress was added as a stopgap by ADR 0026) alongside four account links (Preferences, Taste quiz, Meal prefs, Log out) in one row. MyFitnessPal uses bottom tabs (Dashboard · Diary · + · Progress · More) with the Diary one tap away and settings under More.

## Decision

**Four bottom tabs, in this order: Diary · Menus · Progress · More.**

| Tab | What it is |
|---|---|
| **Diary** (home) | Today's Diary: week strip for other days, pinned Goal − Food + Exercise = Remaining, four Meal Sections, Exercise. Signed-in users land here, and finishing onboarding lands here too. |
| **Menus** | Today's dining halls, each with its suggested Crafted Meal (ADR 0027), and a tap through to that hall's full menu and options (Eatery Detail). This is where Crafted Meals live, as a secondary feature next to the menus rather than as the home screen. |
| **Progress** | ADR 0026's screen. |
| **More** | Preferences & goals, Taste quiz, Meal preferences, Log out. |

**No global "+".** MyFitnessPal's centre button earns its place by fronting search, barcode and recipes, none of which exist here. Every logging action already has a home: each Meal Section has "+ Log" and "Quick add", Exercise has "+ Add exercise", and Progress has "Log weight". A "+" that only re-offers those adds a tab-bar slot and a sheet without saving taps. Revisit if the add-food flow (wayfinder #58) introduces cross-hall search.

**Menus is a destination of its own,** not only a step inside logging. Students browse "what's at Okenshields tonight" without intending to log, and it's the natural home for Crafted Meals. A section's "+ Log" button opens Menus until #58 designs a section-aware add flow.

**Tabs are flat.** Switching tabs resets to that tab's root screen. Detail and step screens (Eatery Detail, Preferences, the surveys) push over the current tab with a back button and hide the tab bar. Logging a meal from Eatery Detail returns to the Diary tab.

**Editorial treatment:** the tab bar is a hairline rule above icon + kicker label. The active tab is ink with a 2px accent rule on top, mirroring the underline-tab idiom; the others are `inkSecondary`. No filled pill, no badge counts. `TopNav` is retired.

**The pinned summary stays pinned** (already done in the Diary redesign).

## Alternatives considered

- **MyFitnessPal's five slots with a centre "+".** Rejected above: it duplicates existing per-section actions.
- **Crafted Meals as their own "For you" tab.** That would give a secondary feature a primary slot. Menus without suggestions is also thinner than menus with them.
- **Menus only inside logging.** That drops the "just browsing" job the app was originally built for.
- **Keep the masthead `TopNav`.** It doesn't scale to four sections plus account links on a phone (it already wraps), and it reads as a website, not an app.
- **`@react-navigation/bottom-tabs`.** The idiomatic navigator, but it's a new dependency and a navigator restructure. A small custom tab bar over the existing native stack gives the same behaviour for four flat tabs. Revisit if tabs ever need their own stacks.

## Consequences

- New `TabBar` and `MoreScreen` components. `TopNav` is deleted. The boot route for an onboarded user becomes `Diary`.
- `CraftedMealsList` becomes the Menus tab, retitled "Menus".
- Design.md's `TopNav emphasis` section is replaced by a `TabBar` note. The wider design amendment is wayfinder #62.
