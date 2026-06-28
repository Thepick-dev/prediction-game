import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createServerSupabaseClient()

  const response = await fetch(
    'https://api.football-data.org/v4/competitions/PL/teams?season=2025',
    {
      headers: {
        'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY!
      }
    }
  )

  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 })
  }

  const data = await response.json()
  const teams = data.teams

  const { error } = await supabase
    .from('teams')
    .upsert(
      teams.map((team: any) => ({
        id: team.id,
        name: team.name,
        short_name: team.shortName,
        crest_url: team.crest
      })),
      { onConflict: 'id' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from('api_sync_log').insert({
    sync_type: 'teams',
    status: 'success',
    records_updated: teams.length
  })

  return NextResponse.json({ success: true, teams_imported: teams.length })
}