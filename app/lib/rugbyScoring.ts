import type { SupabaseClient } from '@supabase/supabase-js'

// Isolated, pure-function-first design mirroring app/lib/scoring.ts (the
// football engine): calculation has zero DB access so it's directly
// testable, and the orchestrator at the bottom just wires DB reads/writes
// around it. This file covers the season-long 6-player squad layer (rated
// on the 0-100 match rating from app/lib/rugbyRating.ts, a captain with a
// change-limit, subs, a differential/"contrarian" bonus per pick) and the
// weekly match-prediction layer (winner + margin, one confidence pick per
// round, a sliding-scale underdog bonus) — season prop bets are separate.
//
// Kit, 2026-09-26: simplified deliberately. The old per-stat-category
// breakdown (try/kick/card/tackle/etc. points) was computed and stored but
// never fed the real total once the 0-100 rating took over, and no page
// ever displayed it — pure dead weight, now removed rather than carried
// along. Same for is_kicker: never set true anywhere in the codebase, so
// the whole kicking-points concept is gone with it.

export type RugbyScoringRules = Record<string, number>

// Sensible fallbacks if a competition's scoring_rules row is missing for
// a given key — defensive, same reasoning as every other "newer optional
// column" in this codebase: a missing admin config shouldn't break scoring,
// just fall back to a reasonable default until admin sets it properly.
export const DEFAULT_RUGBY_SCORING_RULES: RugbyScoringRules = {
  // The scoring mechanism: each pick's 0-100 match rating (app/lib/
  // rugbyRating.ts) times this multiplier, then the captain/ownership
  // bonuses and sub/captain-change penalties below are layered on top.
  squad_rating_multiplier: 0.5,
  max_free_subs: 10,
  extra_sub_penalty: 10,
  // A player picked by few managers earns a multiplier on their rating
  // points for the round they were acquired — e.g. a threshold of 25 and a
  // multiplier of 1.5 means anyone picked by under 25% of the field that
  // round has those points multiplied by 1.5. One-time, at acquisition —
  // deliberately NOT the same sliding scale as the match-prediction
  // underdog bonus below (Kit scoped that ask to Match Predictions).
  player_ownership_threshold_pct: 25,
  player_ownership_multiplier: 1.5,
  // Captain: picked at squad creation, gets this multiplier on their rating
  // points every round they're captain (not one-time). The first change
  // after the initial pick is free; every change beyond that costs
  // captain_change_penalty, charged the round the change is made.
  captain_multiplier: 1.5,
  max_free_captain_changes: 1,
  captain_change_penalty: 15,
  // Weekly match predictions: winner + margin (not exact score). A correct
  // winner call is always worth at least match_winner_points, however
  // wrong the margin guess is — Kit: "picking a win in itself shouldn't be
  // worth loads... but picking a winner is worth something." The rest
  // (match_margin_max_points) decays 1 point lost per point of margin
  // error, floors at 0 on its own. A draw has no margin to be off by, so
  // it's a single flat (and higher) base instead.
  match_winner_points: 15,
  match_margin_max_points: 35,
  match_draw_base: 75,
  match_confidence_multiplier: 1.5,
  // Underdog bonus: a sliding scale, not a cliff-edge — scales linearly
  // from 1x at match_underdog_threshold_pct% of the field (or above) up to
  // match_underdog_max_multiplier at 0% (literally nobody else picked that
  // side).
  match_underdog_threshold_pct: 25,
  match_underdog_max_multiplier: 2,
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
  is_initial_pick: boolean
  active: boolean
  contrarian_pct_at_pick: number | null
  round_acquired: number
  round_removed: number | null
  created_at: string
}

export type RugbyFixtureRef = { id: number; round_id: string; home_team_id: number; away_team_id: number }
export type RugbyPlayerRef = { id: number; team_id: number }

export type RugbyPlayerMatchRating = { fixture_id: number; player_id: number; rating: number }

