import { describe, it, expect } from 'vitest'
import { computePickScores, type Pick, type Fixture, type ScoringRule, type PlayerScoringRule, type MatchEvent, type PlayerInfo } from '../scoring'

function makePick(overrides: Partial<Pick> = {}): Pick {
  return {
    id: 'pick-1',
    user_id: 'user-1',
    team_id: 1,
    fixture_id: 100,
    player1_id: 10,
    player2_id: 20,
    player1_fixture_id: null,
    player2_fixture_id: null,
    is_banker: false,
    competition_id: 'comp-1',
    ...overrides,
  }
}

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 100,
    home_team_id: 1,
    away_team_id: 2,
    home_score: null,
    away_score: null,
    status: 'scheduled',
    postponed_handling: null,
    postponed_points: null,
    ...overrides,
  }
}

// Mirrors the real bug fixed this season: Liverpool (Q4, the underdog) beat
// Bournemouth (Q3) at home — "1 Up" — which should score MORE than a big
// team beating a small team, not less. This was inverted before the fix
// (quartileDiff was opponent - team instead of team - opponent).
const homeWinScoringRules: ScoringRule[] = [
  { result_type: 'home_win', quartile_diff: -1, points: 15 },
  { result_type: 'home_win', quartile_diff: 0, points: 25 },
  { result_type: 'home_win', quartile_diff: 1, points: 35 },
]

describe('computePickScores — quartile-diff sign (regression test for the inverted-sign bug)', () => {
  it('awards the underdog ("1 Up") rate when a Q4 team beats a Q3 team at home', () => {
    // team_id 1 = "Liverpool" (Q4), team_id 2 = "Bournemouth" (Q3, opponent)
    const quartileMap = { 1: 4, 2: 3 }
    const fixture = makeFixture({ home_score: 3, away_score: 1 }) // Liverpool win
    const pick = makePick({ team_id: 1, fixture_id: fixture.id, is_banker: true })

    const [row] = computePickScores('gw-1', [pick], [fixture], quartileMap, homeWinScoringRules, [], [])

    // Weaker team (higher quartile number) beating a stronger one is a
    // POSITIVE quartile_diff ("N Up") — worth the higher 35pt rate, not the
    // lower 15pt one a naive/inverted sign would have picked instead.
    expect(row.breakdown.team_detail.quartile_diff).toBe(1)
    expect(row.breakdown.team_detail.result_type).toBe('home_win')
    // Banker doubles it: 35 * 2 = 70 — matches the real expected value used
    // to verify the original fix (a flat 35 would mean the sign is wrong again).
    expect(row.team_points).toBe(70)
  })

  it('awards the lower rate when a stronger team beats a weaker one (the reverse case)', () => {
    // team_id 1 = Q3 team beating team_id 2 = Q4 team at home — "1 Down" for us.
    const quartileMap = { 1: 3, 2: 4 }
    const fixture = makeFixture({ home_score: 2, away_score: 0 })
    const pick = makePick({ team_id: 1, fixture_id: fixture.id })

    const [row] = computePickScores('gw-1', [pick], [fixture], quartileMap, homeWinScoringRules, [], [])

    expect(row.breakdown.team_detail.quartile_diff).toBe(-1)
    expect(row.team_points).toBe(15)
  })

  it('treats an equally-matched win (same quartile) as "Level"', () => {
    const quartileMap = { 1: 2, 2: 2 }
    const fixture = makeFixture({ home_score: 1, away_score: 0 })
    const pick = makePick({ team_id: 1, fixture_id: fixture.id })

    const [row] = computePickScores('gw-1', [pick], [fixture], quartileMap, homeWinScoringRules, [], [])

    expect(row.breakdown.team_detail.quartile_diff).toBe(0)
    expect(row.team_points).toBe(25)
  })
})

