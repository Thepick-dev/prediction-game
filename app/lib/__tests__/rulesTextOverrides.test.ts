import { describe, it, expect } from 'vitest'
import { resolveRulesText, defaultTextFor } from '../rulesTextOverrides'
import { RULES_TEXT } from '../rulesText'

describe('resolveRulesText', () => {
  it('returns the hardcoded defaults when there are no overrides', () => {
    expect(resolveRulesText({})).toEqual(RULES_TEXT)
  })

  it('splits a paragraph section on blank lines', () => {
    const result = resolveRulesText({ banker: 'First paragraph.\n\nSecond paragraph.' })
    expect(result.banker).toEqual(['First paragraph.', 'Second paragraph.'])
  })

  it('splits tiebreakers on single lines, not blank lines', () => {
    const result = resolveRulesText({ tiebreakers: 'Total points\nMost goals' })
    expect(result.tiebreakers).toEqual(['Total points', 'Most goals'])
  })

  it('keeps scoringIntro as a single string', () => {
    const result = resolveRulesText({ scoringIntro: '  A custom intro line.  ' })
    expect(result.scoringIntro).toBe('A custom intro line.')
  })

  it('treats an empty or whitespace-only override as no override at all', () => {
    const result = resolveRulesText({ banker: '   ' })
    expect(result.banker).toEqual(RULES_TEXT.banker)
  })

  it('leaves sections with no override untouched', () => {
    const result = resolveRulesText({ banker: 'Custom banker text.' })
    expect(result.futzy).toEqual(RULES_TEXT.futzy)
  })
})

describe('defaultTextFor', () => {
  it('joins a paragraph section with blank lines', () => {
    expect(defaultTextFor('banker')).toBe(RULES_TEXT.banker.join('\n\n'))
  })

  it('joins tiebreakers with single newlines', () => {
    expect(defaultTextFor('tiebreakers')).toBe(RULES_TEXT.tiebreakers.join('\n'))
  })

  it('returns scoringIntro as-is', () => {
    expect(defaultTextFor('scoringIntro')).toBe(RULES_TEXT.scoringIntro)
  })
})
