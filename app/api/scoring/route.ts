import { createServerSupabaseClient } from '../../lib/supabase-server'
import { calculateScoring } from '../../lib/scoring'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()

  const { gameweek_id } = await request.json()

  if (!gameweek_id) {
    return NextResponse.json({ error: 'gameweek_id is required' }, { status: 400 })
  }

  const result = await calculateScoring(supabase, gameweek_id)

  if ('error' in result) {
    const status = result.error === 'Gameweek not found' ? 404 : 500
    return NextResponse.json(result, { status })
  }

  return NextResponse.json(result)
}
