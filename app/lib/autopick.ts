import type { SupabaseClient } from '@supabase/supabase-js'

export type DerivedPick = {
  team_id: number
  player1_id: number
  player2_id: number
}

// Prefer recognisable, higher-value players for autopicks rather than
// drawing from the entire player pool at random.
const MIN_AUTOPICK_PLAYER_VALUE = 7.0

// Deterministic seeded PRNG (mulberry32) so a given user+gameweek always
// produces the SAME autopick — whether previewed on-read or written by cron.
function seededRandom(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Turn a string (e.g. userId+gameweekId) into a numeric seed.
function hashString(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return h
}

function seededShuffle<T>(array: T[], seed: number): T[] {
  const rng = seededRandom(seed)
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Derives a player's autopick deterministically. Writes nothing.
 * Same inputs always yield the same result, so the on-read preview and the
 * cron-written row are guaranteed to match.
 *
 * Rules:
 *  - Team: lowest available ACTIVE team by current league position, respecting
 *    used-team counts and double-use (tier) teams.
 *  - Players: two available players (used < 2 times each), preferring two from
 *    different teams, chosen via seeded shuffle.
 */
export async function deriveAutopick(
  supabase: SupabaseClient,
  userId: string,
  gameweekId: string,
  competitionId: string
): Promise<DerivedPick | null> {
  const [{ data: activeTeams }, { data: leaguePositions }, { data: allPlayers }, { data: userPicks }, { data: tierPicks }] = await Promise.all([
    supabase.from('teams').select('id, name').eq('active', true),
    supabase.from('team_league_positions').select('team_id, position, recorded_at').order('recorded_at', { ascending: false }),
    supabase.from('players').select('id, name, team_id, value'),
    supabase.from('picks').select('team_id, player1_id, player2_id').eq('user_id', userId).eq('competition_id', competitionId),
    supabase.from('tier_draft_picks').select('tier1_team_id, tier2_team_id, tier3_team_id, tier4_team_id').eq('competition_id', competitionId).eq('user_id', userId).single(),
  ])

  if (!activeTeams || activeTeams.length === 0) return null
  if (!allPlayers || allPlayers.length < 2) return null

  // Latest league position per team
  const seen = new Set<number>()
  const latestPositions: Record<number, number> = {}
  leaguePositions?.forEach(lp => {
    if (!seen.has(lp.team_id)) {
      seen.add(lp.team_id)
      latestPositions[lp.team_id] = lp.position
    }
  })

  // Double-use teams from the CORRECT table (tier_draft_picks)
  const doubleUseTeams = tierPicks
    ? [tierPicks.tier1_team_id, tierPicks.tier2_team_id, tierPicks.tier3_team_id, tierPicks.tier4_team_id].filter((id): id is number => id != null)
    : []

  const teamUseCounts: Record<number, number> = {}
  const playerUseCounts: Record<number, number> = {}
  userPicks?.forEach(p => {
    teamUseCounts[p.team_id] = (teamUseCounts[p.team_id] || 0) + 1
    playerUseCounts[p.player1_id] = (playerUseCounts[p.player1_id] || 0) + 1
    playerUseCounts[p.player2_id] = (playerUseCounts[p.player2_id] || 0) + 1
  })

  const availableTeams = activeTeams.filter(team => {
    const uses = teamUseCounts[team.id] || 0
    const maxUses = doubleUseTeams.includes(team.id) ? 2 : 1
    return uses < maxUses
  })

  if (availableTeams.length === 0) return null

  // Lowest league position = highest position number (20th is lowest).
  // Teams with no recorded position sort last (treated as bottom) but only
  // if genuinely unknown; fall back to name order for full determinism.
  const sortedTeams = [...availableTeams].sort((a, b) => {
    const posA = latestPositions[a.id]
    const posB = latestPositions[b.id]
    if (posA != null && posB != null) return posB - posA
    if (posA != null) return -1
    if (posB != null) return 1
    return a.name.localeCompare(b.name)
  })

  const selectedTeam = sortedTeams[0]
  if (!selectedTeam) return null

  const availablePlayers = allPlayers.filter(p => (playerUseCounts[p.id] || 0) < 2)
  if (availablePlayers.length < 2) return null

  // Prefer players worth at least £7m — but if that's too restrictive right
  // now (a user's own used-twice history can run a small pool dry late in
  // the season), fall back to the full available pool rather than skipping
  // their autopick entirely.
  const valuablePlayers = availablePlayers.filter(p => (p.value ?? 0) >= MIN_AUTOPICK_PLAYER_VALUE)
  const candidatePlayers = valuablePlayers.length >= 2 ? valuablePlayers : availablePlayers

  const seed = hashString(userId + gameweekId)
  const shuffled = seededShuffle(candidatePlayers, seed)

  const player1 = shuffled[0]
  const player2 = shuffled.find(p => p.team_id !== player1.team_id) ?? shuffled[1]

  if (!player1 || !player2 || player1.id === player2.id) return null

  return {
    team_id: selectedTeam.id,
    player1_id: player1.id,
    player2_id: player2.id,
  }
}

export type AutopickRunResult =
  | { error: string }
  | { success: true; autopicks_created: number; missing_users: number }

// Pulled out of the /api/autopick route so cron can call it directly
// instead of over an internal HTTP fetch — that fetch needed
// NEXT_PUBLIC_SITE_URL to build the right URL, which only exists if it's
// been separately configured wherever this is deployed, and silently
// fails if it hasn't.
export async function runAutopickForGameweek(supabase: SupabaseClient, gameweek_id: string): Promise<AutopickRunResult> {
  const { data: gameweek } = await supabase
    .from('gameweeks')
    .select('id, competition_id, deadline, status')
    .eq('id', gameweek_id)
    .single()

  if (!gameweek) {
    return { error: 'Gameweek not found' }
  }

  if (new Date() < new Date(gameweek.deadline)) {
    return { error: 'Deadline has not passed yet' }
  }

  const { data: entries } = await supabase
    .from('competition_entries')
    .select('user_id')
    .eq('competition_id', gameweek.competition_id)
    .eq('removed', false)

  const { data: existingPicks } = await supabase
    .from('picks')
    .select('user_id')
    .eq('gameweek_id', gameweek_id)

  const existingPickUserIds = new Set(existingPicks?.map(p => p.user_id) ?? [])
  const missingUsers = entries?.filter(e => !existingPickUserIds.has(e.user_id)) ?? []

  if (missingUsers.length === 0) {
    return { success: true, autopicks_created: 0, missing_users: 0 }
  }

  let autopicksCreated = 0

  for (const entry of missingUsers) {
    const derived = await deriveAutopick(supabase, entry.user_id, gameweek_id, gameweek.competition_id)
    if (!derived) continue

    const { error } = await supabase
      .from('picks')
      .insert({
        user_id: entry.user_id,
        competition_id: gameweek.competition_id,
        gameweek_id,
        team_id: derived.team_id,
        player1_id: derived.player1_id,
        player2_id: derived.player2_id,
        is_banker: false,
        is_autopick: true
      })

    if (!error) autopicksCreated++
  }

  return {
    success: true,
    autopicks_created: autopicksCreated,
    missing_users: missingUsers.length
  }
}