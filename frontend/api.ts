import type { PortionUnit } from './foodDensity';

// Set via EXPO_PUBLIC_API_BASE (see frontend/.env.example) — Expo inlines
// EXPO_PUBLIC_* vars at build time, no extra config needed. Falls back to
// localhost for local dev — must stay "localhost" (not 127.0.0.1) since
// Google OAuth's registered redirect URI is http://localhost:8001/auth/callback
// and the backend derives its redirect_uri from the request's Host header
// (see auth.py's request.url_for), so any mismatch here breaks sign-in.
// The backend itself must bind both loopback addresses (see run instructions)
// since "localhost" can resolve to the IPv6 loopback first on some machines.
// A physical device or simulator can't reach localhost either way — swap the
// env var for your Mac's LAN IP (`ipconfig getifaddr en0`) plus :8001 when
// testing on iOS.
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'http://localhost:8001';

// Mirrors app/services/llm_enrichment.py — keep in sync manually, there's no
// shared schema between the Python backend and this TS frontend.
export const DIET_TAGS = ['vegan', 'vegetarian', 'gluten_free', 'dairy_free', 'halal', 'kosher'];
export const ALLERGENS = ['dairy', 'eggs', 'gluten', 'soy', 'peanuts', 'tree_nuts', 'fish', 'shellfish', 'sesame'];

// Mirrors app/services/eating_styles.py — see docs/adr/0015.
export const EATING_STYLES = ['low_sugar', 'high_fiber', 'whole_foods_focus'];

function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, { ...options, credentials: 'include' });
}

// FastAPI validation errors (422) return `detail` as a list of {msg, ...},
// not a string — this reads either shape into one message for display.
async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  if (typeof body?.detail === 'string') return body.detail;
  if (Array.isArray(body?.detail)) return body.detail.map((d: any) => d.msg).filter(Boolean).join('; ') || fallback;
  return fallback;
}

export type Me = { id: number; email: string };

