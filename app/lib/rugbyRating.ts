import type { SupabaseClient } from '@supabase/supabase-js'

// Pure-function-first, same pattern as app/lib/rugbyScoring.ts and
// app/lib/scoring.ts — calculation has zero DB access, the orchestrator at
// the bottom wires DB reads/writes around it.
//
// The 0-100 match rating: every real player-match performance is scored on
// the same underlying stats, weighted for what that position is actually
// asked to do, then converted to a 0-100 rating by ranking that raw score
// against every OTHER performance ever recorded for the same position
// group — an ever-growing pool (2024 onward), never reset per season. 5.0
// [on the old 0-10 scale; 50 here] means "an average performance for that
// position," nothing more. This is what makes a prop's 80/100 and a
// winger's 80/100 mean the same thing, despite wildly different raw scores.
//
// Calibrated this session against 43 real Six Nations matches (2024-2026)
// and checked against the real 2026 Team of the Tournament (13/15 picks
// rated above their position's median). Position comes straight from
// rugby.players.position (real squad data, not re-derived per match) — a
// player with no position set simply can't be rated yet.

export type RugbyPositionGroup =
  | 'Prop' | 'Hooker' | 'Second Row' | 'Back Row'
  | 'Scrum-half' | 'Fly-half' | 'Centre' | 'Wing' | 'Fullback'

export type RugbyMatchStatLine = {
  tries: number
  try_assists: number
  clean_breaks: number
  offloads: number
  meters_run: number
  passes: number
  tackles: number
  tackles_missed: number
  yellow_card: number
  red_card: number
  conversions: number
  penalty_goals: number
  drop_goals: number
}

type WeightSet = {
  try: number; try_assist: number; clean_break: number; offload: number
  meters: number; passes: number; tackle: number; tackle_missed: number
  yellow: number; red: number
}

// Prop and Hooker share one weight set — near-identical role (scrum +
// tackle, rarely carry or kick). 8 weight sets across the 9 groups.
//
// yellow/red WERE a flat -5/-10 for every position — found this session
// (Kit, 2026-09-26, checking why a 12-tackle Itoje performance still
// rated 5.8) that this hits positions very unevenly: a flat penalty is
// a much bigger bite out of a position whose typical raw score is small
// (a scrum-half's median match is ~1.85) than one where it's large (a
// wing's is ~12.34) — the SAME card, wildly different real punishment,
// just because forwards/9s naturally post smaller raw numbers than
// attacking backs. Recalibrated so a card costs roughly the same
// proportion of a "typical match" at every position instead: yellow
// ≈ -1.0x, red ≈ -2.0x that position's real median raw score, measured
// against the live pool this session (before this fix). Same principle,
// same real-data-calibration discipline as the pack bonus above.
// Forward tackle weight (both made and missed) raised ×1.5 here — found
// this session (Kit, 2026-09-26: a 12-tackle/1-missed Itoje performance
// still rated 5.5) that an individually excellent tackling shift could be
// swamped by the team-wide pack score below (see PACK_SCALE) whenever the
// team had a bad set-piece/discipline day, even though the two are largely
// independent facts about the match. Raising tackle credit AND trimming
// PACK_SCALE together (tested against real matches before shipping) lets
// personal defensive work count for more without erasing the team pack's
// own real value.
const WEIGHTS: Record<string, WeightSet> = {
  PropHooker: { try: 10, try_assist: 3, clean_break: 3, offload: 1.5, meters: 0.06, passes: 0, tackle: 0.525, tackle_missed: -0.9, yellow: -2.6, red: -5.2 },
  SecondRow: { try: 10, try_assist: 3, clean_break: 2.5, offload: 1.5, meters: 0.06, passes: 0, tackle: 0.45, tackle_missed: -0.9, yellow: -3.2, red: -6.3 },
  BackRow: { try: 10, try_assist: 3, clean_break: 2, offload: 1, meters: 0.06, passes: 0, tackle: 0.375, tackle_missed: -0.75, yellow: -4.3, red: -8.6 },
  ScrumHalf: { try: 10, try_assist: 4, clean_break: 2, offload: 1, meters: 0.05, passes: 0.03, tackle: 0.25, tackle_missed: -0.5, yellow: -1.9, red: -3.8 },
  FlyHalf: { try: 10, try_assist: 4, clean_break: 2, offload: 1.5, meters: 0.06, passes: 0.02, tackle: 0.2, tackle_missed: -0.5, yellow: -6.0, red: -12.0 },
  Centre: { try: 10, try_assist: 3, clean_break: 2.5, offload: 1.5, meters: 0.06, passes: 0, tackle: 0.25, tackle_missed: -0.5, yellow: -4.6, red: -9.2 },
  Wing: { try: 12, try_assist: 3, clean_break: 3, offload: 1.5, meters: 0.06, passes: 0, tackle: 0.2, tackle_missed: -0.5, yellow: -12.3, red: -24.7 },
  Fullback: { try: 10, try_assist: 3, clean_break: 2.5, offload: 1.5, meters: 0.06, passes: 0, tackle: 0.3, tackle_missed: -0.7, yellow: -7.9, red: -15.7 },
}

