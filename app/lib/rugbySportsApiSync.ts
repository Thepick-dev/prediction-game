import type { ResultRow, ScorerRow } from './rugbySheetSync'
import { sportsApiProGet } from './sportsApiProClient'

// Pulls real results, scorer events AND full player match stats from
// SportsAPI Pro (sportsapipro.com) for whichever of our own fixtures have
// already kicked off but aren't marked 'finished' yet. Produces the exact
// same ResultRow/ScorerRow shapes the spreadsheet sync already parses (see
// rugbySheetSync.ts), so both sources reconcile into match_events by the
// same logic — plus a new PlayerStatRow shape for rugby.player_match_stats
// (the tackles/meters/offloads/etc. categories added this session). This
// module only fetches and translates, it never touches the database.
//
// One call per match, not two: /match/:id/player-statistics already
// includes exact separate counts for tries/conversions/penalty
// goals/drop goals/cards per player — strictly better than the old
// /incidents-based approach, which could only lump penalty and drop goals
// together as "threePoints" and had to guess. No per-event minute is
// available this way (player-statistics gives match totals, not a
// timeline) — match_events.minute is set to null for API-sourced events,
// same as it already is for many spreadsheet-sourced ones.
//
// Matching a fixture to a SportsAPI Pro match: their match ids don't
// correspond to anything of ours, so matches are found by team-name pair
// on the fixture's own kickoff date (checked ±1 day, for timezone/late-
// notice reschedule safety). Matching a player to one of our own squad:
// by team + case-insensitive name, same as the spreadsheet sync's own
// player matching — a name SportsAPI Pro spells differently to how it's
// stored in our squads shows up as an "unmatched" warning rather than
// silently failing, exactly like a spreadsheet typo already does today.

export type DueFixture = {
  fixtureId: number
  round: number
  homeTeamName: string
  awayTeamName: string
  kickoffTime: string
}

export type PlayerStatRow = {
  round: number
  homeTeam: string
  awayTeam: string
  player: string
  meters_run: number
  clean_breaks: number
  offloads: number
  tackles: number
  tackles_missed: number
  try_assists: number
  is_substitute: boolean
}

export type FetchResult = {
  results: ResultRow[]
  scorers: ScorerRow[]
  playerStats: PlayerStatRow[]
  matchedFixtureIds: number[]
  unmatchedFixtures: string[]
  apiErrors: string[]
}

const apiGet = sportsApiProGet

function normalizeTeamName(name: string): string {
  return name.trim().toLowerCase()
}

// Player-statistics gives match-total counts, not discrete timestamped
// events — each count becomes that many identical rows (minute: null),
// which is exactly what match_events needs to keep counting correctly.
function pushCountedEvents(
  scorers: ScorerRow[], round: number, homeTeam: string, awayTeam: string,
  playerName: string, eventType: string, count: number
) {
  for (let i = 0; i < count; i++) {
    scorers.push({ round, homeTeam, awayTeam, player: playerName, eventType, minute: null })
  }
}

function extractFromPlayerStats(
  data: { home?: any[]; away?: any[] }, round: number, homeTeam: string, awayTeam: string,
  scorers: ScorerRow[], playerStats: PlayerStatRow[]
) {
  const sides: { list: any[]; }[] = [{ list: data.home ?? [] }, { list: data.away ?? [] }]
  sides.forEach(({ list }) => {
    list.forEach(entry => {
      const name = entry.player?.name
      const s = entry.statistics
      if (!name || !s) return
      pushCountedEvents(scorers, round, homeTeam, awayTeam, name, 'try', s.tries ?? 0)
      pushCountedEvents(scorers, round, homeTeam, awayTeam, name, 'conversion', s.conversions ?? 0)
      pushCountedEvents(scorers, round, homeTeam, awayTeam, name, 'penalty_goal', s.penaltyGoals ?? 0)
      pushCountedEvents(scorers, round, homeTeam, awayTeam, name, 'drop_goal', s.dropGoals ?? 0)
      pushCountedEvents(scorers, round, homeTeam, awayTeam, name, 'yellow_card', s.yellowCard ?? 0)
      pushCountedEvents(scorers, round, homeTeam, awayTeam, name, 'red_card', s.redCard ?? 0)
      playerStats.push({
        round, homeTeam, awayTeam, player: name,
        meters_run: s.metersRun ?? 0, clean_breaks: s.cleanBreaks ?? 0, offloads: s.offloads ?? 0,
        tackles: s.tackles ?? 0, tackles_missed: s.tacklesMissed ?? 0, try_assists: s.tryAssists ?? 0,
        is_substitute: entry.substitute ?? false,
      })
    })
  })
}

