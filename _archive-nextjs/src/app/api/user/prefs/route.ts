import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const PrefsSchema = z.object({
  daily_calorie_goal: z.number().min(500).max(5000),
  protein_goal_g: z.number().min(0).max(400),
  carb_goal_g: z.number().min(0).max(800),
  fat_goal_g: z.number().min(0).max(300),
  liked_foods: z.array(z.string()).default([]),
  disliked_foods: z.array(z.string()).default([]),
  dietary_restrictions: z.array(z.string()).default([]),
  meal_count_per_day: z.number().min(1).max(6).default(3),
  onboarding_complete: z.boolean().optional(),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ prefs: data ?? null })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const prefs = PrefsSchema.parse(body)

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert({ ...prefs, user_id: user.id, updated_at: new Date().toISOString() })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ prefs: data })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
