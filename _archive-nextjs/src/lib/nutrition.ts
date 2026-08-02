import Anthropic from '@anthropic-ai/sdk'
import type { NutritionData, NutritionSource } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── USDA FoodData Central ────────────────────────────────────────────────────

interface USDAFood {
  fdcId: number
  description: string
  foodNutrients: { nutrientId: number; value: number }[]
}

const USDA_NUTRIENT_IDS = {
  calories: 1008,
  protein: 1003,
  carbs: 1005,
  fat: 1004,
  fiber: 1079,
}

async function lookupUSDA(itemName: string): Promise<NutritionData | null> {
  try {
    const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search')
    url.searchParams.set('query', itemName)
    url.searchParams.set('dataType', 'Survey (FNDDS),SR Legacy')
    url.searchParams.set('pageSize', '5')
    url.searchParams.set('api_key', process.env.USDA_API_KEY ?? 'DEMO_KEY')

    const res = await fetch(url.toString())
    if (!res.ok) return null

    const json = await res.json()
    const foods: USDAFood[] = json.foods ?? []
    if (foods.length === 0) return null

    // Use the first result (best match by USDA scoring)
    const food = foods[0]

    const getNutrient = (id: number) =>
      food.foodNutrients.find((n) => n.nutrientId === id)?.value ?? 0

    // Basic name similarity check — skip if description is totally different
    const similarity = cosineSimilarityWords(
      itemName.toLowerCase(),
      food.description.toLowerCase()
    )
    if (similarity < 0.2) return null

    return {
      calories: getNutrient(USDA_NUTRIENT_IDS.calories),
      protein_g: getNutrient(USDA_NUTRIENT_IDS.protein),
      carbs_g: getNutrient(USDA_NUTRIENT_IDS.carbs),
      fat_g: getNutrient(USDA_NUTRIENT_IDS.fat),
      fiber_g: getNutrient(USDA_NUTRIENT_IDS.fiber),
      source: 'usda' as NutritionSource,
      confidence_score: Math.min(0.95, similarity * 1.5),
    }
  } catch {
    return null
  }
}

// ─── Nutritionix ─────────────────────────────────────────────────────────────

async function lookupNutritionix(itemName: string): Promise<NutritionData | null> {
  try {
    const res = await fetch('https://trackapi.nutritionix.com/v2/natural/nutrients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': process.env.NUTRITIONIX_APP_ID ?? '',
        'x-app-key': process.env.NUTRITIONIX_API_KEY ?? '',
      },
      body: JSON.stringify({ query: `1 serving of ${itemName}` }),
    })

    if (!res.ok) return null

    const json = await res.json()
    const food = json.foods?.[0]
    if (!food) return null

    return {
      calories: food.nf_calories ?? 0,
      protein_g: food.nf_protein ?? 0,
      carbs_g: food.nf_total_carbohydrate ?? 0,
      fat_g: food.nf_total_fat ?? 0,
      fiber_g: food.nf_dietary_fiber ?? 0,
      source: 'nutritionix' as NutritionSource,
      confidence_score: 0.8,
    }
  } catch {
    return null
  }
}

// ─── Claude Estimation Fallback ───────────────────────────────────────────────

async function estimateWithClaude(itemName: string): Promise<NutritionData> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `You are a nutrition expert. Estimate the calories and macros for a standard single-serving dining hall portion of: "${itemName}"

Respond ONLY with valid JSON, no other text:
{"calories": <int>, "protein_g": <float>, "carbs_g": <float>, "fat_g": <float>, "fiber_g": <float>, "confidence": <float 0-1>}`,
      },
    ],
  })

  try {
    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const parsed = JSON.parse(text.trim())
    return {
      calories: parsed.calories ?? 0,
      protein_g: parsed.protein_g ?? 0,
      carbs_g: parsed.carbs_g ?? 0,
      fat_g: parsed.fat_g ?? 0,
      fiber_g: parsed.fiber_g ?? 0,
      source: 'llm_estimate' as NutritionSource,
      confidence_score: parsed.confidence ?? 0.5,
    }
  } catch {
    // Absolute fallback if JSON parse fails
    return {
      calories: 300,
      protein_g: 15,
      carbs_g: 35,
      fat_g: 10,
      fiber_g: 3,
      source: 'llm_estimate',
      confidence_score: 0.3,
    }
  }
}

// ─── Main Enrichment Pipeline ─────────────────────────────────────────────────

/**
 * Enrich a menu item name with nutrition data.
 * Pipeline: USDA → Nutritionix → Claude estimate
 * Results should be cached in DB — only call once per unique item name.
 */
export async function enrichItem(itemName: string): Promise<NutritionData> {
  // 1. Try USDA
  const usda = await lookupUSDA(itemName)
  if (usda && usda.confidence_score >= 0.5) return usda

  // 2. Try Nutritionix
  const nix = await lookupNutritionix(itemName)
  if (nix) return nix

  // 3. Claude fallback
  return estimateWithClaude(itemName)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cosineSimilarityWords(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/))
  const wordsB = new Set(b.split(/\s+/))
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length
  return intersection / Math.sqrt(wordsA.size * wordsB.size)
}