const WEIGHT_KEY_BY_GROUP: Record<RugbyPositionGroup, string> = {
  'Prop': 'PropHooker', 'Hooker': 'PropHooker', 'Second Row': 'SecondRow', 'Back Row': 'BackRow',
  'Scrum-half': 'ScrumHalf', 'Fly-half': 'FlyHalf', 'Centre': 'Centre', 'Wing': 'Wing', 'Fullback': 'Fullback',
}

// Kicking is deliberately NOT part of each group's own weight table —
// applying it per-position used to mean a fly-half got full running-back
// credit AND nearly every kick in the match (kicking alone was ~49% of an
// average #10's score), while a forward or centre who stepped up to kick
// in a pinch got zero credit. One universal, trimmed weight instead:
// whoever actually kicks is judged on it exactly as a recognised fly-half
// would be, regardless of position.
const KICKING_WEIGHT = { conversion: 1.5, penalty: 2, dropgoal: 3.5 }

// The pack rating: a forward's own tackle/carry stats can't see pure
// scrummaging or lineout value, so team-level set-piece and turnover data
// is folded in as a bonus/malus for forwards only (Prop/Hooker/Second
// Row/Back Row) — the positions that data actually reflects. No sub
// adjustment, per Kit: a team's scrum performance is a team performance,
// full weight regardless of who was on for which part of it.
//
// Each of the 5 categories is expressed as a z-score (how many standard
// deviations from average that category was, in that match), then
// averaged equally across all 5 and scaled. Z-scoring puts percentages
// (scrum/lineout %) and raw counts (turnovers, penalties) on the same
// footing without one dominating just because its numbers are bigger.
//
// Mean/stdev below are calibrated against the real 45-match 2024-2026
// Six Nations pool (90 team-match observations) pulled from SportsAPI Pro.
// PACK_SCALE was 4 (this pillar's spread ~40% of a forward's individual
// raw score spread) — trimmed to 2.5 this session (Kit, 2026-09-26) after
// confirming live that a bad team-wide set-piece/discipline day could
// swamp an individually excellent tackling performance (e.g. -3.7 pack
// swing vs +3.3 of personal tackle credit, on a match where the forward's
// own defensive work was genuinely praised in the press). Still a real
// third factor in the rating, just no longer able to outweigh a player's
// own defensive work on its own.
const PACK_STATS_MEAN = { scrumPct: 85.8, lineoutPct: 89.98, turnoversWon: 5.24, turnoversConceded: 13.93, penaltiesConceded: 9.14 }
const PACK_STATS_STDEV = { scrumPct: 16.59, lineoutPct: 9.58, turnoversWon: 2.35, turnoversConceded: 4.54, penaltiesConceded: 3.05 }
const PACK_SCALE = 2.5