export async function getMe(): Promise<Me | null> {
  const res = await apiFetch('/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /auth/me failed: ${res.status}`);
  return res.json();
}

export async function logout(): Promise<void> {
  const res = await apiFetch('/auth/logout', { method: 'POST' });
  if (!res.ok) throw new Error(`POST /auth/logout failed: ${res.status}`);
}

// Permanently deletes the account and everything scoped to it (preferences,
// logged meals, cached crafted-meal payloads) and clears the session
// server-side. Irreversible — callers must confirm with the user before
// calling this; there's no undo endpoint.
export async function deleteAccount(): Promise<void> {
  const res = await apiFetch('/auth/me', { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE /auth/me failed: ${res.status}`);
}

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const HEALTH_GOALS = ['lose_weight', 'maintain_weight', 'gain_weight'] as const;
export type HealthGoal = (typeof HEALTH_GOALS)[number];

export const MACRO_STYLES = ['balanced', 'lower_carb', 'keto', 'high_protein'] as const;
export type MacroStyle = (typeof MACRO_STYLES)[number];

export type Sex = 'male' | 'female';
export type UnitSystem = 'imperial' | 'metric';
export type TargetMode = 'recommended' | 'manual';

export type Preferences = {
  calorie_goal: number;
  protein_goal_g: number;
  carb_goal_g: number;
  fat_goal_g: number;
  meals_per_day: number;
  diet_restrictions: string[];
  allergens: string[];
  age: number | null;
  sex: Sex | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: ActivityLevel | null;
  health_goal: HealthGoal | null;
  macro_style: MacroStyle | null;
  target_mode: TargetMode;
  liked_foods_text: string | null;
  disliked_foods_text: string | null;
  liked_tags: string[];
  disliked_tags: string[];
  eating_styles: string[];
  food_survey_completed: boolean;
  // docs/adr/0025 — whether Exercise Entries add to the day's budget.
  exercise_adds_to_goal: boolean;
  // docs/adr/0026 — display units only; the API is always metric.
  unit_system: UnitSystem;
};

export async function getPreferences(): Promise<Preferences | null> {
  const res = await apiFetch('/preferences');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /preferences failed: ${res.status}`);
  return res.json();
}

export async function putPreferences(prefs: Preferences): Promise<Preferences> {
  const res = await apiFetch('/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `PUT /preferences failed: ${res.status}`));
  return res.json();
}

export type RecommendTargetsInput = {
  age: number;
  sex: Sex;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  health_goal: HealthGoal;
  macro_style: MacroStyle;
};

export type RecommendedTargets = {
  bmr: number;
  tdee: number;
  calorie_goal: number;
  protein_goal_g: number;
  carb_goal_g: number;
  fat_goal_g: number;
};

export async function recommendTargets(input: RecommendTargetsInput): Promise<RecommendedTargets> {
  const res = await apiFetch('/preferences/recommend-targets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `POST /preferences/recommend-targets failed: ${res.status}`));
  return res.json();
}

// --- Food Preference Survey (onboarding "would you rather" quiz) ---

export type FoodSurveyItem = { id: string; name: string; image_url?: string | null };
export type FoodSurveyPair = { id: string; item_a: FoodSurveyItem; item_b: FoodSurveyItem };
export type FoodSurveyChoice = 'a' | 'b' | 'skip';
export type FoodSurveyResponse = { pair_id: string; choice: FoodSurveyChoice };

export async function getFoodSurveyPairs(): Promise<FoodSurveyPair[]> {
  const res = await apiFetch('/preferences/food-survey');
  if (!res.ok) throw new Error(await errorMessage(res, `GET /preferences/food-survey failed: ${res.status}`));
  const body = await res.json();
  return body.pairs;
}

export async function submitFoodSurvey(responses: FoodSurveyResponse[]): Promise<Preferences> {
  const res = await apiFetch('/preferences/food-survey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `POST /preferences/food-survey failed: ${res.status}`));
  return res.json();
}

// --- Station Survey (compare today's actual staple-station picks at one
// eatery — see docs/adr/0013). Repeatable, eatery-scoped; reuses the same
// FoodSurveyPair/FoodSurveyResponse shapes as the onboarding quiz above. ---

export async function getStationSurveyPairs(eateryId: number): Promise<FoodSurveyPair[]> {
  const res = await apiFetch(`/preferences/station-survey/${eateryId}`);
  if (!res.ok) {
    throw new Error(await errorMessage(res, `GET /preferences/station-survey/${eateryId} failed: ${res.status}`));
  }
  const body = await res.json();
  return body.pairs;
}

export async function submitStationSurvey(eateryId: number, responses: FoodSurveyResponse[]): Promise<Preferences> {
  const res = await apiFetch(`/preferences/station-survey/${eateryId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses }),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, `POST /preferences/station-survey/${eateryId} failed: ${res.status}`));
  }
  return res.json();
}

// --- Meal Preference Survey (one round per meal-period x plate-role
// bucket, drawn from the admin-curated Common Foods catalog — see
// docs/adr/0020). Repeatable, Cornell-wide; reuses the same
// FoodSurveyPair/FoodSurveyResponse shapes as the surveys above. ---

export async function getMealPreferenceSurveyPairs(): Promise<FoodSurveyPair[]> {
  const res = await apiFetch('/preferences/meal-preference-survey');
  if (!res.ok) {
    throw new Error(await errorMessage(res, `GET /preferences/meal-preference-survey failed: ${res.status}`));
  }
  const body = await res.json();
  return body.pairs;
}

export async function submitMealPreferenceSurvey(responses: FoodSurveyResponse[]): Promise<Preferences> {
  const res = await apiFetch('/preferences/meal-preference-survey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses }),
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, `POST /preferences/meal-preference-survey failed: ${res.status}`));
  }
  return res.json();
}

// Mirrors app.services.meal_crafting.ROLE_ORDER.
export const PLATE_ROLE_ORDER = ['protein', 'carb', 'vegetable'] as const;
export type PlateRole = (typeof PLATE_ROLE_ORDER)[number];

export type CraftedItem = {
  name: string;
  category: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  fiber_g: number;
  role: PlateRole | null;
};

export type CraftedMeal = {
  name: string;
  rationale: string;
  items: CraftedItem[];
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number; sugar_g: number; fiber_g: number };
};

export type EateryCrafted = {
  id: number;
  name: string;
  campus_area: string | null;
  meal_period: string | null;
  crafted_meal: CraftedMeal | null;
  reason_unavailable: string | null;
  // What crafted_meal was sized to: the Remaining-Budget Target once
  // anything is logged today, else goal ÷ meals_per_day (docs/adr/0027).
  target: Totals | null;
  sized_to_remaining: boolean;
};

export async function getCraftedMealsToday(): Promise<EateryCrafted[]> {
  const res = await apiFetch('/menus/today/crafted');
  if (!res.ok) throw new Error(`GET /menus/today/crafted failed: ${res.status}`);
  return res.json();
}

// A single best-pick preview for a meal period later today at this eatery —
// see EateryCraftedOptions.next_meals. Unlike crafted_meals (several ranked
// options for "now"), this is just a preview of what's coming, not the
// primary pick-one interaction.
export type NextMeal = {
  meal_period: string;
  crafted_meal: CraftedMeal | null;
  reason_unavailable: string | null;
  target: Totals | null;
};

// Up to a few ranked meal options for one eatery — see the eatery-detail
// "3 meal options" flow. Unlike EateryCrafted.crafted_meal (the single
// today-list pick), crafted_meals here can include lower-ranked candidates
// so the user has choices, even at some cost to average suggestion quality.
export type EateryCraftedOptions = {
  id: number;
  name: string;
  campus_area: string | null;
  meal_period: string | null;
  crafted_meals: CraftedMeal[];
  reason_unavailable: string | null;
  // Later meal periods still being served today at this eatery, in serving
  // order — empty once the current pick is the last period of the day.
  next_meals: NextMeal[];
  // What crafted_meals were sized to (docs/adr/0027).
  target: Totals | null;
  sized_to_remaining: boolean;
};

export async function getCraftedMealsForEatery(eateryId: number): Promise<EateryCraftedOptions> {
  const res = await apiFetch(`/menus/today/crafted/${eateryId}`);
  if (!res.ok) throw new Error(`GET /menus/today/crafted/${eateryId} failed: ${res.status}`);
  return res.json();
}

export function loginUrl(): string {
  return `${API_BASE}/auth/login`;
}

// --- Raw menu (per 100g, not per portion — see docs/adr/0007) ---

export type MenuNutrition = {
  calories_per_100g: number;
  protein_g_per_100g: number;
  carbs_g_per_100g: number;
  fat_g_per_100g: number;
  confidence: number;
  source: string;
};

export type MenuItemOut = {
  name: string;
  nutrition: MenuNutrition | null;
  diet_tags: string[];
  likely_allergens: string[];
};

export type MenuCategory = { category: string; items: MenuItemOut[] };
export type MenuEventOut = { meal_period: string; categories: MenuCategory[] };
export type EateryMenu = {
  id: number;
  name: string;
  campus_area: string | null;
  menu_events: MenuEventOut[];
};

export async function getMenusToday(): Promise<EateryMenu[]> {
  const res = await apiFetch('/menus/today');
  if (!res.ok) throw new Error(`GET /menus/today failed: ${res.status}`);
  return res.json();
}

// Admin-set portion units keyed by item name — see docs/adr/0022 and
// setPortionOverrides in foodDensity.ts.
export type PortionOverrides = Record<string, { unit: PortionUnit; grams_per_unit: number }>;

export async function getPortionOverrides(): Promise<PortionOverrides> {
  const res = await apiFetch('/portion-overrides');
  if (!res.ok) throw new Error(`GET /portion-overrides failed: ${res.status}`);
  return res.json();
}

// --- Logged meals ---

export type LoggedMealItem = {
  name: string;
  category: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type Totals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

// The Diary's four fixed sections, in display order. Derived server-side
// from each Logged Meal's meal period (docs/adr/0023) — read
// `meal_section` off the API rather than mapping meal periods here.
export const MEAL_SECTIONS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
export type MealSection = (typeof MEAL_SECTIONS)[number];

export type LoggedMeal = {
  id: number;
  date: string;
  eatery_id: number;
  eatery_name: string;
  meal_period: string;
  meal_section: MealSection;
  items: LoggedMealItem[];
  totals: Totals;
  liked: boolean | null;
};

// How the items were chosen; only counted for success metrics
// (docs/adr/0028), never used for nutrition.
export type LogSource = 'menu' | 'crafted';

export async function logMeal(
  eateryId: number,
  mealPeriod: string,
  items: { name: string; grams: number }[],
  source: LogSource = 'menu'
): Promise<LoggedMeal> {
  const res = await apiFetch('/logged-meals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // No `liked` key: logging appends to the Menu Event's existing Logged
    // Meal (docs/adr/0023), and sending `liked: null` would clear its rating.
    body: JSON.stringify({ eatery_id: eateryId, meal_period: mealPeriod, items, source }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `POST /logged-meals failed: ${res.status}`);
  }
  return res.json();
}

export async function rateMeal(mealId: number, liked: boolean | null): Promise<LoggedMeal> {
  const res = await apiFetch(`/logged-meals/${mealId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ liked }),
  });
  if (!res.ok) throw new Error(`PATCH /logged-meals/${mealId} failed: ${res.status}`);
  return res.json();
}

// Replaces a logged meal's items. Only names/grams are sent — the server
// revalidates them against the meal's own Menu Event and recomputes all
// nutrition itself (docs/adr/0004), so the response is the source of truth.
export async function updateMealItems(mealId: number, items: { name: string; grams: number }[]): Promise<LoggedMeal> {
  const res = await apiFetch(`/logged-meals/${mealId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `PATCH /logged-meals/${mealId} failed: ${res.status}`));
  return res.json();
}

export async function deleteMeal(mealId: number): Promise<void> {
  const res = await apiFetch(`/logged-meals/${mealId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE /logged-meals/${mealId} failed: ${res.status}`);
}

// `date` is a local "YYYY-MM-DD"; omitted means the server's today.
export async function getLoggedMeals(date?: string): Promise<LoggedMeal[]> {
  const res = await apiFetch(date ? `/logged-meals?date=${date}` : '/logged-meals');
  if (!res.ok) throw new Error(`GET /logged-meals failed: ${res.status}`);
  return res.json();
}

// `goal` is the base goal; when `exercise_adds_to_goal`, the day's budget
// is goal + exercise_calories (docs/adr/0025).
export type DaySummary = {
  date: string;
  totals: Totals;
  goal: Totals;
  exercise_calories: number;
  exercise_adds_to_goal: boolean;
};

export async function getLoggedMealsSummary(days = 7): Promise<DaySummary[]> {
  const res = await apiFetch(`/logged-meals/summary?days=${days}`);
  if (!res.ok) throw new Error(`GET /logged-meals/summary failed: ${res.status}`);
  return res.json();
}

// Food from anywhere other than a dining-hall menu (docs/adr/0024). Unlike
// a Logged Meal, these numbers are the user's own and stored as entered,
// and the Meal Section is chosen rather than derived.
export type QuickAddEntry = {
  id: number;
  date: string;
  meal_section: MealSection;
  name: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type QuickAddInput = {
  meal_section: MealSection;
  name: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export async function getQuickAdds(date: string): Promise<QuickAddEntry[]> {
  const res = await apiFetch(`/quick-add?date=${date}`);
  if (!res.ok) throw new Error(`GET /quick-add failed: ${res.status}`);
  return res.json();
}

export async function createQuickAdd(date: string, input: QuickAddInput): Promise<QuickAddEntry> {
  const res = await apiFetch('/quick-add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, ...input }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `POST /quick-add failed: ${res.status}`));
  return res.json();
}

export async function updateQuickAdd(entryId: number, input: QuickAddInput): Promise<QuickAddEntry> {
  const res = await apiFetch(`/quick-add/${entryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `PATCH /quick-add/${entryId} failed: ${res.status}`));
  return res.json();
}

export async function deleteQuickAdd(entryId: number): Promise<void> {
  const res = await apiFetch(`/quick-add/${entryId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE /quick-add/${entryId} failed: ${res.status}`);
}

// One logged workout (docs/adr/0025). Calories are estimated server-side
// from activity × minutes × weight unless `calories_typed`.
export type ExerciseEntry = {
  id: number;
  date: string;
  activity: string;
  label: string;
  minutes: number;
  calories: number;
  calories_typed: boolean;
};

export type ExerciseActivity = { key: string; label: string };

// `activity: 'other'` always needs `calories`; omitted calories otherwise
// mean "estimate it".
export type ExerciseInput = { activity: string; minutes: number; calories: number | null; label: string | null };

export const OTHER_ACTIVITY = 'other';

export async function getExerciseActivities(): Promise<ExerciseActivity[]> {
  const res = await apiFetch('/exercise/activities');
  if (!res.ok) throw new Error(`GET /exercise/activities failed: ${res.status}`);
  return res.json();
}

export async function getExercise(date: string): Promise<ExerciseEntry[]> {
  const res = await apiFetch(`/exercise?date=${date}`);
  if (!res.ok) throw new Error(`GET /exercise failed: ${res.status}`);
  return res.json();
}

export async function createExercise(date: string, input: ExerciseInput): Promise<ExerciseEntry> {
  const res = await apiFetch('/exercise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, ...input }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `POST /exercise failed: ${res.status}`));
  return res.json();
}

export async function replaceExercise(entryId: number, input: ExerciseInput): Promise<ExerciseEntry> {
  const res = await apiFetch(`/exercise/${entryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `PUT /exercise/${entryId} failed: ${res.status}`));
  return res.json();
}

export async function deleteExercise(entryId: number): Promise<void> {
  const res = await apiFetch(`/exercise/${entryId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE /exercise/${entryId} failed: ${res.status}`);
}

// One Weigh-in per day (docs/adr/0026). History only — targets change
// only through recalculateTargets().
export type WeighIn = { date: string; weight_kg: number };

export async function getWeighIns(days = 90): Promise<WeighIn[]> {
  const res = await apiFetch(`/weight?days=${days}`);
  if (!res.ok) throw new Error(`GET /weight failed: ${res.status}`);
  return res.json();
}

export async function putWeighIn(date: string, weightKg: number): Promise<WeighIn> {
  const res = await apiFetch(`/weight/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weight_kg: weightKg }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `PUT /weight/${date} failed: ${res.status}`));
  return res.json();
}

export async function deleteWeighIn(date: string): Promise<void> {
  const res = await apiFetch(`/weight/${date}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE /weight/${date} failed: ${res.status}`);
}

// Re-runs Recommended Targets with the latest Weigh-in and saves them.
export async function recalculateTargets(): Promise<Preferences> {
  const res = await apiFetch('/preferences/recalculate-targets', { method: 'POST' });
  if (!res.ok) throw new Error(await errorMessage(res, `POST /preferences/recalculate-targets failed: ${res.status}`));
  return res.json();
}
