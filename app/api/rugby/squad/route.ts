import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireUser } from '../../../lib/require-admin'
import { NextResponse } from 'next/server'

// Submitting your one-time initial squad (6 players, one per team, one
// designated kicker). Deliberately goes through the service-role client
// even though a user only ever writes their OWN rows here — computing
// each pick's contrarian bonus needs to see how many OTHER users already
// have that player, and the site's hard pre-deadline privacy rule means a
// normal session's RLS can't see anyone else's picks yet. Only the
// resulting aggregate percentage is ever computed and stored here — the
// raw rows behind it are never returned to the client.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const user = await requireUser(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }
  const db = createAdminSupabaseClient()

  const { competition_id, picks, kicker_player_id } = await request.json()

  if (!competition_id || !Array.isArray(picks) || picks.length !== 6 || !kicker_player_id) {
    return NextResponse.json({ error: 'A squad needs exactly 6 players, one per team, and one marked as kicker' }, { status: 400 })
  }

  const { data: round1 } = await db.schema('rugby').from('rounds').select('id, number, deadline').eq('competition_id', competition_id).eq('number', 1).maybeSingle()
  if (!round1) {
    return NextResponse.json({ error: 'Round 1 has not been set up yet' }, { status: 400 })
  }
  if (new Date() >= new Date(round1.deadline)) {
    return NextResponse.json({ error: "Round 1's deadline has passed — squads can no longer be drafted" }, { status: 400 })
  }

  const { data: existing } = await db.schema('rugby').from('season_squad_picks').select('id').eq('competition_id', competition_id).eq('user_id', user.id).limit(1)
  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'You already have a squad for this competition' }, { status: 400 })
  }

  const { data: teams } = await db.schema('rugby').from('teams').select('id').eq('active', true)
  const teamIds = new Set((teams ?? []).map(t => t.id))

  const { data: playerRows } = await db.schema('rugby').from('players').select('id, team_id').in('id', picks.map((p: { player_id: number }) => p.player_id))
  const teamByPlayerId = new Map<number, number>()
  playerRows?.forEach(p => teamByPlayerId.set(p.id, p.team_id))

  const pickedTeamIds = new Set<number>()
  for (const p of picks) {
    const teamId = teamByPlayerId.get(p.player_id)
    if (teamId == null) {
      return NextResponse.json({ error: `Player ${p.player_id} not found` }, { status: 400 })
    }
    if (pickedTeamIds.has(teamId)) {
      return NextResponse.json({ error: 'Only one player per team is allowed' }, { status: 400 })
    }
    pickedTeamIds.add(teamId)
  }
  if (pickedTeamIds.size !== teamIds.size || ![...pickedTeamIds].every(id => teamIds.has(id))) {
    return NextResponse.json({ error: 'Your squad must have exactly one player from every active team' }, { status: 400 })
  }
  if (!picks.some((p: { player_id: number }) => p.player_id === kicker_player_id)) {
    return NextResponse.json({ error: 'The kicker must be one of your 6 picks' }, { status: 400 })
  }

  // Contrarian %: for each pick, how many OTHER active picks (any user)
  // already have that same player, against how many users currently have
  // a squad at all — a snapshot frozen at the moment of picking.
  const { data: allActivePicks } = await db.schema('rugby').from('season_squad_picks').select('user_id, player_id').eq('competition_id', competition_id).eq('active', true)
  const fieldSize = new Set((allActivePicks ?? []).map(p => p.user_id)).size

  const rowsToInsert = picks.map((p: { player_id: number }) => {
    const holders = (allActivePicks ?? []).filter(row => row.player_id === p.player_id).length
    const pct = fieldSize > 0 ? (holders / fieldSize) * 100 : 0
    return {
      competition_id,
      user_id: user.id,
      player_id: p.player_id,
      is_kicker: p.player_id === kicker_player_id,
      is_initial_pick: true,
      active: true,
      contrarian_pct_at_pick: pct,
      round_acquired: round1.number,
      round_removed: null,
    }
  })

  const { error } = await db.schema('rugby').from('season_squad_picks').insert(rowsToInsert)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
