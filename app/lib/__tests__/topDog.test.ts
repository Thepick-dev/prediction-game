import { describe, it, expect } from 'vitest'
import { computeTopDog } from '../topDog'

// weekly_points arrays are indexed by gameweek NUMBER (1-based, like the
// real data from app/leaderboard/page.tsx), so index 0 is always a spacer.

describe('computeTopDog', () => {
  it('crowns nobody until someone has a sole lead', () => {
    // GW1 is a flat tie — nobody is ahead yet.
    const result = computeTopDog(
      [1],
      { alice: [0,10], bob: [0,10] },
      {},
      [],
      {}
    )
    expect(result.leaderUserId).toBeNull()
    expect(result.reignWeeks).toBe(0)
  })

  it('crowns the sole leader and grows the reign each week they stay ahead', () => {
    const result = computeTopDog(
      [1, 2, 3],
      { alice: [0,10, 5, 5], bob: [0,8, 5, 5] },
      {},
      [],
      {}
    )
    expect(result.leaderUserId).toBe('alice')
    expect(result.reignWeeks).toBe(3)
  })

  it('only changes hands on a clear, sole overtake', () => {
    const result = computeTopDog(
      [1, 2, 3],
      { alice: [0,10, 0, 0], bob: [0,5, 20, 0] },
      {},
      [],
      {}
    )
    // GW1: alice 10 vs bob 5 -> alice leads (1 week)
    // GW2: alice 10 vs bob 25 -> bob overtakes outright (1 week)
    // GW3: alice 10 vs bob 25 -> unchanged, bob's reign grows to 2
    expect(result.leaderUserId).toBe('bob')
    expect(result.reignWeeks).toBe(2)
  })

  it('leaves the belt with the incumbent through a tie at the top', () => {
    const result = computeTopDog(
      [1, 2, 3],
      { alice: [0,10, 5, 0], bob: [0,4, 11, 0] },
      {},
      [],
      {}
    )
    // GW1: alice leads outright (10 vs 4), reign = 1.
    // GW2: cumulative alice=15, bob=15 -> tie, alice keeps the belt, reign grows to 2.
    // GW3: still tied (no more points) -> alice keeps it, reign grows to 3.
    expect(result.leaderUserId).toBe('alice')
    expect(result.reignWeeks).toBe(3)
  })

  it('excludes bots from ever holding the belt, even if they top the table', () => {
    const result = computeTopDog(
      [1, 2],
      { futzy: [0,100, 100], alice: [0,10, 10] },
      { futzy: true },
      [],
      {}
    )
    expect(result.leaderUserId).toBe('alice')
    expect(result.reignWeeks).toBe(2)
  })

  it('folds bonus card points into the correct gameweek only', () => {
    const result = computeTopDog(
      [1, 2],
      { alice: [0,10, 0], bob: [0,8, 0] },
      {},
      [{ user_id: 'bob', gameweek_id: 'gw1', points: 5 }],
      { gw1: 1 }
    )
    // GW1: alice 10 vs bob 8+5=13 -> bob leads outright, reign grows through GW2.
    expect(result.leaderUserId).toBe('bob')
    expect(result.reignWeeks).toBe(2)
  })
})
