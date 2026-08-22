import type { SupabaseClient } from '@supabase/supabase-js'

// A suspended user gets no picks row at all for the gameweek(s) they miss —
// see the "Yellow & Red Card discipline system" plan. This is the single
// query every autopick/scoring call site uses to find who that is, so the
// "who's suspended" definition can never drift between them.
export async function getSuspendedUserIds(supabase: SupabaseClient, gameweek_id: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('suspension_gameweeks')
    .select('suspensions!inner(user_id, status)')
    .eq('gameweek_id', gameweek_id)
    .eq('suspensions.status', 'active')

  return new Set((data ?? []).map((r: any) => r.suspensions.user_id))
}

export type SuspensionDetail = {
  user_id: string
  suspension_number: number
  gameweeks_count: number
  reason: string
}

// Same idea, but keeps the detail needed to render a "SUSPENDED" row (the
// Results grid) rather than just the id set.
export async function getSuspensionDetailsForGameweek(supabase: SupabaseClient, gameweek_id: string): Promise<Map<string, SuspensionDetail>> {
  const { data } = await supabase
    .from('suspension_gameweeks')
    .select('suspensions!inner(user_id, status, suspension_number, gameweeks_count, reason)')
    .eq('gameweek_id', gameweek_id)
    .eq('suspensions.status', 'active')

  const map = new Map<string, SuspensionDetail>()
  ;(data ?? []).forEach((r: any) => {
    const s = r.suspensions
    map.set(s.user_id, {
      user_id: s.user_id,
      suspension_number: s.suspension_number,
      gameweeks_count: s.gameweeks_count,
      reason: s.reason,
    })
  })
  return map
}
