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
- No `borderRadius` above `0` except the named exception below.
- No bordered/background "card" boxes for grouping content. Use whitespace and, where a boundary is truly needed, one 1px hairline rule.
- No Lorem ipsum, no "Feature one / Feature two" placeholder copy. Every string in the UI is either real Cornell dining data or specific, concrete instructional copy (e.g. "e.g. chicken, spicy food, Asian flavors", not "Enter your preference").

### Tracker exceptions (wayfinder #62, `docs/adr/0033`)

The tracking pivot needs a denser, stickier screen than a menu card. These are the only relaxations of the rules above, each with the boundary it must not cross:

1. **Pinned surfaces.** `CalorieSummary` (pinned over the Diary) and the bottom trays (`EateryDetailScreen`'s Log tray, Add Food's "Added … · Undo" tray) may carry an opaque `paper` background so content scrolls under them, with one `hairline` on the edge facing the content. They are never a different fill color, never shadowed, never rounded, never floating or inset from the screen edge. A surface, not a card.
2. **Ink section rule.** A Meal Section or the Exercise block starts with a 1px `ink` rule under its header. It's the one rule that isn't `hairline`, and it marks a section *start* only, never a row.
3. **Density.** Diary and Add Food rows use `space.xs`–`space.sm` vertical padding, 14px body and 12px mono, tighter than Crafted Meal cards. Rows still get no box, and every tappable row or control still reaches `touchTarget.min` through `hitSlop`.

Nothing else relaxes. In particular, no rings, no colored macro coding, no badges, no celebration graphics (`docs/adr/0032`).

## Palette (`theme.ts` → `colors`)

| Token | Hex | Usage |
|---|---|---|
| `paper` | `#F7F3EA` | Screen background everywhere |
| `ink` | `#1C1A17` | Primary text, active states |
| `inkSecondary` | `#6B6355` | Secondary text — captions, rationale, inactive labels |
| `inkTertiary` | `#9C9483` | Placeholder text, least-emphasis captions |
| `hairline` | `#E4DCC8` | The *only* divider mechanism — replaces every border/box |
| `accent` | `#B31B1B` | Cornell Red. The single saturated color: primary CTAs, active tab/chip underline, current-tab rule in `TabBar`, error text |
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
| Four all-`accent` kicker links jammed into the right half of the title row (`CraftedMealsList`, `DiaryScreen`) | A masthead bar (`TopNav`), since replaced by the bottom `TabBar` and the More tab — see `docs/adr/0029` |

### `Disclosure`: sectioning long forms

`PreferencesForm` was one ~400-line continuous scroll of every question the app asks. `components/Disclosure.tsx` breaks it into four collapsible sections (Daily targets / Diet & allergens / Eating style / Foods you like & dislike), one open at a time.

The section header is what "a nice looking button" means in this system — not a filled pill or a rounded card, but a full-width pressable row carrying a mono step number, a Fraunces title, a **live one-line summary of the section's current answers**, and a chevron that rotates on open. Hairline rules top and bottom do the grouping a box would do elsewhere. The summary is what makes this a disclosure rather than just hidden fields: collapsed, every answer is still readable, so the page is a scannable overview instead of a wall of inputs.

- Sections whose summary is a placeholder render it in the app's existing italic empty-state voice (`Fraunces_500Medium_Italic`, `inkTertiary`) — the same treatment as "Nothing logged yet today."
- `summaryMono` is opt-in and set on the targets section only; a summary listing allergens or food names is prose and stays in Archivo.
- First-time setup opens section 1 and each section ends in a "Next: …" accent link; returning to edit opens nothing, so the screen loads as a summary.
- Motion: the chevron rotation and the body's fade/slide-in run on `Animated` (works on web); the height change additionally uses `LayoutAnimation` on native only, since react-native-web doesn't implement it.

### Live figures over static fields

The targets section computes as you type rather than waiting for a save to reveal a problem: whether the three macro targets actually add up to the calorie goal (4/4/9 cal per gram), and what one meal's share looks like at the current `meals_per_day`. When the macros don't add up, `accent` marks the line and a one-tap "Set carbs to Ng to make it add up →" link fixes it — the same warning role `accent` already plays on an over-goal `ProgressBar`, not a new hue. The target `NumberField`s also gained `+`/`–` steppers (50 cal, 5g, 1 meal) reusing `PortionStepper`'s bordered-square idiom; the body-stat fields (age/height/weight) deliberately don't have them, since those are typed once, not adjusted by feel.

