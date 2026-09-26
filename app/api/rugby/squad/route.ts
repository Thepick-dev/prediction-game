import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireUser } from '../../../lib/require-admin'
import { NextResponse } from 'next/server'

// Submitting your one-time initial squad (6 players, at most 2 from any
// one team). Deliberately goes through the service-role client even
// though a user only ever writes their OWN rows here — computing each
// pick's contrarian bonus needs to see how many OTHER users already have
// that player, and the site's hard pre-deadline privacy rule means a
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

  const { competition_id, picks, captain_player_id } = await request.json()

  if (!competition_id || !Array.isArray(picks) || picks.length !== 6) {
    return NextResponse.json({ error: 'A squad needs exactly 6 players (at most 2 from any one team)' }, { status: 400 })
  }
  if (!captain_player_id || !picks.some((p: { player_id: number }) => p.player_id === captain_player_id)) {
    return NextResponse.json({ error: 'Pick one of your 6 as captain' }, { status: 400 })
  }

  const { data: round1 } = await db.schema('rugby').from('rounds').select('id, number, deadline').eq('competition_id', competition_id).eq('number', 1).maybeSingle()
  if (!round1) {
    return NextResponse.json({ error: 'Round 1 has not been set up yet' }, { status: 400 })
  }
  if (new Date() >= new Date(round1.deadline)) {
    return NextResponse.json({ error: "Round 1's deadline has passed — squads can no longer be drafted" }, { status: 400 })
  }

  // Before Round 1's deadline, a full redraft simply replaces the squad —
  // it hasn't started scoring anything yet, so there's no history to
  // protect and no reason to make someone spend a "sub" just to fix a
  // pick made minutes ago. The deadline check above is what actually
  // locks this once the season starts; the old squad's rows are deleted
  // outright rather than treated as subs.
  const { error: deleteExistingError } = await db.schema('rugby').from('season_squad_picks').delete().eq('competition_id', competition_id).eq('user_id', user.id)
  if (deleteExistingError) return NextResponse.json({ error: deleteExistingError.message }, { status: 500 })

  const { data: teams } = await db.schema('rugby').from('teams').select('id').eq('active', true)
  const teamIds = new Set((teams ?? []).map(t => t.id))

  const { data: playerRows } = await db.schema('rugby').from('players').select('id, team_id, value').in('id', picks.map((p: { player_id: number }) => p.player_id))
  const teamByPlayerId = new Map<number, number>()
  const valueByPlayerId = new Map<number, number>()
  playerRows?.forEach(p => { teamByPlayerId.set(p.id, p.team_id); valueByPlayerId.set(p.id, p.value ?? 0) })

  // At most 2 picks from any one team, 6 total (checked above) — no
  // longer required to touch every team, so a squad could legally be e.g.
  // 2+2+1+1+0+0 across the 6 nations.
  const pickedPlayerIds = new Set<number>()
  const teamCounts = new Map<number, number>()
  for (const p of picks) {
    const teamId = teamByPlayerId.get(p.player_id)
    if (teamId == null) {
      return NextResponse.json({ error: `Player ${p.player_id} not found` }, { status: 400 })
    }
    if (!teamIds.has(teamId)) {
      return NextResponse.json({ error: `Player ${p.player_id} is not on an active team` }, { status: 400 })
    }
    if (pickedPlayerIds.has(p.player_id)) {
      return NextResponse.json({ error: 'The same player can only be picked once' }, { status: 400 })
    }
    pickedPlayerIds.add(p.player_id)
    const count = (teamCounts.get(teamId) ?? 0) + 1
    teamCounts.set(teamId, count)
    if (count > 2) {
      return NextResponse.json({ error: 'No more than 2 players from the same team are allowed' }, { status: 400 })
    }
  }
  // Budget cap is a newer, optional competitions column — null means
  // uncapped, so a competition that never set one enforces nothing here.
  const { data: comp } = await db.schema('rugby').from('competitions').select('squad_budget_cap').eq('id', competition_id).maybeSingle()
  const budgetCap = (comp as { squad_budget_cap?: number | null } | null)?.squad_budget_cap ?? null
  if (budgetCap != null) {
    const totalValue = picks.reduce((sum: number, p: { player_id: number }) => sum + (valueByPlayerId.get(p.player_id) ?? 0), 0)
    if (totalValue > budgetCap) {
      return NextResponse.json({ error: `That squad costs £${totalValue.toLocaleString()}, which is over the £${budgetCap.toLocaleString()} budget` }, { status: 400 })
    }
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
      is_kicker: false, // legacy column, kept harmless — captaincy replaces this concept entirely
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

  // The initial captain pick — always free, never counts against the
  // captain-change budget (see computeCaptainChangePenalties). A fresh
  // squad replaces the old one entirely (same reasoning as the pick
  // delete above), so any prior captain_selections rows are cleared too.
  await db.schema('rugby').from('captain_selections').delete().eq('competition_id', competition_id).eq('user_id', user.id)
  const { error: captainError } = await db.schema('rugby').from('captain_selections').insert({
    competition_id, user_id: user.id, player_id: captain_player_id, round_effective_from: round1.number,
  })
  if (captainError) {
    return NextResponse.json({ error: captainError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
