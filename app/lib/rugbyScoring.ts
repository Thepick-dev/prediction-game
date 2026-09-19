import type { SupabaseClient } from '@supabase/supabase-js'

// Isolated, pure-function-first design mirroring app/lib/scoring.ts (the
// football engine): calculation has zero DB access so it's directly
// testable, and the orchestrator at the bottom just wires DB reads/writes
// around it. This file only covers the season-long 6-player squad layer
// (one player per team, one designated kicker, subs, red-card penalty,
// a differential/"contrarian" bonus per pick) — match-score predictions
// and season prop bets are a separate, not-yet-built layer.

export type RugbyScoringRules = Record<string, number>

// Sensible fallbacks if a competition's scoring_rules row is missing for
// a given key — defensive, same reasoning as every other "newer optional
// column" in this codebase: a missing admin config shouldn't break scoring,
// just fall back to a reasonable default until admin sets it properly.
export const DEFAULT_RUGBY_SCORING_RULES: RugbyScoringRules = {
  squad_try_points: 10,
  squad_conversion_points: 2,
  squad_penalty_points: 3,
  squad_dropgoal_points: 5,
  squad_red_card_penalty: 15,
  // Magnitude/count categories from full match player-statistics, on top of
  // the discrete try/kick/card events above — apply to ANY of the 6 picks,
  // not just the designated kicker (unlike kicking points). Calibrated
  // against a real Six Nations match's full player stats so an average
  // forward's tackle+carry haul and an average back's carry+tackle haul
  // come out close to level (~2.4-2.5pts each), not lopsided toward either.
  squad_try_assist_points: 3,
  squad_clean_break_points: 2,
  squad_offload_points: 1,
  squad_meters_run_points: 0.05,
  squad_tackle_points: 0.2,
  squad_tackle_missed_penalty: 0.5,
  squad_yellow_card_penalty: 5,
  // The actual live scoring mechanism now: each pick's 0-100 match rating
  // (app/lib/rugbyRating.ts — already accounts for tries/kicks/tackles/
  // cards/etc. on its own scale) summed across the squad, times this
  // multiplier. The squad_try_points-and-friends values above stay
  // computed and shown for transparency but no longer feed the total,
  // to avoid double-counting what the rating already covers. 0.5 is a
  // starting estimate for a roughly comparable scale to Match
  // Predictions' own points, not a guaranteed 50/50 — tune by watching
  // real rounds.
  squad_rating_multiplier: 0.5,
  max_free_subs: 6,
  extra_sub_penalty: 10,
  // A player picked by few managers earns a multiplier on their try+kicking
  // points for the round they were acquired — e.g. a threshold of 25 and a
  // multiplier of 1.5 means anyone picked by under 25% of the field that
  // round has those points multiplied by 1.5.
  player_ownership_threshold_pct: 25,
  player_ownership_multiplier: 1.5,
  // Weekly match predictions: winner + margin (not exact score), a single
  // admin-tunable base per outcome, one confidence pick per round, and an
  // underdog multiplier for a widely-missed correct winner call.
  match_win_base: 50,
  match_draw_base: 75,
  match_confidence_multiplier: 1.5,
  match_underdog_threshold_pct: 25,
  match_underdog_multiplier: 1.5,
  // Per-team try-bonus (4+ tries) call, one for each side per fixture —
  // shares the match's own confidence/underdog multiplier state.
  try_bonus_points: 20,
  // Season-long prop-bet layer — same underdog-multiplier principle,
  // applied to that question's own admin-set points value.
  season_underdog_threshold_pct: 25,
  season_underdog_multiplier: 1.5,
}