export type TeamMatchStatLine = {
  scrums_won: number | null
  scrums_attempted: number | null
  lineouts_won: number | null
  lineouts_attempted: number | null
  turnovers_won: number
  turnovers_conceded: number
  penalties_conceded: number
}

export function computePackRawScore(teamStats: TeamMatchStatLine): number {
  const scrumPct = teamStats.scrums_attempted ? (teamStats.scrums_won! / teamStats.scrums_attempted) * 100 : PACK_STATS_MEAN.scrumPct
  const lineoutPct = teamStats.lineouts_attempted ? (teamStats.lineouts_won! / teamStats.lineouts_attempted) * 100 : PACK_STATS_MEAN.lineoutPct

  const zScrum = (scrumPct - PACK_STATS_MEAN.scrumPct) / PACK_STATS_STDEV.scrumPct
  const zLineout = (lineoutPct - PACK_STATS_MEAN.lineoutPct) / PACK_STATS_STDEV.lineoutPct
  const zTurnoversWon = (teamStats.turnovers_won - PACK_STATS_MEAN.turnoversWon) / PACK_STATS_STDEV.turnoversWon
  const zTurnoversConceded = (teamStats.turnovers_conceded - PACK_STATS_MEAN.turnoversConceded) / PACK_STATS_STDEV.turnoversConceded
  const zPenalties = (teamStats.penalties_conceded - PACK_STATS_MEAN.penaltiesConceded) / PACK_STATS_STDEV.penaltiesConceded

  const packZ = (zScrum + zLineout + zTurnoversWon - zTurnoversConceded - zPenalties) / 5
  return Math.round(packZ * PACK_SCALE * 100) / 100
}

const FORWARD_GROUPS = new Set<RugbyPositionGroup>(['Prop', 'Hooker', 'Second Row', 'Back Row'])

// A small, deliberately modest nudge for the team's actual match result —
// applies to every position (unlike the pack bonus, forwards only). Was
// also a single flat 1.5 for every position — same proportionality
// problem as the card penalties above (a flat nudge is a much bigger
// relative deal for a scrum-half's typically-small raw score than a
// wing's typically-large one), fixed the same way: roughly 0.3x each
// position's real median raw score measured this session. Still a
// starting estimate for Kit to tune by watching real rounds, same
// caveat already attached to squad_rating_multiplier in rugbyScoring.ts
// — the PROPORTIONALITY is the real fix here, not this exact 0.3 figure.
const WIN_LOSS_BONUS_BY_GROUP: Record<string, number> = {
  PropHooker: 0.8, SecondRow: 0.9, BackRow: 1.3, ScrumHalf: 0.6,
  FlyHalf: 1.8, Centre: 1.4, Wing: 3.7, Fullback: 2.4,
}
export type MatchResult = 'win' | 'loss' | 'draw'

export function computeRawScore(stats: RugbyMatchStatLine, group: RugbyPositionGroup, teamStats?: TeamMatchStatLine, matchResult?: MatchResult): number {
  const w = WEIGHTS[WEIGHT_KEY_BY_GROUP[group]]
  let raw = stats.tries * w.try
    + stats.conversions * KICKING_WEIGHT.conversion + stats.penalty_goals * KICKING_WEIGHT.penalty + stats.drop_goals * KICKING_WEIGHT.dropgoal
    + stats.try_assists * w.try_assist + stats.clean_breaks * w.clean_break + stats.offloads * w.offload
    + stats.meters_run * w.meters + stats.passes * w.passes + stats.tackles * w.tackle
    - stats.tackles_missed * Math.abs(w.tackle_missed) - stats.yellow_card * Math.abs(w.yellow) - stats.red_card * Math.abs(w.red)
  if (teamStats && FORWARD_GROUPS.has(group)) {
    raw += computePackRawScore(teamStats)
  }
  const winLossBonus = WIN_LOSS_BONUS_BY_GROUP[WEIGHT_KEY_BY_GROUP[group]] ?? 1.5
  if (matchResult === 'win') raw += winLossBonus
  else if (matchResult === 'loss') raw -= winLossBonus
  return Math.round(raw * 100) / 100
}

