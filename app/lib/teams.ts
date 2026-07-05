export function abbr(name: string, shortName?: string | null) {
  return shortName ?? name.replace(' FC', '').replace(' AFC', '')
}

export function abbrFromMap(teamMap: Record<number, { name: string; short_name: string | null }>, id: number) {
  const team = teamMap[id]
  if (!team) return 'Unknown'
  return abbr(team.name, team.short_name)
}