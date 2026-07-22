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