// group is a plain RugbyPositionGroup for almost every entry — widened to
// string so external (player_performances) substitute entries can use a
// compound key ("Wing::sub") to rank against OTHER subs at that position
// rather than full-match starters (see recomputeAllRugbyRatings) without
// computeRatings itself needing to know anything special; it only ever
// treats this as an opaque grouping key.
export type RatingPoolEntry = { id: string; group: string; rawScore: number }

// Ranks every entry against every OTHER entry in the same group — the
// "ever-growing historical pool" that establishes what an average/good/bad
// performance looks like for that position. Pure and side-effect free:
// call it with the CURRENT full pool every time, never incrementally —
// cheap enough (a sort) to just always recompute from scratch, and it
// means adding more historical data (autumn internationals, a new season)
// automatically sharpens every rating next time this runs, not just new
// ones.
export function computeRatings(pool: RatingPoolEntry[]): Map<string, number> {
  const ratingById = new Map<string, number>()
  const byGroup = new Map<string, number[]>()
  pool.forEach(e => {
    if (!byGroup.has(e.group)) byGroup.set(e.group, [])
    byGroup.get(e.group)!.push(e.rawScore)
  })
  byGroup.forEach(scores => scores.sort((a, b) => a - b))

  pool.forEach(e => {
    const scores = byGroup.get(e.group)!
    let below = 0
    for (const v of scores) { if (v < e.rawScore) below++; else break }
    const pctile = scores.length > 1 ? below / (scores.length - 1) : 0.5
    ratingById.set(e.id, Math.round(pctile * 1000) / 10) // 0.0-100.0
  })
  return ratingById
}

// ---------- Orchestrator (DB-touching) ----------

export type RugbyMatchRatingRow = { fixture_id: number; player_id: number; group: string; raw_score: number; rating: number }

// Recomputes ratings for EVERY player-match performance we have real stats
// for, using each player's current rugby.players.position — not just new
// ones, since the whole point of the ever-growing pool is that adding more
// data can shift where an older performance ranks too. Cheap enough (a
// sort per position group) to always run in full rather than try to patch
// incrementally. Players with no position set are skipped, not guessed.
// Supabase/PostgREST caps an unpaginated select at 1000 rows — the
// historical backfill alone put player_match_stats past that, so every
// table here that can grow past 1000 (stats, events; not the ~300-row
// players table) needs an explicit page loop or the pool silently truncates.
async function fetchAllRows<T>(query: () => any): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await query().range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return rows
}

// One row per external performance (rugby.player_performances) — unlike
// the fixture-based rows, these already carry every stat inline (no
// separate match_events table to derive try/card counts from) and their
// own match_result, so they build a RatingPoolEntry far more directly.
type ExternalPerformanceRow = {
  id: number; player_id: number; external_competition_id: number
  tries: number; conversions: number; penalty_goals: number; drop_goals: number
  yellow_card: number; red_card: number; try_assists: number; clean_breaks: number
  offloads: number; meters_run: number; passes: number; tackles: number; tackles_missed: number
  match_result: MatchResult | null
  is_substitute: boolean | null
}

// Kit, 2026-09-26, after seeing real data confirm club performances
// systematically out-rank international ones on the same raw formula
// (Test rugby is tighter/lower-stat by nature, not lower-quality): boost
// international raw scores before ranking rather than trying to
// normalize the gap away statistically. 1.4x is a starting estimate
// (roughly closes the average club/international raw-score gap
// measured this session), not a settled number. Six Nations fixture-
// based performances are ALWAYS international; external ones only
// count if their competition is (rugby.external_competitions.
// is_international — a newer, optional column, degrades to "nothing is
// international" if missing rather than breaking the whole recompute).
const INTERNATIONAL_BONUS = 1.4
// Graduated by how many international appearances a player actually has
// in our data (Six Nations fixtures always count; external performances
// count only when their competition is flagged is_international) — Kit,
// 2026-09-26: "you can't rely on those players to replicate their
// existing average" until they've proven it at the top level a handful
// of times, not just once. 0 caps stays capped hardest; 1-4 caps is
// capped less harshly (clearly good, some proof, just not much of it);
// 5+ caps lifts the cap entirely. Caps are only what we've actually
// pulled — a real senior international with a gap in our specific data
// window would currently register with fewer caps than they truly have;
// this self-corrects as more historical data is pulled.
function ratingCapForCaps(caps: number): number {
  if (caps === 0) return 65
  if (caps < 5) return 80
  return 100 // no effective cap
}

