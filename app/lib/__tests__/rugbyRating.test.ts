import { describe, it, expect } from 'vitest'
import { computeRawScore, computeRatings, computePackRawScore, type RugbyMatchStatLine, type RatingPoolEntry, type TeamMatchStatLine } from '../rugbyRating'

function stats(overrides: Partial<RugbyMatchStatLine> = {}): RugbyMatchStatLine {
  return {
    tries: 0, try_assists: 0, clean_breaks: 0, offloads: 0, meters_run: 0, passes: 0,
    tackles: 0, tackles_missed: 0, yellow_card: 0, red_card: 0,
    conversions: 0, penalty_goals: 0, drop_goals: 0,
    ...overrides,
  }
}

// League-average team performance across the 5 pack categories — should
// contribute ~0 to raw score either way.
function teamStats(overrides: Partial<TeamMatchStatLine> = {}): TeamMatchStatLine {
  return {
    scrums_won: 9, scrums_attempted: 10, // ~86% ≈ mean
    lineouts_won: 9, lineouts_attempted: 10, // 90% ≈ mean
    turnovers_won: 5, turnovers_conceded: 14, penalties_conceded: 9,
    ...overrides,
  }
}

describe('computeRawScore', () => {
  it('scores a try the same across every position (10pts)', () => {
    expect(computeRawScore(stats({ tries: 1 }), 'Prop')).toBe(10)
    expect(computeRawScore(stats({ tries: 1 }), 'Wing')).toBe(12) // wing try value raised
  })

  it('applies the universal kicking weight to whoever kicks, regardless of position', () => {
    const kicking = stats({ conversions: 1, penalty_goals: 1, drop_goals: 1 })
    const propScore = computeRawScore(kicking, 'Prop')
    const flyHalfScore = computeRawScore(kicking, 'Fly-half')
    expect(propScore).toBe(1.5 + 2 + 3.5) // exactly the same kicking credit either way
    expect(flyHalfScore).toBe(1.5 + 2 + 3.5)
  })

  it('gives Prop/Hooker the highest tackle weight of any group', () => {
    const tackling = stats({ tackles: 10 })
    expect(computeRawScore(tackling, 'Prop')).toBe(3.5) // 10 * 0.35
    expect(computeRawScore(tackling, 'Wing')).toBe(2) // 10 * 0.2
  })

  it('penalises missed tackles and cards, can go negative', () => {
    const bad = stats({ tackles_missed: 2, yellow_card: 1 })
    expect(computeRawScore(bad, 'Fullback')).toBe(-(2 * 0.7) - 5)
  })

  it('ignores team stats entirely with no teamStats argument (backward compatible)', () => {
    expect(computeRawScore(stats({ tries: 1 }), 'Prop')).toBe(10)
  })

  it('applies the pack bonus to forward groups only, never to backs', () => {
    const great = teamStats({ scrums_won: 10, scrums_attempted: 10, lineouts_won: 10, lineouts_attempted: 10, turnovers_won: 10, turnovers_conceded: 5, penalties_conceded: 3 })
    const base = stats({ tackles: 10 })
    expect(computeRawScore(base, 'Prop', great)).toBeGreaterThan(computeRawScore(base, 'Prop'))
    expect(computeRawScore(base, 'Hooker', great)).toBeGreaterThan(computeRawScore(base, 'Hooker'))
    expect(computeRawScore(base, 'Second Row', great)).toBeGreaterThan(computeRawScore(base, 'Second Row'))
    expect(computeRawScore(base, 'Back Row', great)).toBeGreaterThan(computeRawScore(base, 'Back Row'))
    // Backs get no pack bonus at all — a back's rating never moves because of it.
    expect(computeRawScore(base, 'Fly-half', great)).toBe(computeRawScore(base, 'Fly-half'))
    expect(computeRawScore(base, 'Wing', great)).toBe(computeRawScore(base, 'Wing'))
  })

  it('applies full pack bonus/malus regardless of minutes played (no sub adjustment)', () => {
    // A player who was on the pitch for 10 minutes and one who played the
    // full 80 get exactly the same pack credit for the same match — by
    // design, per Kit: it's a team performance, not an individual one.
    const bad = teamStats({ scrums_won: 3, scrums_attempted: 10, lineouts_won: 6, lineouts_attempted: 10, turnovers_won: 1, turnovers_conceded: 22, penalties_conceded: 15 })
    const starterStats = stats({ tackles: 15 })
    const subStats = stats({ tackles: 2 })
    const starterDelta = computeRawScore(starterStats, 'Prop', bad) - computeRawScore(starterStats, 'Prop')
    const subDelta = computeRawScore(subStats, 'Prop', bad) - computeRawScore(subStats, 'Prop')
    expect(starterDelta).toBe(subDelta)
  })

  it('nudges raw score up for a win, down for a loss, leaves a draw untouched — same size either way', () => {
    const base = stats({ tackles: 10 })
    const neutral = computeRawScore(base, 'Fly-half')
    const win = computeRawScore(base, 'Fly-half', undefined, 'win')
    const loss = computeRawScore(base, 'Fly-half', undefined, 'loss')
    const draw = computeRawScore(base, 'Fly-half', undefined, 'draw')
    expect(win).toBeGreaterThan(neutral)
    expect(loss).toBeLessThan(neutral)
    expect(draw).toBe(neutral)
    expect(win - neutral).toBeCloseTo(neutral - loss, 5) // same magnitude both directions
  })

  it('applies the win/loss nudge to every position, not just forwards (unlike the pack bonus)', () => {
    const base = stats({ tries: 1 })
    expect(computeRawScore(base, 'Prop', undefined, 'win')).toBeGreaterThan(computeRawScore(base, 'Prop'))
    expect(computeRawScore(base, 'Wing', undefined, 'win')).toBeGreaterThan(computeRawScore(base, 'Wing'))
    expect(computeRawScore(base, 'Fly-half', undefined, 'win')).toBeGreaterThan(computeRawScore(base, 'Fly-half'))
  })

  it('leaves raw score unchanged with no matchResult argument (backward compatible)', () => {
    expect(computeRawScore(stats({ tries: 1 }), 'Prop')).toBe(computeRawScore(stats({ tries: 1 }), 'Prop', undefined, undefined))
  })
})

