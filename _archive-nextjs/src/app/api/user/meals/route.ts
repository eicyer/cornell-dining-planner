import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTodayDate } from '@/lib/utils'

const LoggedItemSchema = z.object({
  item_id: z.string(),
  item_name: z.string(),
  portion_multiplier: z.number(),
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
})

const LogMealSchema = z.object({
  date: z.string().optional(),
  meal_period: z.enum(['breakfast', 'brunch', 'lunch', 'dinner', 'late_night']),
  eatery_id: z.number(),
  eatery_name: z.string(),
  items: z.array(LoggedItemSchema),
  total_calories: z.number(),
  total_protein_g: z.number(),
  total_carbs_g: z.number(),
  total_fat_g: z.number(),
})

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = new URL(request.url).searchParams.get('date') ?? getTodayDate()

  const { data, error } = await supabase
    .from('logged_meals')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', date)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ meals: data, date })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const meal = LogMealSchema.parse(body)

    const { data, error } = await supabase
      .from('logged_meals')
      .insert({
        ...meal,
        user_id: user.id,
        date: meal.date ?? getTodayDate(),
        items_json: meal.items,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ meal: data })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
