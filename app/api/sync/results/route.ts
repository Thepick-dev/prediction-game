import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createServerSupabaseClient()

  const matchesRes = await fetch(
    'https://api.football-data.org/v4/competitions/PL/matches?season=2026&status=FINISHED',
    {
      headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY! }
    }
  )

  if (!matchesRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 })
  }

  const matchesData = await matchesRes.json()

  if (!matchesData.matches || matchesData.matches.length === 0) {
    return NextResponse.json({ success: true, message: 'No finished matches yet for 2026 season', results_updated: 0 })
  }

  const { error: fixturesError } = await supabase
    .from('fixtures')
    .upsert(
      matchesData.matches.map((match: any) => ({
        id: match.id,
        home_team_id: match.homeTeam.id,
        away_team_id: match.awayTeam.id,
        kickoff_time: match.utcDate,
        status: 'finished',
        home_score: match.score.fullTime.home,
        away_score: match.score.fullTime.away,
        matchday: match.matchday,
        season: '2026'
      })),
      { onConflict: 'id' }
    )

  if (fixturesError) {
    return NextResponse.json({ error: fixturesError.message }, { status: 500 })
  }

  await supabase.from('api_sync_log').insert({
    sync_type: 'results',
    status: 'success',
    records_updated: matchesData.matches.length
  })

  return NextResponse.json({
    success: true,
    results_updated: matchesData.matches.length
  })
}