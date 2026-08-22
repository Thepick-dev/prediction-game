import type { SupabaseClient } from '@supabase/supabase-js'

// FPL's fixture-stats endpoint reports goals/assists/own-goals per player,
// identified by FPL's own player id — which is exactly what we already
// store as players.id (see app/api/sync/fpl/route.ts), so no id bridging
// is needed there. FPL fixture ids and team ids are a different space to
// ours though, so we match each FPL fixture to one of ours via team
// short_code (already populated by the player sync) plus the gameweek.
const STAT_TO_EVENT_TYPE: Record<string, string> = {
  goals_scored: 'goal',
  assists: 'assist',
  own_goals: 'own_goal',
}

export type SyncEventsResult =
  | {
      success: true
      fixtures_matched: number
      events_inserted: number
      scores_updated: number
      unmatched: string[]
      teams_missing_short_code: string[]
    }
  | { success: false; error: string; unmatched?: string[]; teams_missing_short_code?: string[] }

// Shared by the admin "Sync from FPL" button (app/api/admin/sync-events)
// and the automated live-sync cron (app/api/cron/live-sync) so both call
// the exact same matching/scoring logic rather than risking two
// implementations drifting apart. Works with either a regular admin
// session or the service-role client — fixtures/match_events aren't
// user-scoped rows, so unlike picks/AoN/Bonus Card there's no RLS "own
// row only" trap here; the admin route already proved this works fine
// with the caller's own session.
export async function syncEventsForGameweek(
  supabase: SupabaseClient,
  gameweek_id: string,
  fpl_event: string | number
): Promise<SyncEventsResult> {
  const { data: ourFixtures, error: fixturesError } = await supabase
    .from('fixtures')
    .select('id, home_team_id, away_team_id')
    .eq('gameweek_id', gameweek_id)

  if (fixturesError) {
    return { success: false, error: fixturesError.message }
  }
  if (!ourFixtures || ourFixtures.length === 0) {
    return { success: false, error: 'No fixtures found for this gameweek — add fixtures before syncing events.' }
  }

  const { data: ourTeams } = await supabase.from('teams').select('id, name, short_code')
  const teamsMissingCode = (ourTeams ?? []).filter(t => !t.short_code).map(t => t.name)
  const ourTeamIdByCode: Record<string, number> = {}
  ourTeams?.forEach(t => { if (t.short_code) ourTeamIdByCode[t.short_code] = t.id })

  const fixtureByTeamPair: Record<string, number> = {}
  ourFixtures.forEach(f => { fixtureByTeamPair[`${f.home_team_id}-${f.away_team_id}`] = f.id })

  const [bootstrapRes, fixturesRes] = await Promise.all([
    fetch('https://fantasy.premierleague.com/api/bootstrap-static/', { headers: { 'User-Agent': 'prediction-game/1.0' } }),
    fetch(`https://fantasy.premierleague.com/api/fixtures/?event=${encodeURIComponent(String(fpl_event))}`, { headers: { 'User-Agent': 'prediction-game/1.0' } }),
  ])

  if (!bootstrapRes.ok || !fixturesRes.ok) {
    return { success: false, error: 'Failed to fetch data from FPL' }
  }

  const bootstrap = await bootstrapRes.json()
  const fplFixtures = await fixturesRes.json()

  const fplTeamIdToOurTeamId: Record<number, number> = {}
  bootstrap.teams.forEach((ft: any) => {
    const ourId = ourTeamIdByCode[ft.short_name]
    if (ourId) fplTeamIdToOurTeamId[ft.id] = ourId
  })

  const matchedFixtureIds = new Set<number>()
  const unmatchedFplFixtures: string[] = []
  const eventsToInsert: { fixture_id: number; player_id: number; event_type: string; team_id: number | null }[] = []
  const scoreUpdates: { fixture_id: number; home_score: number; away_score: number; status: 'finished' | 'in_play' }[] = []

  for (const ff of fplFixtures) {
    const ourHomeId = fplTeamIdToOurTeamId[ff.team_h]
    const ourAwayId = fplTeamIdToOurTeamId[ff.team_a]
    const label = `FPL fixture ${ff.team_h} v ${ff.team_a}`

    if (!ourHomeId || !ourAwayId) {
      unmatchedFplFixtures.push(`${label} (team not mapped — run an FPL player sync first)`)
      continue
    }

    const ourFixtureId = fixtureByTeamPair[`${ourHomeId}-${ourAwayId}`]
    if (!ourFixtureId) {
      unmatchedFplFixtures.push(`${label} (no matching fixture in this gameweek)`)
      continue
    }

    // `started` covers kicked-off-but-still-playing too, not just finished
    // — FPL's stats (goals/assists) update live during a match, so this
    // can be re-run mid-game for a running provisional score, not just
    // after full time. Always safe to re-run at any point since it deletes
    // and re-inserts rather than adding on top.
    if (!ff.started) {
      unmatchedFplFixtures.push(`${label} (hasn't kicked off yet on FPL — skipped)`)
      continue
    }

    matchedFixtureIds.add(ourFixtureId)
    if (typeof ff.team_h_score === 'number' && typeof ff.team_a_score === 'number') {
      // Only mark the fixture "finished" once FPL's own provisional
      // full-time flag agrees — otherwise a mid-match sync would freeze it
      // as finished while still being played.
      scoreUpdates.push({
        fixture_id: ourFixtureId,
        home_score: ff.team_h_score,
        away_score: ff.team_a_score,
        status: ff.finished_provisional ? 'finished' : 'in_play',
      })
    }

    ;(ff.stats ?? []).forEach((stat: any) => {
      const eventType = STAT_TO_EVENT_TYPE[stat.identifier]
      if (!eventType) return
      ;(['h', 'a'] as const).forEach(side => {
        ;(stat[side] ?? []).forEach((entry: { element: number; value: number }) => {
          const teamId = side === 'h' ? ourHomeId : ourAwayId
          for (let i = 0; i < entry.value; i++) {
            eventsToInsert.push({ fixture_id: ourFixtureId, player_id: entry.element, event_type: eventType, team_id: teamId })
          }
        })
      })
    })
  }

  if (matchedFixtureIds.size === 0) {
    return {
      success: false,
      error: 'Could not match any FPL fixtures to this gameweek.',
      unmatched: unmatchedFplFixtures,
      teams_missing_short_code: teamsMissingCode,
    }
  }

  // Re-syncing is meant to replace manual/previous entries for these
  // fixtures with a fresh pull, not add on top of them — otherwise
  // clicking the button (or the automated poll) twice would double-count
  // every goal.
  const { error: deleteError } = await supabase
    .from('match_events')
    .delete()
    .in('fixture_id', Array.from(matchedFixtureIds))

  if (deleteError) {
    return { success: false, error: deleteError.message }
  }

  if (eventsToInsert.length > 0) {
    const { error: insertError } = await supabase.from('match_events').insert(eventsToInsert)
    if (insertError) {
      return { success: false, error: insertError.message }
    }
  }

  for (const s of scoreUpdates) {
    await supabase.from('fixtures').update({ home_score: s.home_score, away_score: s.away_score, status: s.status }).eq('id', s.fixture_id)
  }

  return {
    success: true,
    fixtures_matched: matchedFixtureIds.size,
    events_inserted: eventsToInsert.length,
    scores_updated: scoreUpdates.length,
    unmatched: unmatchedFplFixtures,
    teams_missing_short_code: teamsMissingCode,
  }
}
