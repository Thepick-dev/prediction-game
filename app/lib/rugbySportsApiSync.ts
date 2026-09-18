import type { ResultRow, ScorerRow } from './rugbySheetSync'

// Pulls real results + scorer events from SportsAPI Pro (sportsapipro.com)
// for whichever of our own fixtures have already kicked off but aren't
// marked 'finished' yet. Deliberately produces the exact same ResultRow/
// ScorerRow shapes the spreadsheet sync already parses (see
// rugbySheetSync.ts), so both sources can be reconciled into the database
// by the same kind of logic — this module only fetches and translates,
// it never touches the database itself.
//
// Matching a fixture to a SportsAPI Pro match: their match ids don't
// correspond to anything of ours, so matches are found by team-name pair
// on the fixture's own kickoff date (checked ±1 day, for timezone/late-
// notice reschedule safety). Matching a scorer to one of our own players:
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

export type FetchResult = {
  results: ResultRow[]
  scorers: ScorerRow[]
  matchedFixtureIds: number[]
  unmatchedFixtures: string[]
  apiErrors: string[]
}

const BASE = 'https://api.sportsapipro.com/v2/rugby/api'

async function apiGet(path: string, apiKey: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'x-api-key': apiKey } })
  const body = await res.json()
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error || `SportsAPI Pro request failed (${res.status})`)
  }
  return body
}

function normalizeTeamName(name: string): string {
  return name.trim().toLowerCase()
}

// SportsAPI Pro's incident feed distinguishes tries/conversions/cards
// clearly, but doesn't appear to separately flag penalty goals vs drop
// goals — both surface as "threePoints". Penalty goals are far more
// common in real matches, so that's the default; a genuine drop goal
// would need a quick manual correction on /admin/rugby/results after a
// sync (same page, same Add/Edit Event panel, either way).
function mapIncidentToEventType(incident: { incidentType?: string; incidentClass?: string }): string | null {
  const type = (incident.incidentType || '').toLowerCase()
  const cls = (incident.incidentClass || '').toLowerCase()
  if (type === 'card') {
    if (cls === 'yellow') return 'yellow_card'
    if (cls === 'red') return 'red_card'
    return null
  }
  if (type === 'goal') {
    if (cls === 'try') return 'try'
    if (cls === 'twopoints') return 'conversion'
    if (cls.includes('drop')) return 'drop_goal'
    if (cls === 'threepoints') return 'penalty_goal'
    return null
  }
  return null // substitutions, periods, etc. — not tracked in match_events
}

export async function fetchRugbyResultsFromApi(apiKey: string, dueFixtures: DueFixture[]): Promise<FetchResult> {
  const results: ResultRow[] = []
  const scorers: ScorerRow[] = []
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
      const incidentsBody = await apiGet(`/match/${apiMatch.id}/incidents`, apiKey)
      const incidents = incidentsBody.data?.incidents ?? []
      incidents.forEach((inc: any) => {
        const eventType = mapIncidentToEventType(inc)
        if (!eventType || !inc.player?.name) return
        scorers.push({
          round: fixture.round,
          homeTeam: fixture.homeTeamName,
          awayTeam: fixture.awayTeamName,
          player: inc.player.name,
          eventType,
          minute: typeof inc.time === 'number' ? inc.time : null,
        })
      })
    } catch (e: any) {
      apiErrors.push(`Incidents for ${fixture.homeTeamName} v ${fixture.awayTeamName}: ${e.message}`)
    }
  }

  return { results, scorers, matchedFixtureIds, unmatchedFixtures, apiErrors }
}
