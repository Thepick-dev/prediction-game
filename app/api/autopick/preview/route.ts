import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { deriveAutopick } from '../../../lib/autopick'
import { requireUser } from '../../../lib/require-admin'
import { getSuspendedUserIds } from '../../../lib/suspensions'
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

  // None of these three depend on each other, so they go out together
  // rather than one-after-another — this route is polled by the
  // Leaderboard, Picks, and Stats Hub for every still-live gameweek.
  const [{ data: entries }, { data: existingPicks }, suspendedUserIds] = await Promise.all([
    supabase.from('competition_entries').select('user_id').eq('competition_id', gameweek.competition_id).eq('removed', false),
    supabase.from('picks').select('user_id').eq('gameweek_id', gameweek_id),
    getSuspendedUserIds(supabase, gameweek_id),
  ])

  const existingPickUserIds = new Set(existingPicks?.map(p => p.user_id) ?? [])
  const missingUsers = entries?.filter(e => !existingPickUserIds.has(e.user_id) && !suspendedUserIds.has(e.user_id)) ?? []

  // Each missing user's autopick derivation is independent of every other
  // user's — run them together rather than one at a time, since a busy
  // gameweek can have a dozen+ of these outstanding right after a deadline
  // passes and before everyone's real autopick has been written.
  const derived = await Promise.all(
    missingUsers.map(entry => deriveAutopick(supabase, entry.user_id, gameweek_id, gameweek.competition_id))
  )

  const previews: Record<string, { team_id: number; player1_id: number; player2_id: number }> = {}
  missingUsers.forEach((entry, i) => {
    if (derived[i]) previews[entry.user_id] = derived[i]!
  })

  return NextResponse.json({ previews })
}