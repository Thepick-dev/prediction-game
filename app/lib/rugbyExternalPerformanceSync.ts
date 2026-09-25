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

// Standard rugby union shirt-number convention — reliable for starters
// (1-15), not for bench numbers (16+, which vary by squad and don't map
// to one position). A brand-new player picked up with no inferable
// position simply can't be rated yet, same as any existing player with
// position left unset — nothing new to handle there, matches how
// app/lib/rugbyRating.ts already treats it.
const POSITION_BY_JERSEY: Record<number, string> = {
  1: 'Prop', 2: 'Hooker', 3: 'Prop', 4: 'Second Row', 5: 'Second Row',
  6: 'Back Row', 7: 'Back Row', 8: 'Back Row', 9: 'Scrum-half', 10: 'Fly-half',
  11: 'Wing', 12: 'Centre', 13: 'Centre', 14: 'Wing', 15: 'Fullback',
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

async function loadPlayerLookup(supabase: SupabaseClient): Promise<PlayerLookup> {
  const { data } = await supabase.schema('rugby').from('players').select('id, name, sportsapi_player_id')
  const byApiId = new Map<number, number>()
  const byLowerName = new Map<string, number>()
  ;(data ?? []).forEach((p: { id: number; name: string; sportsapi_player_id: number | null }) => {
    if (p.sportsapi_player_id != null) byApiId.set(p.sportsapi_player_id, p.id)
    byLowerName.set(p.name.trim().toLowerCase(), p.id)
  })
  return { byApiId, byLowerName }
}

async function findOrCreatePlayer(
  supabase: SupabaseClient,
  statPlayer: { id: number; name: string; jerseyNumber?: string; country?: { name?: string } },
  teamNameById: Map<number, string>,
  lookup: PlayerLookup,
): Promise<{ playerId: number; created: boolean } | null> {
  // 1. Exact match — we've seen this SportsAPI player before.
  const byApiId = lookup.byApiId.get(statPlayer.id)
  if (byApiId != null) return { playerId: byApiId, created: false }

  // 2. Fuzzy match by name (case-insensitive) — the same player may exist
  // from the original Six Nations backfill without an sportsapi_player_id
  // yet. Backfill it now so future pulls hit the fast path above.
  const byName = lookup.byLowerName.get(statPlayer.name.trim().toLowerCase())
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
  const jersey = statPlayer.jerseyNumber ? Number(statPlayer.jerseyNumber) : null
  const position = jersey && jersey >= 1 && jersey <= 15 ? POSITION_BY_JERSEY[jersey] : null

  const { data: inserted, error } = await supabase.schema('rugby').from('players').insert({
    name: statPlayer.name,
    team_id: teamId,
    nationality: statPlayer.country?.name ?? null,
    position,
    sportsapi_player_id: statPlayer.id,
    is_draftable: false,
    value_is_estimated: true,
  }).select('id').single()
  if (error || !inserted) return null
  lookup.byApiId.set(statPlayer.id, inserted.id)
  lookup.byLowerName.set(statPlayer.name.trim().toLowerCase(), inserted.id)
  return { playerId: inserted.id, created: true }
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

    for (const match of finished) {
      if (requestsLeft <= 0) break
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
        continue
      }
      requestsLeft--

      const entries = extractPlayerStatEntries(statsBody.data ?? {})
      const matchDate = match.startTimestamp ? new Date(match.startTimestamp * 1000).toISOString() : null
      const homeName = match.homeTeam?.name ?? '?'
      const awayName = match.awayTeam?.name ?? '?'
      const homeWon = (match.homeScore?.current ?? 0) > (match.awayScore?.current ?? 0)
      const awayWon = (match.awayScore?.current ?? 0) > (match.homeScore?.current ?? 0)

      for (const { side, entry } of entries) {
        const found = await findOrCreatePlayer(supabase, entry.player, teamNameById, playerLookup)
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
          round_label: `Round ${round}`,
          match_date: matchDate,
          team_name: isHome ? homeName : awayName,
          opponent_name: isHome ? awayName : homeName,
          is_home: isHome,
          match_result: result,
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

    if (unfinished.length > 0) {
      // This round isn't over yet — don't claim it as "pulled" (next run
      // should re-check it for newly-finished matches), and don't walk
      // past it into rounds that haven't happened yet either.
      summary.stoppedReason = 'future_fixtures'
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

export async function checkQuota(apiKey: string) {
  return sportsApiProQuota(apiKey)
}
