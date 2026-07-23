import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/require-admin'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createServerSupabaseClient()
  if (!(await requireAdmin(supabase))) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const standingsRes = await fetch(
    'https://api.football-data.org/v4/competitions/PL/standings?season=2026',
    {
      headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY! }
    }
  )

  if (!standingsRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch standings' }, { status: 500 })
  }

  const standingsData = await standingsRes.json()

  const table = standingsData?.standings?.[0]?.table

  if (!table || table.length === 0) {
    return NextResponse.json({ success: true, message: 'No standings data available yet', records_updated: 0 })
  }

  const rows = table.map((entry: any) => ({
    team_id: entry.team.id,
    position: entry.position,
    played: entry.playedGames,
    won: entry.won,
    drawn: entry.draw,
    lost: entry.lost,
    goals_for: entry.goalsFor,
    goals_against: entry.goalsAgainst,
    goal_difference: entry.goalDifference,
    points: entry.points,
    recorded_at: new Date().toISOString(),
    season: '2026'
  }))

  const { error } = await supabase
    .from('team_league_positions')
    .insert(rows)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from('api_sync_log').insert({
    sync_type: 'standings',
    status: 'success',
    records_updated: rows.length
  })

  return NextResponse.json({
    success: true,
    records_updated: rows.length,
    message: `Standings synced — ${rows.length} teams updated`
  })
}