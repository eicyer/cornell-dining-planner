import type { CornellEatery, MealPeriod } from '@/types'

const CORNELL_API_BASE = 'https://now.dining.cornell.edu/api/1.0/dining'

export interface CornellApiResponse {
  status: string
  data: {
    eateries: CornellEatery[]
  }
}

/**
 * Fetch all eateries with today's menus from Cornell Dining API.
 * Returns raw Cornell API shape — call parseEateries() to normalize.
 */
export async function fetchCornellEateries(): Promise<CornellEatery[]> {
  const res = await fetch(`${CORNELL_API_BASE}/eateries.json`, {
    next: { revalidate: 3600 }, // cache for 1 hour in Next.js
  })

  if (!res.ok) {
    throw new Error(`Cornell API error: ${res.status} ${res.statusText}`)
  }

  const json = (await res.json()) as CornellApiResponse

  if (json.status !== 'success') {
    throw new Error(`Cornell API returned non-success status: ${json.status}`)
  }

  return json.data.eateries
}

/**
 * Map Cornell's meal period string to our MealPeriod type
 */
export function parseMealPeriod(calSummary: string): MealPeriod {
  const s = calSummary.toLowerCase()
  if (s.includes('breakfast')) return 'breakfast'
  if (s.includes('brunch')) return 'brunch'
  if (s.includes('lunch')) return 'lunch'
  if (s.includes('dinner') || s.includes('supper')) return 'dinner'
  if (s.includes('late') || s.includes('night')) return 'late_night'
  return 'lunch' // fallback
}

/**
 * Extract flat list of unique item names from an eatery for a given date.
 * Used by the nutrition enrichment pipeline.
 */
export function extractMenuItemNames(eatery: CornellEatery): string[] {
  const seen = new Set<string>()
  const names: string[] = []

  for (const dayHours of eatery.operatingHours) {
    for (const event of dayHours.events) {
      if (!event.menu) continue
      for (const item of event.menu.items) {
        const name = item.item.trim()
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase())
          names.push(name)
        }
      }
    }
  }

  return names
}

/**
 * Get today's meal events for an eatery, keyed by meal period
 */
export function getTodayEvents(eatery: CornellEatery) {
  const today = new Date()
    .toLocaleDateString('en-US', { weekday: 'long' })
    .toLowerCase()

  const todayHours = eatery.operatingHours.find(
    (h) => h.weekday.toLowerCase() === today
  )

  return todayHours?.events ?? []
}
