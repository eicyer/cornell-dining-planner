import { create } from 'zustand'
import type { MenuItem, LoggedMealItem, MacroSummary, PortionMultiplier, MealPeriod } from '@/types'

interface MealLogState {
  // Active meal being built
  eateryId: number | null
  eateryName: string
  mealPeriod: MealPeriod
  items: LoggedMealItem[]

  // Actions
  setEatery: (id: number, name: string) => void
  setMealPeriod: (period: MealPeriod) => void
  addItem: (menuItem: MenuItem, portion?: PortionMultiplier) => void
  removeItem: (itemId: string) => void
  updatePortion: (itemId: string, portion: PortionMultiplier) => void
  clearMeal: () => void

  // Derived
  totals: () => MacroSummary
  itemCount: () => number
}

function calcItemMacros(item: MenuItem, portion: PortionMultiplier): LoggedMealItem {
  return {
    item_id: item.id,
    item_name: item.name,
    portion_multiplier: portion,
    calories: Math.round(item.calories * portion),
    protein_g: Math.round(item.protein_g * portion * 10) / 10,
    carbs_g: Math.round(item.carbs_g * portion * 10) / 10,
    fat_g: Math.round(item.fat_g * portion * 10) / 10,
  }
}

export const useMealLog = create<MealLogState>((set, get) => ({
  eateryId: null,
  eateryName: '',
  mealPeriod: 'lunch',
  items: [],

  setEatery: (id, name) => set({ eateryId: id, eateryName: name }),
  setMealPeriod: (mealPeriod) => set({ mealPeriod }),

  addItem: (menuItem, portion = 1) => {
    set((state) => {
      // If item already in log, increase portion instead
      const existing = state.items.find((i) => i.item_id === menuItem.id)
      if (existing) {
        const newPortion = Math.min(2, existing.portion_multiplier + 0.5) as PortionMultiplier
        return {
          items: state.items.map((i) =>
            i.item_id === menuItem.id ? calcItemMacros(menuItem, newPortion) : i
          ),
        }
      }
      return { items: [...state.items, calcItemMacros(menuItem, portion)] }
    })
  },

  removeItem: (itemId) =>
    set((state) => ({ items: state.items.filter((i) => i.item_id !== itemId) })),

  updatePortion: (itemId, portion) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.item_id === itemId ? { ...i, portion_multiplier: portion } : i
      ),
    })),

  clearMeal: () => set({ items: [], eateryId: null, eateryName: '' }),

  totals: () =>
    get().items.reduce(
      (acc, item) => ({
        calories: acc.calories + item.calories,
        protein_g: acc.protein_g + item.protein_g,
        carbs_g: acc.carbs_g + item.carbs_g,
        fat_g: acc.fat_g + item.fat_g,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    ),

  itemCount: () => get().items.length,
}))
