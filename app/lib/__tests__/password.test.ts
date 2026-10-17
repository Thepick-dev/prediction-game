import { describe, it, expect } from 'vitest'
import { isValidPassword, MIN_PASSWORD_LENGTH } from '../password'

describe('isValidPassword', () => {
  it('rejects anything shorter than the minimum', () => {
    expect(isValidPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe(false)
  })

  it('accepts exactly the minimum length', () => {
    expect(isValidPassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBe(true)
  })

  it('accepts anything longer', () => {
    expect(isValidPassword('a'.repeat(MIN_PASSWORD_LENGTH + 10))).toBe(true)
  })
})
