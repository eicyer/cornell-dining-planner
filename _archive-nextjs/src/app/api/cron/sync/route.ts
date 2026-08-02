import { NextRequest, NextResponse } from 'next/server'
import { fetchCornellEateries, parseMealPeriod } from '@/lib/cornell-api'
import { enrichItem } from '@/lib/nutrition'
import { createServiceClient } from '@/lib/supabase/server'
import { getTodayDate } from '@/lib/utils'

/**
 * POST /api/cron/sync
 *
 * Called by Vercel Cron (see vercel.json) every Monday at 6am.
 * Also callable manually with Authorization: Bearer ${CRON_SECRET}
 *
 * Flow:
 * 1. Fetch all eateries from Cornell API
 * 2. Upsert eateries into DB
 * 3. For each menu item today: upsert with nutrition data
 * 4. Items without nutrition: run enrichment pipeline
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`
  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = getTodayDate()
  let synced = 0
  let enriched = 0

  try {
    const eateries = await fetchCornellEateries()

    for (const eatery of eateries) {
      // 1. Upsert eatery
      await supabase.from('eateries').upsert({
        id: eatery.id,
        name: eatery.name,
        location: eatery.location ?? '',
        hours_json: eatery.operatingHours,
        updated_at: new Date().toISOString(),
      })

      // 2. Process today's menu items
      for (const dayHours of eatery.operatingHours) {
        for (const event of dayHours.events) {
          if (!event.menu?.items) continue

          const mealPeriod = parseMealPeriod(event.calSummary)

          for (const item of event.menu.items) {
            const name = item.item?.trim()
            if (!name) continue

            // Check if item already exists with nutrition data
            const { data: existing } = await supabase
              .from('menu_items')
              .select('id, nutrition_source')
              .eq('eatery_id', eatery.id)
              .eq('name', name)
              .eq('date', today)
              .eq('meal_period', mealPeriod)
              .single()

            if (existing) continue // Already synced

            // Determine nutrition
            let nutrition = {
              calories: item.calories ?? 0,
              protein_g: item.protein ?? 0,
              carbs_g: item.totalCarb ?? 0,
              fat_g: item.totalFat ?? 0,
              fiber_g: 0,
              source: 'cornell_api' as const,
              confidence_score: 0.9,
            }

            // If Cornell API has no calories, run enrichment pipeline
            if (!nutrition.calories) {
              const enriched_nutrition = await enrichItem(name)
              nutrition = {
                calories: enriched_nutrition.calories,
                protein_g: enriched_nutrition.protein_g,
                carbs_g: enriched_nutrition.carbs_g,
                fat_g: enriched_nutrition.fat_g,
                fiber_g: enriched_nutrition.fiber_g,
                source: enriched_nutrition.source,
                confidence_score: enriched_nutrition.confidence_score,
              }
              enriched++
            }

            await supabase.from('menu_items').upsert({
              eatery_id: eatery.id,
              name,
              meal_period: mealPeriod,
              date: today,
              calories: nutrition.calories,
              protein_g: nutrition.protein_g,
              carbs_g: nutrition.carbs_g,
              fat_g: nutrition.fat_g,
              fiber_g: nutrition.fiber_g,
              nutrition_source: nutrition.source,
              confidence_score: nutrition.confidence_score,
              dietary_tags: item.icons ?? [],
              is_healthy: item.healthy ?? false,
            })

            synced++
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      date: today,
      synced,
      enriched,
      eateries: eateries.length,
    })
  } catch (err) {
    console.error('Cron sync error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