export async function recomputeAllRugbyRatings(supabase: SupabaseClient): Promise<{ success: true; rows: number } | { error: string }> {
  const [statsRows, players, matchEvents, teamStatsRows, fixtures, externalPerformances] = await Promise.all([
    fetchAllRows<{ fixture_id: number; player_id: number; meters_run: number; clean_breaks: number; offloads: number; tackles: number; tackles_missed: number; try_assists: number }>(
      () => supabase.schema('rugby').from('player_match_stats').select('fixture_id, player_id, meters_run, clean_breaks, offloads, tackles, tackles_missed, try_assists')
    ),
    fetchAllRows<{ id: number; position: string | null; team_id: number | null }>(
      () => supabase.schema('rugby').from('players').select('id, position, team_id')
    ),
    fetchAllRows<{ fixture_id: number; player_id: number | null; event_type: string }>(
      () => supabase.schema('rugby').from('match_events').select('fixture_id, player_id, event_type')
    ),
    // Team stats are a newer, optional table — missing/empty degrades to
    // "no pack bonus applied" rather than breaking the whole recompute.
    fetchAllRows<TeamMatchStatLine & { fixture_id: number; team_id: number }>(
      () => supabase.schema('rugby').from('match_team_stats').select('fixture_id, team_id, scrums_won, scrums_attempted, lineouts_won, lineouts_attempted, turnovers_won, turnovers_conceded, penalties_conceded')
    ).catch(() => []),
    fetchAllRows<{ id: number; home_team_id: number; away_team_id: number; home_score: number | null; away_score: number | null }>(
      () => supabase.schema('rugby').from('fixtures').select('id, home_team_id, away_team_id, home_score, away_score')
    ),
    // Own isolated fetch, own try/catch — a brand-new table (this
    // session), so a problem reading it must only mean external
    // performances sit out of this recompute, never that fixture-based
    // ratings (the live game) stop working.
    fetchAllRows<ExternalPerformanceRow>(
      () => supabase.schema('rugby').from('player_performances').select('id, player_id, external_competition_id, tries, conversions, penalty_goals, drop_goals, yellow_card, red_card, try_assists, clean_breaks, offloads, meters_run, passes, tackles, tackles_missed, match_result, is_substitute')
    ).catch(() => [] as ExternalPerformanceRow[]),
  ])

  // Isolated fetch: is_international is newer/optional — missing means
  // every external competition reads as "not international" (no bonus
  // applied, no player wrongly exempted from the club-only cap), never
  // that this whole recompute breaks.
  let isInternationalByExtCompId = new Map<number, boolean>()
  try {
    const { data: comps } = await supabase.schema('rugby').from('external_competitions').select('id, is_international')
    isInternationalByExtCompId = new Map((comps ?? []).map((c: { id: number; is_international: boolean }) => [c.id, !!c.is_international]))
  } catch { /* column not added yet */ }

  const fixtureById = new Map(fixtures.map(f => [f.id, f]))
  function matchResultFor(fixtureId: number, teamId: number | undefined): MatchResult | undefined {
    if (teamId == null) return undefined
    const f = fixtureById.get(fixtureId)
    if (!f || f.home_score == null || f.away_score == null) return undefined
    if (f.home_score === f.away_score) return 'draw'
    const wonAsHome = f.home_score > f.away_score && teamId === f.home_team_id
    const wonAsAway = f.away_score > f.home_score && teamId === f.away_team_id
    return (wonAsHome || wonAsAway) ? 'win' : 'loss'
  }

  if (statsRows.length === 0) return { success: true, rows: 0 }

  const positionByPlayerId = new Map<number, string>()
  const teamIdByPlayerId = new Map<number, number>()
  players.forEach(p => {
    if (p.position) positionByPlayerId.set(p.id, p.position)
    if (p.team_id != null) teamIdByPlayerId.set(p.id, p.team_id)
  })

  const teamStatsByFixtureAndTeam = new Map<string, TeamMatchStatLine>()
  teamStatsRows.forEach(t => teamStatsByFixtureAndTeam.set(`${t.fixture_id}::${t.team_id}`, t))

  const eventsByFixtureAndPlayer = new Map<string, { event_type: string }[]>()
  matchEvents.forEach(e => {
    if (e.player_id == null) return
    const key = `${e.fixture_id}::${e.player_id}`
    if (!eventsByFixtureAndPlayer.has(key)) eventsByFixtureAndPlayer.set(key, [])
    eventsByFixtureAndPlayer.get(key)!.push({ event_type: e.event_type })
  })

  const pool: RatingPoolEntry[] = []
  const rawByEntryId = new Map<string, { fixture_id: number; player_id: number; group: RugbyPositionGroup }>()
  const entryPlayerId = new Map<string, number>()
  const internationalCapsByPlayerId = new Map<number, number>()
  function addCap(playerId: number) {
    internationalCapsByPlayerId.set(playerId, (internationalCapsByPlayerId.get(playerId) ?? 0) + 1)
  }

  // Six Nations fixtures are always international — counted up front so
  // the graduated cap below sees every real cap regardless of the order
  // pool entries happen to build in.
  statsRows.forEach(s => addCap(s.player_id))
  externalPerformances.forEach(p => {
    if (isInternationalByExtCompId.get(p.external_competition_id)) addCap(p.player_id)
  })

  statsRows.forEach(s => {
    const position = positionByPlayerId.get(s.player_id)
    if (!position || !(position in WEIGHT_KEY_BY_GROUP)) return // no real position yet — skip, don't guess
    const group = position as RugbyPositionGroup
    const events = eventsByFixtureAndPlayer.get(`${s.fixture_id}::${s.player_id}`) ?? []
    const statLine: RugbyMatchStatLine = {
      tries: events.filter(e => e.event_type === 'try').length,
      conversions: events.filter(e => e.event_type === 'conversion').length,
      penalty_goals: events.filter(e => e.event_type === 'penalty_goal').length,
      drop_goals: events.filter(e => e.event_type === 'drop_goal').length,
      yellow_card: events.filter(e => e.event_type === 'yellow_card').length,
      red_card: events.filter(e => e.event_type === 'red_card').length,
      try_assists: s.try_assists ?? 0, clean_breaks: s.clean_breaks ?? 0, offloads: s.offloads ?? 0,
      meters_run: s.meters_run ?? 0, passes: 0, tackles: s.tackles ?? 0, tackles_missed: s.tackles_missed ?? 0,
    }
    const id = `${s.fixture_id}::${s.player_id}`
    const teamId = teamIdByPlayerId.get(s.player_id)
    const teamStats = teamId != null ? teamStatsByFixtureAndTeam.get(`${s.fixture_id}::${teamId}`) : undefined
    const matchResult = matchResultFor(s.fixture_id, teamId)
    // Six Nations is always international — the bonus always applies here.
    const rawScore = computeRawScore(statLine, group, teamStats, matchResult) * INTERNATIONAL_BONUS
    pool.push({ id, group, rawScore })
    rawByEntryId.set(id, { fixture_id: s.fixture_id, player_id: s.player_id, group })
    entryPlayerId.set(id, s.player_id)
  })

  // Domestic/other-international performances (rugby.player_performances)
  // join the SAME ever-growing pool, ranked against fixture-based ones on
  // equal footing — computeRawScore/computeRatings are already generic,
  // nothing to change there. No team-level pack stats available for these
  // yet (teamStats left undefined — computeRawScore treats that as "no
  // pack bonus," same as any fixture missing match_team_stats).
  externalPerformances.forEach(p => {
    const position = positionByPlayerId.get(p.player_id)
    if (!position || !(position in WEIGHT_KEY_BY_GROUP)) return
    const group = position as RugbyPositionGroup
    const statLine: RugbyMatchStatLine = {
      tries: p.tries ?? 0, conversions: p.conversions ?? 0, penalty_goals: p.penalty_goals ?? 0,
      drop_goals: p.drop_goals ?? 0, yellow_card: p.yellow_card ?? 0, red_card: p.red_card ?? 0,
      try_assists: p.try_assists ?? 0, clean_breaks: p.clean_breaks ?? 0, offloads: p.offloads ?? 0,
      meters_run: p.meters_run ?? 0, passes: p.passes ?? 0, tackles: p.tackles ?? 0, tackles_missed: p.tackles_missed ?? 0,
    }
    const id = `ext::${p.id}`
    const isInternational = isInternationalByExtCompId.get(p.external_competition_id)
    const bonus = isInternational ? INTERNATIONAL_BONUS : 1
    const rawScore = computeRawScore(statLine, group, undefined, p.match_result ?? undefined) * bonus
    // Kit, 2026-09-26: confirmed live that substitutes score ~20-30 points
    // lower than starters at EVERY position (not just backs) — not a real
    // quality gap, just fewer minutes to rack up counting stats, with no
    // minutes-played field available to normalize by instead. Ranking a
    // sub's performance against ONLY other subs at that position (rather
    // than full-match starters) fixes the comparison itself. Fixture-based
    // (Six Nations) entries have no is_substitute data at all, so they
    // stay in the plain, ungrouped position pool as before.
    const poolGroup = p.is_substitute ? `${group}::sub` : group
    pool.push({ id, group: poolGroup, rawScore })
    entryPlayerId.set(id, p.player_id)
  })

  if (pool.length === 0) return { success: true, rows: 0 }

  const ratings = computeRatings(pool)
  // Cap AFTER ranking, never before — the cap is about the final
  // comparison number, not about pretending the underlying performance
  // was worse than it was.
  pool.forEach(e => {
    const playerId = entryPlayerId.get(e.id)
    if (playerId == null) return
    const cap = ratingCapForCaps(internationalCapsByPlayerId.get(playerId) ?? 0)
    if (cap < 100) {
      const capped = Math.min(ratings.get(e.id) ?? 50, cap)
      ratings.set(e.id, capped)
    }
  })
  const fixtureBased = pool.filter(e => !e.id.startsWith('ext::'))
  const rows: RugbyMatchRatingRow[] = fixtureBased.map(e => ({
    fixture_id: rawByEntryId.get(e.id)!.fixture_id,
    player_id: rawByEntryId.get(e.id)!.player_id,
    group: e.group,
    raw_score: e.rawScore,
    rating: ratings.get(e.id) ?? 50,
  }))

  const { error } = await supabase.schema('rugby').from('player_match_ratings').upsert(rows, { onConflict: 'fixture_id,player_id' })
  if (error) return { error: error.message }

  // One .update() per row, since a PostgREST upsert would need every
  // NOT NULL column on player_performances re-sent, not just the two
  // being changed — but sequentially awaited, this was ~11 minutes for
  // 1150 rows in real testing this session (each a full round trip).
  // Chunked and run concurrently within each chunk instead — fast enough
  // without opening hundreds of connections at once.
  const externalEntries = pool.filter(e => e.id.startsWith('ext::'))
  const UPDATE_CHUNK_SIZE = 25
  for (let i = 0; i < externalEntries.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = externalEntries.slice(i, i + UPDATE_CHUNK_SIZE)
    await Promise.all(chunk.map(e => {
      const perfId = Number(e.id.slice('ext::'.length))
      return supabase.schema('rugby').from('player_performances')
        .update({ raw_score: e.rawScore, rating: ratings.get(e.id) ?? 50 }).eq('id', perfId)
    }))
  }
  return { success: true, rows: rows.length + externalEntries.length }
}
