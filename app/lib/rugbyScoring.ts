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
  squad_contrarian_bonus: 10,
  contrarian_threshold_pct: 25,
  max_free_subs: 6,
  extra_sub_penalty: 10,
}

export function rulesWithDefaults(rows: { rule_key: string; points: number }[]): RugbyScoringRules {
  const rules: RugbyScoringRules = { ...DEFAULT_RUGBY_SCORING_RULES }
  rows.forEach(r => { rules[r.rule_key] = r.points })
  return rules
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

export type SeasonSquadPointsRow = {
  season_squad_pick_id: string
  user_id: string
  round_id: string
  try_points: number
  kicking_points: number
  red_card_penalty: number
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

// Which of a user's subs (their non-initial picks, in the order they were
// made) fall beyond the free budget — a pure function of pick order, so
// it doesn't matter whether it's computed at pick-time or recomputed
// wholesale on every scoring run; the answer is always the same for a
// given history.
export function computeSubPenalties(
  picks: SeasonSquadPick[],
  rules: RugbyScoringRules
): Record<string, number> {
  const penaltyByPickId: Record<string, number> = {}
  const byUser = new Map<string, SeasonSquadPick[]>()
  picks.filter(p => !p.is_initial_pick).forEach(p => {
    if (!byUser.has(p.user_id)) byUser.set(p.user_id, [])
    byUser.get(p.user_id)!.push(p)
  })
  for (const userPicks of byUser.values()) {
    const ordered = [...userPicks].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
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
  subPenaltyByPickId: Record<string, number>
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

    // Both one-off charges/bonuses only ever apply in the specific round
    // the pick was acquired — never repeated on later rounds' recalcs.
    const isAcquisitionRound = roundNumber === pick.round_acquired
    const contrarianBonus = isAcquisitionRound && pick.contrarian_pct_at_pick != null && pick.contrarian_pct_at_pick < rules.contrarian_threshold_pct
      ? rules.squad_contrarian_bonus
      : 0
    const subPenalty = isAcquisitionRound ? (subPenaltyByPickId[pick.id] ?? 0) : 0

    const totalPoints = tryPoints + kickingPoints + contrarianBonus - redCardPenalty - subPenalty

    rows.push({
      season_squad_pick_id: pick.id,
      user_id: pick.user_id,
      round_id: roundId,
      try_points: tryPoints,
      kicking_points: kickingPoints,
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

  const rules = rulesWithDefaults(rulesRows ?? [])
  const allPicks = (picks ?? []) as SeasonSquadPick[]
  const fixturesList = (fixtures ?? []) as RugbyFixtureRef[]
  const playersList = (players ?? []) as RugbyPlayerRef[]

  const fixtureIds = fixturesList.filter(f => f.round_id === roundId).map(f => f.id)
  const { data: matchEvents } = fixtureIds.length
    ? await supabase.schema('rugby').from('match_events').select('player_id, event_type, fixture_id').in('fixture_id', fixtureIds)
    : { data: [] as RugbyMatchEvent[] }

  const subPenaltyByPickId = computeSubPenalties(allPicks, rules)

  const rows = computeSeasonSquadRoundPoints(
    allPicks, round.number, roundId, fixturesList, playersList, (matchEvents ?? []) as RugbyMatchEvent[], rules, subPenaltyByPickId
  )

  if (rows.length === 0) return { success: true, rows: 0 }

  const { error } = await supabase.schema('rugby').from('season_squad_points').upsert(rows, { onConflict: 'season_squad_pick_id,round_id' })
  if (error) return { error: error.message }

  return { success: true, rows: rows.length }
}
