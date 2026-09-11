import type { SupabaseClient } from '@supabase/supabase-js'

export type PodiumEntry = { name: string; points: number }

// Top 3 by total points for one COMPLETED competition — Futzy never
// eligible for a place, same rule as everywhere else he could otherwise
// top a table. No live-preview merge here (unlike the Leaderboard/Winners
// page's own version, which also has to handle a still-in-progress
// competition) since a completed competition's points are already final.
export async function computeCompletedCompetitionPodium(
  supabase: SupabaseClient,
  competitionId: string
): Promise<PodiumEntry[]> {
  const [{ data: entries }, { data: pointsRows }, { data: profiles }, { data: bonusCardPlays }] = await Promise.all([
    supabase.from('competition_entries').select('user_id').eq('competition_id', competitionId).eq('removed', false),
    supabase.from('points').select('user_id, total_points').eq('competition_id', competitionId),
    supabase.from('profiles').select('id, display_name, is_bot'),
    supabase.from('bonus_card_plays').select('user_id, points').eq('competition_id', competitionId),
  ])

  const nameByUid: Record<string, string> = {}
  const isBotByUid: Record<string, boolean> = {}
  profiles?.forEach(p => { nameByUid[p.id] = p.display_name ?? 'Unknown'; isBotByUid[p.id] = p.is_bot ?? false })

  const totals: Record<string, number> = {}
  entries?.forEach(e => { totals[e.user_id] = 0 })
  pointsRows?.forEach(p => { if (p.user_id in totals) totals[p.user_id] += p.total_points ?? 0 })
  bonusCardPlays?.forEach(play => {
    if (!(play.user_id in totals) || play.points == null) return
    totals[play.user_id] += play.points
  })

  return Object.entries(totals)
    .filter(([uid]) => !isBotByUid[uid])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([uid, pts]) => ({ name: nameByUid[uid] ?? 'Unknown', points: Math.round(pts) }))
}
