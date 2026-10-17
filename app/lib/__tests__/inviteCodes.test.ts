import { describe, it, expect } from 'vitest'
import { isInviteCodeUsable } from '../inviteCodes'

describe('isInviteCodeUsable', () => {
  it('rejects a deactivated code regardless of its use count', () => {
    expect(isInviteCodeUsable({ active: false, max_uses: null, uses_count: 0 })).toBe(false)
  })

  it('accepts an active code with no max_uses (unlimited) no matter how many times it has been used', () => {
    expect(isInviteCodeUsable({ active: true, max_uses: null, uses_count: 500 })).toBe(true)
  })

  it('accepts an active code still under its max_uses', () => {
    expect(isInviteCodeUsable({ active: true, max_uses: 5, uses_count: 4 })).toBe(true)
  })

  it('rejects a code that has reached its max_uses', () => {
    expect(isInviteCodeUsable({ active: true, max_uses: 5, uses_count: 5 })).toBe(false)
  })

  it('rejects a code that has somehow gone past its max_uses', () => {
    expect(isInviteCodeUsable({ active: true, max_uses: 1, uses_count: 2 })).toBe(false)
  })

  it('accepts a single-use code that has not been used yet', () => {
    expect(isInviteCodeUsable({ active: true, max_uses: 1, uses_count: 0 })).toBe(true)
  })
})