// One row per user per captain designation event — never mutated in
// place, always a new row; the current captain for a round is whichever
// row has the greatest round_effective_from at or before it (same
// event-log philosophy as round_acquired/round_removed on SeasonSquadPick
// itself). The first row per user (by created_at) is the initial pick,
// never a "change".
export type CaptainSelection = {
  id: string
  user_id: string
  player_id: number
  round_effective_from: number
  created_at: string
}

export type SeasonSquadPointsRow = {
  season_squad_pick_id: string
  user_id: string
  round_id: string
  // The player's real 0-100 rating that round (0 if they have no rating
  // yet — unplayed, unsynced, or no position set — same "no data = zero"
  // convention as an unused pick). rating_points is rating * the admin's
  // squad_rating_multiplier, and is what total_points is built from.
  rating: number
  rating_points: number
  captain_bonus: number
  contrarian_bonus: number
  sub_penalty: number
  captain_change_penalty: number
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

// Same shape as computeSubPenalties, applied to captain_selections instead
// of season_squad_picks: the first selection per user (chronologically) is
// the initial pick and never counts against the budget; every one after
// that is a "change", and anything beyond max_free_captain_changes is
// penalized. Returns the penalty keyed by captain_selections.id, so the
// caller can attribute it to whichever pick/round that specific change
// landed on.
export function computeCaptainChangePenalties(
  selections: CaptainSelection[],
  rules: RugbyScoringRules
): Record<string, number> {
  const penaltyBySelectionId: Record<string, number> = {}
  const byUser = new Map<string, CaptainSelection[]>()
  selections.forEach(s => {
    if (!byUser.has(s.user_id)) byUser.set(s.user_id, [])
    byUser.get(s.user_id)!.push(s)
  })
  for (const userSelections of byUser.values()) {
    const ordered = [...userSelections].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const changes = ordered.slice(1) // first pick is initial, never a "change"
    changes.forEach((s, i) => {
      if (i >= rules.max_free_captain_changes) penaltyBySelectionId[s.id] = rules.captain_change_penalty
    })
  }
  return penaltyBySelectionId
}

// The current captain for a user in a given round: the selection with the
// greatest round_effective_from at or before roundNumber. Pure lookup, no
// DB access — callers build the per-user list once and reuse it.
function currentCaptainPlayerId(selections: CaptainSelection[], roundNumber: number): number | null {
  const applicable = selections.filter(s => s.round_effective_from <= roundNumber)
  if (applicable.length === 0) return null
  return applicable.reduce((latest, s) => (s.round_effective_from > latest.round_effective_from ? s : latest)).player_id
}

export function computeSeasonSquadRoundPoints(
  picks: SeasonSquadPick[],
  roundNumber: number,
  roundId: string,
  fixtures: RugbyFixtureRef[],
  players: RugbyPlayerRef[],
  rules: RugbyScoringRules,
  subPenaltyByPickId: Record<string, number>,
  playerMatchRatings: RugbyPlayerMatchRating[] = [],
  captainSelections: CaptainSelection[] = [],
  captainChangePenaltyBySelectionId: Record<string, number> = {}
): SeasonSquadPointsRow[] {
  const teamIdByPlayerId = new Map<number, number>()
  players.forEach(p => teamIdByPlayerId.set(p.id, p.team_id))

  const fixtureByTeamId = new Map<number, RugbyFixtureRef>()
  fixtures.filter(f => f.round_id === roundId).forEach(f => {
    fixtureByTeamId.set(f.home_team_id, f)
    fixtureByTeamId.set(f.away_team_id, f)
  })

  const ratingByFixtureAndPlayer = new Map<string, number>()
  playerMatchRatings.forEach(r => ratingByFixtureAndPlayer.set(`${r.fixture_id}::${r.player_id}`, r.rating))

  const captainSelectionsByUser = new Map<string, CaptainSelection[]>()
  captainSelections.forEach(s => {
    if (!captainSelectionsByUser.has(s.user_id)) captainSelectionsByUser.set(s.user_id, [])
    captainSelectionsByUser.get(s.user_id)!.push(s)
  })

  const rows: SeasonSquadPointsRow[] = []

  for (const pick of picks) {
    if (!pickCoversRound(pick, roundNumber)) continue
    const teamId = teamIdByPlayerId.get(pick.player_id)
    const fixture = teamId != null ? fixtureByTeamId.get(teamId) : undefined

    // The real scoring mechanism: this pick's 0-100 rating for this
    // fixture (0 if unrated — unplayed, unsynced, or no position set,
    // same "no data = zero" convention as an unused pick), times the
    // admin's squad_rating_multiplier.
    const rating = fixture ? (ratingByFixtureAndPlayer.get(`${fixture.id}::${pick.player_id}`) ?? 0) : 0
    const ratingPoints = round2(rating * rules.squad_rating_multiplier)

    // Captain bonus applies EVERY round this pick is the user's current
    // captain (not one-time, unlike the ownership bonus below) — kept as
    // the EXTRA amount the multiplier contributes, so rating_points stays
    // its raw, unmultiplied value.
    const userCaptainSelections = captainSelectionsByUser.get(pick.user_id) ?? []
    const isCaptain = currentCaptainPlayerId(userCaptainSelections, roundNumber) === pick.player_id
    const captainBonus = isCaptain ? round2(ratingPoints * (rules.captain_multiplier - 1)) : 0

    // Both one-off charges/bonuses only ever apply in the specific round
    // the pick was acquired — never repeated on later rounds' recalcs. A
    // rarely-held player multiplies their rating points rather than
    // adding a flat bonus; contrarian_bonus is kept as the EXTRA amount
    // that multiplier contributes.
    const isAcquisitionRound = roundNumber === pick.round_acquired
    const isUnderdogPick = isAcquisitionRound && pick.contrarian_pct_at_pick != null && pick.contrarian_pct_at_pick < rules.player_ownership_threshold_pct
    const contrarianBonus = isUnderdogPick
      ? Math.round(ratingPoints * (rules.player_ownership_multiplier - 1))
      : 0
    const subPenalty = isAcquisitionRound ? (subPenaltyByPickId[pick.id] ?? 0) : 0

    // Captain-change penalty: charged in the round a paid change lands in,
    // attributed to the player who became captain via that specific
    // change (their captain_selections row's round_effective_from equals
    // this round).
    const changeThisRound = userCaptainSelections.find(s => s.round_effective_from === roundNumber && s.player_id === pick.player_id)
    const captainChangePenalty = changeThisRound ? (captainChangePenaltyBySelectionId[changeThisRound.id] ?? 0) : 0

    const totalPoints = round2(ratingPoints + captainBonus + contrarianBonus - subPenalty - captainChangePenalty)

    rows.push({
      season_squad_pick_id: pick.id,
      user_id: pick.user_id,
      round_id: roundId,
      rating,
      rating_points: ratingPoints,
      captain_bonus: captainBonus,
      contrarian_bonus: contrarianBonus,
      sub_penalty: subPenalty,
      captain_change_penalty: captainChangePenalty,
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

  // Isolated fetch: captain_selections is a brand-new table — degrades to
  // [] (nobody has a captain yet) rather than breaking scoring for
  // everyone else while it's being rolled out.
  let captainSelections: CaptainSelection[] = []
  try {
    const { data } = await supabase.schema('rugby').from('captain_selections')
      .select('id, user_id, player_id, round_effective_from, created_at').eq('competition_id', round.competition_id)
    captainSelections = (data ?? []) as CaptainSelection[]
  } catch { /* table not created yet */ }
  const captainChangePenaltyBySelectionId = computeCaptainChangePenalties(captainSelections, rules)

  const subPenaltyByPickId = computeSubPenalties(allPicks, rules, subBudgetMode)

  const rows = computeSeasonSquadRoundPoints(
    allPicks, round.number, roundId, fixturesList, playersList, rules, subPenaltyByPickId, ratingRows, captainSelections, captainChangePenaltyBySelectionId
  )

  if (rows.length === 0) return { success: true, rows: 0 }

  const { error } = await supabase.schema('rugby').from('season_squad_points').upsert(rows, { onConflict: 'season_squad_pick_id,round_id' })
  if (error) return { error: error.message }

  return { success: true, rows: rows.length }
}

// ============================================================
// Weekly match predictions: winner + margin (not an exact score). A
// correct winner call is always worth match_winner_points, however wrong
// the margin guess is — margin accuracy tops it up, decaying to 0 on its
// own but never taking the whole pick down with it. One confidence pick
// per round, and a sliding-scale underdog bonus (not a cliff-edge) for a
// widely-missed correct winner call.
// ============================================================

export type MatchPrediction = {
  id: string
  user_id: string
  round_id: string
  fixture_id: number
  predicted_winner: 'home' | 'away' | 'draw'
  predicted_margin: number | null // null when predicted_winner is 'draw'
  is_confidence_pick: boolean
}

export type FinishedFixture = { id: number; home_score: number | null; away_score: number | null }

export type RugbyFixtureTeams = { id: number; home_team_id: number; away_team_id: number }

export type MatchPredictionPointsRow = {
  match_prediction_id: string
  user_id: string
  round_id: string
  fixture_id: number
  is_correct: boolean
  multiplier: number
  match_points: number
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
    // wrongly-called draw) simply scores zero, no penalty. A correct
    // winner call is always worth at least match_winner_points, however
    // wrong the margin guess is — only the margin-accuracy TOP-UP can
    // decay to 0 on its own.
    let base = 0
    if (isCorrect) {
      if (actualSide === 'draw') {
        base = rules.match_draw_base
      } else {
        const marginError = Math.abs((pred.predicted_margin ?? 0) - actualMargin)
        base = rules.match_winner_points + Math.max(0, rules.match_margin_max_points - marginError)
      }
    }

    const sidePct = sidePctByFixtureId[pred.fixture_id]
    // Sliding scale, not a cliff-edge: 1x at/above the threshold, ramping
    // linearly up to match_underdog_max_multiplier at 0% (nobody else
    // picked this side). Confidence and underdog each contribute their own
    // "extra" fraction on top of 1x, additively — e.g. a 1.5x confidence
    // pick and a half-way-to-max underdog bonus combine additively, not
    // multiplicatively.
    const underdogExtra = sidePct != null && sidePct < rules.match_underdog_threshold_pct
      ? (1 - sidePct / rules.match_underdog_threshold_pct) * (rules.match_underdog_max_multiplier - 1)
      : 0
    const multiplier = 1
      + (pred.is_confidence_pick ? rules.match_confidence_multiplier - 1 : 0)
      + underdogExtra

    const matchPoints = Math.round(base * multiplier)

    rows.push({
      match_prediction_id: pred.id, user_id: pred.user_id, round_id: pred.round_id, fixture_id: pred.fixture_id,
      is_correct: isCorrect, multiplier, match_points: matchPoints,
      total_points: matchPoints,
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

  const [{ data: rulesRows }, { data: predictions }, { data: fixtures }] = await Promise.all([
    supabase.schema('rugby').from('scoring_rules').select('rule_key, points').eq('competition_id', round.competition_id),
    supabase.schema('rugby').from('match_predictions').select('*').eq('round_id', roundId),
    supabase.schema('rugby').from('fixtures').select('id, home_team_id, away_team_id, home_score, away_score').eq('round_id', roundId),
  ])

  const rules = rulesWithDefaults(rulesRows ?? [])
  const predictionsList = (predictions ?? []) as MatchPrediction[]
  const fixturesList = (fixtures ?? []) as (FinishedFixture & RugbyFixtureTeams)[]

  const sidePctByFixtureId = computeMatchSideDistribution(predictionsList, fixturesList)
  const rows = computeMatchPredictionScores(predictionsList, fixturesList, sidePctByFixtureId, rules)

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
