import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/require-admin'
import { NextResponse } from 'next/server'

// FPL's bootstrap-static team ids (1-20, reassigned each season) have no
// relation to our own teams.id (football-data.org ids, stable across
// seasons). The PRIMARY bridge is teams.short_code — the exact FPL code
// this same sync already writes back onto each team once it's matched it
// once, so it's immune to someone later editing that team's short_name
// for display purposes (which used to be the only bridge here, and broke
// silently for several established clubs once their short_name text was
// changed — see docs/TODO.md). The dictionary below is only a FALLBACK,
// used purely to bootstrap a brand-new team's very first sync, before it
// has a short_code of its own yet.
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
  // 2026/27 promoted clubs — confirmed live against FPL's own feed (it has
  // switched over to the new season's team list, and these 3 codes are
  // exactly right). Matched here against each team's current short_name in
  // our own database (checked directly, not guessed) since these three have
  // never been through a successful sync yet and so have no short_code of
  // their own to fall back on above — this dictionary entry only needs to
  // be right for ONE successful sync; after that, short_code takes over.
  COV: 'Coventry City',
  HUL: 'Hull City',
  IPS: 'Ipswich Town',
}

export async function POST() {
  const supabase = await createServerSupabaseClient()
  if (!(await requireAdmin(supabase))) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const response = await fetch(
    'https://fantasy.premierleague.com/api/bootstrap-static/',
    { headers: { 'User-Agent': 'prediction-game/1.0' } }
  )

  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to fetch FPL data' }, { status: 500 })
  }

  const data = await response.json()

  const { data: ourTeams } = await supabase.from('teams').select('id, short_name, short_code')

  const ourTeamIdByShortCode: Record<string, number> = {}
  const ourTeamIdByShortName: Record<string, number> = {}
  ourTeams?.forEach(t => {
    if (t.short_code) ourTeamIdByShortCode[t.short_code] = t.id
    if (t.short_name) ourTeamIdByShortName[t.short_name.toLowerCase()] = t.id
  })

  const fplTeamIdToOurTeamId: Record<number, number> = {}
  const unmappedFplTeams: string[] = []
  const teamCodeUpdates: { id: number; short_code: string }[] = []
  data.teams.forEach((fplTeam: any) => {
    // Try the stable short_code bridge first; only fall back to the
    // name-based dictionary for a team that's never been matched before.
    let ourTeamId: number | undefined = ourTeamIdByShortCode[fplTeam.short_name]
    if (!ourTeamId) {
      const ourShortName = FPL_CODE_TO_OUR_SHORT_NAME[fplTeam.short_name]
      ourTeamId = ourShortName ? ourTeamIdByShortName[ourShortName.toLowerCase()] : undefined
    }
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