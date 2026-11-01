# Add Food: tap a food to pick its portion before adding

ADR 0030 made Add Food one-tap: each row's "+" logs one portion unit, and finer portion edits happen afterwards in the Diary's meal editor. Trying the preview, the user wanted to set the amount *while adding*, e.g. 1.5 scoops instead of one. Going to the Diary to fix the amount after every add defeats the speed the screen exists for.

## Decision

**Tapping a food's name opens a portion picker inline under that row.** "+" stays as the one-tap add, so ADR 0030's tap budget is unchanged for the common case.

- The picker is the existing `PortionStepper`: a portion row stepping in the food's unit (½ steps, or ¼ for cups and plates), plus an editable grams row for exact numbers. It starts at the amount "+" would add: one portion, or a recent item's last-used grams.
- It shows the live calories for the chosen amount, then **Cancel** (secondary) and **Add 1½ scoops** (primary). Adding works exactly like "+": it appends to the hall's Logged Meal, shows the "Added … · Undo" tray, and Undo takes back the whole amount just added.
- One picker is open at a time. Tapping the same name again, Cancel, or Add closes it.
- Nutrition is still computed server-side from per-100g data (ADR 0004/0007). The picker only sends grams.

## Alternatives considered

- **Make "+" open the picker** (no one-tap). Simpler to explain, but it costs every add an extra tap. Rejected; the picker is opt-in.
- **A bottom sheet.** Native-feeling, but it's a new floating surface Design.md doesn't have (ADR 0033 keeps surfaces flush), and it hides which row you're adjusting.
- **Keep editing in the Diary only.** That's what the user pushed back on.

## Consequences

- `AddFoodScreen` gains a tap target on each row's text and an inline picker. No API change.
- This amends ADR 0030's "finer portion edits happen on the Diary's existing meal editor": they can now also happen in the picker before adding.
- The picker's Cancel uses a new `secondary` Button variant (ink border, ink text). Quick Add and Exercise use it for Cancel too.
