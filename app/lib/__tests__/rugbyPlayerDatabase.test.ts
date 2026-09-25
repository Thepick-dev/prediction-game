import { describe, it, expect } from 'vitest'
import { seasonWeight } from '../rugbyPlayerDatabase'

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
