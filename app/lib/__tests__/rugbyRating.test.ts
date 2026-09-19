import { describe, it, expect } from 'vitest'
import { computeRawScore, computeRatings, type RugbyMatchStatLine, type RatingPoolEntry } from '../rugbyRating'

function stats(overrides: Partial<RugbyMatchStatLine> = {}): RugbyMatchStatLine {
  return {
    tries: 0, try_assists: 0, clean_breaks: 0, offloads: 0, meters_run: 0, passes: 0,
    tackles: 0, tackles_missed: 0, yellow_card: 0, red_card: 0,
    conversions: 0, penalty_goals: 0, drop_goals: 0,
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
