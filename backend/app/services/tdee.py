"""TDEE-based target recommendation.

Mifflin-St Jeor for BMR (the modern standard, more accurate across body
types than Harris-Benedict), an activity multiplier for TDEE, then a
goal-based calorie adjustment and a protein-first macro split. Every output
is clamped to widely-cited safe bounds — this recommends a sane starting
point, not medical advice, and should never hand back a crash-diet-level
deficit or a reckless surplus even if the raw math would produce one.
Manual entry always remains available (see PreferencesIn) for anyone who
wants to bypass this and log their own numbers — this module only powers
the optional "recommend for me" path.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.db.models import ActivityLevel, HealthGoal, MacroStyle, Sex

ACTIVITY_MULTIPLIERS: dict[ActivityLevel, float] = {
    ActivityLevel.sedentary: 1.2,
    ActivityLevel.light: 1.375,
    ActivityLevel.moderate: 1.55,
    ActivityLevel.active: 1.725,
    ActivityLevel.very_active: 1.9,
}

# Fraction of TDEE to move by for each goal. Kept well inside generally-cited
# safe ranges (10-25% deficit, up to ~15-20% surplus) since this app only
# offers one option per direction — that option has to already be the sane
# one, there's no "aggressive" variant to guard separately.
GOAL_ADJUSTMENT_FRACTION: dict[HealthGoal, float] = {
    HealthGoal.lose_weight: -0.20,
    HealthGoal.maintain_weight: 0.0,
    HealthGoal.gain_weight: 0.15,
}

# Never recommend below this regardless of how the deficit math works out —
# commonly-cited safe minimums below which a diet needs clinical
# supervision, not an app.
MIN_SAFE_CALORIES: dict[Sex, float] = {Sex.male: 1500, Sex.female: 1200}
MAX_SAFE_CALORIES = 4500.0

PROTEIN_G_PER_KG: dict[HealthGoal, float] = {
    HealthGoal.lose_weight: 2.0,  # higher to preserve lean mass in a deficit
    HealthGoal.maintain_weight: 1.6,
    HealthGoal.gain_weight: 1.8,
}

# high_protein layers this on top of the goal-driven PROTEIN_G_PER_KG above
# rather than replacing it — losing weight on high_protein should still
# out-protein maintaining on balanced. Kept modest (the highest combined
# case, lose_weight + high_protein, lands at 2.5g/kg) to stay inside
# commonly-cited safe upper ranges rather than another "no extremes"
# exception like keto below. The calories this claims come straight out of
# carbs (fat fraction is unchanged from balanced) — that's the "at the
# expense of variety/other macros" behavior this style is for.
PROTEIN_G_PER_KG_BOOST_BY_MACRO_STYLE: dict[MacroStyle, float] = {
    MacroStyle.balanced: 0.0,
    MacroStyle.lower_carb: 0.0,
    MacroStyle.keto: 0.0,
    MacroStyle.high_protein: 0.5,
}

# Macro Style shifts the fat/carb split — protein stays goal-driven (plus
# the optional boost above) regardless. "Lower carb" and "high_protein" are
# moderate tiers, consistent with the "no extremes" rule this module
# otherwise enforces on calories. "keto" is the deliberate exception: fat
# ~75% of calories is genuinely keto-level, not a moderate tier — see
# MAX_NON_CARB_KCAL_FRACTION_BY_MACRO_STYLE below for the other half of
# what makes that actually reach a keto-range carb count.
FAT_FRACTION_BY_MACRO_STYLE: dict[MacroStyle, float] = {
    MacroStyle.balanced: 0.28,
    MacroStyle.lower_carb: 0.45,
    MacroStyle.keto: 0.75,
    MacroStyle.high_protein: 0.28,
}

# Guards against protein+fat eating the whole calorie budget (see the scale
# step in recommend_targets) — this is the mandatory carb floor, as a
# fraction of total calories protein+fat are allowed to claim before carbs
# get squeezed to fill whatever's left. 0.85 (a ~15% carb floor) is that
# guardrail for every style except keto: a true keto diet needs carbs able
# to shrink well below 15% of calories, which is the whole point of the
# style, so its cap is deliberately looser.
MAX_NON_CARB_KCAL_FRACTION_BY_MACRO_STYLE: dict[MacroStyle, float] = {
    MacroStyle.balanced: 0.85,
    MacroStyle.lower_carb: 0.85,
    MacroStyle.keto: 0.92,
    MacroStyle.high_protein: 0.85,
}


@dataclass
class RecommendedTargets:
    bmr: int
    tdee: int
    calorie_goal: int
    protein_goal_g: int
    carb_goal_g: int
    fat_goal_g: int


def mifflin_st_jeor_bmr(sex: Sex, weight_kg: float, height_cm: float, age: int) -> float:
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    return base + (5 if sex == Sex.male else -161)


def recommend_targets(
    *,
    sex: Sex,
    weight_kg: float,
    height_cm: float,
    age: int,
    activity_level: ActivityLevel,
    health_goal: HealthGoal,
    macro_style: MacroStyle = MacroStyle.balanced,
) -> RecommendedTargets:
    bmr = mifflin_st_jeor_bmr(sex, weight_kg, height_cm, age)
    tdee = bmr * ACTIVITY_MULTIPLIERS[activity_level]

    adjusted = tdee * (1 + GOAL_ADJUSTMENT_FRACTION[health_goal])
    calories = min(max(adjusted, MIN_SAFE_CALORIES[sex]), MAX_SAFE_CALORIES)

    protein_g = weight_kg * (PROTEIN_G_PER_KG[health_goal] + PROTEIN_G_PER_KG_BOOST_BY_MACRO_STYLE[macro_style])
    protein_kcal = protein_g * 4
    fat_kcal = calories * FAT_FRACTION_BY_MACRO_STYLE[macro_style]

    # Guard against protein+fat eating the whole calorie budget at once (a
    # heavy person on a low-calorie goal) — scale both down proportionally
    # rather than let carbs go negative. The cap itself is per-style; see
    # MAX_NON_CARB_KCAL_FRACTION_BY_MACRO_STYLE.
    non_carb_kcal = protein_kcal + fat_kcal
    max_non_carb_kcal = calories * MAX_NON_CARB_KCAL_FRACTION_BY_MACRO_STYLE[macro_style]
    if non_carb_kcal > max_non_carb_kcal:
        scale = max_non_carb_kcal / non_carb_kcal
        protein_kcal *= scale
        fat_kcal *= scale

    protein_g = protein_kcal / 4
    fat_g = fat_kcal / 9
    carb_g = max(calories - protein_kcal - fat_kcal, 0.0) / 4

    return RecommendedTargets(
        bmr=round(bmr),
        tdee=round(tdee),
        calorie_goal=round(calories),
        protein_goal_g=round(protein_g),
        carb_goal_g=round(carb_g),
        fat_goal_g=round(fat_g),
    )
