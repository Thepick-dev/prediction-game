import { describe, it, expect } from 'vitest'
import {
  computeSeasonSquadRoundPoints,
  computeSubPenalties,
  computeMatchPredictionScores,
  computeMatchSideDistribution,
  computeTryBonusActuals,
  computeSeasonPredictionScores,
  DEFAULT_RUGBY_SCORING_RULES,
  rulesWithDefaults,
  type SeasonSquadPick,
  type RugbyFixtureRef,
  type RugbyPlayerRef,
  type RugbyMatchEvent,
  type RugbyPlayerMatchStat,
  type MatchPrediction,
  type FinishedFixture,
  type RugbyFixtureTeams,
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

  it('multiplies try+kicking points (not a flat add) for a rarely-held player, only in the acquisition round', () => {
    const lowPct = rules.player_ownership_threshold_pct - 1
    const pick = makePick({ player_id: 2, is_kicker: true, round_acquired: 2, contrarian_pct_at_pick: lowPct })
    const roundsFixtures: RugbyFixtureRef[] = [
      { id: 100, round_id: 'round-1', home_team_id: 1, away_team_id: 2 },
      { id: 200, round_id: 'round-2', home_team_id: 1, away_team_id: 2 },
      { id: 300, round_id: 'round-3', home_team_id: 1, away_team_id: 2 },
    ]
    const events: RugbyMatchEvent[] = [{ player_id: 2, event_type: 'try', fixture_id: 200 }]
    // Round 2 (acquisition round) — try_points stay raw; the multiplier's
    // extra shows up as contrarian_bonus, and total_points reflects it.
    const round2Rows = computeSeasonSquadRoundPoints([pick], 2, 'round-2', roundsFixtures, players, events, rules, {})
    const expectedBonus = Math.round(rules.squad_try_points * (rules.player_ownership_multiplier - 1))
    expect(round2Rows[0].try_points).toBe(rules.squad_try_points)
    expect(round2Rows[0].contrarian_bonus).toBe(expectedBonus)
    expect(round2Rows[0].total_points).toBe(rules.squad_try_points + expectedBonus)
    // Round 3 (later, same events wouldn't recur, but even hypothetically) — no repeat bonus.
    const round3Rows = computeSeasonSquadRoundPoints([pick], 3, 'round-3', roundsFixtures, players, [], rules, {})
    expect(round3Rows[0].contrarian_bonus).toBe(0)
  })

  it('does NOT apply the ownership multiplier when the pick was widely held (at/above threshold)', () => {
    const pick = makePick({ player_id: 1, round_acquired: 1, contrarian_pct_at_pick: rules.player_ownership_threshold_pct })
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

describe('computeSeasonSquadRoundPoints — new player-statistics categories', () => {
  it('awards try assist, clean break, offload, meters run and tackle points to any pick, not just the kicker', () => {
    const picks = [makePick({ player_id: 1, is_kicker: false })]
    const stats: RugbyPlayerMatchStat[] = [
      { fixture_id: 100, player_id: 1, meters_run: 40, clean_breaks: 2, offloads: 1, tackles: 5, tackles_missed: 0, try_assists: 1 },
    ]
    const rows = computeSeasonSquadRoundPoints(picks, 1, 'round-1', fixtures, players, [], rules, {}, stats)
    expect(rows[0].try_assist_points).toBe(rules.squad_try_assist_points)
    expect(rows[0].clean_break_points).toBe(2 * rules.squad_clean_break_points)
    expect(rows[0].offload_points).toBe(rules.squad_offload_points)
    expect(rows[0].meters_run_points).toBe(40 * rules.squad_meters_run_points)
    expect(rows[0].tackle_points).toBe(5 * rules.squad_tackle_points)
    expect(rows[0].total_points).toBe(
      rules.squad_try_assist_points + 2 * rules.squad_clean_break_points + rules.squad_offload_points
      + 40 * rules.squad_meters_run_points + 5 * rules.squad_tackle_points
    )
  })

  it('subtracts the tackles-missed and yellow-card penalties', () => {
    const picks = [makePick({ player_id: 1, is_kicker: false })]
    const events: RugbyMatchEvent[] = [{ player_id: 1, event_type: 'yellow_card', fixture_id: 100 }]
    const stats: RugbyPlayerMatchStat[] = [
      { fixture_id: 100, player_id: 1, meters_run: 0, clean_breaks: 0, offloads: 0, tackles: 0, tackles_missed: 3, try_assists: 0 },
    ]
    const rows = computeSeasonSquadRoundPoints(picks, 1, 'round-1', fixtures, players, events, rules, {}, stats)
    expect(rows[0].tackle_missed_penalty).toBe(3 * rules.squad_tackle_missed_penalty)
    expect(rows[0].yellow_card_penalty).toBe(rules.squad_yellow_card_penalty)
    expect(rows[0].total_points).toBe(-(3 * rules.squad_tackle_missed_penalty) - rules.squad_yellow_card_penalty)
  })

  it('scores zero for these categories when a pick has no match_stats row (defaults to []) ', () => {
    const picks = [makePick({ player_id: 1, is_kicker: false })]
    const rows = computeSeasonSquadRoundPoints(picks, 1, 'round-1', fixtures, players, [], rules, {})
    expect(rows[0].meters_run_points).toBe(0)
    expect(rows[0].tackle_points).toBe(0)
    expect(rows[0].total_points).toBe(0)
  })
})

describe('rulesWithDefaults — per-category enabled toggle', () => {
  it('zeroes out a disabled rule\'s points regardless of its configured value', () => {
    const rows = [{ rule_key: 'squad_tackle_missed_penalty', points: 0.5 }]
    const enabled = rulesWithDefaults(rows)
    expect(enabled.squad_tackle_missed_penalty).toBe(0.5)
    const disabled = rulesWithDefaults(rows, new Set(['squad_tackle_missed_penalty']))
    expect(disabled.squad_tackle_missed_penalty).toBe(0)
  })

  it('leaves every other rule untouched when only one key is disabled', () => {
    const rows = [{ rule_key: 'squad_try_points', points: 10 }, { rule_key: 'squad_yellow_card_penalty', points: 5 }]
    const rules = rulesWithDefaults(rows, new Set(['squad_yellow_card_penalty']))
    expect(rules.squad_try_points).toBe(10)
    expect(rules.squad_yellow_card_penalty).toBe(0)
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

describe('computeTryBonusActuals', () => {
  const fixtureTeams: RugbyFixtureTeams[] = [{ id: 1, home_team_id: 10, away_team_id: 20 }]
  const teamPlayers: RugbyPlayerRef[] = [{ id: 1, team_id: 10 }, { id: 2, team_id: 20 }]

  it('is true for a side with 4 or more try events, false otherwise', () => {
    const events: RugbyMatchEvent[] = [
      { fixture_id: 1, event_type: 'try', player_id: 1 },
      { fixture_id: 1, event_type: 'try', player_id: 1 },
      { fixture_id: 1, event_type: 'try', player_id: 1 },
      { fixture_id: 1, event_type: 'try', player_id: 1 },
      { fixture_id: 1, event_type: 'try', player_id: 2 },
      { fixture_id: 1, event_type: 'conversion', player_id: 2 }, // not a try, ignored
    ]
    const result = computeTryBonusActuals(fixtureTeams, teamPlayers, events)
    expect(result[1].home).toBe(true) // 4 tries
    expect(result[1].away).toBe(false) // 1 try
  })
})

describe('computeMatchPredictionScores', () => {
  const fixture: FinishedFixture = { id: 1, home_score: 20, away_score: 10 } // home won by 10

  function makePred(overrides: Partial<MatchPrediction> = {}): MatchPrediction {
    return {
      id: 'p1', user_id: 'u1', round_id: 'r1', fixture_id: 1,
      predicted_winner: 'home', predicted_margin: 10, is_confidence_pick: false,
      predicted_home_try_bonus: null, predicted_away_try_bonus: null,
      ...overrides,
    }
  }

  it('scores the win base minus the margin error for a correct, spot-on margin', () => {
    const pred = makePred({ predicted_margin: 10 })
    const rows = computeMatchPredictionScores([pred], [fixture], {}, {}, rules)
    expect(rows[0].is_correct).toBe(true)
    expect(rows[0].match_points).toBe(rules.match_win_base)
    expect(rows[0].total_points).toBe(rules.match_win_base)
  })

  it('diminishes the win base by exactly the margin error, per the worked example (50 base, 10 out -> 40)', () => {
    // Predicted home by 10, actual was by 20 -> off by 10.
    const pred = makePred({ predicted_winner: 'home', predicted_margin: 10 })
    const wideFixture: FinishedFixture = { id: 1, home_score: 30, away_score: 10 } // by 20
    const rows = computeMatchPredictionScores([pred], [wideFixture], {}, {}, rules)
    expect(rows[0].match_points).toBe(rules.match_win_base - 10)
  })

  it('never goes below zero even with a huge margin error', () => {
    const pred = makePred({ predicted_winner: 'home', predicted_margin: 1 })
    const wideFixture: FinishedFixture = { id: 1, home_score: 100, away_score: 0 } // by 100
    const rows = computeMatchPredictionScores([pred], [wideFixture], {}, {}, rules)
    expect(rows[0].match_points).toBe(0)
  })

  it('scores the flat draw base for a correctly predicted draw, no margin involved', () => {
    const drawFixture: FinishedFixture = { id: 1, home_score: 15, away_score: 15 }
    const pred = makePred({ predicted_winner: 'draw', predicted_margin: null })
    const rows = computeMatchPredictionScores([pred], [drawFixture], {}, {}, rules)
    expect(rows[0].is_correct).toBe(true)
    expect(rows[0].match_points).toBe(rules.match_draw_base)
  })

  it('scores zero — never negative — for a wrong winner call, regardless of confidence', () => {
    const pred = makePred({ predicted_winner: 'away', predicted_margin: 5, is_confidence_pick: true })
    const rows = computeMatchPredictionScores([pred], [fixture], {}, {}, rules)
    expect(rows[0].is_correct).toBe(false)
    expect(rows[0].match_points).toBe(0)
    expect(rows[0].total_points).toBe(0)
  })

  it('applies the confidence multiplier on top of the base for a correct pick', () => {
    const pred = makePred({ predicted_margin: 10, is_confidence_pick: true })
    const rows = computeMatchPredictionScores([pred], [fixture], {}, {}, rules)
    expect(rows[0].match_points).toBe(Math.round(rules.match_win_base * rules.match_confidence_multiplier))
  })

  it('applies the underdog multiplier only when the picked side was rare enough', () => {
    const pred = makePred({ predicted_margin: 10 })
    const lowPct = { 1: rules.match_underdog_threshold_pct - 1 }
    const highPct = { 1: rules.match_underdog_threshold_pct }
    const lowRows = computeMatchPredictionScores([pred], [fixture], lowPct, {}, rules)
    const highRows = computeMatchPredictionScores([pred], [fixture], highPct, {}, rules)
    expect(lowRows[0].match_points).toBe(Math.round(rules.match_win_base * rules.match_underdog_multiplier))
    expect(highRows[0].match_points).toBe(rules.match_win_base)
  })

  it('combines confidence and underdog additively (1.5x + 1.5x = 2x, not 2.25x), matching the worked example (50 win base -> 100, 75 draw base -> 150)', () => {
    const drawFixture: FinishedFixture = { id: 1, home_score: 15, away_score: 15 }
    const winPred = makePred({ predicted_winner: 'home', predicted_margin: 10, is_confidence_pick: true })
    const drawPred = makePred({ predicted_winner: 'draw', predicted_margin: null, is_confidence_pick: true })
    const lowPct = { 1: rules.match_underdog_threshold_pct - 1 }
    const winRows = computeMatchPredictionScores([winPred], [fixture], lowPct, {}, rules)
    const drawRows = computeMatchPredictionScores([drawPred], [drawFixture], lowPct, {}, rules)
    expect(winRows[0].match_points).toBe(100)
    expect(drawRows[0].match_points).toBe(150)
  })

  it('scores each team\'s try-bonus call independently, sharing the match\'s own multiplier', () => {
    const pred = makePred({ predicted_margin: 10, is_confidence_pick: true, predicted_home_try_bonus: true, predicted_away_try_bonus: false })
    const tryActuals = { 1: { home: true, away: false } } // both calls correct
    const rows = computeMatchPredictionScores([pred], [fixture], {}, tryActuals, rules)
    const expectedTryPoints = Math.round(rules.try_bonus_points * rules.match_confidence_multiplier)
    expect(rows[0].home_try_bonus_points).toBe(expectedTryPoints)
    expect(rows[0].away_try_bonus_points).toBe(expectedTryPoints)
    expect(rows[0].total_points).toBe(rows[0].match_points + expectedTryPoints * 2)
  })

  it('scores zero try-bonus points for an incorrect try-bonus call', () => {
    const pred = makePred({ predicted_home_try_bonus: false, predicted_away_try_bonus: true })
    const tryActuals = { 1: { home: true, away: false } } // both calls wrong
    const rows = computeMatchPredictionScores([pred], [fixture], {}, tryActuals, rules)
    expect(rows[0].home_try_bonus_points).toBe(0)
    expect(rows[0].away_try_bonus_points).toBe(0)
  })

  it('skips a fixture with no final score yet', () => {
    const unfinished: FinishedFixture = { id: 2, home_score: null, away_score: null }
    const pred = makePred({ fixture_id: 2 })
    expect(computeMatchPredictionScores([pred], [unfinished], {}, {}, rules)).toHaveLength(0)
  })
})

describe('computeMatchSideDistribution', () => {
  it('computes the % of the field that picked the actual winning side', () => {
    const fixture: FinishedFixture = { id: 1, home_score: 20, away_score: 10 }
    const base = { round_id: 'r1', fixture_id: 1, predicted_margin: 5, is_confidence_pick: false, predicted_home_try_bonus: null, predicted_away_try_bonus: null }
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
