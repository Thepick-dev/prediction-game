import { describe, it, expect } from 'vitest'
import {
  computeSeasonSquadRoundPoints,
  computeSubPenalties,
  computeMatchPredictionScores,
  computeMatchSideDistribution,
  computeSeasonPredictionScores,
  DEFAULT_RUGBY_SCORING_RULES,
  type SeasonSquadPick,
  type RugbyFixtureRef,
  type RugbyPlayerRef,
  type RugbyMatchEvent,
  type MatchPrediction,
  type FinishedFixture,
  type SeasonPrediction,
  type SeasonPredictionResult,
  type SeasonPredictionType,
} from '../rugbyScoring'

const rules = { ...DEFAULT_RUGBY_SCORING_RULES }

function makePick(overrides: Partial<SeasonSquadPick> = {}): SeasonSquadPick {
  return {
    id: 'pick-1',
    user_id: 'user-1',
    player_id: 1,
    is_kicker: false,
    is_initial_pick: true,
    active: true,
    contrarian_pct_at_pick: null,
    round_acquired: 1,
    round_removed: null,
    created_at: '2027-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const fixtures: RugbyFixtureRef[] = [
  { id: 100, round_id: 'round-1', home_team_id: 1, away_team_id: 2 },
]
const players: RugbyPlayerRef[] = [
  { id: 1, team_id: 1 }, // scorer, team 1
  { id: 2, team_id: 2 }, // kicker, team 2
]

describe('computeSeasonSquadRoundPoints', () => {
  it('awards try points to a non-kicker who scores', () => {
    const picks = [makePick({ player_id: 1, is_kicker: false })]
    const events: RugbyMatchEvent[] = [{ player_id: 1, event_type: 'try', fixture_id: 100 }]
    const rows = computeSeasonSquadRoundPoints(picks, 1, 'round-1', fixtures, players, events, rules, {})
    expect(rows).toHaveLength(1)
    expect(rows[0].try_points).toBe(rules.squad_try_points)
    expect(rows[0].kicking_points).toBe(0)
    expect(rows[0].total_points).toBe(rules.squad_try_points)
  })

  it('gives a non-kicker ZERO points for a conversion/penalty/drop goal — kicking only counts for the kicker', () => {
    const picks = [makePick({ player_id: 1, is_kicker: false })]
    const events: RugbyMatchEvent[] = [
      { player_id: 1, event_type: 'conversion', fixture_id: 100 },
      { player_id: 1, event_type: 'penalty_goal', fixture_id: 100 },
      { player_id: 1, event_type: 'drop_goal', fixture_id: 100 },
    ]
    const rows = computeSeasonSquadRoundPoints(picks, 1, 'round-1', fixtures, players, events, rules, {})
    expect(rows[0].kicking_points).toBe(0)
    expect(rows[0].total_points).toBe(0)
  })

  it('awards the kicker points for tries AND every kind of kick', () => {
    const picks = [makePick({ id: 'pick-2', player_id: 2, is_kicker: true })]
    const events: RugbyMatchEvent[] = [
      { player_id: 2, event_type: 'try', fixture_id: 100 },
      { player_id: 2, event_type: 'conversion', fixture_id: 100 },
      { player_id: 2, event_type: 'penalty_goal', fixture_id: 100 },
      { player_id: 2, event_type: 'drop_goal', fixture_id: 100 },
    ]
    const rows = computeSeasonSquadRoundPoints(picks, 1, 'round-1', fixtures, players, events, rules, {})
    const expectedKicking = rules.squad_conversion_points + rules.squad_penalty_points + rules.squad_dropgoal_points
    expect(rows[0].try_points).toBe(rules.squad_try_points)
    expect(rows[0].kicking_points).toBe(expectedKicking)
    expect(rows[0].total_points).toBe(rules.squad_try_points + expectedKicking)
  })

  it('subtracts the red card penalty and can push total_points negative — never floors at zero', () => {
    const picks = [makePick({ player_id: 1, is_kicker: false })]
    const events: RugbyMatchEvent[] = [{ player_id: 1, event_type: 'red_card', fixture_id: 100 }]
    const rows = computeSeasonSquadRoundPoints(picks, 1, 'round-1', fixtures, players, events, rules, {})
    expect(rows[0].red_card_penalty).toBe(rules.squad_red_card_penalty)
    expect(rows[0].total_points).toBe(-rules.squad_red_card_penalty)
  })

  it('applies the contrarian bonus only in the exact round the player was acquired, never in later rounds', () => {
    const lowPct = rules.contrarian_threshold_pct - 1
    const pick = makePick({ player_id: 1, round_acquired: 2, contrarian_pct_at_pick: lowPct })
    const roundsFixtures: RugbyFixtureRef[] = [
      { id: 100, round_id: 'round-1', home_team_id: 1, away_team_id: 2 },
      { id: 200, round_id: 'round-2', home_team_id: 1, away_team_id: 2 },
      { id: 300, round_id: 'round-3', home_team_id: 1, away_team_id: 2 },
    ]
    // Round 2 (acquisition round) — bonus applies.
    const round2Rows = computeSeasonSquadRoundPoints([pick], 2, 'round-2', roundsFixtures, players, [], rules, {})
    expect(round2Rows[0].contrarian_bonus).toBe(rules.squad_contrarian_bonus)
    // Round 3 (later) — no repeat bonus.
    const round3Rows = computeSeasonSquadRoundPoints([pick], 3, 'round-3', roundsFixtures, players, [], rules, {})
    expect(round3Rows[0].contrarian_bonus).toBe(0)
  })

  it('does NOT apply the contrarian bonus when the pick was widely held (at/above threshold)', () => {
    const pick = makePick({ player_id: 1, round_acquired: 1, contrarian_pct_at_pick: rules.contrarian_threshold_pct })
    const rows = computeSeasonSquadRoundPoints([pick], 1, 'round-1', fixtures, players, [], rules, {})
    expect(rows[0].contrarian_bonus).toBe(0)
  })

  it('excludes a pick from a round outside its [round_acquired, round_removed) coverage window', () => {
    const before = makePick({ round_acquired: 3 })
    const removedFixtures: RugbyFixtureRef[] = [{ id: 100, round_id: 'round-1', home_team_id: 1, away_team_id: 2 }]
    expect(computeSeasonSquadRoundPoints([before], 1, 'round-1', removedFixtures, players, [], rules, {})).toHaveLength(0)

    const removed = makePick({ round_acquired: 1, round_removed: 2 })
    expect(computeSeasonSquadRoundPoints([removed], 1, 'round-1', removedFixtures, players, [], rules, {})).toHaveLength(1)
    expect(computeSeasonSquadRoundPoints([removed], 2, 'round-1', removedFixtures, players, [], rules, {})).toHaveLength(0)
  })

  it('applies a precomputed sub penalty only in the pick\'s acquisition round', () => {
    const pick = makePick({ id: 'sub-pick', is_initial_pick: false, round_acquired: 3 })
    const roundsFixtures: RugbyFixtureRef[] = [
      { id: 300, round_id: 'round-3', home_team_id: 1, away_team_id: 2 },
      { id: 400, round_id: 'round-4', home_team_id: 1, away_team_id: 2 },
    ]
    const penaltyMap = { 'sub-pick': rules.extra_sub_penalty }
    const round3 = computeSeasonSquadRoundPoints([pick], 3, 'round-3', roundsFixtures, players, [], rules, penaltyMap)
    expect(round3[0].sub_penalty).toBe(rules.extra_sub_penalty)
    expect(round3[0].total_points).toBe(-rules.extra_sub_penalty)

    const round4 = computeSeasonSquadRoundPoints([pick], 4, 'round-4', roundsFixtures, players, [], rules, penaltyMap)
    expect(round4[0].sub_penalty).toBe(0)
  })
})

describe('computeSubPenalties', () => {
  it('never penalises the initial 6 picks', () => {
    const picks = Array.from({ length: 6 }, (_, i) => makePick({ id: `init-${i}`, is_initial_pick: true }))
    expect(computeSubPenalties(picks, rules)).toEqual({})
  })

  it('leaves subs within the free budget unpenalised, and penalises only the ones beyond it, in chronological order', () => {
    const smallBudgetRules: typeof rules = { ...rules, max_free_subs: 2 }
    const subs = [
      makePick({ id: 'sub-a', is_initial_pick: false, created_at: '2027-01-01T00:00:00.000Z' }),
      makePick({ id: 'sub-b', is_initial_pick: false, created_at: '2027-01-02T00:00:00.000Z' }),
      makePick({ id: 'sub-c', is_initial_pick: false, created_at: '2027-01-03T00:00:00.000Z' }),
      makePick({ id: 'sub-d', is_initial_pick: false, created_at: '2027-01-04T00:00:00.000Z' }),
    ]
    const penalties = computeSubPenalties(subs, smallBudgetRules)
    expect(penalties['sub-a']).toBeUndefined()
    expect(penalties['sub-b']).toBeUndefined()
    expect(penalties['sub-c']).toBe(smallBudgetRules.extra_sub_penalty)
    expect(penalties['sub-d']).toBe(smallBudgetRules.extra_sub_penalty)
  })

  it('tracks each user\'s sub budget independently', () => {
    const smallBudgetRules: typeof rules = { ...rules, max_free_subs: 1 }
    const subs = [
      makePick({ id: 'u1-sub1', user_id: 'user-1', is_initial_pick: false, created_at: '2027-01-01T00:00:00.000Z' }),
      makePick({ id: 'u1-sub2', user_id: 'user-1', is_initial_pick: false, created_at: '2027-01-02T00:00:00.000Z' }),
      makePick({ id: 'u2-sub1', user_id: 'user-2', is_initial_pick: false, created_at: '2027-01-01T00:00:00.000Z' }),
    ]
    const penalties = computeSubPenalties(subs, smallBudgetRules)
    expect(penalties['u1-sub1']).toBeUndefined()
    expect(penalties['u1-sub2']).toBe(smallBudgetRules.extra_sub_penalty)
    expect(penalties['u2-sub1']).toBeUndefined()
  })
})

describe('computeMatchPredictionScores', () => {
  const fixture: FinishedFixture = { id: 1, home_score: 20, away_score: 10 } // home won by 10

  function makePred(overrides: Partial<MatchPrediction> = {}): MatchPrediction {
    return { id: 'p1', user_id: 'u1', round_id: 'r1', fixture_id: 1, predicted_home_score: 20, predicted_away_score: 10, confidence: 1, ...overrides }
  }

  it('stacks winner + margin + exact bonuses for a spot-on prediction, multiplied by confidence', () => {
    const pred = makePred({ confidence: 2 })
    const rows = computeMatchPredictionScores([pred], [fixture], {}, rules)
    const expectedBase = rules.winner_bonus + rules.margin_bonus_max + rules.exact_score_bonus
    expect(rows[0].base_points).toBe(expectedBase)
    expect(rows[0].total_points).toBe(expectedBase * 2)
  })

  it('gives partial margin credit for the right winner but the wrong margin, no exact bonus', () => {
    // Predicted home win by 15 (25-10), actual was by 10 — margin off by 5.
    const pred = makePred({ predicted_home_score: 25, predicted_away_score: 10, confidence: 1 })
    const rows = computeMatchPredictionScores([pred], [fixture], {}, rules)
    const expectedMargin = Math.max(0, rules.margin_bonus_max - 5)
    expect(rows[0].base_points).toBe(rules.winner_bonus + expectedMargin)
    expect(rows[0].total_points).toBe(rules.winner_bonus + expectedMargin)
  })

  it('a wrong winner scores a straight negative penalty, never a partial margin credit — even a narrow miss', () => {
    // Predicted a draw, actual was a home win — wrong side entirely.
    const pred = makePred({ predicted_home_score: 10, predicted_away_score: 10, confidence: 3 })
    const rows = computeMatchPredictionScores([pred], [fixture], {}, rules)
    expect(rows[0].is_correct).toBe(false)
    expect(rows[0].base_points).toBe(0)
    expect(rows[0].total_points).toBe(-(3 * rules.wrong_pick_penalty_constant))
  })

  it('applies the underdog/contrarian bonus only when the side pct is below threshold, and only on a correct pick', () => {
    const pred = makePred({ confidence: 1 })
    const lowPct = { 1: rules.contrarian_threshold_pct - 1 }
    const highPct = { 1: rules.contrarian_threshold_pct }
    const lowRows = computeMatchPredictionScores([pred], [fixture], lowPct, rules)
    const highRows = computeMatchPredictionScores([pred], [fixture], highPct, rules)
    expect(lowRows[0].base_points).toBe(rules.winner_bonus + rules.margin_bonus_max + rules.exact_score_bonus + rules.match_contrarian_bonus)
    expect(highRows[0].base_points).toBe(rules.winner_bonus + rules.margin_bonus_max + rules.exact_score_bonus)
  })

  it('skips a fixture with no final score yet', () => {
    const unfinished: FinishedFixture = { id: 2, home_score: null, away_score: null }
    const pred = makePred({ fixture_id: 2 })
    expect(computeMatchPredictionScores([pred], [unfinished], {}, rules)).toHaveLength(0)
  })
})

describe('computeMatchSideDistribution', () => {
  it('computes the % of the field that picked the actual winning side', () => {
    const fixture: FinishedFixture = { id: 1, home_score: 20, away_score: 10 }
    const predictions: MatchPrediction[] = [
      { id: 'a', user_id: 'u1', round_id: 'r1', fixture_id: 1, predicted_home_score: 15, predicted_away_score: 10, confidence: 1 }, // home win, correct side
      { id: 'b', user_id: 'u2', round_id: 'r1', fixture_id: 1, predicted_home_score: 10, predicted_away_score: 15, confidence: 1 }, // away win, wrong side
      { id: 'c', user_id: 'u3', round_id: 'r1', fixture_id: 1, predicted_home_score: 22, predicted_away_score: 12, confidence: 1 }, // home win, correct side
      { id: 'd', user_id: 'u4', round_id: 'r1', fixture_id: 1, predicted_home_score: 12, predicted_away_score: 22, confidence: 1 }, // away win, wrong side
    ]
    const result = computeMatchSideDistribution(predictions, [fixture])
    expect(result[1]).toBe(50)
  })
})

describe('computeSeasonPredictionScores', () => {
  const types: SeasonPredictionType[] = [
    { type_key: 'winner', points: 20, tolerance: null, answer_type: 'team' },
    { type_key: 'total_tries', points: 10, tolerance: 5, answer_type: 'numeric' },
  ]
  const results: SeasonPredictionResult[] = [
    { type_key: 'winner', result_team_id: 1, result_player_id: null, result_numeric: null, result_fixture_id: null },
    { type_key: 'total_tries', result_team_id: null, result_player_id: null, result_numeric: 100, result_fixture_id: null },
  ]

  it('awards the flat points for an exact team match, no bonus when widely picked', () => {
    const predictions: SeasonPrediction[] = [
      { id: 'p1', user_id: 'u1', type_key: 'winner', answer_team_id: 1, answer_player_id: null, answer_numeric: null, answer_fixture_id: null },
      { id: 'p2', user_id: 'u2', type_key: 'winner', answer_team_id: 1, answer_player_id: null, answer_numeric: null, answer_fixture_id: null },
    ]
    const rows = computeSeasonPredictionScores(predictions, results, types, rules)
    expect(rows.find(r => r.user_id === 'u1')?.points).toBe(20)
    expect(rows.find(r => r.user_id === 'u1')?.contrarian_bonus_applied).toBe(false)
  })

  it('adds the underdog bonus when the correct answer was rare among predictions', () => {
    // 1 of 5 correct = 20%, strictly below the 25% threshold.
    const predictions: SeasonPrediction[] = [
      { id: 'p1', user_id: 'u1', type_key: 'winner', answer_team_id: 1, answer_player_id: null, answer_numeric: null, answer_fixture_id: null }, // correct, rare
      { id: 'p2', user_id: 'u2', type_key: 'winner', answer_team_id: 2, answer_player_id: null, answer_numeric: null, answer_fixture_id: null }, // wrong
      { id: 'p3', user_id: 'u3', type_key: 'winner', answer_team_id: 2, answer_player_id: null, answer_numeric: null, answer_fixture_id: null }, // wrong
      { id: 'p4', user_id: 'u4', type_key: 'winner', answer_team_id: 2, answer_player_id: null, answer_numeric: null, answer_fixture_id: null }, // wrong
      { id: 'p5', user_id: 'u5', type_key: 'winner', answer_team_id: 2, answer_player_id: null, answer_numeric: null, answer_fixture_id: null }, // wrong
    ]
    const rows = computeSeasonPredictionScores(predictions, results, types, rules)
    const u1Row = rows.find(r => r.user_id === 'u1')
    expect(u1Row?.is_correct).toBe(true)
    expect(u1Row?.contrarian_bonus_applied).toBe(true)
    expect(u1Row?.points).toBe(20 + rules.season_contrarian_bonus)
  })

  it('accepts a numeric answer within tolerance as correct, and rejects one outside it', () => {
    const predictions: SeasonPrediction[] = [
      { id: 'p1', user_id: 'u1', type_key: 'total_tries', answer_team_id: null, answer_player_id: null, answer_numeric: 96, answer_fixture_id: null }, // within ±5 of 100
      { id: 'p2', user_id: 'u2', type_key: 'total_tries', answer_team_id: null, answer_player_id: null, answer_numeric: 80, answer_fixture_id: null }, // outside tolerance
    ]
    const rows = computeSeasonPredictionScores(predictions, results, types, rules)
    expect(rows.find(r => r.user_id === 'u1')?.is_correct).toBe(true)
    expect(rows.find(r => r.user_id === 'u2')?.is_correct).toBe(false)
    expect(rows.find(r => r.user_id === 'u2')?.points).toBe(0)
  })

  it('scores zero for a wrong answer, never negative', () => {
    const predictions: SeasonPrediction[] = [
      { id: 'p1', user_id: 'u1', type_key: 'winner', answer_team_id: 99, answer_player_id: null, answer_numeric: null, answer_fixture_id: null },
    ]
    const rows = computeSeasonPredictionScores(predictions, results, types, rules)
    expect(rows[0].points).toBe(0)
    expect(rows[0].is_correct).toBe(false)
  })
})
