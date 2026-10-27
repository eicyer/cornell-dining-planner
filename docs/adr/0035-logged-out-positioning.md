# Logged-out positioning: "Your dining-hall food diary", name stays Cornell Dining

The logged-out screen says "Plan your plate.", which described the recommendation-first product. After the tracking pivot (wayfinder map #49) the app is a food diary for Cornell's dining halls, with Crafted Meals as a secondary feature (ADR 0027). The map left the positioning copy and a possible rename open (ticket #81).

## Decision

**Headline:** "Your dining-hall food diary."

**One supporting line:** "Log what you eat at Cornell's dining halls in a couple of taps. Every menu item comes with its nutrition." It says what's different from a general tracker (today's real menus, no searching a food database) without marketing filler (Design.md).

**Name stays "Cornell Dining"**, the kicker the app already shows, and the PWA manifest and page title (ADR 0032). "Planner" leaves user-facing copy. The repo and README name aren't user-facing and aren't renamed.

**No feature list or screenshots** on the logged-out screen. Students arrive from a link or a friend, and the screen's job is the sign-in button.

## Alternatives considered

- **Keep "Plan your plate."** Wrong product now: the home screen is the Diary, not a plan.
- **A new product name.** No evidence the name is a problem. It's easy to revisit, but costly to churn the PWA name on installed home screens.
- **Lead with Crafted Meals** ("Know what to eat before you go"). It's the secondary feature now (ADR 0027).

## Consequences

- `LoggedOutScreen` gets the new headline and supporting line.
- No changes to the manifest or page title: both already say "Cornell Dining".