// disabledKeys is kept as a separate argument (not a field on each row)
// deliberately — 'enabled' is a newer, optional scoring_rules column, and
// the codebase's own convention is that any newer/optional column gets its
// own isolated fetch rather than being bundled into an established select,
// so a not-yet-run migration degrades to "everything enabled" instead of
// breaking the whole rules read.
export function rulesWithDefaults(rows: { rule_key: string; points: number }[], disabledKeys: Set<string> = new Set()): RugbyScoringRules {
  const rules: RugbyScoringRules = { ...DEFAULT_RUGBY_SCORING_RULES }
  rows.forEach(r => { rules[r.rule_key] = r.points })
  disabledKeys.forEach(key => { rules[key] = 0 })
  return rules
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type SeasonSquadPick = {
  id: string
  user_id: string
  player_id: number
  is_kicker: boolean
  is_initial_pick: boolean
  active: boolean
  contrarian_pct_at_pick: number | null
  round_acquired: number
  round_removed: number | null
  created_at: string
}

export type RugbyMatchEvent = { player_id: number | null; event_type: string; fixture_id: number }
export type RugbyFixtureRef = { id: number; round_id: string; home_team_id: number; away_team_id: number }
export type RugbyPlayerRef = { id: number; team_id: number }

// One row per player per fixture — magnitude/count categories that aren't
// a discrete moment in time (unlike tries/kicks/cards, which stay in
// match_events). Applies to whichever of a user's 6 squad picks played
// that fixture, regardless of is_kicker.
export type RugbyPlayerMatchStat = {
  fixture_id: number
  player_id: number
  meters_run: number
  clean_breaks: number
  offloads: number
  tackles: number
  tackles_missed: number
  try_assists: number
}

export type RugbyPlayerMatchRating = { fixture_id: number; player_id: number; rating: number }

export type SeasonSquadPointsRow = {
  season_squad_pick_id: string
  user_id: string
  round_id: string
  try_points: number
  kicking_points: number
  try_assist_points: number
  clean_break_points: number
  offload_points: number
  meters_run_points: number
  tackle_points: number
  tackle_missed_penalty: number
  yellow_card_penalty: number
  red_card_penalty: number
  // The player's real 0-100 rating that round (0 if they have no rating
  // yet — unplayed, unsynced, or no position set — same "no data = zero"
  // convention as an unused pick). rating_points is rating * the admin's
  // squad_rating_multiplier, and is what total_points is actually built
  // from now — every field above this comment stays computed for the
  // transparency breakdown, but no longer feeds the total.
  rating: number
  rating_points: number
  sub_penalty: number
  contrarian_bonus: number
  total_points: number
}

// A pick "covers" a round if it was on the squad for the whole of it — a
// half-open interval, [round_acquired, round_removed). The round a sub
// happens IN belongs to the incoming player, not the outgoing one.
function pickCoversRound(pick: SeasonSquadPick, roundNumber: number): boolean {
  if (pick.round_acquired > roundNumber) return false
  if (pick.round_removed != null && pick.round_removed <= roundNumber) return false
  return true
}

export type SubBudgetMode = 'season' | 'per_round'

// Which of a user's subs (their non-initial picks, in the order they were
// made) fall beyond the free budget — a pure function of pick order, so
// it doesn't matter whether it's computed at pick-time or recomputed
// wholesale on every scoring run; the answer is always the same for a
// given history. 'season' pools every sub across the whole competition
// against one budget (max_free_subs total, ever); 'per_round' resets the
// budget every round instead (max_free_subs per round, never carries
// over) — grouping key is the only thing that changes between the two.
export function computeSubPenalties(
  picks: SeasonSquadPick[],
  rules: RugbyScoringRules,
  mode: SubBudgetMode = 'season'
): Record<string, number> {
  const penaltyByPickId: Record<string, number> = {}
  const byGroup = new Map<string, SeasonSquadPick[]>()
  picks.filter(p => !p.is_initial_pick).forEach(p => {
    const key = mode === 'per_round' ? `${p.user_id}::${p.round_acquired}` : p.user_id
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key)!.push(p)
  })
  for (const groupPicks of byGroup.values()) {
    const ordered = [...groupPicks].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    ordered.forEach((p, i) => {
      if (i >= rules.max_free_subs) penaltyByPickId[p.id] = rules.extra_sub_penalty
    })
  }
  return penaltyByPickId
}

