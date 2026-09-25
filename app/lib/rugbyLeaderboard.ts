import type { SupabaseClient } from '@supabase/supabase-js'

// Every rugby scoring layer sums into ONE grand total per user — mirrors
// how football's leaderboard treats Banker/AoN/Bonus Card as all feeding
// one number. Just squad (Dream Team) + match predictions now — Tournament
// Predictions was removed as a whole feature, so season_prediction_points
// is deliberately not read here any more (it stays inert in the DB rather
// than being torn out, but nothing sums it into standings going forward).
export type RugbyGrandTotal = {
  userId: string
  squadPoints: number
  matchPoints: number
  total: number
}

export async function computeRugbyGrandTotals(
  supabase: SupabaseClient,
  competitionId: string,
  userIds: string[]
): Promise<Map<string, RugbyGrandTotal>> {
  const totals = new Map<string, RugbyGrandTotal>()
  userIds.forEach(id => totals.set(id, { userId: id, squadPoints: 0, matchPoints: 0, total: 0 }))
  if (userIds.length === 0) return totals

  // season_squad_points/match_prediction_points have no competition_id column
  // of their own (only round_id) — without scoping through rounds first, a
  // user who's played more than one competition would have a past season's
  // points silently added into this season's total.
  const { data: rounds } = await supabase.schema('rugby').from('rounds').select('id').eq('competition_id', competitionId)
  const roundIds = (rounds ?? []).map((r: { id: string }) => r.id)

  const [{ data: squadPoints }, { data: matchPoints }] = await Promise.all([
    roundIds.length
      ? supabase.schema('rugby').from('season_squad_points').select('user_id, total_points').in('user_id', userIds).in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
    roundIds.length
      ? supabase.schema('rugby').from('match_prediction_points').select('user_id, total_points').in('user_id', userIds).in('round_id', roundIds)
      : Promise.resolve({ data: [] }),
  ])

  ;(squadPoints ?? []).forEach((r: { user_id: string; total_points: number }) => {
    const row = totals.get(r.user_id)
    if (row) { row.squadPoints += r.total_points; row.total += r.total_points }
  })
  ;(matchPoints ?? []).forEach((r: { user_id: string; total_points: number }) => {
    const row = totals.get(r.user_id)
    if (row) { row.matchPoints += r.total_points; row.total += r.total_points }
  })

  return totals
}
