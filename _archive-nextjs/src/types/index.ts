// ─── Cornell Dining API ──────────────────────────────────────────────────────

export interface CornellEatery {
  id: number
  name: string
  location: string
  latitude?: number
  longitude?: number
  operatingHours: CornellOperatingHours[]
  diningItems: CornellDiningItem[]
}

export interface CornellOperatingHours {
  weekday: string
  events: CornellEvent[]
}

export interface CornellEvent {
  start: string
  end: string
  calSummary: string // e.g. "Breakfast", "Lunch", "Dinner"
  menu?: CornellMenu
}

export interface CornellMenu {
  items: CornellMenuItem[]
}

export interface CornellMenuItem {
  item: string
  healthy: boolean
  icons: string[] // 'veg', 'vegan', 'gluten-free', etc.
  calories?: number
  totalFat?: number
  totalCarb?: number
  protein?: number
}

export interface CornellDiningItem {
  item: string
  healthy: boolean
  icons: string[]
}

// ─── Nutrition ───────────────────────────────────────────────────────────────

export type NutritionSource = 'cornell_api' | 'usda' | 'nutritionix' | 'llm_estimate'

export interface NutritionData {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  source: NutritionSource
  confidence_score: number // 0.0 to 1.0
}

// ─── Database Types ───────────────────────────────────────────────────────────

export interface Eatery {
  id: number
  name: string
  location: string
  hours_json: CornellOperatingHours[]
  created_at: string
  updated_at: string
}

export type MealPeriod = 'breakfast' | 'lunch' | 'dinner' | 'brunch' | 'late_night'

export interface MenuItem {
  id: string
  eatery_id: number
  name: string
  station?: string
  meal_period: MealPeriod
  date: string // ISO date string YYYY-MM-DD
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  nutrition_source: NutritionSource
  confidence_score: number
  dietary_tags: string[] // 'vegetarian', 'vegan', 'gluten-free', etc.
  is_healthy: boolean
  created_at: string
}

export type DietaryRestriction =
  | 'vegetarian'
  | 'vegan'
  | 'gluten-free'
  | 'halal'
  | 'kosher'
  | 'dairy-free'
  | 'nut-free'

export interface UserPreferences {
  user_id: string
  daily_calorie_goal: number
  protein_goal_g: number
  carb_goal_g: number
  fat_goal_g: number
  liked_foods: string[]
  disliked_foods: string[]
  dietary_restrictions: DietaryRestriction[]
  meal_count_per_day: number
  updated_at: string
}

export type PortionMultiplier = 0.5 | 1 | 1.5 | 2

export interface LoggedMealItem {
  item_id: string
  item_name: string
  portion_multiplier: PortionMultiplier
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface LoggedMeal {
  id: string
  user_id: string
  date: string
  meal_period: MealPeriod
  eatery_id: number
  eatery_name: string
  items: LoggedMealItem[]
  total_calories: number
  total_protein_g: number
  total_carbs_g: number
  total_fat_g: number
  created_at: string
}

// ─── Meal Suggestions ─────────────────────────────────────────────────────────

export interface MealSuggestionItem {
  item_name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  station?: string
}

export interface MealSuggestion {
  name: string // e.g. "High-Protein Lunch"
  items: MealSuggestionItem[]
  totals: {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }
  reason: string // short explanation of why this fits the user's goals
}

// ─── Macros Summary ───────────────────────────────────────────────────────────

export interface MacroSummary {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}