export function computeSeasonSquadRoundPoints(
  picks: SeasonSquadPick[],
  roundNumber: number,
  roundId: string,
  fixtures: RugbyFixtureRef[],
  players: RugbyPlayerRef[],
  matchEvents: RugbyMatchEvent[],
  rules: RugbyScoringRules,
  subPenaltyByPickId: Record<string, number>,
  playerMatchStats: RugbyPlayerMatchStat[] = [],
  playerMatchRatings: RugbyPlayerMatchRating[] = []
): SeasonSquadPointsRow[] {
  const teamIdByPlayerId = new Map<number, number>()
  players.forEach(p => teamIdByPlayerId.set(p.id, p.team_id))

  const fixtureByTeamId = new Map<number, RugbyFixtureRef>()
  fixtures.filter(f => f.round_id === roundId).forEach(f => {
    fixtureByTeamId.set(f.home_team_id, f)
    fixtureByTeamId.set(f.away_team_id, f)
  })

  const eventsByFixtureAndPlayer = new Map<string, RugbyMatchEvent[]>()
  matchEvents.forEach(e => {
    if (e.player_id == null) return
    const key = `${e.fixture_id}::${e.player_id}`
    if (!eventsByFixtureAndPlayer.has(key)) eventsByFixtureAndPlayer.set(key, [])
    eventsByFixtureAndPlayer.get(key)!.push(e)
  })

  const statsByFixtureAndPlayer = new Map<string, RugbyPlayerMatchStat>()
  playerMatchStats.forEach(s => statsByFixtureAndPlayer.set(`${s.fixture_id}::${s.player_id}`, s))

  const ratingByFixtureAndPlayer = new Map<string, number>()
  playerMatchRatings.forEach(r => ratingByFixtureAndPlayer.set(`${r.fixture_id}::${r.player_id}`, r.rating))

  const rows: SeasonSquadPointsRow[] = []

  for (const pick of picks) {
    if (!pickCoversRound(pick, roundNumber)) continue
    const teamId = teamIdByPlayerId.get(pick.player_id)
    const fixture = teamId != null ? fixtureByTeamId.get(teamId) : undefined
    const events = fixture ? (eventsByFixtureAndPlayer.get(`${fixture.id}::${pick.player_id}`) ?? []) : []

    const tryCount = events.filter(e => e.event_type === 'try').length
    const tryPoints = tryCount * rules.squad_try_points

    let kickingPoints = 0
    if (pick.is_kicker) {
      const conversionCount = events.filter(e => e.event_type === 'conversion').length
      const penaltyCount = events.filter(e => e.event_type === 'penalty_goal').length
      const dropgoalCount = events.filter(e => e.event_type === 'drop_goal').length
      kickingPoints = conversionCount * rules.squad_conversion_points
        + penaltyCount * rules.squad_penalty_points
        + dropgoalCount * rules.squad_dropgoal_points
    }

    const hasRedCard = events.some(e => e.event_type === 'red_card')
    const redCardPenalty = hasRedCard ? rules.squad_red_card_penalty : 0
    const hasYellowCard = events.some(e => e.event_type === 'yellow_card')
    const yellowCardPenalty = hasYellowCard ? rules.squad_yellow_card_penalty : 0

    const stat = fixture ? statsByFixtureAndPlayer.get(`${fixture.id}::${pick.player_id}`) : undefined
    const tryAssistPoints = round2((stat?.try_assists ?? 0) * rules.squad_try_assist_points)
    const cleanBreakPoints = round2((stat?.clean_breaks ?? 0) * rules.squad_clean_break_points)
    const offloadPoints = round2((stat?.offloads ?? 0) * rules.squad_offload_points)
    const metersRunPoints = round2((stat?.meters_run ?? 0) * rules.squad_meters_run_points)
    const tacklePoints = round2((stat?.tackles ?? 0) * rules.squad_tackle_points)
    const tackleMissedPenalty = round2((stat?.tackles_missed ?? 0) * rules.squad_tackle_missed_penalty)

    // The real scoring mechanism: this pick's 0-100 rating for this
    // fixture (0 if unrated — unplayed, unsynced, or no position set,
    // same "no data = zero" convention as an unused pick), times the
    // admin's squad_rating_multiplier.
    const rating = fixture ? (ratingByFixtureAndPlayer.get(`${fixture.id}::${pick.player_id}`) ?? 0) : 0
    const ratingPoints = round2(rating * rules.squad_rating_multiplier)

    // Both one-off charges/bonuses only ever apply in the specific round
    // the pick was acquired — never repeated on later rounds' recalcs. A
    // rarely-held player multiplies their rating points rather than
    // adding a flat bonus; contrarian_bonus is kept as the EXTRA amount
    // that multiplier contributes, so rating_points stays its raw,
    // unmultiplied value for anything reading it directly.
    const isAcquisitionRound = roundNumber === pick.round_acquired
    const isUnderdogPick = isAcquisitionRound && pick.contrarian_pct_at_pick != null && pick.contrarian_pct_at_pick < rules.player_ownership_threshold_pct
    const contrarianBonus = isUnderdogPick
      ? Math.round(ratingPoints * (rules.player_ownership_multiplier - 1))
      : 0
    const subPenalty = isAcquisitionRound ? (subPenaltyByPickId[pick.id] ?? 0) : 0

    // Red/yellow cards are already priced into the rating itself
    // (app/lib/rugbyRating.ts's own yellow/red weights) — redCardPenalty/
    // yellowCardPenalty below are kept computed for the transparency
    // breakdown only, deliberately NOT subtracted again here.
    const totalPoints = round2(ratingPoints + contrarianBonus - subPenalty)

    rows.push({
      season_squad_pick_id: pick.id,
      user_id: pick.user_id,
      round_id: roundId,
      try_points: tryPoints,
      kicking_points: kickingPoints,
      try_assist_points: tryAssistPoints,
      clean_break_points: cleanBreakPoints,
      offload_points: offloadPoints,
      rating,
      rating_points: ratingPoints,
      meters_run_points: metersRunPoints,
      tackle_points: tacklePoints,
      tackle_missed_penalty: tackleMissedPenalty,
      yellow_card_penalty: yellowCardPenalty,
      red_card_penalty: redCardPenalty,
      sub_penalty: subPenalty,
      contrarian_bonus: contrarianBonus,
      total_points: totalPoints,
    })
  }

  return rows
}

