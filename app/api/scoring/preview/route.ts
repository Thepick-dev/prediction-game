import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { previewGameweekScoring } from '../../../lib/scoring'
import { NextResponse } from 'next/server'

// Live, read-only scoring preview for a gameweek that's locked (deadline
// passed) but not yet marked "completed" — see previewGameweekScoring for
// why this uses current quartiles rather than a frozen snapshot.
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()

  const { searchParams } = new URL(request.url)
  const gameweek_id = searchParams.get('gameweek_id')

  if (!gameweek_id) {
    return NextResponse.json({ error: 'gameweek_id is required' }, { status: 400 })
  }

  const result = await previewGameweekScoring(supabase, gameweek_id)

  if ('error' in result) {
    return NextResponse.json(result, { status: 404 })
  }

  return NextResponse.json(result)
}
