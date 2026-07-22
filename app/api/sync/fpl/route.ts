import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'

// FPL's bootstrap-static team ids (1-20, reassigned each season) have no
// relation to our own teams.id (football-data.org ids, stable across
// seasons). FPL's 3-letter short_name codes are stable and correspond
// 1:1 with the short_name values we store on `teams` — use that as the
// bridge instead of fuzzy-matching full club names (which don't line up
// cleanly, e.g. FPL "Spurs"/"Wolves"/"Nott'm Forest" vs our "Tottenham"/
// "Wolves"/"Forest").
const FPL_CODE_TO_OUR_SHORT_NAME: Record<string, string> = {
  ARS: 'Arsenal',
  AVL: 'Villa',
  BOU: 'Bournemouth',
  BRE: 'Brentford',
  BHA: 'Brighton',
  BUR: 'Burnley',
  CHE: 'Chelsea',
  CRY: 'Palace',
  EVE: 'Everton',
  FUL: 'Fulham',
  LEE: 'Leeds',
  LIV: 'Liverpool',
  MCI: 'Man City',
  MUN: 'Man Utd',
  NEW: 'Newcastle',
  NFO: 'Forest',
  SUN: 'Sunderland',
  TOT: 'Tottenham',
  WHU: 'West Ham',
  WOL: 'Wolves',
}

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

  const { data: ourTeams } = await supabase.from('teams').select('id, short_name')

  const ourTeamIdByShortName: Record<string, number> = {}
  ourTeams?.forEach(t => {
    if (t.short_name) ourTeamIdByShortName[t.short_name.toLowerCase()] = t.id
  })

  const fplTeamIdToOurTeamId: Record<number, number> = {}
  const unmappedFplTeams: string[] = []
  const teamCodeUpdates: { id: number; short_code: string }[] = []
  data.teams.forEach((fplTeam: any) => {
    const ourShortName = FPL_CODE_TO_OUR_SHORT_NAME[fplTeam.short_name]
    const ourTeamId = ourShortName ? ourTeamIdByShortName[ourShortName.toLowerCase()] : undefined
    if (ourTeamId) {
      fplTeamIdToOurTeamId[fplTeam.id] = ourTeamId
      teamCodeUpdates.push({ id: ourTeamId, short_code: fplTeam.short_name })
    } else {
      unmappedFplTeams.push(fplTeam.name)
    }
  })

  // Plain updates, not upsert — every id here already exists, and upsert's
  // INSERT ... ON CONFLICT still validates NOT NULL columns (like `name`)
  // on the insert attempt even though it always resolves to the update path.
  let teamCodeError: string | null = null
  if (teamCodeUpdates.length > 0) {
    const results = await Promise.all(
      teamCodeUpdates.map(({ id, short_code }) =>
        supabase.from('teams').update({ short_code }).eq('id', id)
      )
    )
    teamCodeError = results.find(r => r.error)?.error?.message ?? null
  }

  const players = data.elements
    .map((player: any) => ({
      id: player.id,
      name: `${player.first_name} ${player.second_name}`,
      web_name: player.web_name ?? null,
      position: player.element_type === 1 ? 'GK' :
                player.element_type === 2 ? 'DEF' :
                player.element_type === 3 ? 'MID' : 'FWD',
      team_id: fplTeamIdToOurTeamId[player.team] ?? null,
      minutes_played: player.minutes ?? 0,
      // FPL prices are in tenths of £1m (e.g. 73 -> £7.3m).
      value: typeof player.now_cost === 'number' ? player.now_cost / 10 : null
    }))
    .filter((p: any) => p.team_id !== null)

  const skippedNoTeam = data.elements.length - players.length

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
    players_imported: players.length,
    skipped_unmapped_team: skippedNoTeam,
    unmapped_teams: unmappedFplTeams,
    team_code_error: teamCodeError
  })
}