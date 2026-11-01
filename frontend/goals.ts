import { ActivityLevel, HealthGoal, Preferences, RecommendedTargets, Sex, UnitSystem, WEEKLY_PACES_KG } from './api';
import { KG_PER_LB } from './units';

// Shared by Setup and the Preferences form (docs/adr/0031).

// What a first save starts from; Setup fills in only its two steps' fields.
export const DEFAULT_PREFERENCES: Preferences = {
  calorie_goal: 2200,
  protein_goal_g: 150,
  carb_goal_g: 220,
  fat_goal_g: 70,
  meals_per_day: 3,
  diet_restrictions: [],
  allergens: [],
  age: null,
  sex: null,
  height_cm: null,
  weight_kg: null,
  activity_level: null,
  health_goal: null,
  macro_style: null,
  weekly_pace_kg: null,
  target_mode: 'manual',
  liked_foods_text: '',
  disliked_foods_text: '',
  liked_tags: [],
  disliked_tags: [],
  eating_styles: [],
  food_survey_completed: false,
  exercise_adds_to_goal: true,
  unit_system: 'imperial',
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary',
  light: 'Light (1–3x/wk)',
  moderate: 'Moderate (3–5x/wk)',
  active: 'Active (6–7x/wk)',
  very_active: 'Very active',
};

export const HEALTH_GOAL_LABELS: Record<HealthGoal, string> = {
  lose_weight: 'Lose weight',
  maintain_weight: 'Maintain weight',
  gain_weight: 'Gain weight',
};

// 0.25 kg reads as ½ lb and 0.5 as 1 lb — the paces were picked to land on
// those, so imperial shows the round number rather than 0.55 lb.
export function paceLabel(kg: number, system: UnitSystem): string {
  if (system === 'metric') return `${kg} kg / week`;
  const lb = Math.round((kg / KG_PER_LB) * 2) / 2;
  return `${lb === 0.5 ? '½' : lb} lb / week`;
}

// The pace a goal starts on when picked: the gentlest one, or none.
export function defaultPace(goal: HealthGoal): number | null {
  return WEEKLY_PACES_KG[goal][0] ?? null;
}

// Keeps a saved pace when it's still valid for the new goal.
export function paceForGoal(goal: HealthGoal, current: number | null): number | null {
  return current != null && WEEKLY_PACES_KG[goal].includes(current) ? current : defaultPace(goal);
}

export const MIN_SAFE_CALORIES: Record<Sex, number> = { male: 1500, female: 1200 };

// Said whenever the floor raised the target, so the number on screen isn't
// one the chosen pace silently didn't produce.
export function floorMessage(result: RecommendedTargets, sex: Sex): string | null {
  if (!result.floor_applied) return null;
  const floor = MIN_SAFE_CALORIES[sex].toLocaleString('en-US');
  return `That pace would put you under ${floor} cal, so we've set ${floor}, the lowest we recommend. A slower pace gets you there more steadily.`;
}
