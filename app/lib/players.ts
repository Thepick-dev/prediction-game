export type PlayerForDisplay = {
  id: number
  name: string
  web_name?: string | null
  team_id: number
}

export type TeamForDisplay = {
  short_code?: string | null
  short_name?: string | null
  name: string
}

function shortenFullName(name: string) {
  const parts = name.split(' ')
  return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : name
}

// Builds a short display name per player: their FPL short name (or an
// initial+surname fallback) plus their club's short code in brackets,
// e.g. "Solanke (TOT)" — shown everywhere so same-surname players are
// never confused for each other.
export function buildPlayerDisplayNames(
  players: PlayerForDisplay[],
  teamMap: Record<number, TeamForDisplay>
): Record<number, string> {
  const result: Record<number, string> = {}
  players.forEach(p => {
    const base = p.web_name?.trim() || shortenFullName(p.name)
    const team = teamMap[p.team_id]
    const code = team?.short_code ?? team?.short_name ?? team?.name
    result[p.id] = code ? `${base} (${code})` : base
  })
  return result
}

// The one place the Bonus Card's label gets decided, reused everywhere it's
// shown (Picks, Results, Leaderboard, Rules, admin) so renaming it or
// renominating the player is never a hunt-and-replace across the codebase.
// An admin-set custom name always wins; otherwise it's built from whoever
// the live nomination currently is.
export function bonusCardDisplayName(customName: string | null | undefined, playerName: string | null | undefined): string {
  if (customName?.trim()) return customName.trim()
  if (playerName?.trim()) return `The ${playerName.trim()} Card`
  return 'The Bonus Card'
}
