import { describe, it, expect } from 'vitest'
import { resolveSkin, resolvePopArtVariant } from '../useSkin'

describe('resolveSkin', () => {
  it('uses the global skin when there is no admin preview', () => {
    expect(resolveSkin('pop-art', false, null)).toBe('pop-art')
    expect(resolveSkin('retro', false, null)).toBe('retro')
  })

  it('ignores a stored preview for a non-admin, even if one exists', () => {
    // e.g. a non-admin who poked localStorage via devtools — never honoured.
    expect(resolveSkin('pop-art', false, 'retro')).toBe('pop-art')
  })

  it("lets an admin's own preview override the global skin", () => {
    expect(resolveSkin('pop-art', true, 'retro')).toBe('retro')
    expect(resolveSkin('retro', true, 'pop-art')).toBe('pop-art')
  })

  it('falls back to the global skin once an admin clears their preview', () => {
    expect(resolveSkin('retro', true, null)).toBe('retro')
  })
})

describe('resolvePopArtVariant', () => {
  it('uses the global variant when there is no admin preview', () => {
    expect(resolvePopArtVariant('v1', false, null)).toBe('v1')
    expect(resolvePopArtVariant('v2', false, null)).toBe('v2')
  })

  it('ignores a stored preview for a non-admin, even if one exists', () => {
    expect(resolvePopArtVariant('v1', false, 'v2')).toBe('v1')
  })

  it("lets an admin's own preview override the global variant", () => {
    expect(resolvePopArtVariant('v1', true, 'v2')).toBe('v2')
    expect(resolvePopArtVariant('v2', true, 'v1')).toBe('v1')
  })

  it('falls back to the global variant once an admin clears their preview', () => {
    expect(resolvePopArtVariant('v2', true, null)).toBe('v2')
  })
})
