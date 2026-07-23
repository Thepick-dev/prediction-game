import { createServerSupabaseClient } from '../../lib/supabase-server'
import { NextResponse } from 'next/server'

async function getDoubleUseTeams(supabase: any, competition_id: string, user_id: string): Promise<number[]> {
  const { data } = await supabase
    .from('tier_draft_picks')
    .select('tier1_team_id, tier2_team_id, tier3_team_id, tier4_team_id')
    .eq('competition_id', competition_id)
    .eq('user_id', user_id)
    .single()

  if (!data) return []
  return [data.tier1_team_id, data.tier2_team_id, data.tier3_team_id, data.tier4_team_id]
    .filter((id): id is number => id != null)
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { gameweek_id, competition_id, team_id, player1_id, player2_id, is_banker, question_answer, comments } = await request.json()

  if (player1_id === player2_id) {
    return NextResponse.json({ error: 'Please pick two different players' }, { status: 400 })
  }

  const { data: team } = await supabase
    .from('teams')
    .select('active')
    .eq('id', team_id)
    .single()

  if (!team?.active) {
    return NextResponse.json({ error: 'That team is not currently active' }, { status: 400 })
  }

  // No foreign key exists between players.team_id and teams.id, so this is
  // a plain two-step lookup rather than a select(...) embed.
  const { data: pickedPlayers } = await supabase
    .from('players')
    .select('id, team_id')
    .in('id', [player1_id, player2_id])

  const pickedTeamIds = [...new Set((pickedPlayers ?? []).map(p => p.team_id))]
  const { data: pickedPlayersTeams } = await supabase
    .from('teams')
    .select('id, active')
    .in('id', pickedTeamIds)

  const activeTeamIds = new Set((pickedPlayersTeams ?? []).filter(t => t.active).map(t => t.id))
  const bothPlayersActive = pickedPlayers?.length === 2 && pickedPlayers.every(p => activeTeamIds.has(p.team_id))

  if (!bothPlayersActive) {
    return NextResponse.json({ error: 'One of the selected players is not on an active team' }, { status: 400 })
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
    .select('id, removed')
    .eq('competition_id', competition_id)
    .eq('user_id', user.id)
    .single()

  if (!entry || entry.removed) {
    return NextResponse.json({ error: 'You are not entered in this competition' }, { status: 400 })
  }

  const doubleUseTeams = await getDoubleUseTeams(supabase, competition_id, user.id)

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
        is_autopick: false,
        submitted_at: new Date().toISOString(),
        question_answer: question_answer ?? null,
        comments: comments ?? null
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
        is_banker,
        is_autopick: false,
        question_answer: question_answer ?? null,
        comments: comments ?? null
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

  const [{ data: pick }, { data: allPicks }] = await Promise.all([
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
      .eq('competition_id', competition_id!)
  ])

  const doubleUseTeams = await getDoubleUseTeams(supabase, competition_id!, user.id)

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