export async function fetchRugbyResultsFromApi(apiKey: string, dueFixtures: DueFixture[]): Promise<FetchResult> {
  const results: ResultRow[] = []
  const scorers: ScorerRow[] = []
  const playerStats: PlayerStatRow[] = []
  const matchedFixtureIds: number[] = []
  const unmatchedFixtures: string[] = []
  const apiErrors: string[] = []

  // One schedule call per distinct date covers every fixture that day,
  // rather than one call per fixture — Six Nations plays 3 matches a
  // round, usually across 2-3 dates, so this is a handful of calls per
  // round, not one per match.
  const scheduleCache = new Map<string, any[]>()
  async function getSchedule(dateStr: string): Promise<any[]> {
    if (scheduleCache.has(dateStr)) return scheduleCache.get(dateStr)!
    try {
      const body = await apiGet(`/schedule/${dateStr}`, apiKey)
      const events = body.events ?? []
      scheduleCache.set(dateStr, events)
      return events
    } catch (e: any) {
      apiErrors.push(`Schedule ${dateStr}: ${e.message}`)
      scheduleCache.set(dateStr, [])
      return []
    }
  }

  function dateStrFromISO(iso: string, offsetDays: number): string {
    const d = new Date(iso)
    d.setUTCDate(d.getUTCDate() + offsetDays)
    return d.toISOString().slice(0, 10)
  }

  for (const fixture of dueFixtures) {
    const candidateDates = [
      dateStrFromISO(fixture.kickoffTime, 0),
      dateStrFromISO(fixture.kickoffTime, -1),
      dateStrFromISO(fixture.kickoffTime, 1),
    ]

    let apiMatch: any = null
    for (const dateStr of candidateDates) {
      const events = await getSchedule(dateStr)
      apiMatch = events.find(e =>
        normalizeTeamName(e.homeTeam?.name ?? '') === normalizeTeamName(fixture.homeTeamName) &&
        normalizeTeamName(e.awayTeam?.name ?? '') === normalizeTeamName(fixture.awayTeamName) &&
        e.status?.type === 'finished'
      )
      if (apiMatch) break
    }

    if (!apiMatch) {
      unmatchedFixtures.push(`${fixture.homeTeamName} v ${fixture.awayTeamName} (round ${fixture.round})`)
      continue
    }

    results.push({
      round: fixture.round,
      homeTeam: fixture.homeTeamName,
      awayTeam: fixture.awayTeamName,
      homeScore: apiMatch.homeScore?.current ?? 0,
      awayScore: apiMatch.awayScore?.current ?? 0,
    })
    matchedFixtureIds.push(fixture.fixtureId)

    try {
      const statsBody = await apiGet(`/match/${apiMatch.id}/player-statistics`, apiKey)
      extractFromPlayerStats(statsBody.data ?? {}, fixture.round, fixture.homeTeamName, fixture.awayTeamName, scorers, playerStats)
    } catch (e: any) {
      apiErrors.push(`Player statistics for ${fixture.homeTeamName} v ${fixture.awayTeamName}: ${e.message}`)
    }
  }

  return { results, scorers, playerStats, matchedFixtureIds, unmatchedFixtures, apiErrors }
}
