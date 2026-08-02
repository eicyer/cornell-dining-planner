import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTodayDate } from '@/lib/utils'

/**
 * GET /api/menus?eatery_id=123&meal_period=lunch&date=2024-01-15
 * Returns menu items for a given eatery + meal period + date
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const eateryId = searchParams.get('eatery_id')
  const mealPeriod = searchParams.get('meal_period')
  const date = searchParams.get('date') ?? getTodayDate()

  const supabase = await createClient()

  let query = supabase
    .from('menu_items')
    .select('*')
    .eq('date', date)
    .order('meal_period')
    .order('station')
    .order('name')

  if (eateryId) query = query.eq('eatery_id', parseInt(eateryId))
  if (mealPeriod) query = query.eq('meal_period', mealPeriod)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data, date })
}