Right under the Calories field, a live "Average split for 2,200 cal: 110g protein · 275g carbs · 73g fat" line suggests a population-average macro split (AMDR midpoints, rounded to the commonly-cited 20% protein / 50% carb / 30% fat) the instant a calorie number is entered, with a "Use these →" link that fills the three fields below. This is deliberately separate from the body-stat "Recommend for me" tab's `recommend_targets` call (`backend/app/services/tdee.py`) — that one is personalized (age/sex/weight/activity/goal) and computed server-side; this one only reacts to whatever calorie number is currently typed, needs no round trip, and is there specifically for someone in "Enter my own numbers" mode who knows their calorie target but not how to split it.

### `TabBar`: four bottom tabs (replaces `TopNav`)

The app navigates with four bottom tabs, Diary · Menus · Progress · More (`docs/adr/0029`). The bar is one `hairline` rule above icon-over-kicker tabs. The **current** tab is `ink` with a 2px `accent` rule along its top edge, which is the underline-tab idiom turned over for a bar at the bottom; the others are `inkSecondary`. No filled pill, no badge counts, and `accent` still only marks *where you are*. Each tab is about 50pt tall, so it clears `touchTarget.min` without `hitSlop`. Account links (Preferences, Taste quiz, Meal prefs, Log out) moved from the old masthead into the More tab as plain hairline rows.

Status-bar/notch clearance on tab screens comes from `TopInset` (`useSafeAreaInsets()`), the job `TopNav` used to do; pushed screens keep their flat native header.

Rows that were already hairline-only (`weekRow`, `itemRow` in `EateryDetailScreen`, the `eatery` block in `CraftedMealsList`) keep that pattern, just recolored to `colors.hairline`.

## Exception: `foodColors.ts`

`foodColors.ts` is functional data-visualization, not brand chrome: it assigns a wide, distinct hue per food item (with semantic keyword rules and per-call collision avoidance in `assignPlateColors`) so the `colorDot` legend swatch next to each item name is visually scannable. It is explicitly exempt from the core palette above and left untouched.

## Portion legibility: `foodDensity.ts`

We tried a plate-shaped chart (pie/donut, then a density-corrected version, then a horizontal-bar and a food-role-grouped variant) and dropped the idea — charts make you compare angles/areas, which people are bad at, and no amount of correction fixed that. Instead, `foodDensity.ts` exports `describePortion()`, which turns a gram count into a plain-language volume estimate using the same coarse density heuristic (`relativeVolume()`) that would have driven the chart: `Grilled Salmon (170g · ≈ ¾ cup)`. This is the app's actual answer to "grams don't map to volume" — say it in words next to the number, don't try to draw it. Used in `CraftedMealsList.tsx`, `DiaryScreen.tsx`, and live (as you type a gram value) in `EateryDetailScreen.tsx`.

## Font loading

`App.tsx` loads Fraunces (500, 500 Italic, 600, 600 Italic, 700), Archivo (400, 500, 600), and IBM Plex Mono (400, 500) via `expo-font`'s `useFonts` hook before rendering any screen, reusing the app's existing loading-state `ActivityIndicator` as the gate (no separate splash-screen setup — this app is tested via `expo start --web` and has no splash config today).

## Interaction layer (`theme.ts` → `motion` / `iconSize` / `touchTarget` / `interaction`)

Added for the mobile interactivity pass: native navigation transitions, a small icon set, and data visualization. These are additive — none of the rules above change.

| Token | Values | Usage |
|---|---|---|
| `motion` | `fast 150, base 250, slow 400` (ms) | In-page animation only — a `ProgressBar` fill animating to a new value on load. Screen-to-screen transitions are React Navigation native-stack's platform-native push/pop and don't use these. |
| `iconSize` | `sm 16, md 20, lg 24` | Every `Icon` usage. No icon is ever sized ad hoc per screen. |
| `touchTarget` | `min 44` | Minimum rendered size (or `hitSlop`) for every tappable element, enforced inside the shared `Button`/`Chip`/`Tab` components in `frontend/components/`. |
| `interaction` | `pressedOpacity 0.6` | The one press-feedback mechanism app-wide, generalizing the border-color swap `FoodSurveyScreen.tsx`'s `optionPressed` already used. |

### Icons

A minimal set (`lucide-react-native`, wrapped by `components/Icon.tsx`) is used sparingly:

**Always import icons via their subpath** — `import ThumbsUp from 'lucide-react-native/icons/thumbs-up'` (default export, kebab-case filename) — never `import { ThumbsUp } from 'lucide-react-native'`. The barrel entry re-exports all ~1,800 icons from one module; Metro's dev bundler pulled in the entire icon set for a 3.5MB bundle-size regression from importing just three icons that way. The subpath form is a real, tree-shakeable module per icon.

