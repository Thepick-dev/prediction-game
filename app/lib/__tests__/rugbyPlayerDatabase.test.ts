import { describe, it, expect } from 'vitest'
import { seasonWeight, capAverageRating } from '../rugbyPlayerDatabase'

describe('seasonWeight', () => {
  it('gives the most recent season full weight', () => {
    expect(seasonWeight(2026, 2026)).toBe(1.0)
  })

  it('applies the light taper Kit confirmed: 1 year back ~0.85, 2+ years back ~0.65', () => {
    expect(seasonWeight(2025, 2026)).toBe(0.85)
    expect(seasonWeight(2024, 2026)).toBe(0.65)
    expect(seasonWeight(2023, 2026)).toBe(0.65) // floors out, doesn't keep dropping
  })

  it('treats a season equal to or after "latest" as full weight (never a negative years-back edge case)', () => {
    expect(seasonWeight(2027, 2026)).toBe(1.0)
  })
})

describe('capAverageRating', () => {
  it('passes a null average through unchanged (no performances yet)', () => {
    expect(capAverageRating(null, 0)).toBeNull()
  })

  it('caps the Power Ranking itself for a player with zero caps, even if the blended average is higher', () => {
    expect(capAverageRating(92, 0)).toBe(65)
  })

  it('leaves a below-cap average untouched', () => {
    expect(capAverageRating(40, 0)).toBe(40)
  })

  it('lifts the cap entirely once a player has 5+ caps', () => {
    expect(capAverageRating(92, 5)).toBe(92)
  })
})
