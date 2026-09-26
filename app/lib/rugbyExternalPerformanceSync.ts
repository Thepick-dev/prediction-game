import type { SupabaseClient } from '@supabase/supabase-js'
import { sportsApiProGet, sportsApiProQuota, extractPlayerStatEntries } from './sportsApiProClient'

// Pulls player performance data from ANY SportsAPI Pro rugby competition
// (domestic leagues, other internationals) — not just Six Nations, which
// rugbySportsApiSync.ts already covers via its own, differently-shaped
// pipeline (matched against OUR OWN known fixtures). This one works the
// other direction: it doesn't know our fixtures in advance, it discovers
// matches round by round from the competition itself, and stores every
// relevant player's performance into rugby.player_performances (see
// C:\Users\k_hut\.claude\plans\glittery-tumbling-blanket.md for the full
// design — a NEW generic table, not reusing rugby.fixtures/match_events,
// since a club match (Toulouse v Leinster) doesn't fit "two of our 6
// nations played each other").
//
// Every player encountered gets stored (Kit, 2026-09-25: "I want the
// database to exist with all players... I just want the data there in
// case I want to use it later" — a future World Cup/Lions mode). A
// player whose nationality matches one of the 6 Six Nations teams gets
// team_id set, so they slot straight into the existing draft exactly
// like today; everyone else gets team_id left null (stored, rated,
// visible, just not draftable under today's 6-team draft structure).

const SIX_NATIONS_BY_NAME: Record<string, string> = {
  england: 'England', ireland: 'Ireland', wales: 'Wales',
  scotland: 'Scotland', france: 'France', italy: 'Italy',
}

// Standard rugby union shirt-number convention for starters (1-15),
// plus the common European bench convention (16-23: 2 front-row cover +
// 1 second/back-row cover + scrum-half + 2 utility backs) — confirmed
// this session that 64% of pulled performances (mostly bench players)
// had no inferable position under 1-15 alone and so couldn't be rated
// at all. The 16-23 mapping is a best-effort convention, not universal
// (some squads run a "6-2" forwards-heavy bench instead) — same "can't
// be rated without a real position" fallback still applies to whatever
// this doesn't cover, and an admin can always correct a specific
// player's position from /admin/rugby/players same as before.
const POSITION_BY_JERSEY: Record<number, string> = {
  1: 'Prop', 2: 'Hooker', 3: 'Prop', 4: 'Second Row', 5: 'Second Row',
  6: 'Back Row', 7: 'Back Row', 8: 'Back Row', 9: 'Scrum-half', 10: 'Fly-half',
  11: 'Wing', 12: 'Centre', 13: 'Centre', 14: 'Wing', 15: 'Fullback',
  16: 'Hooker', 17: 'Prop', 18: 'Prop', 19: 'Second Row', 20: 'Back Row',
  21: 'Scrum-half', 22: 'Fly-half', 23: 'Centre',
}

export type ExternalCompetition = {
  id: number
  sportsapi_tournament_id: number
  name: string
  current_season_id: number | null
  last_pulled_round: number
  fully_pulled: boolean
  is_actively_pulling: boolean
  draftable_by_default: boolean
  // Not every competition in SportsAPI Pro exposes a round-based fixture
  // list — confirmed live this session that Nations Championship and
  // Int. Friendly Games both 404 on /events/round/N and only work via
  // the paginated "most recent finished matches" feed instead
  // (/events/last/N). 'rounds' (the default/original shape) uses
  // pullNextBatch; 'pages' uses pullNextPaginatedBatch below.
  pull_mode?: 'rounds' | 'pages'
}

export type PullSummary = {
  competition: string
  roundsChecked: number
  matchesPulled: number
  playerRowsStored: number
  newPlayersCreated: number
  requestsUsed: number
  fullyPulled: boolean
  stoppedReason: 'quota' | 'end_of_season' | 'future_fixtures' | 'no_competition'
  errors: string[]
}

// Pre-loaded once per pullNextBatch call (see below) rather than two
// DB round trips per player per match — in real testing this session,
// the per-player-query version took ~11 minutes for one modest batch,
// almost entirely this lookup, repeated for every player in every
// match. In-memory lookups against a pool of ~300-600 players cost
// nothing; the DB is only touched for an actual INSERT of a genuinely
// new player, or the one-time sportsapi_player_id backfill below.
type PlayerLookup = {
  byApiId: Map<number, number>
  byLowerName: Map<string, number>
}

