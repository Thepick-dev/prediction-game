import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createServerSupabaseClient()

  const response = await fetch(
    'https://fantasy.premierleague.com/api/bootstrap-static/',
    { headers: { 'User-Agent': 'prediction-game/1.0' } }
  )

  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to fetch FPL data' }, { status: 500 })
  }

  const data = await response.json()

  const players = data.elements.map((player: any) => ({
    id: player.id,
    name: `${player.first_name} ${player.second_name}`,
    position: player.element_type === 1 ? 'GK' :
              player.element_type === 2 ? 'DEF' :
              player.element_type === 3 ? 'MID' : 'FWD',
    team_id: player.team
  }))

  const { error: playersError } = await supabase
    .from('players')
    .upsert(players, { onConflict: 'id' })

  if (playersError) {
    return NextResponse.json({ error: playersError.message }, { status: 500 })
  }

  await supabase.from('api_sync_log').insert({
    sync_type: 'fpl',
    status: 'success',
    records_updated: players.length
  })

  return NextResponse.json({
    success: true,
    players_imported: players.length
  })
}