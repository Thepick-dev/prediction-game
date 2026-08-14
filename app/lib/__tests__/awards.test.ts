import { describe, it, expect } from 'vitest'
import { resolveWinners } from '../awards'

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
