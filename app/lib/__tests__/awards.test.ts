import { describe, it, expect } from 'vitest'
import { resolveWinners, computeCompetitionAwards, awardWinnerNames } from '../awards'

describe('resolveWinners', () => {
  const fmt = (c: { value: number }) => `${c.value} pts`

  it('names a single clear winner', () => {
    const result = resolveWinners(
      [{ name: 'Alice', value: 10 }, { name: 'Bob', value: 5 }],
      fmt
    )
    expect(result.winnerDisplay).toBe('Alice')
    expect(result.detail).toBe('10 pts')
    expect(result.tiedEntries).toBeNull()
  })

  it('joins exactly two tied winners with "&"', () => {
    const result = resolveWinners(
      [{ name: 'Alice', value: 10 }, { name: 'Bob', value: 10 }, { name: 'Cara', value: 3 }],
      fmt
    )
    expect(result.winnerDisplay).toBe('Alice & Bob')
    expect(result.tiedEntries).toBeNull()
  })

  it('collapses three or more tied winners into "Multiple players (N)" with the full list separately', () => {
    const result = resolveWinners(
      [{ name: 'Alice', value: 10 }, { name: 'Bob', value: 10 }, { name: 'Cara', value: 10 }],
      fmt
    )
    expect(result.winnerDisplay).toBe('Multiple players (3)')
    expect(result.tiedEntries).toEqual([
      { name: 'Alice', detail: '10 pts' },
      { name: 'Bob', detail: '10 pts' },
      { name: 'Cara', detail: '10 pts' },
    ])
  })

  it('reports "Not decided yet" when there are no candidates at all', () => {
    const result = resolveWinners([], fmt)
    expect(result.winnerDisplay).toBe('Not decided yet')
    expect(result.detail).toBe('')
    expect(result.tiedEntries).toBeNull()
  })

  it('reports "Not decided yet" when nobody has cleared the qualifying minimum', () => {
    const result = resolveWinners(
      [{ name: 'Alice', value: 0 }, { name: 'Bob', value: 0 }],
      fmt,
      { minQualifying: 1 }
    )
    expect(result.winnerDisplay).toBe('Not decided yet')
  })

  it('picks the lowest value when direction is "min", with no qualifying floor applied', () => {
    const result = resolveWinners(
      [{ name: 'Alice', value: 40 }, { name: 'Bob', value: 5 }],
      fmt,
      { direction: 'min' }
    )
    expect(result.winnerDisplay).toBe('Bob')
    expect(result.detail).toBe('5 pts')
  })

  it('includes each candidate\'s own extra-qualified detail in a multi-way tie', () => {
    const result = resolveWinners(
      [
        { name: 'Alice', value: 38, extra: '7' },
        { name: 'Bob', value: 38, extra: '3' },
        { name: 'Cara', value: 38, extra: '12' },
      ],
      c => `${c.value} pts (GW${c.extra})`
    )
    expect(result.winnerDisplay).toBe('Multiple players (3)')
    expect(result.tiedEntries).toEqual([
      { name: 'Alice', detail: '38 pts (GW7)' },
      { name: 'Bob', detail: '38 pts (GW3)' },
      { name: 'Cara', detail: '38 pts (GW12)' },
    ])
  })
})

