# Exercise Entries: activity + duration with an estimated burn, added to the day's budget

The tracking pivot (wayfinder map #49) includes manual exercise logging; Health/wearable sync is out of scope. MyFitnessPal's Diary formula is **Remaining = Goal − Food + Exercise**. Two things make copying it directly risky here: students rarely know how many calories a workout burned, and our Recommended Targets already multiply BMR by an **Activity Level** labelled by workout frequency ("Moderate (3–5x/wk)"), so adding logged workouts on top double-counts them.

## Decision

**An Exercise Entry is an activity plus a duration; the server estimates the burn.** The user picks from a short list of activities common at Cornell (walking, running, cycling, stationary bike, elliptical, weight training, swimming, rowing machine, HIIT/circuit, basketball, soccer, tennis, yoga, dancing, climbing, hiking) or "Other", and types minutes. The burn is

> calories = (MET − 1) × weight_kg × hours

using approximate values from the Compendium of Physical Activities. Subtracting 1 MET removes the resting burn that BMR already counts, so the figure is the *extra* energy the workout cost. The table lives in one backend module (`app/services/exercise.py`) and is served to the client.

**The user can type the calories instead.** "Other" always needs typed calories, and so does any activity when the user has no weight on file (manual Target Mode never asks for one). A typed number is stored as entered within sanity bounds (1–3000 cal, 1–600 min), the same trust exception as Quick Add (ADR 0024) and for the same reason: it's the user's own claim, about something the app has no data for.

**Exercise adds to the day's calorie budget by default:** Remaining = Goal − Food + Exercise. Only calories change; macro targets stay as they are (MyFitnessPal does the same by default, and scaling macros would make the bars move under the user mid-day).

**Double-counting with Activity Level is handled with copy and a switch, not by redefining Activity Level.** Redefining it as "your day without workouts" would silently change every existing user's Recommended Targets. Instead:
- The preferences form says, under Activity Level: if you log workouts in the Diary, pick the level for your days without them, or turn off "Add exercise to my budget".
- A per-user preference, `exercise_adds_to_goal` (default on), drops Exercise from the formula when off. Entries are still listed and still show their burn.

**Display:** an Exercise block after Snacks on every Diary day (MyFitnessPal's position), one row per entry, with its own total and an "+ Add exercise" link. The pinned summary adds "+ Exercise" to the formula only on days that have some, so most days don't carry a "+ 0". The 7-day summary returns each day's exercise so the week bars can compare food to goal + exercise.

**Days:** any day up to today, like Quick Add.

## Alternatives considered

- **Calories typed directly.** Simplest, but most students don't know the number, and a guess inflates the budget. Kept as the fallback, not the main path.
- **Gross MET burn (MET × kg × hours), as most calculators show.** Overstates by the resting burn already in BMR, about 70–90 cal per hour for a typical student. Rejected.
- **No eat-back, display only.** Safest against double-counting, but it isn't what users expect from the benchmark and makes logging exercise pointless for the budget. Kept as the opt-out.
- **Partial eat-back (e.g. 50%).** A common coaching heuristic, but an unexplained fraction in the formula reads as a bug. Rejected.
- **Redefine Activity Level to exclude workouts.** Correct in the long run, but changes existing users' targets without them doing anything. Can be revisited with onboarding (wayfinder #59).

## Consequences

- New table `exercise_entries` (activity key, label, minutes, calories, whether calories were typed). New preference column `exercise_adds_to_goal`.
- Endpoints: `GET /exercise/activities`, `POST/GET /exercise`, `PATCH/DELETE /exercise/{id}`. `DaySummary` gains `exercise_calories`.
- The weight used for the estimate is the preference's `weight_kg`; once the weight log exists (wayfinder #55) it should be the latest logged weight.
- Crafted Meals sizing to the remaining budget (wayfinder #56) should use the same Remaining figure, exercise included when the switch is on.
