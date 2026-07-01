import { createServerSupabaseClient } from '../../lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ message: 'Autopick route active' })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()

  const { gameweek_id } = await request.json()

  if (!gameweek_id) {
    return NextResponse.json({ error: 'gameweek_id is required' }, { status: 400 })
  }

  const { data: gameweek } = await supabase
    .from('gameweeks')
    .select('id, competition_id, deadline, status')
    .eq('id', gameweek_id)
    .single()

  if (!gameweek) {
    return NextResponse.json({ error: 'Gameweek not found' }, { status: 404 })
  }

  if (new Date() < new Date(gameweek.deadline)) {
    return NextResponse.json({ error: 'Deadline has not passed yet' }, { status: 400 })
  }

  const { data: entries } = await supabase
    .from('competition_entries')
    .select('user_id')
    .eq('competition_id', gameweek.competition_id)
    .eq('removed', false)

  const { data: existingPicks } = await supabase
    .from('picks')
    .select('user_id')
    .eq('gameweek_id', gameweek_id)

  const existingPickUserIds = new Set(existingPicks?.map(p => p.user_id) ?? [])
  const missingUsers = entries?.filter(e => !existingPickUserIds.has(e.user_id)) ?? []

  if (missingUsers.length === 0) {
    return NextResponse.json({ success: true, autopicks_created: 0, message: 'All players have picks' })
  }

  const { data: allTeams } = await supabase
    .from('teams')
    .select('id, name')
    .order('name')

  const { data: leaguePositions } = await supabase
    .from('team_league_positions')
    .select('team_id, position')
    .order('recorded_at', { ascending: false })

  const seen = new Set()
  const latestPositions: Record<number, number> = {}
  leaguePositions?.forEach(lp => {
    if (!seen.has(lp.team_id)) {
      seen.add(lp.team_id)
      latestPositions[lp.team_id] = lp.position
    }
  })

  const { data: allPlayers } = await supabase
    .from('players')
    .select('id, name, team_id')

  let autopicksCreated = 0

  for (const entry of missingUsers) {
    const userId = entry.user_id

    const { data: userPicks } = await supabase
      .from('picks')
      .select('team_id, player1_id, player2_id')
      .eq('user_id', userId)
      .eq('competition_id', gameweek.competition_id)

    const { data: userDraftPicks } = await supabase
      .from('draft_picks')
      .select('team_id')
      .eq('competition_id', gameweek.competition_id)
      .eq('user_id', userId)

    const doubleUseTeams = userDraftPicks?.map(p => p.team_id) ?? []

    const teamUseCounts: Record<number, number> = {}
    userPicks?.forEach(p => {
      teamUseCounts[p.team_id] = (teamUseCounts[p.team_id] || 0) + 1
    })

    const playerUseCounts: Record<number, number> = {}
    userPicks?.forEach(p => {
      playerUseCounts[p.player1_id] = (playerUseCounts[p.player1_id] || 0) + 1
      playerUseCounts[p.player2_id] = (playerUseCounts[p.player2_id] || 0) + 1
    })

    const availableTeams = allTeams?.filter(team => {
      const uses = teamUseCounts[team.id] || 0
      const maxUses = doubleUseTeams.includes(team.id) ? 2 : 1
      return uses < maxUses
    }) ?? []

    let selectedTeam = null

    if (Object.keys(latestPositions).length > 0) {
      const sorted = [...availableTeams].sort((a, b) => {
        const posA = latestPositions[a.id] ?? 0
        const posB = latestPositions[b.id] ?? 0
        return posB - posA
      })
      selectedTeam = sorted[0]
    } else {
      const sorted = [...availableTeams].sort((a, b) => a.name.localeCompare(b.name))
      selectedTeam = sorted[0]
    }

    if (!selectedTeam) continue

    const availablePlayers = allPlayers?.filter(p => {
      const uses = playerUseCounts[p.id] || 0
      return uses < 2
    }) ?? []

    if (availablePlayers.length < 2) continue

    const shuffled = [...availablePlayers].sort(() => Math.random() - 0.5)

    let player1 = shuffled[0]
    let player2 = shuffled.find(p => p.team_id !== player1.team_id) ?? shuffled[1]

    if (!player1 || !player2 || player1.id === player2.id) continue

    const { error } = await supabase
      .from('picks')
      .insert({
        user_id: userId,
        competition_id: gameweek.competition_id,
        gameweek_id,
        team_id: selectedTeam.id,
        player1_id: player1.id,
        player2_id: player2.id,
        is_banker: false,
        is_autopick: true
      })

    if (!error) autopicksCreated++
  }

  return NextResponse.json({
    success: true,
    autopicks_created: autopicksCreated,
    missing_users: missingUsers.length
  })
}