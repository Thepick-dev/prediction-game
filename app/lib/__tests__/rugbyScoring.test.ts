import { describe, it, expect } from 'vitest'
import {
  computeSeasonSquadRoundPoints,
  computeSubPenalties,
  computeCaptainChangePenalties,
  computeMatchPredictionScores,
  computeMatchSideDistribution,
  computeSeasonPredictionScores,
  DEFAULT_RUGBY_SCORING_RULES,
  rulesWithDefaults,
  type SeasonSquadPick,
  type RugbyFixtureRef,
  type RugbyPlayerRef,
  type RugbyPlayerMatchRating,
  type CaptainSelection,
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
    is_initial_pick: true,
    active: true,
    contrarian_pct_at_pick: null,
    round_acquired: 1,
    round_removed: null,
    created_at: '2027-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeCaptainSelection(overrides: Partial<CaptainSelection> = {}): CaptainSelection {
  return {
    id: 'cap-1',
    user_id: 'user-1',
    player_id: 1,
    round_effective_from: 1,
    created_at: '2027-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const fixtures: RugbyFixtureRef[] = [
  { id: 100, round_id: 'round-1', home_team_id: 1, away_team_id: 2 },
]
const players: RugbyPlayerRef[] = [
  { id: 1, team_id: 1 },
  { id: 2, team_id: 2 },
]

describe('computeSeasonSquadRoundPoints', () => {
  it('total_points is the rating times squad_rating_multiplier when no other bonus/penalty applies', () => {
    const picks = [makePick({ player_id: 1 })]
    const ratings: RugbyPlayerMatchRating[] = [{ fixture_id: 100, player_id: 1, rating: 80 }]
    const rows = computeSeasonSquadRoundPoints(picks, 1, 'round-1', fixtures, players, rules, {}, ratings)
    expect(rows[0].rating).toBe(80)
    expect(rows[0].rating_points).toBe(Math.round(80 * rules.squad_rating_multiplier * 100) / 100)
    expect(rows[0].total_points).toBe(rows[0].rating_points)
  })

  it('scores zero when a pick has no rating for this fixture (unplayed/unsynced/no position)', () => {
    const picks = [makePick({ player_id: 1 })]
    const rows = computeSeasonSquadRoundPoints(picks, 1, 'round-1', fixtures, players, rules, {})
    expect(rows[0].rating).toBe(0)
    expect(rows[0].total_points).toBe(0)
  })

  it('applies the ownership/contrarian multiplier only in the acquisition round, for a rarely-held player', () => {
    const lowPct = rules.player_ownership_threshold_pct - 1
    const pick = makePick({ player_id: 2, round_acquired: 2, contrarian_pct_at_pick: lowPct })
    const roundsFixtures: RugbyFixtureRef[] = [
      { id: 100, round_id: 'round-1', home_team_id: 1, away_team_id: 2 },
      { id: 200, round_id: 'round-2', home_team_id: 1, away_team_id: 2 },
      { id: 300, round_id: 'round-3', home_team_id: 1, away_team_id: 2 },
    ]
    const ratings: RugbyPlayerMatchRating[] = [{ fixture_id: 200, player_id: 2, rating: 70 }]
    const round2Rows = computeSeasonSquadRoundPoints([pick], 2, 'round-2', roundsFixtures, players, rules, {}, ratings)
    const expectedRatingPoints = Math.round(70 * rules.squad_rating_multiplier * 100) / 100
    const expectedBonus = Math.round(expectedRatingPoints * (rules.player_ownership_multiplier - 1))
    expect(round2Rows[0].contrarian_bonus).toBe(expectedBonus)
    expect(round2Rows[0].total_points).toBe(expectedRatingPoints + expectedBonus)

    const round3Rows = computeSeasonSquadRoundPoints([pick], 3, 'round-3', roundsFixtures, players, rules, {})
    expect(round3Rows[0].contrarian_bonus).toBe(0)
  })

  it('does NOT apply the ownership multiplier when the pick was widely held (at/above threshold)', () => {
    const pick = makePick({ player_id: 1, round_acquired: 1, contrarian_pct_at_pick: rules.player_ownership_threshold_pct })
    const rows = computeSeasonSquadRoundPoints([pick], 1, 'round-1', fixtures, players, rules, {})
    expect(rows[0].contrarian_bonus).toBe(0)
  })

  it('excludes a pick from a round outside its [round_acquired, round_removed) coverage window', () => {
    const before = makePick({ round_acquired: 3 })
    const removedFixtures: RugbyFixtureRef[] = [{ id: 100, round_id: 'round-1', home_team_id: 1, away_team_id: 2 }]
    expect(computeSeasonSquadRoundPoints([before], 1, 'round-1', removedFixtures, players, rules, {})).toHaveLength(0)

    const removed = makePick({ round_acquired: 1, round_removed: 2 })
    expect(computeSeasonSquadRoundPoints([removed], 1, 'round-1', removedFixtures, players, rules, {})).toHaveLength(1)
    expect(computeSeasonSquadRoundPoints([removed], 2, 'round-1', removedFixtures, players, rules, {})).toHaveLength(0)
  })

  it('applies a precomputed sub penalty only in the pick\'s acquisition round', () => {
    const pick = makePick({ id: 'sub-pick', is_initial_pick: false, round_acquired: 3 })
    const roundsFixtures: RugbyFixtureRef[] = [
      { id: 300, round_id: 'round-3', home_team_id: 1, away_team_id: 2 },
      { id: 400, round_id: 'round-4', home_team_id: 1, away_team_id: 2 },
    ]
    const penaltyMap = { 'sub-pick': rules.extra_sub_penalty }
    const round3 = computeSeasonSquadRoundPoints([pick], 3, 'round-3', roundsFixtures, players, rules, penaltyMap)
    expect(round3[0].sub_penalty).toBe(rules.extra_sub_penalty)
    expect(round3[0].total_points).toBe(-rules.extra_sub_penalty)

    const round4 = computeSeasonSquadRoundPoints([pick], 4, 'round-4', roundsFixtures, players, rules, penaltyMap)
    expect(round4[0].sub_penalty).toBe(0)
  })

  it('applies the captain multiplier every round the pick is the current captain, not just once', () => {
    const pick = makePick({ player_id: 1 })
    const roundsFixtures: RugbyFixtureRef[] = [
      { id: 100, round_id: 'round-1', home_team_id: 1, away_team_id: 2 },
      { id: 200, round_id: 'round-2', home_team_id: 1, away_team_id: 2 },
    ]
    const ratings: RugbyPlayerMatchRating[] = [
      { fixture_id: 100, player_id: 1, rating: 80 },
      { fixture_id: 200, player_id: 1, rating: 60 },
    ]
    const captainSelections = [makeCaptainSelection({ player_id: 1, round_effective_from: 1 })]
    const round1Rows = computeSeasonSquadRoundPoints([pick], 1, 'round-1', roundsFixtures, players, rules, {}, ratings, captainSelections)
    const round2Rows = computeSeasonSquadRoundPoints([pick], 2, 'round-2', roundsFixtures, players, rules, {}, ratings, captainSelections)
    const roundToTwoDp = (n: number) => Math.round(n * 100) / 100
    expect(round1Rows[0].captain_bonus).toBe(roundToTwoDp(80 * rules.squad_rating_multiplier * (rules.captain_multiplier - 1)))
    expect(round2Rows[0].captain_bonus).toBe(roundToTwoDp(60 * rules.squad_rating_multiplier * (rules.captain_multiplier - 1)))
  })

  it('applies no captain bonus to a pick that is not the current captain', () => {
    const pick = makePick({ player_id: 2 })
    const ratings: RugbyPlayerMatchRating[] = [{ fixture_id: 100, player_id: 2, rating: 80 }]
    const captainSelections = [makeCaptainSelection({ player_id: 1, round_effective_from: 1 })]
    const rows = computeSeasonSquadRoundPoints([pick], 1, 'round-1', fixtures, players, rules, {}, ratings, captainSelections)
    expect(rows[0].captain_bonus).toBe(0)
  })

  it('charges the captain-change penalty in the round the change lands, on the new captain\'s pick', () => {
    const pick = makePick({ player_id: 1 })
    const changeSelection = makeCaptainSelection({ id: 'cap-2', player_id: 1, round_effective_from: 2 })
    const ratings: RugbyPlayerMatchRating[] = [{ fixture_id: 100, player_id: 1, rating: 50 }]
    const roundsFixtures: RugbyFixtureRef[] = [{ id: 100, round_id: 'round-2', home_team_id: 1, away_team_id: 2 }]
    const penaltyBySelectionId = { 'cap-2': rules.captain_change_penalty }
    const rows = computeSeasonSquadRoundPoints([pick], 2, 'round-2', roundsFixtures, players, rules, {}, ratings, [changeSelection], penaltyBySelectionId)
    expect(rows[0].captain_change_penalty).toBe(rules.captain_change_penalty)
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

  it('per_round mode resets the free budget every round instead of pooling it across the season', () => {
    const oneFreePerRound: typeof rules = { ...rules, max_free_subs: 1 }
    const subs = [
      makePick({ id: 'r2-sub1', round_acquired: 2, is_initial_pick: false, created_at: '2027-01-01T00:00:00.000Z' }),
      makePick({ id: 'r2-sub2', round_acquired: 2, is_initial_pick: false, created_at: '2027-01-02T00:00:00.000Z' }),
      makePick({ id: 'r3-sub1', round_acquired: 3, is_initial_pick: false, created_at: '2027-01-03T00:00:00.000Z' }),
    ]
    const seasonMode = computeSubPenalties(subs, oneFreePerRound, 'season')
    expect(seasonMode['r2-sub1']).toBeUndefined()
    expect(seasonMode['r2-sub2']).toBe(oneFreePerRound.extra_sub_penalty)
    expect(seasonMode['r3-sub1']).toBe(oneFreePerRound.extra_sub_penalty)

    const perRoundMode = computeSubPenalties(subs, oneFreePerRound, 'per_round')
    expect(perRoundMode['r2-sub1']).toBeUndefined()
    expect(perRoundMode['r2-sub2']).toBe(oneFreePerRound.extra_sub_penalty)
    expect(perRoundMode['r3-sub1']).toBeUndefined()
  })
})

describe('computeCaptainChangePenalties', () => {
  it('never penalises the first (initial) captain selection', () => {
    const selections = [makeCaptainSelection({ id: 'cap-1', created_at: '2027-01-01T00:00:00.000Z' })]
    expect(computeCaptainChangePenalties(selections, rules)).toEqual({})
  })

  it('the first change is free, every change after that is penalised, in chronological order', () => {
    const selections = [
      makeCaptainSelection({ id: 'cap-1', created_at: '2027-01-01T00:00:00.000Z' }), // initial
      makeCaptainSelection({ id: 'cap-2', created_at: '2027-01-02T00:00:00.000Z' }), // 1st change, free
      makeCaptainSelection({ id: 'cap-3', created_at: '2027-01-03T00:00:00.000Z' }), // 2nd change, penalised
    ]
    const penalties = computeCaptainChangePenalties(selections, rules)
    expect(penalties['cap-1']).toBeUndefined()
    expect(penalties['cap-2']).toBeUndefined()
    expect(penalties['cap-3']).toBe(rules.captain_change_penalty)
  })

  it('tracks each user\'s captain-change budget independently', () => {
    const selections = [
      makeCaptainSelection({ id: 'u1-a', user_id: 'user-1', created_at: '2027-01-01T00:00:00.000Z' }),
      makeCaptainSelection({ id: 'u1-b', user_id: 'user-1', created_at: '2027-01-02T00:00:00.000Z' }),
      makeCaptainSelection({ id: 'u1-c', user_id: 'user-1', created_at: '2027-01-03T00:00:00.000Z' }),
      makeCaptainSelection({ id: 'u2-a', user_id: 'user-2', created_at: '2027-01-01T00:00:00.000Z' }),
      makeCaptainSelection({ id: 'u2-b', user_id: 'user-2', created_at: '2027-01-02T00:00:00.000Z' }),
    ]
    const penalties = computeCaptainChangePenalties(selections, rules)
    expect(penalties['u1-c']).toBe(rules.captain_change_penalty)
    expect(penalties['u2-b']).toBeUndefined()
  })
})

describe('computeMatchPredictionScores', () => {
  const fixture: FinishedFixture = { id: 1, home_score: 20, away_score: 10 } // home won by 10

  function makePred(overrides: Partial<MatchPrediction> = {}): MatchPrediction {
    return {
      id: 'p1', user_id: 'u1', round_id: 'r1', fixture_id: 1,
      predicted_winner: 'home', predicted_margin: 10, is_confidence_pick: false,
      ...overrides,
    }
  }

  it('scores winner_points + full margin_max_points for a correct, spot-on margin', () => {
    const pred = makePred({ predicted_margin: 10 })
    const rows = computeMatchPredictionScores([pred], [fixture], {}, rules)
    expect(rows[0].is_correct).toBe(true)
    expect(rows[0].match_points).toBe(rules.match_winner_points + rules.match_margin_max_points)
    expect(rows[0].total_points).toBe(rules.match_winner_points + rules.match_margin_max_points)
  })

  it('diminishes the margin component by exactly the margin error, but never below winner_points', () => {
    // Predicted home by 10, actual was by 20 -> off by 10.
    const pred = makePred({ predicted_winner: 'home', predicted_margin: 10 })
    const wideFixture: FinishedFixture = { id: 1, home_score: 30, away_score: 10 } // by 20
    const rows = computeMatchPredictionScores([pred], [wideFixture], {}, rules)
    expect(rows[0].match_points).toBe(rules.match_winner_points + (rules.match_margin_max_points - 10))
  })

  it('floors at winner_points (never zero) for a correct winner call however wrong the margin is', () => {
    const pred = makePred({ predicted_winner: 'home', predicted_margin: 1 })
    const wideFixture: FinishedFixture = { id: 1, home_score: 100, away_score: 0 } // by 100
    const rows = computeMatchPredictionScores([pred], [wideFixture], {}, rules)
    expect(rows[0].match_points).toBe(rules.match_winner_points)
    expect(rows[0].match_points).toBeGreaterThan(0)
  })

  it('scores the flat draw base for a correctly predicted draw, no margin involved', () => {
    const drawFixture: FinishedFixture = { id: 1, home_score: 15, away_score: 15 }
    const pred = makePred({ predicted_winner: 'draw', predicted_margin: null })
    const rows = computeMatchPredictionScores([pred], [drawFixture], {}, rules)
    expect(rows[0].is_correct).toBe(true)
    expect(rows[0].match_points).toBe(rules.match_draw_base)
  })

  it('scores zero — never negative — for a wrong winner call, regardless of confidence', () => {
    const pred = makePred({ predicted_winner: 'away', predicted_margin: 5, is_confidence_pick: true })
    const rows = computeMatchPredictionScores([pred], [fixture], {}, rules)
    expect(rows[0].is_correct).toBe(false)
    expect(rows[0].match_points).toBe(0)
    expect(rows[0].total_points).toBe(0)
  })

  it('applies the confidence multiplier on top of the base for a correct pick', () => {
    const pred = makePred({ predicted_margin: 10, is_confidence_pick: true })
    const rows = computeMatchPredictionScores([pred], [fixture], {}, rules)
    const base = rules.match_winner_points + rules.match_margin_max_points
    expect(rows[0].match_points).toBe(Math.round(base * rules.match_confidence_multiplier))
  })

  it('sliding-scale underdog: 1x at/above the threshold, ramping linearly to the max multiplier at 0%', () => {
    const pred = makePred({ predicted_margin: 10 })
    const base = rules.match_winner_points + rules.match_margin_max_points
    const atThreshold = { 1: rules.match_underdog_threshold_pct }
    const zeroPct = { 1: 0 }
    const halfway = { 1: rules.match_underdog_threshold_pct / 2 }
    expect(computeMatchPredictionScores([pred], [fixture], atThreshold, rules)[0].match_points).toBe(base)
    expect(computeMatchPredictionScores([pred], [fixture], zeroPct, rules)[0].match_points).toBe(Math.round(base * rules.match_underdog_max_multiplier))
    const halfwayMultiplier = 1 + 0.5 * (rules.match_underdog_max_multiplier - 1)
    expect(computeMatchPredictionScores([pred], [fixture], halfway, rules)[0].match_points).toBe(Math.round(base * halfwayMultiplier))
  })

  it('combines confidence and underdog additively, not multiplicatively', () => {
    const pred = makePred({ predicted_margin: 10, is_confidence_pick: true })
    const zeroPct = { 1: 0 }
    const base = rules.match_winner_points + rules.match_margin_max_points
    const additiveMultiplier = 1 + (rules.match_confidence_multiplier - 1) + (rules.match_underdog_max_multiplier - 1)
    const rows = computeMatchPredictionScores([pred], [fixture], zeroPct, rules)
    expect(rows[0].match_points).toBe(Math.round(base * additiveMultiplier))
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
    const base = { round_id: 'r1', fixture_id: 1, predicted_margin: 5, is_confidence_pick: false }
    const predictions: MatchPrediction[] = [
      { id: 'a', user_id: 'u1', predicted_winner: 'home', ...base },
      { id: 'b', user_id: 'u2', predicted_winner: 'away', ...base },
      { id: 'c', user_id: 'u3', predicted_winner: 'home', ...base },
      { id: 'd', user_id: 'u4', predicted_winner: 'away', ...base },
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

  it('awards the flat points for an exact team match, no multiplier when widely picked', () => {
    const predictions: SeasonPrediction[] = [
      { id: 'p1', user_id: 'u1', type_key: 'winner', answer_team_id: 1, answer_player_id: null, answer_numeric: null, answer_fixture_id: null },
      { id: 'p2', user_id: 'u2', type_key: 'winner', answer_team_id: 1, answer_player_id: null, answer_numeric: null, answer_fixture_id: null },
    ]
    const rows = computeSeasonPredictionScores(predictions, results, types, rules)
    expect(rows.find(r => r.user_id === 'u1')?.points).toBe(20)
    expect(rows.find(r => r.user_id === 'u1')?.contrarian_bonus_applied).toBe(false)
  })

  it('multiplies the question\'s own points when the correct answer was rare among predictions', () => {
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
    expect(u1Row?.points).toBe(Math.round(20 * rules.season_underdog_multiplier))
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
