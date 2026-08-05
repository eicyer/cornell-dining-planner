# Design.md — Cornell Dining Planner

## Direction: Editorial

This app reads like a dining-hall menu card in a food magazine, not a fitness SaaS dashboard. Serif headlines carry meal and eatery names; italic serif carries the "why this meal" rationale copy; a single mono typeface renders nutrition figures like a spec sheet; Cornell Red is the only color doing work. Hierarchy comes from type scale and whitespace — not boxes.

Target feel, approved as the north star for every screen:

```
CORNELL DINING · TUESDAY

OKENSHIELDS

Grilled Salmon Bowl
With charred broccolini, jasmine rice,
and a citrus-soy glaze.

612 cal   41g protein   58g carbs   19g fat

Log this meal →
```

This is genuinely how the app should read: `CraftedMealsList.tsx` renders the kicker from the real current weekday, the eatery/meal names and macro row are always live API data — no placeholder copy anywhere in the app.

## Don't do this

- No Inter, Roboto, or system/`-apple-system`/`system-ui` fonts, anywhere.
- No purple or indigo. No gradients.
- No centered three-card hero layout.
- No "modern and clean" — this is Editorial, specifically.
- No `borderRadius` above `0` except the two named exceptions below.
- No bordered/background "card" boxes for grouping content. Use whitespace and, where a boundary is truly needed, one 1px hairline rule.
- No Lorem ipsum, no "Feature one / Feature two" placeholder copy. Every string in the UI is either real Cornell dining data or specific, concrete instructional copy (e.g. "e.g. chicken, spicy food, Asian flavors", not "Enter your preference").

## Palette (`theme.ts` → `colors`)

| Token | Hex | Usage |
|---|---|---|
| `paper` | `#F7F3EA` | Screen background everywhere |
| `ink` | `#1C1A17` | Primary text, active states |
| `inkSecondary` | `#6B6355` | Secondary text — captions, rationale, inactive labels |
| `inkTertiary` | `#9C9483` | Placeholder text, least-emphasis captions |
| `hairline` | `#E4DCC8` | The *only* divider mechanism — replaces every border/box |
| `accent` | `#B31B1B` | Cornell Red. The single saturated color: primary CTAs, active tab/chip underline, nav links, error text |
| `accentInk` | `#FFFFFF` | Text on top of a solid `accent` fill |
| `disabled` | `#D8CFB8` | Disabled buttons, progress-bar track |
| `neutralFallback` | `#A8A093` | Warm stand-in for any unmatched food-color lookup |

`accent` is intentionally reused for both primary CTAs and error/negative states — the brief calls for a *single* accent, so no second red is introduced for errors.

## Type scale (`theme.ts` → `fonts` / `type`)

| Role | Font | Size/Line-height | Used for |
|---|---|---|---|
| `display` | Fraunces 700 | 32/38 (screen titles use 28–30 locally) | Screen titles, eatery-detail headline |
| `headline` / `headlineSmall` | Fraunces 600 | 22/28, 17/22 | Section headlines |
| eatery/meal names | Fraunces 600 | 19–21 | `CraftedMealsList`, `DiaryScreen` meal cards |
| `editorialItalic` / rationale | Fraunces 500 Italic | 14/20 | Meal rationale copy, empty states ("Nothing logged yet today.") |
| `body` | Archivo 400 | 15/22 | Body copy, item names, instructional text |
| `kicker` | Archivo 600, uppercase, +0.8 tracking | 12/16 | Nav links, section labels, category headers, form field labels |
| `button` | Archivo 600 | 15/20 | All button labels |
| `caption` | Archivo 400 | 12/16 | Least-emphasis captions |
| `mono` / `monoEmphasis` | IBM Plex Mono 400/500 | 13/18, 15/20 | **Numeric data only** — calories, grams, macro totals, progress figures, numeric form inputs |

