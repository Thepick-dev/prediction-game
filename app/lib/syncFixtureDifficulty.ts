import type { SupabaseClient } from '@supabase/supabase-js'
import { getFplTeamMapping } from './fplTeamMapping'

export type SyncFixtureDifficultyResult =
  | { success: true; fixtures_matched: number; fixtures_unmatched: number }
  | { success: false; error: string }

// FPL rates every fixture 1 (easiest) to 5 (hardest) for both sides — a
// second opinion alongside our own quartile system, surfaced on the Form
// Guide and used as a gentle secondary nudge in Futzy's projections (see
// botPick.ts). One API call for the WHOLE season's fixtures, not one per
// fixture — cheap regardless of how many teams/matches exist.
//
// FPL's own fixture ids don't match football-data.org's (what our own
// `fixtures` table is keyed by), so matching is done by team pair +
// kickoff date instead — reliable since two teams only play each other
// twice a season, on two clearly different dates.
export async function syncFixtureDifficulty(supabase: SupabaseClient): Promise<SyncFixtureDifficultyResult> {
  const response = await fetch(
    'https://fantasy.premierleague.com/api/fixtures/',
    { headers: { 'User-Agent': 'prediction-game/1.0' } }
  )
  if (!response.ok) {
    return { success: false, error: 'Failed to fetch FPL fixtures' }
  }
  const fplFixtures: any[] = await response.json()

  let fplTeams: { id: number; short_name: string; name: string }[]
  try {
    const bootstrapRes = await fetch(
      'https://fantasy.premierleague.com/api/bootstrap-static/',
      { headers: { 'User-Agent': 'prediction-game/1.0' } }
    )
    fplTeams = (await bootstrapRes.json()).teams
  } catch {
    return { success: false, error: 'Failed to fetch FPL teams for difficulty mapping' }
  }

  const fplTeamIdToOurTeamId = await getFplTeamMapping(supabase, fplTeams)

  const { data: ourFixtures } = await supabase
    .from('fixtures')
    .select('id, home_team_id, away_team_id, kickoff_time')

  let matched = 0
  let unmatched = 0

  const updates: { id: number; home_difficulty: number; away_difficulty: number }[] = []

  for (const f of fplFixtures) {
    if (f.team_h_difficulty == null || f.team_a_difficulty == null || !f.kickoff_time) continue
    const ourHomeId = fplTeamIdToOurTeamId[f.team_h]
    const ourAwayId = fplTeamIdToOurTeamId[f.team_a]
    if (!ourHomeId || !ourAwayId) { unmatched++; continue }

    const fplKickoff = new Date(f.kickoff_time).getTime()
    const match = (ourFixtures ?? []).find(of =>
      of.home_team_id === ourHomeId &&
      of.away_team_id === ourAwayId &&
      of.kickoff_time &&
      Math.abs(new Date(of.kickoff_time).getTime() - fplKickoff) < 1000 * 60 * 60 * 36 // within 36h — same real match, allows for a rescheduled kickoff time
    )
    if (!match) { unmatched++; continue }

    updates.push({ id: match.id, home_difficulty: f.team_h_difficulty, away_difficulty: f.team_a_difficulty })
    matched++
  }

  // Its own isolated write — same defensive convention as everywhere else:
  // if home_difficulty/away_difficulty don't exist yet (SQL not run), this
  // fails silently rather than throwing, and Futzy/the Form Guide just fall
  // back to no FDR signal until the SQL's been run.
  for (let i = 0; i < updates.length; i += 50) {
    const chunk = updates.slice(i, i + 50)
    await Promise.all(chunk.map(u =>
      supabase.from('fixtures').update({ home_difficulty: u.home_difficulty, away_difficulty: u.away_difficulty }).eq('id', u.id)
    )).catch(() => {})
  }

  return { success: true, fixtures_matched: matched, fixtures_unmatched: unmatched }
}