// ---------- Orchestrator (DB-touching) ----------

export async function calculateSeasonSquadRoundScoring(
  supabase: SupabaseClient,
  roundId: string
): Promise<{ success: true; rows: number } | { error: string }> {
  const { data: round } = await supabase.schema('rugby').from('rounds').select('id, number, competition_id').eq('id', roundId).single()
  if (!round) return { error: 'Round not found' }

  const [{ data: rulesRows }, { data: picks }, { data: fixtures }, { data: players }] = await Promise.all([
    supabase.schema('rugby').from('scoring_rules').select('rule_key, points').eq('competition_id', round.competition_id),
    supabase.schema('rugby').from('season_squad_picks').select('*').eq('competition_id', round.competition_id),
    supabase.schema('rugby').from('fixtures').select('id, round_id, home_team_id, away_team_id'),
    supabase.schema('rugby').from('players').select('id, team_id'),
  ])

  // Isolated fetch: 'enabled' is a newer, optional column — kept out of the
  // select above so a not-yet-run migration can never break the real points
  // values, only ever degrade to "everything enabled" (today's behaviour).
  const disabledKeys = new Set<string>()
  const { data: enabledRows, error: enabledError } = await supabase.schema('rugby').from('scoring_rules').select('rule_key, enabled').eq('competition_id', round.competition_id)
  if (!enabledError) enabledRows?.forEach((r: { rule_key: string; enabled: boolean | null }) => { if (r.enabled === false) disabledKeys.add(r.rule_key) })

  const rules = rulesWithDefaults(rulesRows ?? [], disabledKeys)
  const allPicks = (picks ?? []) as SeasonSquadPick[]
  const fixturesList = (fixtures ?? []) as RugbyFixtureRef[]
  const playersList = (players ?? []) as RugbyPlayerRef[]

  const fixtureIds = fixturesList.filter(f => f.round_id === roundId).map(f => f.id)
  const { data: matchEvents } = fixtureIds.length
    ? await supabase.schema('rugby').from('match_events').select('player_id, event_type, fixture_id').in('fixture_id', fixtureIds)
    : { data: [] as RugbyMatchEvent[] }

  // Isolated fetch: player_match_stats is a brand-new table — degrade to []
  // if it doesn't exist yet rather than failing try/kick/card scoring too.
  let statsRows: RugbyPlayerMatchStat[] = []
  if (fixtureIds.length) {
    const { data: statsData, error: statsError } = await supabase.schema('rugby').from('player_match_stats')
      .select('fixture_id, player_id, meters_run, clean_breaks, offloads, tackles, tackles_missed, try_assists')
      .in('fixture_id', fixtureIds)
    if (!statsError && statsData) statsRows = statsData as RugbyPlayerMatchStat[]
  }

  // Isolated fetch: sub_budget_mode is a newer, optional competitions
  // column — degrades to 'season' (today's only behaviour) if missing.
  const { data: competitionRow } = await supabase.schema('rugby').from('competitions').select('sub_budget_mode').eq('id', round.competition_id).maybeSingle()
  const subBudgetMode: SubBudgetMode = competitionRow?.sub_budget_mode === 'per_round' ? 'per_round' : 'season'

  // Isolated fetch: player_match_ratings is a brand-new table (and the
  // whole reason it exists as its own table rather than a live
  // computation here — ranking against the full historical pool needs
  // every fixture ever recorded, not just this round's). Degrades to []
  // — an admin who hasn't run "Recalculate Ratings" yet just sees 0s
  // rather than a broken page. Call recomputeAllRugbyRatings (app/lib/
  // rugbyRating.ts) before this to refresh it first.
  let ratingRows: RugbyPlayerMatchRating[] = []
  if (fixtureIds.length) {
    const { data: ratingsData, error: ratingsError } = await supabase.schema('rugby').from('player_match_ratings')
      .select('fixture_id, player_id, rating')
      .in('fixture_id', fixtureIds)
    if (!ratingsError && ratingsData) ratingRows = ratingsData as RugbyPlayerMatchRating[]
  }

  const subPenaltyByPickId = computeSubPenalties(allPicks, rules, subBudgetMode)

  const rows = computeSeasonSquadRoundPoints(
    allPicks, round.number, roundId, fixturesList, playersList, (matchEvents ?? []) as RugbyMatchEvent[], rules, subPenaltyByPickId, statsRows, ratingRows
  )

  if (rows.length === 0) return { success: true, rows: 0 }

  const { error } = await supabase.schema('rugby').from('season_squad_points').upsert(rows, { onConflict: 'season_squad_pick_id,round_id' })
  if (error) return { error: error.message }

  return { success: true, rows: rows.length }
}

