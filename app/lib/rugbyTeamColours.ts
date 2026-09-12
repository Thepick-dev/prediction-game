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
export const DEFAULT_TEAM_COLOURS = { fill: 'var(--pop-blue)', text: 'var(--pop-black)' }
export const DRAW_COLOURS = { fill: 'var(--pop-pink)', text: 'var(--pop-white)' }

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
