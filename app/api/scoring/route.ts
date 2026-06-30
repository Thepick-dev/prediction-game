import { createServerSupabaseClient } from '../../lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()

  const { gameweek_id } = await request.json()

  if (!gameweek_id) {
    return NextResponse.json({ error: 'gameweek_id is required' }, { status: 400 })
  }

  const { data: gameweek } = await supabase
    .from('gameweeks')
    .select('id, number, competition_id')
    .eq('id', gameweek_id)
    .single()

  if (!gameweek) {
    return NextResponse.json({ error: 'Gameweek not found' }, { status: 404 })
  }

  const { data: picks } = await supabase
    .from('picks')
    .select('id, user_id, team_id, player1_id, player2_id, is_banker, competition_id')
    .eq('gameweek_id', gameweek_id)

  if (!picks || picks.length === 0) {
    return NextResponse.json({ message: 'No picks found for this gameweek', points_calculated: 0 })
  }

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, home_team_id, away_team_id, home_score, away_score, status')
    .eq('gameweek_id', gameweek_id)
    .eq('status', 'finished')

  const { data: quartiles } = await supabase
    .from('gameweek_quartiles')
    .select('team_id, quartile')
    .eq('gameweek_id', gameweek_id)

  const { data: scoringRules } = await supabase
    .from('competition_scoring_rules')
    .select('result_type, quartile_diff, points')
    .eq('competition_id', gameweek.competition_id)

  const { data: playerScoringRules } = await supabase
    .from('player_scoring_rules')
    .select('event_type, points')
    .eq('competition_id', gameweek.competition_id)

  const { data: matchEvents } = await supabase
    .from('match_events')
    .select('player_id, event_type, fixture_id')
    .in('fixture_id', fixtures?.map(f => f.id) ?? [])

  const quartileMap: Record<number, number> = {}
  quartiles?.forEach(q => { quartileMap[q.team_id] = q.quartile })

  const scoringMap: Record<string, number> = {}
  scoringRules?.forEach(r => {
    scoringMap[`${r.result_type}_${r.quartile_diff}`] = r.points
  })

  const playerPointsMap: Record<string, number> = {}
  playerScoringRules?.forEach(r => { playerPointsMap[r.event_type] = r.points })

  const fixtureMap: Record<number, any> = {}
  fixtures?.forEach(f => {
    if (f.home_team_id) fixtureMap[f.home_team_id] = f
    if (f.away_team_id) fixtureMap[f.away_team_id] = f
  })

  const playerEventsMap: Record<number, { goals: number; assists: number }> = {}
  matchEvents?.forEach(event => {
    if (!event.player_id) return
    if (!playerEventsMap[event.player_id]) {
      playerEventsMap[event.player_id] = { goals: 0, assists: 0 }
    }
    if (event.event_type === 'goal') playerEventsMap[event.player_id].goals++
    if (event.event_type === 'assist') playerEventsMap[event.player_id].assists++
  })

  function getTeamPoints(teamId: number): { points: number; breakdown: string } {
    const fixture = fixtureMap[teamId]
    if (!fixture || fixture.home_score === null || fixture.away_score === null) {
      return { points: 0, breakdown: 'No result' }
    }

    const isHome = fixture.home_team_id === teamId
    const teamScore = isHome ? fixture.home_score : fixture.away_score
    const opponentScore = isHome ? fixture.away_score : fixture.home_score
    const opponentId = isHome ? fixture.away_team_id : fixture.home_team_id

    const teamQuartile = quartileMap[teamId] ?? 2
    const opponentQuartile = quartileMap[opponentId] ?? 2
    const quartileDiff = opponentQuartile - teamQuartile

    let resultType: string
    if (teamScore > opponentScore) {
      resultType = isHome ? 'home_win' : 'away_win'
    } else if (teamScore === opponentScore) {
      resultType = isHome ? 'home_draw' : 'away_draw'
    } else {
      return { points: 0, breakdown: 'Loss' }
    }

    const clampedDiff = Math.max(-3, Math.min(3, quartileDiff))
    const key = `${resultType}_${clampedDiff}`
    const points = scoringMap[key] ?? 0

    return {
      points,
      breakdown: `${resultType} (Q diff: ${clampedDiff}) = ${points}pts`
    }
  }

  function getPlayerPoints(playerId: number): number {
    const events = playerEventsMap[playerId]
    if (!events) return 0
    const goalPoints = playerPointsMap['goal'] ?? 12
    const assistPoints = playerPointsMap['assist'] ?? 6
    return (events.goals * goalPoints) + (events.assists * assistPoints)
  }

  const pointsToUpsert = []

  for (const pick of picks) {
    const teamResult = getTeamPoints(pick.team_id)
    const player1Points = getPlayerPoints(pick.player1_id)
    const player2Points = getPlayerPoints(pick.player2_id)

    let teamPoints = teamResult.points
    let p1Points = player1Points
    let p2Points = player2Points

    if (pick.is_banker) {
      teamPoints *= 2
      p1Points *= 2
      p2Points *= 2
    }

    const totalPoints = teamPoints + p1Points + p2Points

    pointsToUpsert.push({
      pick_id: pick.id,
      user_id: pick.user_id,
      competition_id: pick.competition_id,
      gameweek_id,
      team_points: teamPoints,
      player1_points: p1Points,
      player2_points: p2Points,
      total_points: totalPoints,
      breakdown: {
        team: teamResult.breakdown,
        is_banker: pick.is_banker,
        player1_raw: player1Points,
        player2_raw: player2Points
      }
    })
  }

  const { error: upsertError } = await supabase
    .from('points')
    .upsert(pointsToUpsert, { onConflict: 'pick_id' })

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    points_calculated: pointsToUpsert.length,
    picks_processed: picks.length
  })
}