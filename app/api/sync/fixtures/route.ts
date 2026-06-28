import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createServerSupabaseClient()

  const response = await fetch(
    'https://api.football-data.org/v4/competitions/PL/matches?season=2025',
    {
      headers: {
        'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY!
      }
    }
  )

  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to fetch fixtures' }, { status: 500 })
  }

  const data = await response.json()
  const matches = data.matches

  const { error } = await supabase
    .from('fixtures')
    .upsert(
      matches.map((match: any) => ({
        id: match.id,
        home_team_id: match.homeTeam.id,
        away_team_id: match.awayTeam.id,
        kickoff_time: match.utcDate,
        status: match.status === 'FINISHED' ? 'finished' :
                match.status === 'IN_PLAY' ? 'live' :
                match.status === 'POSTPONED' ? 'postponed' : 'scheduled',
        home_score: match.score.fullTime.home,
        away_score: match.score.fullTime.away,
        matchday: match.matchday,
        season: '2025'
      })),
      { onConflict: 'id' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from('api_sync_log').insert({
    sync_type: 'fixtures',
    status: 'success',
    records_updated: matches.length
  })

  return NextResponse.json({ success: true, fixtures_imported: matches.length })
}
