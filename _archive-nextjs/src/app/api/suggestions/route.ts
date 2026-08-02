import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { suggestMeals } from '@/lib/suggestions'
import { getTodayDate } from '@/lib/utils'
import type { MenuItem, UserPreferences } from '@/types'

const SuggestionsRequestSchema = z.object({
  eatery_id: z.number(),
  meal_period: z.enum(['breakfast', 'brunch', 'lunch', 'dinner', 'late_night']),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Auth check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { eatery_id, meal_period } = SuggestionsRequestSchema.parse(body)

    // Fetch user preferences
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!prefs) {
      return NextResponse.json({ error: 'Complete onboarding first' }, { status: 400 })
    }

    // Fetch today's menu items for this eatery + meal period
    const { data: items, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('eatery_id', eatery_id)
      .eq('date', getTodayDate())
      .eq('meal_period', meal_period)

    if (error) throw error
    if (!items || items.length === 0) {
      return NextResponse.json({ suggestions: [], message: 'No menu items found' })
    }

    // Fetch eatery name
    const { data: eatery } = await supabase
      .from('eateries')
      .select('name')
      .eq('id', eatery_id)
      .single()

    const suggestions = await suggestMeals({
      eateryName: eatery?.name ?? 'Dining Hall',
      items: items as MenuItem[],
      userPrefs: prefs as UserPreferences,
      mealPeriod: meal_period,
    })

    return NextResponse.json({ suggestions })
  } catch (err) {
    console.error('Suggestions error:', err)
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