describe('computePickScores — other core behaviour', () => {
  it('awards zero team points for a loss, regardless of quartile difference', () => {
    const quartileMap = { 1: 4, 2: 1 } // huge underdog, but still lost
    const fixture = makeFixture({ home_score: 0, away_score: 3 })
    const pick = makePick({ team_id: 1, fixture_id: fixture.id })

    const [row] = computePickScores('gw-1', [pick], [fixture], quartileMap, homeWinScoringRules, [], [])

    expect(row.team_points).toBe(0)
    expect(row.breakdown.team_detail.result_type).toBe('loss')
  })

  it('fills in opponent/quartile/home-away detail before the match is played, without awarding points', () => {
    const quartileMap = { 1: 4, 2: 3 }
    const fixture = makeFixture({ home_score: null, away_score: null })
    const pick = makePick({ team_id: 1, fixture_id: fixture.id })

    const [row] = computePickScores('gw-1', [pick], [fixture], quartileMap, homeWinScoringRules, [], [])

    expect(row.team_points).toBe(0)
    expect(row.breakdown.team).toBe('Not played yet')
    expect(row.breakdown.team_detail.opponent_team_id).toBe(2)
    expect(row.breakdown.team_detail.team_score).toBeNull()
  })

  it('doubles team AND player points when the pick is a banker', () => {
    const quartileMap = { 1: 2, 2: 2 }
    const fixture = makeFixture({ home_score: 1, away_score: 0 })
    const events: MatchEvent[] = [{ player_id: 10, event_type: 'goal', fixture_id: 100 }]
    const rules: PlayerScoringRule[] = [{ event_type: 'goal', points: 12 }, { event_type: 'assist', points: 6 }]
    const pick = makePick({ team_id: 1, fixture_id: fixture.id, is_banker: true })

    const [row] = computePickScores('gw-1', [pick], [fixture], quartileMap, homeWinScoringRules, rules, events)

    expect(row.player1_points).toBe(24) // 12 * 2
    expect(row.total_points).toBe(row.team_points + row.player1_points + row.player2_points)
  })

  it('sums goals and assists for the correct player using the configured point values', () => {
    const quartileMap = { 1: 2, 2: 2 }
    const fixture = makeFixture({ home_score: 0, away_score: 0 })
    const events: MatchEvent[] = [
      { player_id: 10, event_type: 'goal', fixture_id: 100 },
      { player_id: 10, event_type: 'goal', fixture_id: 100 },
      { player_id: 10, event_type: 'assist', fixture_id: 100 },
      { player_id: 20, event_type: 'assist', fixture_id: 100 },
    ]
    const rules: PlayerScoringRule[] = [{ event_type: 'goal', points: 12 }, { event_type: 'assist', points: 6 }]
    const pick = makePick({ team_id: 1, fixture_id: fixture.id })

    const [row] = computePickScores('gw-1', [pick], [fixture], quartileMap, homeWinScoringRules, rules, events)

    expect(row.player1_points).toBe(12 * 2 + 6) // two goals + one assist
    expect(row.player2_points).toBe(6) // one assist
  })

  it('gives no points and no fixture detail when there is no fixture at all for the picked team', () => {
    const quartileMap = { 1: 2 }
    const pick = makePick({ team_id: 1, fixture_id: 999 }) // no such fixture supplied

    const [row] = computePickScores('gw-1', [pick], [], quartileMap, homeWinScoringRules, [], [])

    expect(row.team_points).toBe(0)
    expect(row.breakdown.team).toBe('No fixture')
    expect(row.breakdown.team_detail.opponent_team_id).toBeNull()
  })
})

describe('computePickScores — double gameweeks (a player\'s team plays twice)', () => {
  // Player 10 is on team 1, which plays twice this gameweek: fixture 100
  // (scores) and fixture 200 (also scores). Without nominating which match
  // the pick is "for", the two shouldn't ever be silently added together.
  const quartileMap = { 1: 2, 2: 2, 3: 2 }
  const fixtureA = makeFixture({ id: 100, home_team_id: 1, away_team_id: 2, home_score: 1, away_score: 0 })
  const fixtureB = makeFixture({ id: 200, home_team_id: 3, away_team_id: 1, home_score: 0, away_score: 2 })
  const players: PlayerInfo[] = [{ id: 10, team_id: 1 }, { id: 20, team_id: 2 }]
  const rules: PlayerScoringRule[] = [{ event_type: 'goal', points: 12 }, { event_type: 'assist', points: 6 }]
  const events: MatchEvent[] = [
    { player_id: 10, event_type: 'goal', fixture_id: 100 }, // scores in match A
    { player_id: 10, event_type: 'goal', fixture_id: 200 }, // and again in match B
  ]

  it('scores zero for a double-gameweek player when no fixture was nominated', () => {
    const pick = makePick({ team_id: 1, fixture_id: 100, player1_id: 10, player1_fixture_id: null })
    const [row] = computePickScores('gw-1', [pick], [fixtureA, fixtureB], quartileMap, homeWinScoringRules, rules, events, players)
    expect(row.player1_points).toBe(0)
  })

  it('only counts the nominated fixture\'s goals, not both games combined', () => {
    const pick = makePick({ team_id: 1, fixture_id: 100, player1_id: 10, player1_fixture_id: 100 })
    const [row] = computePickScores('gw-1', [pick], [fixtureA, fixtureB], quartileMap, homeWinScoringRules, rules, events, players)
    expect(row.player1_points).toBe(12) // just fixture 100's goal, not fixture 200's too
  })

  it('picking the other nominated fixture scores that game\'s goal instead', () => {
    const pick = makePick({ team_id: 1, fixture_id: 100, player1_id: 10, player1_fixture_id: 200 })
    const [row] = computePickScores('gw-1', [pick], [fixtureA, fixtureB], quartileMap, homeWinScoringRules, rules, events, players)
    expect(row.player1_points).toBe(12) // fixture 200's goal
  })

  it('scores normally with no nomination needed when the player\'s team only plays once', () => {
    // Player 20 is on team 2, which only appears in fixture 100 (not a double gameweek).
    const pick = makePick({ team_id: 1, fixture_id: 100, player2_id: 20, player2_fixture_id: null })
    const singleGameEvents: MatchEvent[] = [{ player_id: 20, event_type: 'assist', fixture_id: 100 }]
    const [row] = computePickScores('gw-1', [pick], [fixtureA, fixtureB], quartileMap, homeWinScoringRules, rules, singleGameEvents, players)
    expect(row.player2_points).toBe(6)
  })
})