Rule: Fraunces is for editorial content (names, rationale, headlines). Archivo is for UI chrome and prose (labels, buttons, instructional copy, free-text areas — e.g. `PreferencesForm`'s "Foods you like" textarea stays Archivo because it's prose, not data). IBM Plex Mono is reserved strictly for numbers, giving nutrition data a spec-sheet feel without turning the whole app technical.

## Spacing & layout

`theme.ts` → `space`: `xs 4, sm 8, md 12, lg 16, xl 24, xxl 32, xxxl 48`. All screens keep the existing `maxWidth: 640` centered-content convention.

## Radius

`theme.ts` → `radius.none = 0`. Applied everywhere: buttons, inputs, progress bars. One explicit exception, functional data-viz rather than UI chrome:
1. `colorDot` legend swatches in `CraftedMealsList.tsx` (`borderRadius: 5`, circular by necessity).

## Boxes → whitespace + rule

| Old pattern | Replacement |
|---|---|
| `progressCard` (bg + `borderRadius:12` box) | Plain `View`, hairline bottom-border closing the section |
| `mealCard` (`borderWidth`+`borderRadius` box) | Hairline bottom-border + vertical padding only |
| Pill `tab`/`tabActive` (border + black fill) | Underline tabs — 2px `accent` bottom-border on the active tab, no fill |
| Pill `chip`/`chipSelected` (border + black fill) | Flat text with a 2px `accent` underline when selected, no fill |
| Boxed `gramsInput` / `numberInput` (border + radius) | Underline input (`borderBottomWidth: 1`), mono font for the value |
| Boxed `textArea` | Underline input, Archivo (prose, not data) |
| `logButtonDone` (green fill) | `accent`-outline button (no second hue introduced) |

Rows that were already hairline-only (`weekRow`, `itemRow` in `EateryDetailScreen`, the `eatery` block in `CraftedMealsList`) keep that pattern, just recolored to `colors.hairline`.

## Exception: `foodColors.ts`

`foodColors.ts` is functional data-visualization, not brand chrome: it assigns a wide, distinct hue per food item (with semantic keyword rules and per-call collision avoidance in `assignPlateColors`) so the `colorDot` legend swatch next to each item name is visually scannable. It is explicitly exempt from the core palette above and left untouched.

## Portion legibility: `foodDensity.ts`

We tried a plate-shaped chart (pie/donut, then a density-corrected version, then a horizontal-bar and a food-role-grouped variant) and dropped the idea — charts make you compare angles/areas, which people are bad at, and no amount of correction fixed that. Instead, `foodDensity.ts` exports `describePortion()`, which turns a gram count into a plain-language volume estimate using the same coarse density heuristic (`relativeVolume()`) that would have driven the chart: `Grilled Salmon (170g · ≈ ¾ cup)`. This is the app's actual answer to "grams don't map to volume" — say it in words next to the number, don't try to draw it. Used in `CraftedMealsList.tsx`, `DiaryScreen.tsx`, and live (as you type a gram value) in `EateryDetailScreen.tsx`.

## Font loading

`App.tsx` loads Fraunces (500, 500 Italic, 600, 600 Italic, 700), Archivo (400, 500, 600), and IBM Plex Mono (400, 500) via `expo-font`'s `useFonts` hook before rendering any screen, reusing the app's existing loading-state `ActivityIndicator` as the gate (no separate splash-screen setup — this app is tested via `expo start --web` and has no splash config today).

## Verification checklist

- [ ] No `Inter`/`Roboto`/system-font family ever resolves in `getComputedStyle(...).fontFamily` on any title, body, or numeric element.
- [ ] No purple/indigo/gradient anywhere; the only saturated color is Cornell Red (plus the exempted `foodColors.ts` palette on `colorDot` swatches).
- [ ] No `borderRadius` above ~2px anywhere except `colorDot`.
- [ ] No bordered/background "card" boxes remain around meal rows, the progress section, or chip/tab groups — hairline rules only.
- [ ] All 5 screens (logged out, survey, crafted meals, eatery detail, diary) render real Cornell dining content, never placeholder copy.
- [ ] Gram inputs, preference toggles, and "Log meal" flows still function end-to-end.
