import { createServerSupabaseClient } from '../../lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { gameweek_id, competition_id, team_id, player1_id, player2_id, is_banker } = await request.json()

  if (player1_id === player2_id) {
    return NextResponse.json({ error: 'Please pick two different players' }, { status: 400 })
  }

  const { data: gameweek } = await supabase
    .from('gameweeks')
    .select('deadline, status')
    .eq('id', gameweek_id)
    .single()

  if (!gameweek) {
    return NextResponse.json({ error: 'Gameweek not found' }, { status: 404 })
  }

  if (new Date() > new Date(gameweek.deadline) || gameweek.status === 'locked') {
    return NextResponse.json({ error: 'Deadline has passed — picks are locked' }, { status: 400 })
  }

  const { data: entry } = await supabase
    .from('competition_entries')
    .select('id')
    .eq('competition_id', competition_id)
    .eq('user_id', user.id)
    .single()

  if (!entry) {
    return NextResponse.json({ error: 'You are not entered in this competition' }, { status: 400 })
  }

  const { data: draftPick } = await supabase
    .from('tier_draft_picks')
    .select('tier1_team_id, tier2_team_id, tier3_team_id')
    .eq('competition_id', competition_id)
    .eq('user_id', user.id)
    .single()

  const doubleUseTeams = draftPick
    ? [draftPick.tier1_team_id, draftPick.tier2_team_id, draftPick.tier3_team_id]
    : []

  const { data: allPicks } = await supabase
    .from('picks')
    .select('team_id, player1_id, player2_id, gameweek_id, is_banker')
    .eq('user_id', user.id)
    .eq('competition_id', competition_id)
    .neq('gameweek_id', gameweek_id)

  if (allPicks) {
    const teamUseCounts: Record<number, number> = {}
    allPicks.forEach(p => {
      teamUseCounts[p.team_id] = (teamUseCounts[p.team_id] || 0) + 1
    })

    const currentUses = teamUseCounts[team_id] || 0
    const maxUses = doubleUseTeams.includes(team_id) ? 2 : 1

    if (currentUses >= maxUses) {
      return NextResponse.json({
        error: doubleUseTeams.includes(team_id)
          ? 'You have already used this team twice'
          : 'You have already used this team in this competition'
      }, { status: 400 })
    }

    const playerCounts: Record<number, number> = {}
    allPicks.forEach(pick => {
      playerCounts[pick.player1_id] = (playerCounts[pick.player1_id] || 0) + 1
      playerCounts[pick.player2_id] = (playerCounts[pick.player2_id] || 0) + 1
    })

    if ((playerCounts[player1_id] || 0) >= 2) {
      return NextResponse.json({ error: 'You have already used this player twice' }, { status: 400 })
    }
    if ((playerCounts[player2_id] || 0) >= 2) {
      return NextResponse.json({ error: 'You have already used this player twice' }, { status: 400 })
    }

    if (is_banker) {
      const bankerCount = allPicks.filter(p => p.is_banker).length
      if (bankerCount >= 2) {
        return NextResponse.json({ error: 'You have already used both your bankers' }, { status: 400 })
      }
    }
  }

  const { data: existingPick } = await supabase
    .from('picks')
    .select('id, is_banker')
    .eq('user_id', user.id)
    .eq('gameweek_id', gameweek_id)
    .single()

  let error
  if (existingPick) {
    const { error: updateError } = await supabase
      .from('picks')
      .update({
        team_id,
        player1_id,
        player2_id,
        is_banker,
        submitted_at: new Date().toISOString()
      })
      .eq('id', existingPick.id)
    error = updateError
  } else {
    const { error: insertError } = await supabase
      .from('picks')
      .insert({
        user_id: user.id,
        competition_id,
        gameweek_id,
        team_id,
        player1_id,
        player2_id,
        is_banker
      })
    error = insertError
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const competition_id = searchParams.get('competition_id')
  const gameweek_id = searchParams.get('gameweek_id')

  const [{ data: pick }, { data: allPicks }, { data: draftPick }] = await Promise.all([
    supabase
      .from('picks')
      .select('*, teams(name), player1:players!picks_player1_id_fkey(name), player2:players!picks_player2_id_fkey(name)')
      .eq('user_id', user.id)
      .eq('gameweek_id', gameweek_id!)
      .single(),
    supabase
      .from('picks')
      .select('team_id, player1_id, player2_id, is_banker')
      .eq('user_id', user.id)
      .eq('competition_id', competition_id!),
    supabase
      .from('tier_draft_picks')
      .select('tier1_team_id, tier2_team_id, tier3_team_id')
      .eq('competition_id', competition_id!)
      .eq('user_id', user.id)
      .single()
  ])

  const doubleUseTeams = draftPick
    ? [draftPick.tier1_team_id, draftPick.tier2_team_id, draftPick.tier3_team_id]
    : []

  const teamUseCounts: Record<number, number> = {}
  allPicks?.forEach(p => {
    teamUseCounts[p.team_id] = (teamUseCounts[p.team_id] || 0) + 1
  })

  const usedTeams = Object.entries(teamUseCounts)
    .filter(([teamId, count]) => {
      const id = parseInt(teamId)
      const max = doubleUseTeams.includes(id) ? 2 : 1
      return count >= max
    })
    .map(([teamId]) => parseInt(teamId))

  const playerCounts: Record<number, number> = {}
  allPicks?.forEach(p => {
    playerCounts[p.player1_id] = (playerCounts[p.player1_id] || 0) + 1
    playerCounts[p.player2_id] = (playerCounts[p.player2_id] || 0) + 1
  })

  const bankersUsed = allPicks?.filter(p => p.is_banker).length ?? 0

  return NextResponse.json({
    pick,
    usedTeams,
    playerCounts,
    doubleUseTeams,
    bankersUsed
  })
}
