import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { deriveAutopick } from '../../../lib/autopick'
import { requireUser } from '../../../lib/require-admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  if (!(await requireUser(supabase))) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const gameweek_id = searchParams.get('gameweek_id')

  if (!gameweek_id) {
    return NextResponse.json({ error: 'gameweek_id is required' }, { status: 400 })
  }

  const { data: gameweek } = await supabase
    .from('gameweeks')
    .select('id, competition_id, deadline')
    .eq('id', gameweek_id)
    .single()

  if (!gameweek) {
    return NextResponse.json({ error: 'Gameweek not found' }, { status: 404 })
  }

  // Only preview autopicks once the deadline has passed — before that,
  // players are still choosing, so there's nothing to autopick yet.
  if (new Date() < new Date(gameweek.deadline)) {
    return NextResponse.json({ previews: {} })
  }

  const { data: entries } = await supabase
    .from('competition_entries')
    .select('user_id')
    .eq('competition_id', gameweek.competition_id)
    .eq('removed', false)

  const { data: existingPicks } = await supabase
    .from('picks')
    .select('user_id')
    .eq('gameweek_id', gameweek_id)

  const existingPickUserIds = new Set(existingPicks?.map(p => p.user_id) ?? [])
  const missingUsers = entries?.filter(e => !existingPickUserIds.has(e.user_id)) ?? []

  const previews: Record<string, { team_id: number; player1_id: number; player2_id: number }> = {}

  for (const entry of missingUsers) {
    const derived = await deriveAutopick(supabase, entry.user_id, gameweek_id, gameweek.competition_id)
    if (derived) {
      previews[entry.user_id] = derived
    }
  }

  return NextResponse.json({ previews })
}