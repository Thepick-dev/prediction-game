import { createServerSupabaseClient } from '../../lib/supabase-server'
import { deriveAutopick } from '../../lib/autopick'
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ message: 'Autopick route active' })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()

  const { gameweek_id } = await request.json()

  if (!gameweek_id) {
    return NextResponse.json({ error: 'gameweek_id is required' }, { status: 400 })
  }

  const { data: gameweek } = await supabase
    .from('gameweeks')
    .select('id, competition_id, deadline, status')
    .eq('id', gameweek_id)
    .single()

  if (!gameweek) {
    return NextResponse.json({ error: 'Gameweek not found' }, { status: 404 })
  }

  if (new Date() < new Date(gameweek.deadline)) {
    return NextResponse.json({ error: 'Deadline has not passed yet' }, { status: 400 })
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

  if (missingUsers.length === 0) {
    return NextResponse.json({ success: true, autopicks_created: 0, message: 'All players have picks' })
  }

  let autopicksCreated = 0

  for (const entry of missingUsers) {
    const derived = await deriveAutopick(supabase, entry.user_id, gameweek_id, gameweek.competition_id)
    if (!derived) continue

    const { error } = await supabase
      .from('picks')
      .insert({
        user_id: entry.user_id,
        competition_id: gameweek.competition_id,
        gameweek_id,
        team_id: derived.team_id,
        player1_id: derived.player1_id,
        player2_id: derived.player2_id,
        is_banker: false,
        is_autopick: true
      })

    if (!error) autopicksCreated++
  }

  return NextResponse.json({
    success: true,
    autopicks_created: autopicksCreated,
    missing_users: missingUsers.length
  })
}