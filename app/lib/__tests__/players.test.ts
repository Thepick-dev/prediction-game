import { describe, it, expect } from 'vitest'
import { buildPlayerDisplayNames } from '../players'

describe('buildPlayerDisplayNames', () => {
  const teamMap = {
    1: { short_code: 'TOT', short_name: 'Tottenham', name: 'Tottenham Hotspur FC' },
    2: { short_code: null, short_name: 'Bournemouth', name: 'AFC Bournemouth' },
    3: { short_code: null, short_name: null, name: 'Some Club FC' },
  }

  it('prefers the web_name plus the club short code, e.g. "Solanke (TOT)"', () => {
    const result = buildPlayerDisplayNames(
      [{ id: 1, name: 'Dominic Solanke', web_name: 'Solanke', team_id: 1 }],
      teamMap
    )
    expect(result[1]).toBe('Solanke (TOT)')
  })

  it('falls back to short_name when short_code is missing', () => {
    const result = buildPlayerDisplayNames(
      [{ id: 2, name: 'Some Player', web_name: 'Player', team_id: 2 }],
      teamMap
    )
    expect(result[2]).toBe('Player (Bournemouth)')
  })

  it('falls back to an initial + surname when web_name is missing', () => {
    const result = buildPlayerDisplayNames(
      [{ id: 3, name: 'Dominic Solanke', web_name: null, team_id: 1 }],
      teamMap
    )
    expect(result[3]).toBe('D. Solanke (TOT)')
  })

  it('shows a single-word name as-is when there is no surname to abbreviate to', () => {
    const result = buildPlayerDisplayNames(
      [{ id: 4, name: 'Ronaldinho', web_name: null, team_id: 1 }],
      teamMap
    )
    expect(result[4]).toBe('Ronaldinho (TOT)')
  })

  it('falls all the way back to the full club name when short_code and short_name are both missing', () => {
    const result = buildPlayerDisplayNames(
      [{ id: 5, name: 'Someone Else', web_name: 'Else', team_id: 3 }],
      teamMap
    )
    expect(result[5]).toBe('Else (Some Club FC)')
  })

  it('drops the club suffix entirely when the player\'s team is not in the map at all', () => {
    const result = buildPlayerDisplayNames(
      [{ id: 6, name: 'Someone Else', web_name: 'Else', team_id: 999 }],
      teamMap
    )
    expect(result[6]).toBe('Else')
  })
})
