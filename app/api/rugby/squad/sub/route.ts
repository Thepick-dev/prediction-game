import { createServerSupabaseClient } from '../../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../../lib/supabase-admin'
import { requireUser } from '../../../../lib/require-admin'
import { NextResponse } from 'next/server'

// A substitution always swaps within the same team (the "one player per
// team" shape must never break) — takes effect from whichever round is
// currently open, not retroactively. Whether it's free or costs points is
// decided later, by app/lib/rugbyScoring.ts, purely from how many prior
// subs this user has made — nothing here needs to know the price at
// sub-time.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const user = await requireUser(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }
  const db = createAdminSupabaseClient()

  const { competition_id, old_player_id, new_player_id } = await request.json()
  if (!competition_id || !old_player_id || !new_player_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (old_player_id === new_player_id) {
    return NextResponse.json({ error: 'That is already your pick' }, { status: 400 })
  }

  const { data: oldPick } = await db.schema('rugby').from('season_squad_picks')
    .select('id, player_id, is_kicker')
    .eq('competition_id', competition_id).eq('user_id', user.id).eq('player_id', old_player_id).eq('active', true)
    .maybeSingle()
  if (!oldPick) {
    return NextResponse.json({ error: 'That player is not currently in your squad' }, { status: 400 })
  }

  const [{ data: oldPlayerRow }, { data: newPlayerRow }] = await Promise.all([
    db.schema('rugby').from('players').select('team_id').eq('id', old_player_id).single(),
    db.schema('rugby').from('players').select('team_id').eq('id', new_player_id).single(),
  ])
  if (!oldPlayerRow || !newPlayerRow || oldPlayerRow.team_id !== newPlayerRow.team_id) {
    return NextResponse.json({ error: 'A substitute must be from the same team as the player they replace' }, { status: 400 })
  }

  // "Currently open" = the earliest round whose deadline hasn't passed —
  // a sub can only ever apply going forward, never to an already-locked round.
  const { data: rounds } = await db.schema('rugby').from('rounds').select('id, number, deadline').eq('competition_id', competition_id).order('number')
  const currentRound = (rounds ?? []).find(r => new Date(r.deadline) > new Date())
  if (!currentRound) {
    return NextResponse.json({ error: 'There is no upcoming round left to make this substitution for' }, { status: 400 })
  }

  const { data: allActivePicks } = await db.schema('rugby').from('season_squad_picks').select('user_id, player_id').eq('competition_id', competition_id).eq('active', true)
  const fieldSize = new Set((allActivePicks ?? []).map(p => p.user_id)).size
  const holders = (allActivePicks ?? []).filter(row => row.player_id === new_player_id).length
  const pct = fieldSize > 0 ? (holders / fieldSize) * 100 : 0

  const { error: updateError } = await db.schema('rugby').from('season_squad_picks')
    .update({ active: false, round_removed: currentRound.number })
    .eq('id', oldPick.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const { error: insertError } = await db.schema('rugby').from('season_squad_picks').insert({
    competition_id, user_id: user.id, player_id: new_player_id,
    is_kicker: oldPick.is_kicker, // carries over automatically; change it separately if needed
    is_initial_pick: false, active: true,
    contrarian_pct_at_pick: pct,
    round_acquired: currentRound.number, round_removed: null,
  })
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