- Color is always `ink`, `accent`, or `inkSecondary` — never a fourth hue, never on a filled/colored chip or circle background. An icon sitting in a pale rounded-square background, repeated per row, is exactly the generic "AI app" pattern this system exists to avoid.
- Reserved for stand-alone navigational glyphs (the back chevron replacing the old `← Back` text link) and a few specific data affordances (meal rating, nutrition-confidence marker). Arrows embedded in button copy (`Log this meal →`, `Sign in with Google →`) stay as text — turning every button into icon+text risks clutter the approved target mock never had.
- Never used as a repeated per-row decorative bullet. If a screen wants one, that's a sign it's reaching for the icon-grid pattern, not solving a real legibility problem.

### Macro figures: no new colors

Calorie/Protein/Carb/Fat are, and remain, distinguished by **position and label only** — never by color — exactly as `DiaryScreen.tsx`'s original `ProgressRow` already did. Different nutrition apps use wildly inconsistent macro color conventions (protein is orange in one app, blue in another); rather than invent a fourth convention, this system doesn't color-code macros at all.

**On-track vs. over-target is weight-coded, not hue-coded**: a `ProgressBar`/`BarTrack` fills `ink` while the value is under goal, and switches to `accent` once at/over goal — reusing the palette section's existing rule that `accent` already doubles as the error/negative-state color, rather than introducing a third hue for "warning." A bar that goes over caps its visual fill at 100% width with a short mono caption (e.g. `+38g over`) so "over" is legible from the number, not just inferred from a color swap.

### Diary: MyFitnessPal's layout, Editorial surface

The Diary (`DiaryScreen.tsx`) follows MyFitnessPal's Today layout for the tracking-first pivot (wayfinder map #49) without borrowing its look:

