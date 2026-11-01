# Weight log and the Progress screen

The tracking pivot (wayfinder map #49) includes a weight log with a progress chart. The app already stores one `weight_kg` on UserPreference, typed during onboarding and used only to compute Recommended Targets (and, since ADR 0025, to estimate exercise burn). The audience is college students, so weight features are wellbeing-sensitive: MyFitnessPal's weigh-in nags, its goal weight and its "in 5 weeks you'll weigh…" projection are the parts we don't want to copy.

## Decision

**Weigh-ins are their own history; `UserPreference.weight_kg` keeps its meaning.** A new `weight_entries` table holds at most one weigh-in per user per day (logging again that day replaces it), stored in kg. `UserPreference.weight_kg` stays "the weight your Recommended Targets were computed from" and doesn't change when a weigh-in is logged.

**Targets never change on their own.** When Target Mode is Recommended and the latest weigh-in is at least 1 kg (about 2 lb) away from the weight the targets used, Progress offers a one-tap "Recalculate my targets" (`POST /preferences/recalculate-targets`). It recomputes from the stored profile with the latest weight and saves both. Users with manual targets aren't prompted; their numbers are theirs.

**Exercise estimates use the latest weigh-in**, falling back to the preference weight (amends ADR 0025's consequence note).

**Log when you want; no nudges.** Nothing prompts a weigh-in. Reminders, if any, are decided with streaks (wayfinder #60) and must not include weigh-ins by default.

**Units are one saved setting.** The preferences form's lb/kg (imperial/metric) switch becomes a saved preference, `unit_system`, defaulting to imperial, and Progress displays weights in it. Storage stays kg.

**Progress screen, v1:**
1. **Weight**, which only appears as a chart once there's a weigh-in (opt-in by use). It shows the latest weight, the change over 30 days in neutral ink (never red or green), a 90-day line with no goal or target line, a "Log weight" form, and recent weigh-ins with delete.
2. **Calories**: the 7-day bars move here from the Diary, so the Diary is about one day as in MyFitnessPal. Below them, a 4-week average of food against budget on the days that have anything logged.
3. **Consistency**: days logged out of the last 28.

**Dropped from the benchmark:** goal weight, weight projections, weigh-in reminders, BMI.

**Placement:** until the navigation decision (wayfinder #57) lands, Progress is a third section in the masthead nav (Today · Diary · Progress).

## Alternatives considered

- **Each weigh-in overwrites `UserPreference.weight_kg`.** No new table for the "current weight", but Recommended-mode targets would either silently drift with every weigh-in or go out of sync with the weight shown in Preferences. Rejected.
- **Auto-recalculate targets on each weigh-in.** MyFitnessPal does this. Daily weight noise of ±1 kg would move the calorie goal around day to day, and a student losing weight would see their budget shrink without asking. Rejected for an explicit prompt.
- **Separate lb/kg setting just for weight.** Two unit controls that can disagree. Rejected for one `unit_system`.
- **Most-eaten halls and foods on Progress.** Dining-hall flavor MyFitnessPal can't have, but not needed to judge the pivot. Left in the map's fog with the weekly digest.

## Consequences

- New table `weight_entries` (unique per user and date) and a `unit_system` preference column.
- Endpoints: `GET /weight?days=`, `PUT /weight/{date}` (upsert), `DELETE /weight/{date}`, `POST /preferences/recalculate-targets`.
- The Diary loses its "Last 7 days" block; it lives on Progress.
