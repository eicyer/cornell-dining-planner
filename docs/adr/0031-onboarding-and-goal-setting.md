# Onboarding and goal setting: two short steps to the Diary, a Weekly Pace, and everything else deferred

The tracking pivot (wayfinder map #49) makes the Diary the product, so onboarding's job is getting a new user to a sensible calorie target and their first logged meal. Today a new user lands on the full Preferences form: four collapsible sections and about 25 inputs (body stats, Health Goal, Macro Style, four target fields, meals per day, the exercise switch, Hard Constraints, Eating Styles, liked/disliked free text). ADR 0027 already dropped the forced Food Preference Survey. MyFitnessPal's top onboarding complaint is "too many questions", and it asks for a weekly pace ("lose 1 lb/week") rather than a percentage.

## Decision

**A new user gets a two-step Setup, then lands on the Diary.**

1. **Your goal.** Units, age, sex, height, weight, Activity Level, Health Goal and, for lose/gain, a **Weekly Pace**. The screen shows the resulting Recommended Targets (calories in the headline, macros on one line) as soon as everything is filled in. "Enter my own numbers instead" opens the full Preferences form.
2. **Anything you can't eat?** Diet Restrictions and allergens (Hard Constraints), skippable, with the existing AI-estimated-allergen caveat. It's here and not deferred because it's the one thing that keeps a Crafted Meal from suggesting food the user can't eat. The Diary itself doesn't need it.

Saving step 2 (or skipping it) writes the preferences with `target_mode = recommended` and opens the Diary.

**Deferred to Preferences (More tab), with defaults:**
- Macro Style: Balanced.
- Meals per day: 3, relabelled "Meals per day (for suggested meals)". It only sizes Crafted Meals (ADR 0008/0027), so it doesn't belong in a tracker's first run.
- Logged exercise adds to the budget: on (ADR 0025).
- Eating Styles and liked/disliked foods: empty (Soft Preferences only rank; ADR 0009).

**Weekly Pace replaces the fixed-percentage shift for anyone who picks one.** Lose: 0.25 or 0.5 kg/week (shown as ½ or 1 lb/week in imperial). Gain: 0.25 kg/week. The daily adjustment is `pace × 7700 kcal/kg ÷ 7` (≈275 or ≈550 cal), capped at 25% of TDEE for a deficit and 20% for a surplus, then clamped to the existing floor and ceiling. A null pace keeps the old −20% / +15% shift, so existing users' targets and Recalculate (ADR 0026) behave exactly as before until they pick a pace. There's no 2 lb/week option: for most students it would hit the floor anyway, and the module's "no extremes" stance means the offered options must already be the sane ones.

**Macro goals stay in grams, and Macro Style stays.** Percent presets would be a second way to say what Macro Style already says. The grams are what the Diary shows.

**Floors and copy.** The recommender's floor is unchanged (1,200 cal female, 1,500 male) and manual targets keep their 1,000 cal hard bound. When the floor kicks in, the recommendation says so: "That pace would put you under 1,200 cal, so we've set 1,200, the lowest we recommend. A slower pace gets you there more steadily." `recommend-targets` returns `floor_applied` for this. Copy stays neutral and never says "diet" or "cheat". There's no in-Diary "you ate too little" warning in v1. The Diary already shows "over" neutrally, and a nag about under-eating needs careful wording that belongs with the wellbeing guardrails item on the map, not here.

**Existing users are untouched.** Anyone with saved preferences boots straight to the Diary, as today. Setup only runs when `GET /preferences` 404s. Their `weekly_pace_kg` is null, which keeps the percentage shift.

## Alternatives considered

- **Keep the full form as onboarding, with sections collapsed.** It's still a wall of 25 inputs, and first-run users don't know which ones they can skip.
- **Ask nothing; start at a default 2,000 cal and nudge later.** Fastest to the Diary, but "calories remaining" against a made-up number makes the headline meaningless on day one, and a tracker with a wrong budget is worse than one more screen.
- **Hard Constraints deferred too.** One fewer screen, but the first Crafted Meal could then suggest a peanut dish to someone allergic. It costs one tap to skip.
- **Weekly pace as free numeric input.** It invites 3 lb/week, and then the floor silently overrides the number the user typed.
- **Per-section calorie goals instead of meals per day.** MyFitnessPal has them, but nothing in the Diary uses them yet, and Crafted Meals already size to what's left today (ADR 0027).

## Consequences

- `user_preferences.weekly_pace_kg` (nullable float). It's accepted by `PUT /preferences` and `POST /preferences/recommend-targets` (lose: 0.25/0.5; gain: 0.25; must be null for maintain) and used by Recalculate.
- `POST /preferences/recommend-targets` also returns `floor_applied`.
- New frontend `SetupScreen` (route `Setup`) for first run. `Survey` (the full Preferences form) stays the edit path from More and the "own numbers" escape hatch.
- The Preferences form gains the Weekly Pace chips and floor copy, and relabels meals per day.