describe('computePackRawScore', () => {
  it('rates a league-average pack performance at roughly zero', () => {
    expect(computePackRawScore(teamStats())).toBeCloseTo(0, 0)
  })

  it('rewards a dominant scrum/lineout/turnover day with a positive score', () => {
    const dominant = teamStats({ scrums_won: 10, scrums_attempted: 10, lineouts_won: 10, lineouts_attempted: 10, turnovers_won: 9, turnovers_conceded: 6, penalties_conceded: 4 })
    expect(computePackRawScore(dominant)).toBeGreaterThan(2)
  })

  it('punishes a poor set-piece/discipline day with a negative score', () => {
    const poor = teamStats({ scrums_won: 4, scrums_attempted: 12, lineouts_won: 6, lineouts_attempted: 10, turnovers_won: 1, turnovers_conceded: 22, penalties_conceded: 15 })
    expect(computePackRawScore(poor)).toBeLessThan(-2)
  })

  it('falls back to league-average when attempts are missing (0 attempted), never divides by zero', () => {
    const noSetPiece = teamStats({ scrums_won: null, scrums_attempted: 0, lineouts_won: null, lineouts_attempted: 0 })
    expect(Number.isFinite(computePackRawScore(noSetPiece))).toBe(true)
  })
})

describe('computeRatings', () => {
  it('ranks purely within the same position group, never across groups', () => {
    const pool: RatingPoolEntry[] = [
      { id: 'p1', group: 'Prop', rawScore: 2 },
      { id: 'p2', group: 'Prop', rawScore: 8 },
      { id: 'w1', group: 'Wing', rawScore: 20 }, // wings score much higher raw numbers
      { id: 'w2', group: 'Wing', rawScore: 5 },
    ]
    const ratings = computeRatings(pool)
    // The best prop performance (raw 8) rates the same as the best wing
    // performance (raw 20) within a 2-person pool — 100 either way —
    // despite wildly different raw scores. That's the whole point.
    expect(ratings.get('p2')).toBe(100)
    expect(ratings.get('w1')).toBe(100)
    expect(ratings.get('p1')).toBe(0)
    expect(ratings.get('w2')).toBe(0)
  })

  it('a lone entry in a group rates as average (50), not 0 or 100', () => {
    const pool: RatingPoolEntry[] = [{ id: 'only', group: 'Scrum-half', rawScore: 999 }]
    expect(computeRatings(pool).get('only')).toBe(50)
  })

  it('adding more data to the pool can shift where an existing performance ranks', () => {
    const smallPool: RatingPoolEntry[] = [
      { id: 'a', group: 'Centre', rawScore: 5 },
      { id: 'b', group: 'Centre', rawScore: 10 },
    ]
    expect(computeRatings(smallPool).get('a')).toBe(0)

    // Same performance, but the pool has grown (more historical data pulled) —
    // "a" is no longer the worst in the group.
    const biggerPool: RatingPoolEntry[] = [
      ...smallPool,
      { id: 'c', group: 'Centre', rawScore: 1 },
    ]
    expect(computeRatings(biggerPool).get('a')).toBeGreaterThan(0)
  })
})
