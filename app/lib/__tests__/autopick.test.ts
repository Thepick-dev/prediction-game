import { describe, it, expect } from 'vitest'
import { deriveAutopick } from '../autopick'
import { createFakeSupabase } from './helpers/fake-supabase'

const basePlayers = [
  { id: 101, name: 'Player A', team_id: 1, value: 8.0 },  // valuable
  { id: 102, name: 'Player B', team_id: 1, value: 8.5 },  // valuable
  { id: 103, name: 'Player C', team_id: 2, value: 3.0 },  // below £5.5m threshold
  { id: 104, name: 'Player D', team_id: 3, value: 9.0 },  // valuable
  { id: 105, name: 'Player E', team_id: 3, value: 2.0 },  // below £5.5m threshold
]

function fakeFor(overrides: Record<string, any> = {}) {
  return createFakeSupabase({
    teams: [
      { id: 1, name: 'Team A' },
      { id: 2, name: 'Team B' },
      { id: 3, name: 'Team C' },
    ],
    team_league_positions: [
      { team_id: 3, position: 20, recorded_at: '2026-05-03' }, // worst-placed — picked first if available
      { team_id: 1, position: 10, recorded_at: '2026-05-03' },
      { team_id: 2, position: 5, recorded_at: '2026-05-03' },
    ],
    players: basePlayers,
    picks: [],
    tier_draft_picks: {},
    ...overrides,
  })
}

describe('deriveAutopick — determinism', () => {
  it('returns the exact same pick for the same user + gameweek every time (same input data)', async () => {
    const first = await deriveAutopick(fakeFor(), 'user-1', 'gw-1', 'comp-1')
    const second = await deriveAutopick(fakeFor(), 'user-1', 'gw-1', 'comp-1')
    expect(first).not.toBeNull()
    expect(second).toEqual(first)
  })
})

describe('deriveAutopick — team selection', () => {
  it('picks the worst-placed available active team', async () => {
    const result = await deriveAutopick(fakeFor(), 'user-1', 'gw-1', 'comp-1')
    expect(result?.team_id).toBe(3) // position 20, the worst of the three
  })

  it('excludes a normal (non-double-use) team once it has already been used once', async () => {
    const supabase = fakeFor({
      teams: [{ id: 1, name: 'Team A' }],
      team_league_positions: [{ team_id: 1, position: 10, recorded_at: '2026-05-03' }],
      picks: [{ team_id: 1, player1_id: 101, player2_id: 102 }],
      tier_draft_picks: {}, // team 1 is NOT a double-use team
    })
    const result = await deriveAutopick(supabase, 'user-1', 'gw-1', 'comp-1')
    expect(result).toBeNull() // no team left to pick
  })

  it('keeps a double-use (draft tier) team available after just one use', async () => {
    const supabase = fakeFor({
      teams: [{ id: 2, name: 'Team B' }],
      team_league_positions: [{ team_id: 2, position: 5, recorded_at: '2026-05-03' }],
      picks: [{ team_id: 2, player1_id: 101, player2_id: 102 }],
      tier_draft_picks: { tier1_team_id: 2, tier2_team_id: null, tier3_team_id: null, tier4_team_id: null },
    })
    const result = await deriveAutopick(supabase, 'user-1', 'gw-1', 'comp-1')
    expect(result?.team_id).toBe(2)
  })
})

describe('deriveAutopick — player value threshold', () => {
  it('only picks from players worth at least £5.5m when enough of them are available', async () => {
    const result = await deriveAutopick(fakeFor(), 'user-1', 'gw-1', 'comp-1')
    const valuableIds = [101, 102, 104]
    expect(valuableIds).toContain(result?.player1_id)
    expect(valuableIds).toContain(result?.player2_id)
  })

  it('falls back to the full player pool when fewer than 2 valuable players remain', async () => {
    // Use up both valuable players in team 1 twice each, leaving only one
    // valuable player (104) anywhere — too few to fill two slots.
    const supabase = fakeFor({
      picks: [
        { team_id: 1, player1_id: 101, player2_id: 102 },
        { team_id: 1, player1_id: 101, player2_id: 102 },
      ],
    })
    const result = await deriveAutopick(supabase, 'user-1', 'gw-1', 'comp-1')
    expect(result).not.toBeNull()
    // Proves the fallback kicked in: a below-threshold player (103 or 105)
    // had to be used since fewer than 2 valuable ones were left.
    const usedBelowThreshold = [result?.player1_id, result?.player2_id].some(id => id === 103 || id === 105)
    expect(usedBelowThreshold).toBe(true)
  })
})

describe('deriveAutopick — edge cases', () => {
  it('returns null when there are no active teams at all', async () => {
    const supabase = fakeFor({ teams: [] })
    const result = await deriveAutopick(supabase, 'user-1', 'gw-1', 'comp-1')
    expect(result).toBeNull()
  })

  it('returns null when fewer than 2 players exist at all', async () => {
    const supabase = fakeFor({ players: [basePlayers[0]] })
    const result = await deriveAutopick(supabase, 'user-1', 'gw-1', 'comp-1')
    expect(result).toBeNull()
  })
})
