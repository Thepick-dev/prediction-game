import { describe, it, expect } from 'vitest'
import { extractTeamStats } from '../sportsApiProClient'

// Shape confirmed live against a real match (/match/{id}/statistics,
// Leicester Tigers v Saracens, 2026-09-27) — stats grouped under named
// sections, each item keyed rather than positioned.
function realShapedResponse(overrides: Partial<Record<string, { home: string; away: string }>> = {}) {
  const defaults: Record<string, { home: string; away: string }> = {
    scrumsAccuracy: { home: '4/4 (100%)', away: '6/7 (86%)' },
    lineoutsAccuracy: { home: '11/14 (79%)', away: '14/15 (93%)' },
    turnovers: { home: '17', away: '13' },
    turnoversWon: { home: '2', away: '3' },
    penaltiesConceded: { home: '10', away: '8' },
    ...overrides,
  }
  return {
    statistics: [{
      period: 'ALL',
      groups: [
        { groupName: 'Possession', statisticsItems: [{ key: 'possession', home: '50%', away: '50%' }] },
        {
          groupName: 'Other',
          statisticsItems: [
            { key: 'scrumsAccuracy', ...defaults.scrumsAccuracy },
            { key: 'lineoutsAccuracy', ...defaults.lineoutsAccuracy },
            { key: 'turnovers', ...defaults.turnovers },
            { key: 'turnoversWon', ...defaults.turnoversWon },
          ],
        },
        { groupName: 'Penalty', statisticsItems: [{ key: 'penaltiesConceded', ...defaults.penaltiesConceded }] },
      ],
    }],
  }
}

describe('extractTeamStats', () => {
  it('parses a real-shaped response into home/away team stats', () => {
    const result = extractTeamStats(realShapedResponse())
    expect(result).toEqual({
      home: { scrumsWon: 4, scrumsAttempted: 4, lineoutsWon: 11, lineoutsAttempted: 14, turnoversWon: 2, turnoversConceded: 17, penaltiesConceded: 10 },
      away: { scrumsWon: 6, scrumsAttempted: 7, lineoutsWon: 14, lineoutsAttempted: 15, turnoversWon: 3, turnoversConceded: 13, penaltiesConceded: 8 },
    })
  })

  it('returns null when the response has no statistics at all', () => {
    expect(extractTeamStats({})).toBeNull()
  })

  it('returns null when the core pack fields are missing, rather than guessing zeroes', () => {
    const data = {
      statistics: [{ groups: [{ statisticsItems: [{ key: 'possession', home: '50%', away: '50%' }] }] }],
    }
    expect(extractTeamStats(data as any)).toBeNull()
  })

  it('still returns turnovers/penalties even when scrums/lineouts are absent (nulls, not zeroes)', () => {
    const data = realShapedResponse()
    data.statistics[0].groups[1].statisticsItems = data.statistics[0].groups[1].statisticsItems.filter(i => i.key !== 'scrumsAccuracy' && i.key !== 'lineoutsAccuracy')
    const result = extractTeamStats(data)
    expect(result?.home.scrumsWon).toBeNull()
    expect(result?.home.scrumsAttempted).toBeNull()
    expect(result?.home.turnoversConceded).toBe(17)
  })
})