// ============================================================
// Weekly match predictions: winner + margin (not an exact score), one
// admin-tunable base per outcome, one confidence pick per round, an
// underdog multiplier for a widely-missed correct winner call, and a
// per-team try-bonus (4+ tries) call sharing that same multiplier state.
// ============================================================

export type MatchPrediction = {
  id: string
  user_id: string
  round_id: string
  fixture_id: number
  predicted_winner: 'home' | 'away' | 'draw'
  predicted_margin: number | null // null when predicted_winner is 'draw'
  is_confidence_pick: boolean
  predicted_home_try_bonus: boolean | null
  predicted_away_try_bonus: boolean | null
}

export type FinishedFixture = { id: number; home_score: number | null; away_score: number | null }

export type RugbyFixtureTeams = { id: number; home_team_id: number; away_team_id: number }

// Whether each side actually scored a try bonus (4+ tries) — derived from
// match_events, never a separate admin input, so there's nothing extra to
// enter beyond the scorer events already logged for the squad-picks layer.
export function computeTryBonusActuals(
  fixtures: RugbyFixtureTeams[],
  players: RugbyPlayerRef[],
  matchEvents: RugbyMatchEvent[]
): Record<number, { home: boolean; away: boolean }> {
  const teamByPlayerId = new Map(players.map(p => [p.id, p.team_id]))
  const result: Record<number, { home: boolean; away: boolean }> = {}
  for (const fixture of fixtures) {
    let homeTries = 0
    let awayTries = 0
    matchEvents.filter(e => e.fixture_id === fixture.id && e.event_type === 'try').forEach(e => {
      const teamId = e.player_id != null ? teamByPlayerId.get(e.player_id) : undefined
      if (teamId === fixture.home_team_id) homeTries += 1
      else if (teamId === fixture.away_team_id) awayTries += 1
    })
    result[fixture.id] = { home: homeTries >= 4, away: awayTries >= 4 }
  }
  return result
}

