import type { SupabaseClient } from '@supabase/supabase-js'

export type SyncResultsResult =
  | { success: true; results_updated: number }
  | { success: false; error: string }

// Shared by the manual "Sync Results" button (app/api/sync/results) and the
// automated live-sync cron (app/api/cron/live-sync) — same reasoning as
// syncEvents.ts's extraction. Deliberately NOT gameweek-scoped: football-data.org
// only returns "currently finished" matches for the whole season, and
// re-upserting an old finished match is a harmless no-op (upsert by the
// match's own id), so this can be called wholesale every time without
// needing to know which gameweek is "live".
export async function syncResults(supabase: SupabaseClient): Promise<SyncResultsResult> {
  const matchesRes = await fetch(
    'https://api.football-data.org/v4/competitions/PL/matches?season=2026&status=FINISHED',
    {
      headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY! }
    }
  )

  if (!matchesRes.ok) {
    return { success: false, error: 'Failed to fetch results' }
  }

  const matchesData = await matchesRes.json()

  if (!matchesData.matches || matchesData.matches.length === 0) {
    return { success: true, results_updated: 0 }
  }

  const { error: fixturesError } = await supabase
    .from('fixtures')
    .upsert(
      matchesData.matches.map((match: any) => ({
        id: match.id,
        home_team_id: match.homeTeam.id,
        away_team_id: match.awayTeam.id,
        kickoff_time: match.utcDate,
        status: 'finished',
        home_score: match.score.fullTime.home,
        away_score: match.score.fullTime.away,
        matchday: match.matchday,
        season: '2026'
      })),
      { onConflict: 'id' }
    )

  if (fixturesError) {
    return { success: false, error: fixturesError.message }
  }

  await supabase.from('api_sync_log').insert({
    sync_type: 'results',
    status: 'success',
    records_updated: matchesData.matches.length
  })

  return { success: true, results_updated: matchesData.matches.length }
}