- **`WeekStrip`**: Sunday-first week of days. The selected day takes the active-`Tab` treatment (2px `accent` underline, no fill), today is set in `monoEmphasis` weight, and future days are inert in `disabled`.
- **`CalorieSummary`**, pinned with `stickyHeaderIndices` while the sections scroll under it (an unpinned summary was MyFitnessPal's top redesign complaint). It shows `Goal − Food = Remaining` as a mono spec-sheet line, with Remaining as the screen's one large figure (28px `monoEmphasis`), one calorie `BarTrack`, then protein/carbs/fat as three labeled mini-bars. It has an opaque `paper` background and a closing hairline: a surface so content can scroll under it, not a box. Over goal follows the weight-coded rule: Remaining and the bar switch to `accent` and the label reads "Over".
- **`MealSectionBlock`**: the four fixed Meal Sections (docs/adr/0023), always rendered. The header is a Fraunces section name with a mono section total, closed by a **1px `ink` rule**. That's the one place a rule is ink rather than `hairline`: it marks a section start, the way a menu card rules off a course. Each Logged Meal in it sits under a kicker eatery label, with one row per food: name and a portion caption on the left, mono calories right-aligned. "+ Log lunch" is an `accent` kicker link, shown only for today.

This replaced the old `ProgressRing` (today's calories as a single ring). A ring doesn't survive being pinned at a usable height, and the formula's Remaining figure answers "how's today going" more directly. The component was removed. Any future ring, per macro or per food, is multi-series and falls back under `foodDensity.ts`'s plain-language rule.

### Tracker components: rows, exercise, weight, Setup, streak

Decided in wayfinder #62 against what the pivot built:

- **Row interaction: tap, never swipe.** A food row's edit affordance is the meal's pencil (`LoggedMealCard`). A Quick Add or Exercise row is itself pressable and opens its inline editor in place, where Delete lives behind a confirm step. No swipe-to-delete: it's invisible on web (our primary platform), it collides with iOS's edge swipe-back, and destructive actions should be visible, not gestural.
- **Macros: bars, not rings.** Three labeled mini-bars under the calorie bar, distinguished by position and label (see *Macro figures* above). A ring per macro is multi-series data viz and falls under the `foodDensity.ts` lesson.
- **Exercise on Today** is the last block of the Diary and uses the Meal Section idiom (Fraunces name, mono total, ink rule, "+ Add exercise" accent kicker). Burned calories enter `CalorieSummary` as their own term, not as a negative food row.
- **Weight is not on Today.** Weigh-ins live on Progress (`docs/adr/0026`); the Diary stays about food, and a daily weight number on the home screen invites the checking behaviour the wellbeing defaults avoid.
- **Setup** (`SetupScreen`, `docs/adr/0031`) is a step kicker ("STEP 1 OF 2"), a Fraunces title, then the same underline fields and chips as Preferences. The live budget appears under a hairline as one 28px `monoEmphasis` figure, the same treatment as `CalorieSummary`'s Remaining, with macros on one mono line under it. Floor copy is a plain caption, never `accent`: it's information, not an error.
- **Secondary button** (`Button variant="secondary"`): a 1px `ink` border with `ink` text on `paper`, for the "back out" action next to a primary one (Cancel beside Add to diary, or in the Add Food picker). It's square like every button and is never `accent`, so it can't compete with the primary action.
- **Add Food portion picker** (`docs/adr/0034`): tapping a food's name opens `PortionStepper` inline under the row, with live mono calories and Cancel / "Add 1½ scoops". The open row drops its hairline, so the row and picker close as one block under a single rule. "+" stays the one-tap add.
- **Units in the field:** body-stat inputs carry their unit as a mono `inkSecondary` suffix (`5 ft 9 in`, `150 lb`). The units switch is an `accent` kicker link on the Height label row ("Use cm · kg"), not a separate tab row people scroll past (`components/BodyStatsFields.tsx`).
- **Logging Streak** (`docs/adr/0032`) is a single `caption` line (`inkTertiary`) under the `WeekStrip`, with no accent, flame or badge. On Progress it's a caption under Consistency.

## Verification checklist

- [ ] No `Inter`/`Roboto`/system-font family ever resolves in `getComputedStyle(...).fontFamily` on any title, body, or numeric element.
- [ ] No purple/indigo/gradient anywhere; the only saturated color is Cornell Red (plus the exempted `foodColors.ts` palette on `colorDot` swatches).
- [ ] No `borderRadius` above ~2px anywhere except `colorDot`.
- [ ] No bordered/background "card" boxes remain around meal rows, the progress section, or chip/tab groups — hairline rules only.
- [ ] Every screen (logged out, Setup, Preferences, Diary, Add Food, Menus, Eatery Detail, Progress, More, the surveys) renders real Cornell dining content or the user's own data, never placeholder copy.
- [ ] Gram inputs, preference toggles, and "Log meal" flows still function end-to-end.
- [ ] No icon ever sits inside a colored/filled chip or circle background.
- [ ] No icon uses a color outside `ink` / `accent` / `inkSecondary`.
- [ ] Every `ProgressBar` / `BarTrack` renders a real fetched value — no placeholder/demo percentage left in from development.
- [ ] The Diary's `CalorieSummary` stays pinned while scrolling on web and native, and nothing scrolling under it shows through.
- [ ] Pinned surfaces and trays are `paper` with one hairline edge: no shadow, radius, inset, or second fill color.
- [ ] No swipe gesture is the only way to reach an action.

## Touch-target audit (Phase 6)

Computed from rendered style values (padding + line-height + hitSlop), not measured on a physical device — no device/simulator was available in the environment this pass ran in. Re-verify on a real device before shipping; the arithmetic below is the best available substitute, not a replacement for it.

| Element | Before | After | How it clears 44pt |
|---|---|---|---|
| `Chip` / `Tab` (shared components) | Tab: 24px content + 16px hitSlop = 40px (short) | Tab hitSlop → 12/6: 24 + 24 = 48px | hitSlop only — visual size unchanged, density preserved |
| `Button` (shared component) | N/A (new) | `minHeight: touchTarget.min` | Direct backstop, independent of label length |
| Diary rate icons (👍/👎 → `ThumbsUp`/`ThumbsDown`) | hitSlop 10: 16 + 20 = 36px (short) | hitSlop 14: 16 + 28 = 44px | hitSlop; `rateButtons` gap bumped to `space.xxl` (32) so the two opposite-meaning targets' hit areas don't overlap (14+14=28 needed) |
| `EateryDetailScreen` gramsInput | ~26px (short) | `minHeight: touchTarget.min`, width unchanged at 56 | Direct backstop — width stays narrow (numeric entry doesn't need to grow) |
| `PreferencesForm` `NumberField` input | ~36px (short) | `minHeight: touchTarget.min` | Direct backstop |
| Kicker nav links (Preferences/Diary/Log out/etc.) | ~16px, zero padding (short) | Retired with `TopNav` (`docs/adr/0029`); `TabBar` tabs are ~50pt and More-tab rows are `minHeight: 44` | Real box size, no hitSlop needed |
| `EateryDetailScreen` "Compare today's picks" / `FoodSurveyScreen` "Skip" | ~16px, zero padding (short) | `paddingVertical: space.sm` + hitSlop 6 = 44px | Same pattern, single standalone link so no adjacency concern |
| Sticky tray "Log Meal" (`EateryDetailScreen`), all `Button` usages | Already ≥44 by construction | — | `Button`'s `minHeight` |

Primary-CTA placement: `EateryDetailScreen`'s "Log Meal" stays in a sticky bottom tray (bottom-third, one-handed reach — unchanged from the original design). `CraftedMealsList`'s per-eatery "Log this meal" buttons are inline in a scrolling list of independent actions (no single "bottom" applies to a repeated per-item action) — reviewed, not a violation. `PreferencesForm`'s Save button sits at the end of a long scroll; this is the same length/structure question Phase 7 already flags as open, not something to silently resolve here.
