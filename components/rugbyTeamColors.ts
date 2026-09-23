// Six Nations team colours for the rugby matchday theme (see globals.css,
// .rugby-theme) — keyed by short_code exactly as stored in rugby.teams,
// so any page with a team row (id, name, short_code) can look this up
// directly. Not stored in the database: these are fixed national colours,
// not something an admin would ever need to edit per competition.
export type RugbyTeamColour = { primary: string; secondary: string }

export const RUGBY_TEAM_COLOURS: Record<string, RugbyTeamColour> = {
  ENG: { primary: 'var(--rugby-eng)', secondary: 'var(--rugby-eng-2)' },
  SCO: { primary: 'var(--rugby-sco)', secondary: 'var(--rugby-sco-2)' },
  ITA: { primary: 'var(--rugby-ita)', secondary: 'var(--rugby-ita-2)' },
  WAL: { primary: 'var(--rugby-wal)', secondary: 'var(--rugby-wal-2)' },
  IRE: { primary: 'var(--rugby-ire)', secondary: 'var(--rugby-ire-2)' },
  FRA: { primary: 'var(--rugby-fra)', secondary: 'var(--rugby-fra-2)' },
}

const FALLBACK: RugbyTeamColour = { primary: 'var(--rugby-ink-3)', secondary: 'var(--rugby-ink-2)' }

export function rugbyTeamColour(shortCode: string | null | undefined): RugbyTeamColour {
  if (!shortCode) return FALLBACK
  return RUGBY_TEAM_COLOURS[shortCode.toUpperCase()] ?? FALLBACK
}

export function rugbyTeamGradient(shortCode: string | null | undefined): string {
  const c = rugbyTeamColour(shortCode)
  return `linear-gradient(100deg, ${c.primary}, ${c.secondary})`
}