// Confirmed live this session: the API returns the SAME real player with
// inconsistent accents across different pulls/endpoints ("Théo Attissogbe"
// vs "Théo Attissogbé", "Ciarán Frawley" vs "Ciaran Frawley" — 8 real
// pairs found, all French/Irish squad members with diacritics) — a plain
// lowercase compare treats these as different people and creates a
// duplicate. NFD-normalizing and stripping the combining accent marks
// before comparing collapses them to the same key; the player's real
// name (with its correct accents) is still what gets stored/displayed —
// this is only ever used as a matching key, never written anywhere.
function normalizeNameForMatching(name: string): string {
  return name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

async function loadPlayerLookup(supabase: SupabaseClient): Promise<PlayerLookup> {
  const { data } = await supabase.schema('rugby').from('players').select('id, name, sportsapi_player_id')
  const byApiId = new Map<number, number>()
  const byLowerName = new Map<string, number>()
  ;(data ?? []).forEach((p: { id: number; name: string; sportsapi_player_id: number | null }) => {
    if (p.sportsapi_player_id != null) byApiId.set(p.sportsapi_player_id, p.id)
    byLowerName.set(normalizeNameForMatching(p.name), p.id)
  })
  return { byApiId, byLowerName }
}

async function findOrCreatePlayer(
  supabase: SupabaseClient,
  statPlayer: { id: number; name: string; jerseyNumber?: string; country?: { name?: string } },
  shirtNumber: number | undefined,
  teamNameById: Map<number, string>,
  lookup: PlayerLookup,
): Promise<{ playerId: number; created: boolean } | null> {
  // 1. Exact match — we've seen this SportsAPI player before.
  const byApiId = lookup.byApiId.get(statPlayer.id)
  if (byApiId != null) return { playerId: byApiId, created: false }

  // 2. Fuzzy match by name (case-insensitive) — the same player may exist
  // from the original Six Nations backfill without an sportsapi_player_id
  // yet. Backfill it now so future pulls hit the fast path above.
  const byName = lookup.byLowerName.get(normalizeNameForMatching(statPlayer.name))
  if (byName != null) {
    await supabase.schema('rugby').from('players').update({ sportsapi_player_id: statPlayer.id }).eq('id', byName)
    lookup.byApiId.set(statPlayer.id, byName)
    return { playerId: byName, created: false }
  }

  // 3. Genuinely new player — store them regardless of nationality (Kit,
  // 2026-09-25). team_id only set when their nationality is one of the 6.
  const countryName = statPlayer.country?.name?.trim().toLowerCase() ?? ''
  const sixNationsName = SIX_NATIONS_BY_NAME[countryName]
  let teamId: number | null = null
  if (sixNationsName) {
    for (const [id, name] of teamNameById) {
      if (name === sixNationsName) { teamId = id; break }
    }
  }
  const jersey = shirtNumber ?? null
  const position = jersey && jersey >= 1 && jersey <= 23 ? POSITION_BY_JERSEY[jersey] : null

  const { data: inserted, error } = await supabase.schema('rugby').from('players').insert({
    name: statPlayer.name,
    team_id: teamId,
    nationality: statPlayer.country?.name ?? null,
    position,
    position_source: position ? 'pull' : null,
    sportsapi_player_id: statPlayer.id,
    is_draftable: false,
    value_is_estimated: true,
  }).select('id').single()
  if (error || !inserted) return null
  lookup.byApiId.set(statPlayer.id, inserted.id)
  lookup.byLowerName.set(normalizeNameForMatching(statPlayer.name), inserted.id)
  return { playerId: inserted.id, created: true }
}

// Shared by both puller shapes below (round-based and paginated) — the
// "given a match + its already-fetched player-statistics, find/create
// each player and store their performance row" step is identical either
// way; only how matches are DISCOVERED differs (see pullNextPaginatedBatch).
async function storeMatchPerformances(
  supabase: SupabaseClient,
  match: { id: number; homeTeam?: { name?: string }; awayTeam?: { name?: string }; startTimestamp?: number; homeScore?: { current?: number }; awayScore?: { current?: number } },
  statsBody: any,
  competition: ExternalCompetition,
  roundLabel: string,
  teamNameById: Map<number, string>,
  playerLookup: PlayerLookup,
  summary: { playerRowsStored: number; newPlayersCreated: number; matchesPulled: number; errors: string[] },
): Promise<void> {
  const entries = extractPlayerStatEntries(statsBody.data ?? {})
  const matchDate = match.startTimestamp ? new Date(match.startTimestamp * 1000).toISOString() : null
  const homeName = match.homeTeam?.name ?? '?'
  const awayName = match.awayTeam?.name ?? '?'
  const homeScore = match.homeScore?.current ?? null
  const awayScore = match.awayScore?.current ?? null
  const homeWon = (homeScore ?? 0) > (awayScore ?? 0)
  const awayWon = (awayScore ?? 0) > (homeScore ?? 0)

  for (const { side, entry } of entries) {
    const found = await findOrCreatePlayer(supabase, entry.player, entry.shirtNumber, teamNameById, playerLookup)
    if (!found) { summary.errors.push(`Could not store player ${entry.player.name}`); continue }
    if (found.created) summary.newPlayersCreated++

    const isHome = side === 'home'
    const result = homeWon === awayWon ? 'draw' : (isHome ? (homeWon ? 'win' : 'loss') : (awayWon ? 'win' : 'loss'))
    const s = entry.statistics

    const { error: insertErr } = await supabase.schema('rugby').from('player_performances').insert({
      sportsapi_match_id: match.id,
      external_competition_id: competition.id,
      player_id: found.playerId,
      season: new Date(matchDate ?? Date.now()).getFullYear(),
      round_label: roundLabel,
      match_date: matchDate,
      team_name: isHome ? homeName : awayName,
      opponent_name: isHome ? awayName : homeName,
      is_home: isHome,
      match_result: result,
      team_score: isHome ? homeScore : awayScore,
      opponent_score: isHome ? awayScore : homeScore,
      tries: s.tries ?? 0, conversions: s.conversions ?? 0, penalty_goals: s.penaltyGoals ?? 0,
      drop_goals: s.dropGoals ?? 0, yellow_card: s.yellowCard ?? 0, red_card: s.redCard ?? 0,
      try_assists: s.tryAssists ?? 0, clean_breaks: s.cleanBreaks ?? 0, offloads: s.offloads ?? 0,
      meters_run: s.metersRun ?? 0, passes: s.passes ?? 0, tackles: s.tackles ?? 0,
      tackles_missed: s.tacklesMissed ?? 0, is_substitute: entry.substitute ?? false, points: s.points ?? null,
    })
    if (insertErr) summary.errors.push(`Storing ${entry.player.name}: ${insertErr.message}`)
    else summary.playerRowsStored++
  }
  summary.matchesPulled++
}

export async function pullNextBatch(
  supabase: SupabaseClient,
  competition: ExternalCompetition,
  apiKey: string,
  maxRequests: number,
): Promise<PullSummary> {
  const summary: PullSummary = {
    competition: competition.name, roundsChecked: 0, matchesPulled: 0, playerRowsStored: 0,
    newPlayersCreated: 0, requestsUsed: 0, fullyPulled: competition.fully_pulled,
    stoppedReason: 'quota', errors: [],
  }

  if (!competition.current_season_id) {
    summary.stoppedReason = 'no_competition'
    return summary
  }
  if (competition.fully_pulled) {
    summary.stoppedReason = 'end_of_season'
    return summary
  }

  const { data: teams } = await supabase.schema('rugby').from('teams').select('id, name')
  const teamNameById = new Map((teams ?? []).map((t: { id: number; name: string }) => [t.id, t.name]))
  const playerLookup = await loadPlayerLookup(supabase)

  let round = competition.last_pulled_round + 1
  let requestsLeft = maxRequests

  while (requestsLeft > 0) {
    let events: any[]
    try {
      const body = await sportsApiProGet(`/tournament/${competition.sportsapi_tournament_id}/season/${competition.current_season_id}/events/round/${round}`, apiKey)
      events = body.data?.events ?? []
      summary.requestsUsed++
    } catch (e: any) {
      // Counts against the budget on failure too — a rate-limited or
      // transient-503 attempt still spends a real request against the
      // account's daily cap (confirmed live this session: a first pull
      // with this uncounted blew straight through the rest of the day's
      // quota on failed retries). requestsLeft-- lives OUTSIDE the try
      // now so both paths hit it exactly once.
      summary.errors.push(`Round ${round}: ${e.message}`)
      requestsLeft--
      break
    }
    requestsLeft--
    summary.roundsChecked++

    if (events.length === 0) {
      summary.fullyPulled = true
      summary.stoppedReason = 'end_of_season'
      break
    }

    const unfinished = events.filter(e => e.status?.type !== 'finished')
    const finished = events.filter(e => e.status?.type === 'finished')
    // Tracks whether every finished match in THIS round was either
    // already stored or successfully pulled just now — a round with any
    // failure must not be marked complete, or those specific matches
    // would never be retried (last_pulled_round only ever moves forward,
    // confirmed as a real bug this session: a round that hit nothing but
    // rate-limit/503 errors still advanced past, permanently skipping it).
    let roundHadFailure = false

    for (const match of finished) {
      if (requestsLeft <= 0) { roundHadFailure = true; break }
      const { data: existing } = await supabase.schema('rugby').from('player_performances')
        .select('id').eq('sportsapi_match_id', match.id).limit(1)
      if (existing && existing.length > 0) continue // already pulled, idempotent

      let statsBody: any
      try {
        statsBody = await sportsApiProGet(`/match/${match.id}/player-statistics`, apiKey)
        summary.requestsUsed++
      } catch (e: any) {
        // Same reasoning as the round-fetch above: a failed attempt still
        // spends real daily quota, so it counts against the budget too.
        summary.errors.push(`Match ${match.homeTeam?.name} v ${match.awayTeam?.name}: ${e.message}`)
        requestsLeft--
        roundHadFailure = true
        continue
      }
      requestsLeft--

      await storeMatchPerformances(supabase, match, statsBody, competition, `Round ${round}`, teamNameById, playerLookup, summary)
    }

    if (unfinished.length > 0) {
      // This round isn't over yet — don't claim it as "pulled" (next run
      // should re-check it for newly-finished matches), and don't walk
      // past it into rounds that haven't happened yet either.
      summary.stoppedReason = 'future_fixtures'
      break
    }

    if (roundHadFailure) {
      // Don't advance past a round that had any failure — next run
      // retries it (already-stored matches are skipped via the idempotent
      // existence check above, so this only re-attempts what's missing).
      summary.stoppedReason = 'quota'
      break
    }

    await supabase.schema('rugby').from('external_competitions').update({ last_pulled_round: round }).eq('id', competition.id)
    round++
  }

  if (requestsLeft <= 0) summary.stoppedReason = 'quota'

  await supabase.schema('rugby').from('external_competitions').update({
    fully_pulled: summary.fullyPulled,
  }).eq('id', competition.id)

  return summary
}

// Six Nations senior sides only, exact name match — deliberately excludes
// "England A"/"Ireland A"/second-string "XV" sides that also turn up in
// the international-friendlies feed (see below): Kit wants the senior
// team's friendlies, not development fixtures.
const SIX_NATIONS_TEAM_NAMES = new Set(['England', 'France', 'Ireland', 'Italy', 'Scotland', 'Wales'])
export function isSixNationsSeniorMatch(homeName: string, awayName: string): boolean {
  return SIX_NATIONS_TEAM_NAMES.has(homeName) || SIX_NATIONS_TEAM_NAMES.has(awayName)
}

// For competitions with no round structure in SportsAPI Pro (confirmed
// live this session: Nations Championship and Int. Friendly Games both
// 404 on /events/round/N) — walks the "most recently finished matches"
// feed instead, a page at a time, oldest-within-the-page-set eventually
// reached once a page comes back empty. last_pulled_round doubles as
// "next page to fetch" here; there's no real notion of a round to name it
// after, just successive pages walking backward through the season.
//
// minYear (Kit, 2026-09-26: "going back 3 years if possible" for
// friendlies) — once the current season's pages run out, looks up that
// tournament's other seasons and rolls current_season_id back to the
// next-most-recent one at or after minYear, resetting the page cursor to
// 0, rather than stopping at "this one season is exhausted." Only marks
// the competition truly fully_pulled once there's no earlier season left
// to roll into (or minYear isn't given, matching the old single-season
// behaviour for Nations Championship, which only has one season so far).
export async function pullNextPaginatedBatch(
  supabase: SupabaseClient,
  competition: ExternalCompetition,
  apiKey: string,
  maxRequests: number,
  teamNameFilter?: (homeName: string, awayName: string) => boolean,
  minYear?: number,
): Promise<PullSummary> {
  const summary: PullSummary = {
    competition: competition.name, roundsChecked: 0, matchesPulled: 0, playerRowsStored: 0,
    newPlayersCreated: 0, requestsUsed: 0, fullyPulled: competition.fully_pulled,
    stoppedReason: 'quota', errors: [],
  }

  if (!competition.current_season_id) {
    summary.stoppedReason = 'no_competition'
    return summary
  }
  if (competition.fully_pulled) {
    summary.stoppedReason = 'end_of_season'
    return summary
  }

  const { data: teams } = await supabase.schema('rugby').from('teams').select('id, name')
  const teamNameById = new Map((teams ?? []).map((t: { id: number; name: string }) => [t.id, t.name]))
  const playerLookup = await loadPlayerLookup(supabase)

  let seasonId = competition.current_season_id
  let page = competition.last_pulled_round
  let requestsLeft = maxRequests

  while (requestsLeft > 0) {
    let events: any[]
    try {
      const body = await sportsApiProGet(`/tournament/${competition.sportsapi_tournament_id}/season/${seasonId}/events/last/${page}`, apiKey)
      events = body.data?.events ?? []
      summary.requestsUsed++
    } catch (e: any) {
      // Confirmed live this session: this endpoint 404s once you page
      // past the last available page, rather than returning an empty
      // events array (unlike the round-based endpoint) — treat that
      // exactly like "no more events," not a real failure. Any other
      // error (rate limit, 503, etc.) is still a genuine stop.
      if (!/\b404\b/.test(e.message ?? '')) {
        summary.errors.push(`Season ${seasonId} page ${page}: ${e.message}`)
        requestsLeft--
        break
      }
      events = []
      summary.requestsUsed++
    }
    requestsLeft--
    summary.roundsChecked++

    if (events.length === 0) {
      // This season's pages are exhausted — try rolling back to the next
      // older season within the requested lookback window.
      let rolledOver = false
      if (minYear != null && requestsLeft > 0) {
        let seasonsBody: any
        try {
          seasonsBody = await sportsApiProGet(`/tournament/${competition.sportsapi_tournament_id}/seasons`, apiKey)
          summary.requestsUsed++
        } catch (e: any) {
          summary.errors.push(`Looking up earlier seasons: ${e.message}`)
        }
        requestsLeft--
        const seasons: { id: number; year: string }[] = seasonsBody?.data?.seasons ?? []
        const currentYear = Number(seasons.find(s => s.id === seasonId)?.year)
        const olderSeasons = seasons
          .filter(s => Number(s.year) < (Number.isFinite(currentYear) ? currentYear : Infinity) && Number(s.year) >= minYear)
          .sort((a, b) => Number(b.year) - Number(a.year))
        if (olderSeasons.length > 0) {
          seasonId = olderSeasons[0].id
          page = 0
          await supabase.schema('rugby').from('external_competitions')
            .update({ current_season_id: seasonId, last_pulled_round: 0 }).eq('id', competition.id)
          rolledOver = true
        }
      }
      if (rolledOver) continue
      summary.fullyPulled = true
      summary.stoppedReason = 'end_of_season'
      break
    }

    const relevant = teamNameFilter
      ? events.filter(e => teamNameFilter(e.homeTeam?.name ?? '', e.awayTeam?.name ?? ''))
      : events
    const finished = relevant.filter(e => e.status?.type === 'finished')

    // Same reasoning as pullNextBatch: don't advance the page cursor past
    // one that had any failure, or those specific matches never get
    // retried.
    let pageHadFailure = false

    for (const match of finished) {
      if (requestsLeft <= 0) { pageHadFailure = true; break }
      const { data: existing } = await supabase.schema('rugby').from('player_performances')
        .select('id').eq('sportsapi_match_id', match.id).limit(1)
      if (existing && existing.length > 0) continue // already pulled, idempotent

      let statsBody: any
      try {
        statsBody = await sportsApiProGet(`/match/${match.id}/player-statistics`, apiKey)
        summary.requestsUsed++
      } catch (e: any) {
        summary.errors.push(`Match ${match.homeTeam?.name} v ${match.awayTeam?.name}: ${e.message}`)
        requestsLeft--
        pageHadFailure = true
        continue
      }
      requestsLeft--

      const label = match.startTimestamp ? new Date(match.startTimestamp * 1000).toISOString().slice(0, 10) : `Page ${page}`
      await storeMatchPerformances(supabase, match, statsBody, competition, label, teamNameById, playerLookup, summary)
    }

    if (pageHadFailure) {
      summary.stoppedReason = 'quota'
      break
    }

    await supabase.schema('rugby').from('external_competitions').update({ last_pulled_round: page + 1 }).eq('id', competition.id)
    page++
  }

  if (requestsLeft <= 0) summary.stoppedReason = 'quota'

  await supabase.schema('rugby').from('external_competitions').update({
    fully_pulled: summary.fullyPulled,
  }).eq('id', competition.id)

  return summary
}

export async function checkQuota(apiKey: string) {
  return sportsApiProQuota(apiKey)
}

export type BackfillSummary = {
  matchesChecked: number
  playersUpdated: number
  requestsUsed: number
  stoppedReason: 'done' | 'quota'
  errors: string[]
}

// One-time-per-competition catch-up: re-fetches player-statistics for
// matches ALREADY stored (idempotent — never inserts a new
// player_performances row, only fills in a still-missing position on
// rugby.players via jersey number) so performances pulled before the
// bench-number fix (16-23) can be rated retroactively. Kit, 2026-09-26:
// "yes we need to retroactively pull." Costs real API quota again since
// jersey number was never stored anywhere the first time.
export async function backfillMissingPositions(
  supabase: SupabaseClient,
  competition: ExternalCompetition,
  apiKey: string,
  maxRequests: number,
): Promise<BackfillSummary> {
  const summary: BackfillSummary = { matchesChecked: 0, playersUpdated: 0, requestsUsed: 0, stoppedReason: 'done', errors: [] }

  const { data: perfRows } = await supabase.schema('rugby').from('player_performances')
    .select('sportsapi_match_id').eq('external_competition_id', competition.id)
  const matchIds = [...new Set((perfRows ?? []).map((r: { sportsapi_match_id: number }) => r.sportsapi_match_id))]

  const { data: playersMissingPosition } = await supabase.schema('rugby').from('players')
    .select('id, sportsapi_player_id').is('position', null).not('sportsapi_player_id', 'is', null)
  const idsNeedingPosition = new Set((playersMissingPosition ?? []).map((p: { sportsapi_player_id: number }) => p.sportsapi_player_id))
  if (idsNeedingPosition.size === 0) return summary

  let requestsLeft = maxRequests
  for (const matchId of matchIds) {
    if (requestsLeft <= 0) { summary.stoppedReason = 'quota'; break }
    let statsBody: any
    try {
      statsBody = await sportsApiProGet(`/match/${matchId}/player-statistics`, apiKey)
      summary.requestsUsed++
    } catch (e: any) {
      summary.errors.push(`Match ${matchId}: ${e.message}`)
      requestsLeft--
      continue
    }
    requestsLeft--
    summary.matchesChecked++

    const entries = extractPlayerStatEntries(statsBody.data ?? {})
    for (const { entry } of entries) {
      if (!idsNeedingPosition.has(entry.player.id)) continue
      const jersey = entry.shirtNumber ?? null
      const position = jersey && jersey >= 1 && jersey <= 23 ? POSITION_BY_JERSEY[jersey] : null
      if (!position) continue
      const { error } = await supabase.schema('rugby').from('players')
        .update({ position, position_source: 'backfill' }).eq('sportsapi_player_id', entry.player.id).is('position', null)
      if (!error) { summary.playersUpdated++; idsNeedingPosition.delete(entry.player.id) }
    }
  }
  return summary
}

export type NationalityBackfillSummary = { playersUpdated: number }

// Some players get created without a nationality at all (the API returns
// an empty country object for them) — Kit, 2026-09-26: "where a player
// doesn't have a nationality can you extrapolate this where they've been
// involved in more than 1 international match?" A player's team_name in
// an international-flagged performance IS their nation, so 2+ consistent
// appearances for the same one is a safe signal (a single appearance
// isn't — could be a one-off data quirk). Also backfills team_id when
// that nation turns out to be one of the 6 and team_id is still null,
// same as if we'd known their nationality at creation time.
export async function backfillNationalityFromInternationalAppearances(supabase: SupabaseClient): Promise<NationalityBackfillSummary> {
  const { data: nullNatPlayers } = await supabase.schema('rugby').from('players')
    .select('id, team_id').is('nationality', null)
  if (!nullNatPlayers || nullNatPlayers.length === 0) return { playersUpdated: 0 }

  const { data: comps } = await supabase.schema('rugby').from('external_competitions').select('id, is_international')
  const intlCompIds = new Set((comps ?? []).filter((c: { is_international: boolean }) => c.is_international).map((c: { id: number }) => c.id))
  if (intlCompIds.size === 0) return { playersUpdated: 0 }

  const { data: teams } = await supabase.schema('rugby').from('teams').select('id, name')
  const teamIdByName = new Map((teams ?? []).map((t: { id: number; name: string }) => [t.name, t.id]))

  const { data: perfs } = await supabase.schema('rugby').from('player_performances')
    .select('player_id, team_name, external_competition_id')
  const namesByPlayer = new Map<number, string[]>()
  ;(perfs ?? []).forEach((p: { player_id: number; team_name: string; external_competition_id: number }) => {
    if (!intlCompIds.has(p.external_competition_id)) return
    if (!namesByPlayer.has(p.player_id)) namesByPlayer.set(p.player_id, [])
    namesByPlayer.get(p.player_id)!.push(p.team_name)
  })

  let playersUpdated = 0
  for (const p of nullNatPlayers as { id: number; team_id: number | null }[]) {
    const names = namesByPlayer.get(p.id) ?? []
    if (names.length < 2) continue
    const counts = new Map<string, number>()
    names.forEach(n => counts.set(n, (counts.get(n) ?? 0) + 1))
    const [topName, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (topCount < 2) continue

    const update: { nationality: string; team_id?: number } = { nationality: topName }
    if (p.team_id == null) {
      const sixNationsName = SIX_NATIONS_BY_NAME[topName.trim().toLowerCase()]
      const teamId = sixNationsName ? teamIdByName.get(sixNationsName) : undefined
      if (teamId != null) update.team_id = teamId
    }
    const { error } = await supabase.schema('rugby').from('players').update(update).eq('id', p.id)
    if (!error) playersUpdated++
  }
  return { playersUpdated }
}

export type SixNationsRecheckSummary = {
  fixturesChecked: number
  fixturesMatched: number
  playersAdded: number
  newPlayersCreated: number
  requestsUsed: number
  stoppedReason: 'done' | 'quota'
  errors: string[]
}

// SportsAPI Pro's tournament id for Six Nations, and its season id per
// year — confirmed live this session via /tournament/423/seasons. Only
// years with real, already-finished fixtures need a season id here;
// future/scheduled fixtures (e.g. 2027) are excluded by the `status =
// finished` filter below before this is ever consulted.
const SIX_NATIONS_TOURNAMENT_ID = 423
const SIX_NATIONS_SEASON_ID_BY_YEAR: Record<number, number> = { 2024: 49850, 2025: 59195, 2026: 86339 }

// Kit, 2026-09-26, after a real Guardian match report showed 8 real Wales
// players (starters included, not just the sub) missing from a fixture we
// already have archived: the ORIGINAL Six Nations historical build (an
// earlier session, before any of today's work) under-captured full squads
// for at least some matches — this isn't a "not yet pulled" gap like the
// external competitions, it's "already marked finished, but incomplete."
// Re-fetches player-statistics for EVERY already-finished fixture (not
// just due ones — rugbySportsApiSync.ts's fetchRugbyResultsFromApi only
// ever looks at fixtures NOT YET marked finished) and adds whichever real
// players are missing, without touching anyone already correctly stored.
//
// Matches by TEAM PAIR alone against that year's full round-by-round
// schedule, never by date — confirmed live this session that our stored
// kickoff_time can be wrong by two whole weeks (the exact flagged Wales v
// England match), which a date-based ± 1 day search (rugbySportsApiSync.ts's
// approach, fine for its own newly-due-fixture use case) would have
// silently missed entirely.
export async function backfillMissingSixNationsPlayers(
  supabase: SupabaseClient,
  apiKey: string,
  maxRequests: number,
): Promise<SixNationsRecheckSummary> {
  const summary: SixNationsRecheckSummary = {
    fixturesChecked: 0, fixturesMatched: 0, playersAdded: 0, newPlayersCreated: 0,
    requestsUsed: 0, stoppedReason: 'done', errors: [],
  }

  const { data: teams } = await supabase.schema('rugby').from('teams').select('id, name')
  const teamNameById = new Map((teams ?? []).map((t: { id: number; name: string }) => [t.id, t.name]))

  const { data: fixtures } = await supabase.schema('rugby').from('fixtures')
    .select('id, home_team_id, away_team_id, kickoff_time, status').eq('status', 'finished').order('kickoff_time')

  const playerLookup = await loadPlayerLookup(supabase)

  let requestsLeft = maxRequests
  // One entry per season year — every round's events fetched once, then
  // reused for every fixture that year, rather than one lookup per fixture.
  const seasonEventsCache = new Map<number, any[]>()
  async function getSeasonEvents(year: number): Promise<any[]> {
    if (seasonEventsCache.has(year)) return seasonEventsCache.get(year)!
    const seasonId = SIX_NATIONS_SEASON_ID_BY_YEAR[year]
    if (!seasonId) { seasonEventsCache.set(year, []); return [] }
    const events: any[] = []
    for (let round = 1; round <= 5 && requestsLeft > 0; round++) {
      try {
        const body = await sportsApiProGet(`/tournament/${SIX_NATIONS_TOURNAMENT_ID}/season/${seasonId}/events/round/${round}`, apiKey)
        summary.requestsUsed++
        requestsLeft--
        events.push(...(body.data?.events ?? []))
      } catch (e: any) {
        summary.requestsUsed++
        requestsLeft--
        summary.errors.push(`Six Nations ${year} round ${round}: ${e.message}`)
        break // a 404 here means past the last real round for that year
      }
    }
    seasonEventsCache.set(year, events)
    return events
  }
  function normTeam(name: string): string {
    return name.trim().toLowerCase()
  }

  for (const fixture of fixtures ?? []) {
    if (requestsLeft <= 0) { summary.stoppedReason = 'quota'; break }
    summary.fixturesChecked++
    const homeTeamName = teamNameById.get(fixture.home_team_id) ?? '?'
    const awayTeamName = teamNameById.get(fixture.away_team_id) ?? '?'

    const year = new Date(fixture.kickoff_time).getFullYear()
    const events = await getSeasonEvents(year)
    const apiMatch = events.find(e =>
      normTeam(e.homeTeam?.name ?? '') === normTeam(homeTeamName) &&
      normTeam(e.awayTeam?.name ?? '') === normTeam(awayTeamName) &&
      e.status?.type === 'finished'
    )
    if (!apiMatch) continue
    summary.fixturesMatched++

    if (requestsLeft <= 0) { summary.stoppedReason = 'quota'; break }
    let statsBody: any
    try {
      statsBody = await sportsApiProGet(`/match/${apiMatch.id}/player-statistics`, apiKey)
      summary.requestsUsed++
    } catch (e: any) {
      summary.requestsUsed++
      summary.errors.push(`Player statistics for ${homeTeamName} v ${awayTeamName}: ${e.message}`)
      requestsLeft--
      continue
    }
    requestsLeft--

    const entries = extractPlayerStatEntries(statsBody.data ?? {})
    const existingStatsByPlayer = new Set(
      ((await supabase.schema('rugby').from('player_match_stats').select('player_id').eq('fixture_id', fixture.id)).data ?? [])
        .map((r: { player_id: number }) => r.player_id)
    )

    for (const { side, entry } of entries) {
      const teamId = side === 'home' ? fixture.home_team_id : fixture.away_team_id
      const teamName = side === 'home' ? homeTeamName : awayTeamName

      let playerId = playerLookup.byApiId.get(entry.player.id)
      if (playerId == null) {
        const byName = playerLookup.byLowerName.get(normalizeNameForMatching(entry.player.name))
        if (byName != null) {
          playerId = byName
          await supabase.schema('rugby').from('players').update({ sportsapi_player_id: entry.player.id }).eq('id', byName)
          playerLookup.byApiId.set(entry.player.id, byName)
        }
      }
      if (playerId == null) {
        // Genuinely missing from the squad entirely (confirmed live this
        // session: several real starters, not just subs) — team_id is
        // known for certain here (which side of a Six Nations fixture
        // they appeared on), unlike the external pipeline which has to
        // infer it from a country field.
        const jersey = entry.shirtNumber ?? null
        const position = jersey && jersey >= 1 && jersey <= 23 ? POSITION_BY_JERSEY[jersey] : null
        const { data: inserted, error } = await supabase.schema('rugby').from('players').insert({
          name: entry.player.name,
          team_id: teamId,
          nationality: teamName,
          position,
          position_source: position ? 'pull' : null,
          sportsapi_player_id: entry.player.id,
          is_draftable: false,
          value_is_estimated: true,
        }).select('id').single()
        if (error || !inserted) { summary.errors.push(`Could not create ${entry.player.name}: ${error?.message}`); continue }
        playerId = inserted.id as number
        summary.newPlayersCreated++
      }
      if (playerId == null) continue // couldn't resolve or create — already logged above
      const resolvedPlayerId: number = playerId
      playerLookup.byApiId.set(entry.player.id, resolvedPlayerId)
      playerLookup.byLowerName.set(normalizeNameForMatching(entry.player.name), resolvedPlayerId)

      if (existingStatsByPlayer.has(resolvedPlayerId)) continue // already correctly captured
      const s = entry.statistics
      const { error: statsErr } = await supabase.schema('rugby').from('player_match_stats').upsert({
        fixture_id: fixture.id, player_id: resolvedPlayerId,
        meters_run: s.metersRun ?? 0, clean_breaks: s.cleanBreaks ?? 0, offloads: s.offloads ?? 0,
        tackles: s.tackles ?? 0, tackles_missed: s.tacklesMissed ?? 0, try_assists: s.tryAssists ?? 0,
      }, { onConflict: 'fixture_id,player_id' })
      if (statsErr) { summary.errors.push(`player_match_stats for ${entry.player.name}: ${statsErr.message}`); continue }
      // is_substitute: the API states this directly (entry.substitute) —
      // Kit, 2026-09-26, asked whether shirt number could tell subs apart
      // for Six Nations data the same way it already does for external
      // performances. It can (16-23 is the same bench convention already
      // used for position inference), but the API already says so
      // outright, so that's what gets stored. Own separate, best-effort
      // call: a newer/optional column, must never block the stats row
      // itself if it's not there yet.
      await supabase.schema('rugby').from('player_match_stats')
        .update({ is_substitute: entry.substitute ?? false }).eq('fixture_id', fixture.id).eq('player_id', resolvedPlayerId)

      const eventRows: { fixture_id: number; player_id: number; event_type: string; minute: null }[] = []
      const pushEvents = (eventType: string, count: number) => {
        for (let i = 0; i < count; i++) eventRows.push({ fixture_id: fixture.id, player_id: resolvedPlayerId, event_type: eventType, minute: null })
      }
      pushEvents('try', s.tries ?? 0)
      pushEvents('conversion', s.conversions ?? 0)
      pushEvents('penalty_goal', s.penaltyGoals ?? 0)
      pushEvents('drop_goal', s.dropGoals ?? 0)
      pushEvents('yellow_card', s.yellowCard ?? 0)
      pushEvents('red_card', s.redCard ?? 0)
      if (eventRows.length > 0) await supabase.schema('rugby').from('match_events').insert(eventRows)

      summary.playersAdded++
    }
  }

  if (requestsLeft <= 0 && summary.stoppedReason !== 'quota') summary.stoppedReason = 'quota'
  return summary
}
