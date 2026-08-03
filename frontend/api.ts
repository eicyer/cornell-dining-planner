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

export type Me = { id: number; email: string };

export async function getMe(): Promise<Me | null> {
  const res = await apiFetch('/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /auth/me failed: ${res.status}`);
  return res.json();
}

export type Preferences = {
  calorie_goal: number;
  protein_goal_g: number;
  carb_goal_g: number;
  fat_goal_g: number;
  meals_per_day: number;
  diet_restrictions: string[];
  allergens: string[];
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
  if (!res.ok) throw new Error(`PUT /preferences failed: ${res.status}`);
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
