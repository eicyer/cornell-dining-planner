import { Platform } from 'react-native';

// Web (browser) can reach the backend via localhost. A physical device or
// simulator can't — swap this for your Mac's LAN IP (`ipconfig getifaddr en0`)
// plus :8001 when testing on iOS.
export const API_BASE = Platform.OS === 'web' ? 'http://localhost:8001' : 'http://localhost:8001';

// Mirrors app/services/llm_enrichment.py — keep in sync manually, there's no
// shared schema between the Python backend and this TS frontend.
export const DIET_TAGS = ['vegan', 'vegetarian', 'gluten_free', 'dairy_free', 'halal', 'kosher'];
export const ALLERGENS = ['dairy', 'eggs', 'gluten', 'soy', 'peanuts', 'tree_nuts', 'fish', 'shellfish', 'sesame'];

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

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const HEALTH_GOALS = ['lose_weight', 'maintain_weight', 'gain_weight'] as const;
export type HealthGoal = (typeof HEALTH_GOALS)[number];

export type Sex = 'male' | 'female';
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
  target_mode: TargetMode;
  liked_foods_text: string | null;
  disliked_foods_text: string | null;
  liked_tags: string[];
  disliked_tags: string[];
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

export type CraftedItem = {
  name: string;
  category: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type CraftedMeal = {
  name: string;
  rationale: string;
  items: CraftedItem[];
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
};

export type EateryCrafted = {
  id: number;
  name: string;
  campus_area: string | null;
  meal_period: string | null;
  crafted_meal: CraftedMeal | null;
  reason_unavailable: string | null;
};

export async function getCraftedMealsToday(): Promise<EateryCrafted[]> {
  const res = await apiFetch('/menus/today/crafted');
  if (!res.ok) throw new Error(`GET /menus/today/crafted failed: ${res.status}`);
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

export type LoggedMeal = {
  id: number;
  date: string;
  eatery_id: number;
  eatery_name: string;
  meal_period: string;
  items: LoggedMealItem[];
  totals: Totals;
  liked: boolean | null;
};

export async function logMeal(
  eateryId: number,
  mealPeriod: string,
  items: { name: string; grams: number }[],
  liked: boolean | null = null
): Promise<LoggedMeal> {
  const res = await apiFetch('/logged-meals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eatery_id: eateryId, meal_period: mealPeriod, items, liked }),
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

export async function getLoggedMealsToday(): Promise<LoggedMeal[]> {
  const res = await apiFetch('/logged-meals');
  if (!res.ok) throw new Error(`GET /logged-meals failed: ${res.status}`);
  return res.json();
}

export type DaySummary = { date: string; totals: Totals; goal: Totals };

export async function getLoggedMealsSummary(days = 7): Promise<DaySummary[]> {
  const res = await apiFetch(`/logged-meals/summary?days=${days}`);
  if (!res.ok) throw new Error(`GET /logged-meals/summary failed: ${res.status}`);
  return res.json();
}
