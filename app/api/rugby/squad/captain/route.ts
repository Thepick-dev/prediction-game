import { createServerSupabaseClient } from '../../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../../lib/supabase-admin'
import { requireUser } from '../../../../lib/require-admin'
import { rulesWithDefaults, computeCaptainChangePenalties, type CaptainSelection } from '../../../../lib/rugbyScoring'
import { NextResponse } from 'next/server'

// Changing captain — takes effect from whichever round is currently open,
// same "currently open = earliest round whose deadline hasn't passed" rule
// as a sub. Never mutates a prior selection in place; always appends a new
// row (same event-log philosophy as season_squad_picks' round_acquired/
// round_removed) so historical rounds keep scoring against whoever was
// really captain at the time. Whether this specific change is free or
// costs points is decided by computeCaptainChangePenalties, purely from
// how many prior changes this user has made — reported back here so the
// UI can warn before committing.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const user = await requireUser(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }
  const db = createAdminSupabaseClient()

  const { competition_id, player_id } = await request.json()
  if (!competition_id || !player_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data: currentPick } = await db.schema('rugby').from('season_squad_picks')
    .select('id').eq('competition_id', competition_id).eq('user_id', user.id).eq('player_id', player_id).eq('active', true)
    .maybeSingle()
  if (!currentPick) {
    return NextResponse.json({ error: 'That player is not currently in your squad' }, { status: 400 })
  }

  const { data: rounds } = await db.schema('rugby').from('rounds').select('id, number, deadline').eq('competition_id', competition_id).order('number')
  const currentRound = (rounds ?? []).find(r => new Date(r.deadline) > new Date())
  if (!currentRound) {
    return NextResponse.json({ error: 'There is no upcoming round left to change captain for' }, { status: 400 })
  }

  const { data: existingSelections } = await db.schema('rugby').from('captain_selections')
    .select('id, user_id, player_id, round_effective_from, created_at').eq('competition_id', competition_id).eq('user_id', user.id)
  const selectionsList = (existingSelections ?? []) as CaptainSelection[]
  if (selectionsList.some(s => s.player_id === player_id && s.round_effective_from === currentRound.number)) {
    return NextResponse.json({ error: 'That player is already your captain from this round' }, { status: 400 })
  }

  const { data: rulesRows } = await db.schema('rugby').from('scoring_rules').select('rule_key, points').eq('competition_id', competition_id)
  const rules = rulesWithDefaults(rulesRows ?? [])

  const { data: inserted, error: insertError } = await db.schema('rugby').from('captain_selections').insert({
    competition_id, user_id: user.id, player_id, round_effective_from: currentRound.number,
  }).select('id, user_id, player_id, round_effective_from, created_at').single()
  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'Could not change captain' }, { status: 500 })
  }

  // Computed AFTER inserting — the penalty function needs this change's
  // own row present to correctly count it in chronological order.
  const penaltyBySelectionId = computeCaptainChangePenalties([...selectionsList, inserted as CaptainSelection], rules)
  const cost = penaltyBySelectionId[inserted.id] ?? 0

  return NextResponse.json({ success: true, cost })
}
