import type { SupabaseClient } from '@supabase/supabase-js'

// Every rugby scoring layer sums into ONE grand total per user — mirrors
// how football's leaderboard treats Banker/AoN/Bonus Card as all feeding
// one number. Three separate call sites (leaderboard, winners, stats hub)
// used to each hand-roll their own partial sum (leaderboard: squad only;
// winners: squad + season, missing match predictions) — this is the single
// place that sums all three correctly, so they can't drift apart again.
export type RugbyGrandTotal = {
  userId: string
  squadPoints: number
  matchPoints: number
  seasonPoints: number
  total: number
}

export async function computeRugbyGrandTotals(
  supabase: SupabaseClient,
  competitionId: string,
  userIds: string[]
): Promise<Map<string, RugbyGrandTotal>> {
  const totals = new Map<string, RugbyGrandTotal>()
  userIds.forEach(id => totals.set(id, { userId: id, squadPoints: 0, matchPoints: 0, seasonPoints: 0, total: 0 }))
  if (userIds.length === 0) return totals

  // season_squad_points/match_prediction_points have no competition_id column
  // of their own (only round_id) — without scoping through rounds first, a
  // user who's played more than one competition would have a past season's
  // points silently added into this season's total.
  const { data: rounds } = await supabase.schema('rugby').from('rounds').select('id').eq('competition_id', competitionId)
  const roundIds = (rounds ?? []).map((r: { id: string }) => r.id)

  const [{ data: squadPoints }, { data: matchPoints }, { data: seasonPoints }] = await Promise.all([
    roundIds.length
      ? supabase.schema('rugby').from('season_squad_points').select('user_id, total_points').in('user_id', userIds).in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
    roundIds.length
      ? supabase.schema('rugby').from('match_prediction_points').select('user_id, total_points').in('user_id', userIds).in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
    supabase.schema('rugby').from('season_prediction_points').select('user_id, points').eq('competition_id', competitionId).in('user_id', userIds),
  ])

  ;(squadPoints ?? []).forEach((r: { user_id: string; total_points: number }) => {
    const row = totals.get(r.user_id)
    if (row) { row.squadPoints += r.total_points; row.total += r.total_points }
  })
  ;(matchPoints ?? []).forEach((r: { user_id: string; total_points: number }) => {
    const row = totals.get(r.user_id)
    if (row) { row.matchPoints += r.total_points; row.total += r.total_points }
  })
  ;(seasonPoints ?? []).forEach((r: { user_id: string; points: number }) => {
    const row = totals.get(r.user_id)
    if (row) { row.seasonPoints += r.points; row.total += r.points }
  })

  return totals
}