export type MatchPredictionPointsRow = {
  match_prediction_id: string
  user_id: string
  round_id: string
  fixture_id: number
  is_correct: boolean
  multiplier: number
  match_points: number
  home_try_bonus_points: number
  away_try_bonus_points: number
  total_points: number
}

// Percentage of submitted predictions (for a given fixture) that picked
// the side that actually won — only meaningful once the fixture has a
// final score. Pure and side-effect free so it can be unit tested without
// a real field of players.
export function computeMatchSideDistribution(
  predictions: MatchPrediction[],
  fixtures: FinishedFixture[]
): Record<number, number> {
  const result: Record<number, number> = {}
  for (const fixture of fixtures) {
    if (fixture.home_score == null || fixture.away_score == null) continue
    const diff = fixture.home_score - fixture.away_score
    const actualSide = diff > 0 ? 'home' : diff < 0 ? 'away' : 'draw'
    const fixturePredictions = predictions.filter(p => p.fixture_id === fixture.id)
    if (fixturePredictions.length === 0) continue
    const correctCount = fixturePredictions.filter(p => p.predicted_winner === actualSide).length
    result[fixture.id] = (correctCount / fixturePredictions.length) * 100
  }
  return result
}

export function computeMatchPredictionScores(
  predictions: MatchPrediction[],
  fixtures: FinishedFixture[],
  sidePctByFixtureId: Record<number, number>,
  tryBonusActualsByFixtureId: Record<number, { home: boolean; away: boolean }>,
  rules: RugbyScoringRules
): MatchPredictionPointsRow[] {
  const fixtureById = new Map(fixtures.map(f => [f.id, f]))
  const rows: MatchPredictionPointsRow[] = []

  for (const pred of predictions) {
    const fixture = fixtureById.get(pred.fixture_id)
    if (!fixture || fixture.home_score == null || fixture.away_score == null) continue

    const diff = fixture.home_score - fixture.away_score
    const actualSide = diff > 0 ? 'home' : diff < 0 ? 'away' : 'draw'
    const actualMargin = Math.abs(diff)
    const isCorrect = pred.predicted_winner === actualSide

    // Never negative — a wrong winner call (including a missed draw, or a
    // wrongly-called draw) simply scores zero, no penalty.
    let base = 0
    if (isCorrect) {
      if (actualSide === 'draw') {
        base = rules.match_draw_base
      } else {
        const marginError = Math.abs((pred.predicted_margin ?? 0) - actualMargin)
        base = Math.max(0, rules.match_win_base - marginError)
      }
    }

    const sidePct = sidePctByFixtureId[pred.fixture_id]
    const isUnderdog = sidePct != null && sidePct < rules.match_underdog_threshold_pct
    // Confidence and underdog each contribute their own "extra" fraction on
    // top of 1x, additively — e.g. two 1.5x bonuses combine to 2x overall,
    // not 2.25x. Applies identically to the win/margin points and both
    // try-bonus calls for this same match.
    const multiplier = 1
      + (pred.is_confidence_pick ? rules.match_confidence_multiplier - 1 : 0)
      + (isUnderdog ? rules.match_underdog_multiplier - 1 : 0)

    const matchPoints = Math.round(base * multiplier)

    const tryActuals = tryBonusActualsByFixtureId[pred.fixture_id]
    let homeTryBonusPoints = 0
    let awayTryBonusPoints = 0
    if (tryActuals) {
      if (pred.predicted_home_try_bonus != null && pred.predicted_home_try_bonus === tryActuals.home) {
        homeTryBonusPoints = Math.round(rules.try_bonus_points * multiplier)
      }
      if (pred.predicted_away_try_bonus != null && pred.predicted_away_try_bonus === tryActuals.away) {
        awayTryBonusPoints = Math.round(rules.try_bonus_points * multiplier)
      }
    }

    rows.push({
      match_prediction_id: pred.id, user_id: pred.user_id, round_id: pred.round_id, fixture_id: pred.fixture_id,
      is_correct: isCorrect, multiplier, match_points: matchPoints,
      home_try_bonus_points: homeTryBonusPoints, away_try_bonus_points: awayTryBonusPoints,
      total_points: matchPoints + homeTryBonusPoints + awayTryBonusPoints,
    })
  }
  return rows
}

