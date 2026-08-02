import Anthropic from '@anthropic-ai/sdk'
import type { MenuItem, MealSuggestion, UserPreferences } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface SuggestMealsParams {
  eateryName: string
  items: MenuItem[]
  userPrefs: UserPreferences
  mealPeriod: string
  /** Per-meal calorie target (daily_calorie_goal / meal_count_per_day) */
  mealCalorieTarget?: number
}

/**
 * Generate 3–5 meal suggestions for a dining hall using Claude.
 * Uses claude-haiku-4-5 by default (fast + cheap). Falls back gracefully.
 */
export async function suggestMeals({
  eateryName,
  items,
  userPrefs,
  mealPeriod,
  mealCalorieTarget,
}: SuggestMealsParams): Promise<MealSuggestion[]> {
  if (items.length === 0) return []

  const targetCals = mealCalorieTarget ?? Math.round(userPrefs.daily_calorie_goal / userPrefs.meal_count_per_day)
  const targetProtein = Math.round(userPrefs.protein_goal_g / userPrefs.meal_count_per_day)

  const itemsJson = items.map((item) => ({
    name: item.name,
    station: item.station,
    calories: Math.round(item.calories),
    protein_g: Math.round(item.protein_g),
    carbs_g: Math.round(item.carbs_g),
    fat_g: Math.round(item.fat_g),
    tags: item.dietary_tags,
  }))

  const systemPrompt = `You are a meal planning assistant for Cornell University dining halls.
You help students eat healthily and enjoyably within their macro goals.
Always respond with valid JSON only — no prose, no markdown, just the JSON array.`

  const userPrompt = `Today's ${mealPeriod} menu at ${eateryName}:
${JSON.stringify(itemsJson, null, 2)}

Student's goals for this meal:
- Calories: ~${targetCals} (±150 is fine)
- Protein: ≥${targetProtein}g
- Dietary restrictions: ${userPrefs.dietary_restrictions.length > 0 ? userPrefs.dietary_restrictions.join(', ') : 'none'}
- Foods they like: ${userPrefs.liked_foods.length > 0 ? userPrefs.liked_foods.join(', ') : 'no preference'}
- Foods to avoid: ${userPrefs.disliked_foods.length > 0 ? userPrefs.disliked_foods.join(', ') : 'none'}

Generate 3 complete meal combinations using ONLY items from the menu above.
Each meal must:
1. Stay within ±150 calories of the target
2. Meet or exceed the protein target
3. Respect all dietary restrictions
4. Not include any disliked foods
5. Be realistic for a single dining hall visit

Return this exact JSON shape:
[
  {
    "name": "Descriptive meal name (e.g. High-Protein Lunch)",
    "items": [
      { "item_name": "exact name from menu", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0 }
    ],
    "totals": { "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0 },
    "reason": "One sentence explaining why this fits the student's goals"
  }
]`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'

    // Strip markdown code fences if model adds them
    const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(cleaned) as MealSuggestion[]

    return parsed
  } catch (err) {
    console.error('Meal suggestion error:', err)
    return []
  }
}

/**
 * Build a cache key for suggestions (use to avoid re-generating for same inputs)
 */
export function suggestionCacheKey(
  eateryId: number,
  date: string,
  mealPeriod: string,
  prefsHash: string
): string {
  return `suggestions:${eateryId}:${date}:${mealPeriod}:${prefsHash}`
}

/**
 * Simple hash of user preferences for cache bucketing.
 * Users with same calorie range + restrictions + major goals share a cache entry.
 */
export function hashPreferences(prefs: UserPreferences): string {
  const calBucket = Math.round(prefs.daily_calorie_goal / 200) * 200
  const proteinBucket = Math.round(prefs.protein_goal_g / 10) * 10
  const restrictions = [...prefs.dietary_restrictions].sort().join(',')
  return `${calBucket}-${proteinBucket}-${restrictions}`
}