describe('computePickScores — double gameweeks (a team plays twice)', () => {
  // Team 1 plays twice: a home win in fixture 100, an away win in fixture
  // 200. A manual pick always carries its own fixture_id (set by the Picks
  // page), so this is really about autopick, which never nominates one.
  const quartileMap = { 1: 2, 2: 2, 3: 2 }
  const fixtureA = makeFixture({ id: 100, home_team_id: 1, away_team_id: 2, home_score: 1, away_score: 0 })
  const fixtureB = makeFixture({ id: 200, home_team_id: 3, away_team_id: 1, home_score: 0, away_score: 2 })

  it('scores zero for the team when it has a double gameweek and no fixture was nominated', () => {
    const pick = makePick({ team_id: 1, fixture_id: null })
    const [row] = computePickScores('gw-1', [pick], [fixtureA, fixtureB], quartileMap, homeWinScoringRules, [], [])
    expect(row.team_points).toBe(0)
    expect(row.breakdown.team_detail.result_type).toBe('double_gameweek_unresolved')
  })

  it('scores the exact nominated fixture, not the other one, when the team has a double gameweek', () => {
    const rules: ScoringRule[] = [...homeWinScoringRules, { result_type: 'away_win', quartile_diff: 0, points: 40 }]
    const pick = makePick({ team_id: 1, fixture_id: 200 })
    const [row] = computePickScores('gw-1', [pick], [fixtureA, fixtureB], quartileMap, rules, [], [])
    expect(row.breakdown.team_detail.result_type).toBe('away_win')
    expect(row.team_points).toBe(40) // fixture 200's away win — not fixture 100's home_win rate
  })
})

describe('computePickScores — postponements', () => {
  const quartileMap = { 1: 2, 2: 2 }

  it('awards zero points for a voided postponement', () => {
    const fixture = makeFixture({ status: 'postponed', postponed_handling: 'void' })
    const pick = makePick({ team_id: 1, fixture_id: fixture.id })
    const [row] = computePickScores('gw-1', [pick], [fixture], quartileMap, homeWinScoringRules, [], [])
    expect(row.team_points).toBe(0)
    expect(row.breakdown.team_detail.result_type).toBe('postponed')
  })

  it('awards zero points when re-picks are offered (the pick itself scores nothing either way)', () => {
    const fixture = makeFixture({ status: 'postponed', postponed_handling: 'repick' })
    const pick = makePick({ team_id: 1, fixture_id: fixture.id })
    const [row] = computePickScores('gw-1', [pick], [fixture], quartileMap, homeWinScoringRules, [], [])
    expect(row.team_points).toBe(0)
  })

  it('awards the admin-set custom points for a postponement handled that way', () => {
    const fixture = makeFixture({ status: 'postponed', postponed_handling: 'custom_points', postponed_points: 22 })
    const pick = makePick({ team_id: 1, fixture_id: fixture.id, is_banker: true })
    const [row] = computePickScores('gw-1', [pick], [fixture], quartileMap, homeWinScoringRules, [], [])
    expect(row.team_points).toBe(44) // 22 * 2 for the banker, same as any other team score
  })
})
