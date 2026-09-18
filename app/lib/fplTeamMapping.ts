import type { SupabaseClient } from '@supabase/supabase-js'

// FPL's bootstrap-static team ids (1-20, reassigned each season) have no
// relation to our own teams.id (football-data.org ids, stable across
// seasons). The PRIMARY bridge is teams.short_code — the exact FPL code
// syncPlayers.ts writes back onto each team once it's matched it once, so
// it's immune to someone later editing that team's short_name for display
// purposes. The dictionary below is only a FALLBACK, used purely to
// bootstrap a brand-new team's very first sync, before it has a
// short_code of its own yet. Shared by every sync step that needs to
// translate an FPL team id into our own (players, fixture difficulty,
// player form history) so this list only ever needs updating in one place.
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
  COV: 'Coventry City',
  HUL: 'Hull City',
  IPS: 'Ipswich Town',
}

export type FplTeam = { id: number; short_name: string; name: string }

// Returns the FPL team id -> our team id map, built the same way
// syncPlayers.ts already builds it (short_code bridge first, name
// dictionary fallback), without writing anything back — read-only, for
// sync steps that only need to translate ids, not maintain short_code.
export async function getFplTeamMapping(
  supabase: SupabaseClient,
  fplTeams: FplTeam[]
): Promise<Record<number, number>> {
  const { data: ourTeams } = await supabase.from('teams').select('id, short_name, short_code')

  const ourTeamIdByShortCode: Record<string, number> = {}
  const ourTeamIdByShortName: Record<string, number> = {}
  ourTeams?.forEach(t => {
    if (t.short_code) ourTeamIdByShortCode[t.short_code] = t.id
    if (t.short_name) ourTeamIdByShortName[t.short_name.toLowerCase()] = t.id
  })

  const fplTeamIdToOurTeamId: Record<number, number> = {}
  fplTeams.forEach(fplTeam => {
    let ourTeamId: number | undefined = ourTeamIdByShortCode[fplTeam.short_name]
    if (!ourTeamId) {
      const ourShortName = FPL_CODE_TO_OUR_SHORT_NAME[fplTeam.short_name]
      ourTeamId = ourShortName ? ourTeamIdByShortName[ourShortName.toLowerCase()] : undefined
    }
    if (ourTeamId) fplTeamIdToOurTeamId[fplTeam.id] = ourTeamId
  })

  return fplTeamIdToOurTeamId
}