describe('computeCompetitionAwards', () => {
  // Futzy outscores everyone but must never win an award — same "can lead,
  // can't be crowned" rule enforced elsewhere (Results' Season Leader,
  // Top Dog).
  const input = {
    entries: [{ user_id: 'alice' }, { user_id: 'bob' }, { user_id: 'futzy' }],
    profiles: [
      { id: 'alice', display_name: 'Alice' },
      { id: 'bob', display_name: 'Bob' },
      { id: 'futzy', display_name: 'Futzy' },
    ],
    isBotMap: { futzy: true },
    gameweeks: [{ id: 'gw1', number: 1 }],
    fixtures: [{ id: 100, gameweek_id: 'gw1' }],
    events: [{ player_id: 1, event_type: 'goal', fixture_id: 100 }],
    picks: [
      { id: 'p-alice', user_id: 'alice', player1_id: 1, player2_id: 2 },
      { id: 'p-bob', user_id: 'bob', player1_id: 3, player2_id: 4 },
      { id: 'p-futzy', user_id: 'futzy', player1_id: 5, player2_id: 6 },
    ],
    pointsData: [
      { user_id: 'alice', pick_id: 'p-alice', total_points: 20, player1_points: 12, player2_points: 0, breakdown: { team: 'home_win', is_banker: false }, gameweek_id: 'gw1' },
      { user_id: 'bob', pick_id: 'p-bob', total_points: 10, player1_points: 5, player2_points: 0, breakdown: { team: 'away_win', is_banker: false }, gameweek_id: 'gw1' },
      { user_id: 'futzy', pick_id: 'p-futzy', total_points: 100, player1_points: 0, player2_points: 0, breakdown: { team: null, is_banker: false }, gameweek_id: 'gw1' },
    ],
    playerDisplayNames: { 1: 'Player One', 2: 'Player Two', 3: 'Player Three', 4: 'Player Four' },
  }

  it('excludes the bot from every award even when it outscores everyone', () => {
    const { awards } = computeCompetitionAwards(input)
    const champion = awards.find(a => a.key === 'champion')!
    expect(champion.winnerDisplay).toBe('Alice')
    expect(champion.detail).toBe('20 pts')
  })

  it('credits goals to whichever human picked that player', () => {
    const { awards } = computeCompetitionAwards(input)
    const goldenBoot = awards.find(a => a.key === 'goldenBoot')!
    expect(goldenBoot.winnerDisplay).toBe('Alice')
  })

  it('aggregates the Talisman across whoever picked that player, bots included', () => {
    const { talisman } = computeCompetitionAwards(input)
    expect(talisman.winnerDisplay).toBe('Player One')
    expect(talisman.detail).toBe('12 pts combined')
  })

  it('ranks the Talisman on raw (non-Banker-doubled) points, with the doubled total shown alongside', () => {
    const bankeredInput = {
      ...input,
      pointsData: [
        // Alice bankered Player One: doubled to 12, raw was 6.
        { user_id: 'alice', pick_id: 'p-alice', total_points: 20, player1_points: 12, player2_points: 0, breakdown: { team: 'home_win', is_banker: true, player1_raw: 6, player2_raw: 0 }, gameweek_id: 'gw1' },
        // Bob's Player Three scored 8 raw, undoubled — beats Player One's 6 raw.
        { user_id: 'bob', pick_id: 'p-bob', total_points: 13, player1_points: 8, player2_points: 0, breakdown: { team: 'away_win', is_banker: false }, gameweek_id: 'gw1' },
        { user_id: 'futzy', pick_id: 'p-futzy', total_points: 100, player1_points: 0, player2_points: 0, breakdown: { team: null, is_banker: false }, gameweek_id: 'gw1' },
      ],
    }
    const { talisman } = computeCompetitionAwards(bankeredInput)
    expect(talisman.winnerDisplay).toBe('Player Three')
    expect(talisman.detail).toBe('8 pts combined')
  })

  it('shows the Banker-doubled total in brackets only when it differs from the raw total', () => {
    const bankeredInput = {
      ...input,
      picks: [{ id: 'p-alice', user_id: 'alice', player1_id: 1, player2_id: 2 }],
      entries: [{ user_id: 'alice' }],
      pointsData: [
        { user_id: 'alice', pick_id: 'p-alice', total_points: 20, player1_points: 12, player2_points: 0, breakdown: { team: 'home_win', is_banker: true, player1_raw: 6, player2_raw: 0 }, gameweek_id: 'gw1' },
      ],
    }
    const { talisman } = computeCompetitionAwards(bankeredInput)
    expect(talisman.winnerDisplay).toBe('Player One')
    expect(talisman.detail).toBe('6 pts combined (with Banker: 12)')
  })

  it('reports no entrants when everyone is a bot', () => {
    const result = computeCompetitionAwards({ ...input, entries: [{ user_id: 'futzy' }] })
    expect(result.hasEntrants).toBe(false)
    expect(result.awards).toEqual([])
  })
})

describe('awardWinnerNames', () => {
  it('returns the single winner', () => {
    expect(awardWinnerNames({ winnerDisplay: 'Alice', detail: '10 pts', tiedEntries: null })).toEqual(['Alice'])
  })

  it('splits a two-way "A & B" tie', () => {
    expect(awardWinnerNames({ winnerDisplay: 'Alice & Bob', detail: '10 pts', tiedEntries: null })).toEqual(['Alice', 'Bob'])
  })

  it('reads names from tiedEntries for a three-or-more-way tie', () => {
    const award = {
      winnerDisplay: 'Multiple players (3)',
      detail: '10 pts',
      tiedEntries: [{ name: 'Alice', detail: '10 pts' }, { name: 'Bob', detail: '10 pts' }, { name: 'Cara', detail: '10 pts' }],
    }
    expect(awardWinnerNames(award)).toEqual(['Alice', 'Bob', 'Cara'])
  })

  it('returns an empty list when nobody has won it yet', () => {
    expect(awardWinnerNames({ winnerDisplay: 'Not decided yet', detail: '', tiedEntries: null })).toEqual([])
  })
})