export async function calculateMatchPredictionRoundScoring(
  supabase: SupabaseClient,
  roundId: string
): Promise<{ success: true; rows: number } | { error: string }> {
  const { data: round } = await supabase.schema('rugby').from('rounds').select('id, competition_id').eq('id', roundId).single()
  if (!round) return { error: 'Round not found' }

  const [{ data: rulesRows }, { data: predictions }, { data: fixtures }, { data: players }] = await Promise.all([
    supabase.schema('rugby').from('scoring_rules').select('rule_key, points').eq('competition_id', round.competition_id),
    supabase.schema('rugby').from('match_predictions').select('*').eq('round_id', roundId),
    supabase.schema('rugby').from('fixtures').select('id, home_team_id, away_team_id, home_score, away_score').eq('round_id', roundId),
    supabase.schema('rugby').from('players').select('id, team_id'),
  ])

  const rules = rulesWithDefaults(rulesRows ?? [])
  const predictionsList = (predictions ?? []) as MatchPrediction[]
  const fixturesList = (fixtures ?? []) as (FinishedFixture & RugbyFixtureTeams)[]
  const playersList = (players ?? []) as RugbyPlayerRef[]

  const fixtureIds = fixturesList.map(f => f.id)
  const { data: matchEvents } = fixtureIds.length
    ? await supabase.schema('rugby').from('match_events').select('player_id, event_type, fixture_id').in('fixture_id', fixtureIds)
    : { data: [] as RugbyMatchEvent[] }

  const sidePctByFixtureId = computeMatchSideDistribution(predictionsList, fixturesList)
  const tryBonusActualsByFixtureId = computeTryBonusActuals(fixturesList, playersList, (matchEvents ?? []) as RugbyMatchEvent[])
  const rows = computeMatchPredictionScores(predictionsList, fixturesList, sidePctByFixtureId, tryBonusActualsByFixtureId, rules)

  if (rows.length === 0) return { success: true, rows: 0 }

  const { error } = await supabase.schema('rugby').from('match_prediction_points').upsert(rows, { onConflict: 'match_prediction_id' })
  if (error) return { error: error.message }

  return { success: true, rows: rows.length }
}

// ============================================================
// Season-long prop-bet predictions
// ============================================================

export type SeasonPredictionType = { type_key: string; points: number; tolerance: number | null; answer_type: string }
export type SeasonPrediction = {
  id: string; user_id: string; type_key: string
  answer_team_id: number | null; answer_player_id: number | null; answer_numeric: number | null; answer_fixture_id: number | null
}
export type SeasonPredictionResult = {
  type_key: string
  result_team_id: number | null; result_player_id: number | null; result_numeric: number | null; result_fixture_id: number | null
}
export type SeasonPredictionPointsRow = { user_id: string; type_key: string; is_correct: boolean; points: number; contrarian_bonus_applied: boolean }

