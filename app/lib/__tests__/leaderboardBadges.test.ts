import { describe, it, expect } from 'vitest'
import { truncateDisplayName } from '../leaderboardBadges'

describe('truncateDisplayName', () => {
  it('leaves names at or under the limit untouched', () => {
    expect(truncateDisplayName('Matt')).toBe('Matt')
    expect(truncateDisplayName('Adders')).toBe('Adders')
  })

  it('cuts longer names to the limit', () => {
    expect(truncateDisplayName('majoringram')).toBe('majori')
  })

  it('respects a custom limit', () => {
    expect(truncateDisplayName('Charlotte', 4)).toBe('Char')
  })

  it('cuts cleanly around an emoji rather than slicing its surrogate pair', () => {
    // "DrStoobz" is 8 chars, so a 6-char cut lands entirely before the
    // emoji — this would still render as a broken glyph with a naive
    // .slice(0, 6) on some inputs, so this locks in the Array.from approach.
    expect(truncateDisplayName('DrStoobz💉', 6)).toBe('DrStoo')
  })
})
