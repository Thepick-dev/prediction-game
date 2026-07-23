import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'

async function requireAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

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

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const { gameweek_id, fpl_event } = await request.json()
  if (!gameweek_id || !fpl_event) {
    return NextResponse.json({ error: 'Missing gameweek_id or fpl_event' }, { status: 400 })
  }

  const { data: ourFixtures, error: fixturesError } = await supabase
    .from('fixtures')
    .select('id, home_team_id, away_team_id')
    .eq('gameweek_id', gameweek_id)

  if (fixturesError) {
    return NextResponse.json({ error: fixturesError.message }, { status: 500 })
  }
  if (!ourFixtures || ourFixtures.length === 0) {
    return NextResponse.json({ error: 'No fixtures found for this gameweek — add fixtures before syncing events.' }, { status: 400 })
  }

  const { data: ourTeams } = await supabase.from('teams').select('id, name, short_code')
  const teamsMissingCode = (ourTeams ?? []).filter(t => !t.short_code).map(t => t.name)
  const ourTeamIdByCode: Record<string, number> = {}
  ourTeams?.forEach(t => { if (t.short_code) ourTeamIdByCode[t.short_code] = t.id })

  const fixtureByTeamPair: Record<string, number> = {}
  ourFixtures.forEach(f => { fixtureByTeamPair[`${f.home_team_id}-${f.away_team_id}`] = f.id })

  const [bootstrapRes, fixturesRes] = await Promise.all([
    fetch('https://fantasy.premierleague.com/api/bootstrap-static/', { headers: { 'User-Agent': 'prediction-game/1.0' } }),
    fetch(`https://fantasy.premierleague.com/api/fixtures/?event=${encodeURIComponent(fpl_event)}`, { headers: { 'User-Agent': 'prediction-game/1.0' } }),
  ])

  if (!bootstrapRes.ok || !fixturesRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch data from FPL' }, { status: 502 })
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
  const scoreUpdates: { fixture_id: number; home_score: number; away_score: number }[] = []

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

    if (!ff.finished) {
      unmatchedFplFixtures.push(`${label} (not finished yet on FPL — skipped)`)
      continue
    }

    matchedFixtureIds.add(ourFixtureId)
    if (typeof ff.team_h_score === 'number' && typeof ff.team_a_score === 'number') {
      scoreUpdates.push({ fixture_id: ourFixtureId, home_score: ff.team_h_score, away_score: ff.team_a_score })
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
    return NextResponse.json({
      error: 'Could not match any FPL fixtures to this gameweek.',
      unmatched: unmatchedFplFixtures,
      teams_missing_short_code: teamsMissingCode,
    }, { status: 400 })
  }

  // Re-syncing is meant to replace manual/previous entries for these
  // fixtures with a fresh pull, not add on top of them — otherwise
  // clicking the button twice would double-count every goal.
  const { error: deleteError } = await supabase
    .from('match_events')
    .delete()
    .in('fixture_id', Array.from(matchedFixtureIds))

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  if (eventsToInsert.length > 0) {
    const { error: insertError } = await supabase.from('match_events').insert(eventsToInsert)
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  for (const s of scoreUpdates) {
    await supabase.from('fixtures').update({ home_score: s.home_score, away_score: s.away_score, status: 'finished' }).eq('id', s.fixture_id)
  }

  return NextResponse.json({
    success: true,
    fixtures_matched: matchedFixtureIds.size,
    events_inserted: eventsToInsert.length,
    scores_updated: scoreUpdates.length,
    unmatched: unmatchedFplFixtures,
    teams_missing_short_code: teamsMissingCode,
  })
}
