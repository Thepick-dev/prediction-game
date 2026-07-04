import { SupabaseClient } from '@supabase/supabase-js'

export type POTWResult = {
  user_id: string
  display_name: string
  gameweek_id: string
  gameweek_number: number
  points: number
  team_id: number
  team_position: number
}

export async function getPlayerOfTheWeek(
  supabase: SupabaseClient,
  competition_id: string
): Promise<POTWResult | null> {

  const { data: gameweeks } = await supabase
    .from('gameweeks')
    .select('id, number, deadline, status')
    .eq('competition_id', competition_id)
    .eq('status', 'completed')
    .order('number', { ascending: false })

  if (!gameweeks || gameweeks.length === 0) return null

  const { data: points } = await supabase
    .from('points')
    .select('user_id, pick_id, total_points, gameweek_id')
    .eq('competition_id', competition_id)
    .in('gameweek_id', gameweeks.map(g => g.id))

  if (!points || points.length === 0) return null

  const maxPoints = Math.max(...points.map(p => p.total_points ?? 0))
  const topScorers = points.filter(p => (p.total_points ?? 0) === maxPoints)

  if (topScorers.length === 1) {
    const winner = topScorers[0]
    const gw = gameweeks.find(g => g.id === winner.gameweek_id)

    const { data: pick } = await supabase
      .from('picks')
      .select('team_id, user_id, submitted_at')
      .eq('id', winner.pick_id)
      .single()

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', winner.user_id)
      .single()

    return {
      user_id: winner.user_id,
      display_name: profile?.display_name ?? 'Unknown',
      gameweek_id: winner.gameweek_id,
      gameweek_number: gw?.number ?? 0,
      points: maxPoints,
      team_id: pick?.team_id ?? 0,
      team_position: 0
    }
  }

  const { data: leaguePositions } = await supabase
    .from('team_league_positions')
    .select('team_id, position')
    .order('recorded_at', { ascending: false })

  const seen = new Set()
  const positionMap: Record<number, number> = {}
  leaguePositions?.forEach(lp => {
    if (!seen.has(lp.team_id)) {
      seen.add(lp.team_id)
      positionMap[lp.team_id] = lp.position
    }
  })

  const pickIds = topScorers.map(p => p.pick_id)
  const { data: tiedPicks } = await supabase
    .from('picks')
    .select('id, user_id, team_id, submitted_at')
    .in('id', pickIds)

  const pickMap: Record<string, any> = {}
  tiedPicks?.forEach(p => { pickMap[p.id] = p })

  const sorted = topScorers.sort((a, b) => {
    const pickA = pickMap[a.pick_id]
    const pickB = pickMap[b.pick_id]

    const posA = positionMap[pickA?.team_id] ?? 0
    const posB = positionMap[pickB?.team_id] ?? 0
    if (posB !== posA) return posB - posA

    return new Date(pickA?.submitted_at ?? 0).getTime() - new Date(pickB?.submitted_at ?? 0).getTime()
  })

  const winner = sorted[0]
  const gw = gameweeks.find(g => g.id === winner.gameweek_id)
  const winnerPick = pickMap[winner.pick_id]

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', winner.user_id)
    .single()

  return {
    user_id: winner.user_id,
    display_name: profile?.display_name ?? 'Unknown',
    gameweek_id: winner.gameweek_id,
    gameweek_number: gw?.number ?? 0,
    points: maxPoints,
    team_id: winnerPick?.team_id ?? 0,
    team_position: positionMap[winnerPick?.team_id] ?? 0
  }
}