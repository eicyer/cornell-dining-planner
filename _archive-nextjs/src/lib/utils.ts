import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { MacroSummary, MealPeriod } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCalories(cal: number): string {
  return `${Math.round(cal)} cal`
}

export function formatMacro(grams: number, unit = 'g'): string {
  return `${Math.round(grams)}${unit}`
}

export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0]
}

export function getCurrentMealPeriod(): MealPeriod {
  const hour = new Date().getHours()
  if (hour >= 7 && hour < 11) return 'breakfast'
  if (hour >= 11 && hour < 15) return 'lunch'
  if (hour >= 15 && hour < 21) return 'dinner'
  return 'late_night'
}

export function sumMacros(items: MacroSummary[]): MacroSummary {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein_g: acc.protein_g + item.protein_g,
      carbs_g: acc.carbs_g + item.carbs_g,
      fat_g: acc.fat_g + item.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )
}

/** Returns 0–100 progress capped at 100 */
export function macroProgress(consumed: number, goal: number): number {
  if (goal === 0) return 0
  return Math.min(100, Math.round((consumed / goal) * 100))
}

/** Returns color class based on how close to goal */
export function calorieStatusColor(consumed: number, goal: number): string {
  const pct = consumed / goal
  if (pct > 1.1) return 'text-red-500'
  if (pct > 0.9) return 'text-emerald-500'
  return 'text-amber-500'
}

export const MACRO_COLORS = {
  calories: 'bg-slate-700',
  protein: 'bg-blue-500',
  carbs: 'bg-amber-400',
  fat: 'bg-rose-400',
} as const

export const DIETARY_TAG_LABELS: Record<string, string> = {
  veg: 'Vegetarian',
  vegan: 'Vegan',
  'gluten-free': 'GF',
  halal: 'Halal',
  kosher: 'Kosher',
  'dairy-free': 'Dairy-Free',
}