function isSeasonPredictionCorrect(pred: SeasonPrediction, result: SeasonPredictionResult, type: SeasonPredictionType): boolean {
  switch (type.answer_type) {
    case 'team': return pred.answer_team_id === result.result_team_id
    case 'player': return pred.answer_player_id === result.result_player_id
    case 'fixture': return pred.answer_fixture_id === result.result_fixture_id
    case 'numeric': {
      if (pred.answer_numeric == null || result.result_numeric == null) return false
      const tolerance = type.tolerance ?? 0
      return Math.abs(pred.answer_numeric - result.result_numeric) <= tolerance
    }
    default: return false
  }
}

export function computeSeasonPredictionScores(
  predictions: SeasonPrediction[],
  results: SeasonPredictionResult[],
  types: SeasonPredictionType[],
  rules: RugbyScoringRules
): SeasonPredictionPointsRow[] {
  const typeByKey = new Map(types.map(t => [t.type_key, t]))
  const resultByKey = new Map(results.map(r => [r.type_key, r]))
  const rows: SeasonPredictionPointsRow[] = []

  // Contrarian %: among everyone who predicted a given question, what
  // share landed on the answer that turned out correct.
  const correctCountByType = new Map<string, number>()
  const totalCountByType = new Map<string, number>()
  predictions.forEach(pred => {
    const type = typeByKey.get(pred.type_key)
    const result = resultByKey.get(pred.type_key)
    if (!type || !result) return
    totalCountByType.set(pred.type_key, (totalCountByType.get(pred.type_key) ?? 0) + 1)
    if (isSeasonPredictionCorrect(pred, result, type)) {
      correctCountByType.set(pred.type_key, (correctCountByType.get(pred.type_key) ?? 0) + 1)
    }
  })

  for (const pred of predictions) {
    const type = typeByKey.get(pred.type_key)
    const result = resultByKey.get(pred.type_key)
    if (!type || !result) continue

    const isCorrect = isSeasonPredictionCorrect(pred, result, type)
    if (!isCorrect) {
      rows.push({ user_id: pred.user_id, type_key: pred.type_key, is_correct: false, points: 0, contrarian_bonus_applied: false })
      continue
    }

    const total = totalCountByType.get(pred.type_key) ?? 0
    const correct = correctCountByType.get(pred.type_key) ?? 0
    const correctPct = total > 0 ? (correct / total) * 100 : 0
    const contrarianApplies = correctPct < rules.season_underdog_threshold_pct
    const points = Math.round(type.points * (contrarianApplies ? rules.season_underdog_multiplier : 1))

    rows.push({ user_id: pred.user_id, type_key: pred.type_key, is_correct: true, points, contrarian_bonus_applied: contrarianApplies })
  }

  return rows
}

export async function finalizeSeasonPredictionScoring(
  supabase: SupabaseClient,
  competitionId: string
): Promise<{ success: true; rows: number } | { error: string }> {
  const [{ data: rulesRows }, { data: types }, { data: predictions }, { data: results }] = await Promise.all([
    supabase.schema('rugby').from('scoring_rules').select('rule_key, points').eq('competition_id', competitionId),
    supabase.schema('rugby').from('season_prediction_types').select('type_key, points, tolerance, answer_type').eq('competition_id', competitionId),
    supabase.schema('rugby').from('season_predictions').select('*').eq('competition_id', competitionId),
    supabase.schema('rugby').from('season_prediction_results').select('*').eq('competition_id', competitionId),
  ])

  const rules = rulesWithDefaults(rulesRows ?? [])
  const rows = computeSeasonPredictionScores(
    (predictions ?? []) as SeasonPrediction[],
    (results ?? []) as SeasonPredictionResult[],
    (types ?? []) as SeasonPredictionType[],
    rules
  )

  if (rows.length === 0) return { success: true, rows: 0 }

  const withCompetition = rows.map(r => ({ ...r, competition_id: competitionId }))
  const { error } = await supabase.schema('rugby').from('season_prediction_points').upsert(withCompetition, { onConflict: 'competition_id,user_id,type_key' })
  if (error) return { error: error.message }

  return { success: true, rows: rows.length }
}
