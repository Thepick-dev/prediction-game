// Each nation's own real shirt colours — used anywhere a team or a squad
// pick needs to visually read as "itself" rather than one generic accent
// colour for every team (match-prediction pick buttons, Dream Team cards).
export const RUGBY_TEAM_COLOURS: Record<string, { fill: string; text: string }> = {
  England: { fill: '#FFFFFF', text: '#C8102E' },
  Ireland: { fill: '#169B62', text: '#FFFFFF' },
  Wales: { fill: '#C8102E', text: '#FFFFFF' },
  Scotland: { fill: '#0C1E3C', text: '#FFFFFF' },
  France: { fill: '#0055A4', text: '#FFFFFF' },
  Italy: { fill: '#0088CE', text: '#FFFFFF' },
}
export const DEFAULT_TEAM_COLOURS = { fill: 'var(--rugby-ink-3)', text: 'var(--rugby-text)' }
export const DRAW_COLOURS = { fill: 'var(--rugby-floodlight)', text: '#001a12' }

export function rugbyTeamColours(name: string): { fill: string; text: string } {
  return RUGBY_TEAM_COLOURS[name] ?? DEFAULT_TEAM_COLOURS
}

// A team's raw shirt colour (e.g. Scotland's navy) is sometimes too dark to
// read as plain text directly on this app's near-black panels — this picks
// the team's own contrast colour instead whenever that would happen, so a
// label never goes "grey/dark text on a dark background" illegible.
function relativeLuminance(hex: string): number {
  const c = hex.replace('#', '')
  if (c.length !== 6) return 1
  const r = parseInt(c.slice(0, 2), 16) / 255
  const g = parseInt(c.slice(2, 4), 16) / 255
  const b = parseInt(c.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function rugbyLabelColour(name: string): string {
  const c = rugbyTeamColours(name)
  if (c.fill.startsWith('#') && relativeLuminance(c.fill) < 0.35) return c.text
  return c.fill
}

// The "v2" bold-colour-on-white palette (Kit, 2026-09-25 concept + design
// note) — a separate set from RUGBY_TEAM_COLOURS above, not a replacement:
// that one is tuned for the dark theme (England = plain white, a bright
// accent against black, which disappears on a white page). England gets
// a proper solid colour here for the first time — deep navy, kept
// distinct from Scotland's brighter Saltire blue.
export const RUGBY_TEAM_COLOURS_V2: Record<string, { fill: string; text: string }> = {
  England: { fill: '#1D2D5C', text: '#FFFFFF' },
  Ireland: { fill: '#169B62', text: '#FFFFFF' },
  Wales: { fill: '#C8102E', text: '#FFFFFF' },
  Scotland: { fill: '#0065BD', text: '#FFFFFF' },
  France: { fill: '#0055A4', text: '#FFFFFF' },
  Italy: { fill: '#0088CE', text: '#FFFFFF' },
}
export const DEFAULT_TEAM_COLOURS_V2 = { fill: '#4B4F57', text: '#FFFFFF' }
export const DRAW_COLOURS_V2 = { fill: '#FFB612', text: '#14171C' }

export function rugbyTeamColoursV2(name: string): { fill: string; text: string } {
  return RUGBY_TEAM_COLOURS_V2[name] ?? DEFAULT_TEAM_COLOURS_V2
}

// "rb3" palette, used by the Picks page's match-prediction carousel.
// Fill values now point at the exact same --rugby-* custom properties
// the rest of the site (fixture/result cards, badges) uses for each
// nation, rather than its own separate hardcoded hex set — the two had
// drifted apart (e.g. England rendered white here, red everywhere
// else), which is exactly the kind of same-team-different-colour
// mismatch that reads as "old and new styles blended together."
export const RUGBY_TEAM_COLOURS_RB3: Record<string, { fill: string; text: string }> = {
  England: { fill: 'var(--rugby-eng)', text: '#ffffff' },
  Ireland: { fill: 'var(--rugby-ire)', text: '#0A0B0D' },
  Wales: { fill: 'var(--rugby-wal)', text: '#ffffff' },
  Scotland: { fill: 'var(--rugby-sco)', text: '#ffffff' },
  France: { fill: 'var(--rugby-fra)', text: '#ffffff' },
  Italy: { fill: 'var(--rugby-ita)', text: '#0A0B0D' },
}
export const DEFAULT_TEAM_COLOURS_RB3 = { fill: 'var(--rugby-ink-3)', text: '#f2f0ea' }
export const DRAW_COLOURS_RB3 = { fill: 'var(--rugby-floodlight-2)', text: '#0a0b0d' }

export function rugbyTeamColoursRb3(name: string): { fill: string; text: string } {
  return RUGBY_TEAM_COLOURS_RB3[name] ?? DEFAULT_TEAM_COLOURS_RB3
}
