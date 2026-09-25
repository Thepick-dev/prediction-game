import type { SupabaseClient } from '@supabase/supabase-js'

// Feeds the "Player Database" tab on /rugby/stats — every real player
// performance across the historical archive (2024-2026 Six Nations,
// backfilled from SportsAPI Pro), served from the live database instead
// of the one-off Rugby Ratings Explorer artifact this was ported from.
// Same row shape, same numbers — just queried fresh each time so it stays
// current as more real matches get synced in.

export type RugbyPlayerPerformanceRow = {
  season: number
  round: number
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  player_id: number
  player: string
  team: string
  opponent: string
  is_home: boolean
  group: string | null
  value: number | null
  value_is_estimated: boolean
  tries: number
  conversions: number
  penalty_goals: number
  drop_goals: number
  yellow_card: number
  red_card: number
  try_assists: number
  clean_breaks: number
  offloads: number
  meters_run: number
  tackles: number
  tackles_missed: number
  raw_score: number | null
  rating: number | null
}

// Supabase/PostgREST caps an unpaginated select at 1000 rows — this pool
// is already past that (1600+ player_match_stats rows), so every table
// here that can grow past 1000 needs an explicit page loop, same lesson
// as app/lib/rugbyRating.ts's own fetchAllRows.
async function fetchAllRows<T>(query: () => any): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await query().range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return rows
}

export async function fetchRugbyPlayerPerformances(supabase: SupabaseClient): Promise<RugbyPlayerPerformanceRow[]> {
  const { data: comps } = await supabase.schema('rugby').from('competitions').select('id, name').like('name', 'Six Nations % (Historical Archive)')
  const compList = comps ?? []
  if (compList.length === 0) return []
  const compIds = compList.map((c: { id: string }) => c.id)
  const seasonByCompId = new Map(compList.map((c: { id: string; name: string }) => [c.id, Number(c.name.match(/Six Nations (\d+)/)?.[1] ?? 0)]))

  const rounds = await fetchAllRows<{ id: string; competition_id: string; number: number }>(
    () => supabase.schema('rugby').from('rounds').select('id, competition_id, number').in('competition_id', compIds)
  )
  const roundInfo = new Map(rounds.map(r => [r.id, { season: seasonByCompId.get(r.competition_id) ?? 0, round: r.number }]))
  const roundIds = rounds.map(r => r.id)
  if (roundIds.length === 0) return []

  const fixtures = await fetchAllRows<{ id: number; round_id: string; home_team_id: number; away_team_id: number; home_score: number | null; away_score: number | null }>(
    () => supabase.schema('rugby').from('fixtures').select('id, round_id, home_team_id, away_team_id, home_score, away_score').in('round_id', roundIds)
  )
  const fixtureIds = fixtures.map(f => f.id)
  const fixtureById = new Map(fixtures.map(f => [f.id, f]))
  if (fixtureIds.length === 0) return []

  const [teams, players, statsRows, events, ratings] = await Promise.all([
    fetchAllRows<{ id: number; name: string }>(() => supabase.schema('rugby').from('teams').select('id, name')),
    fetchAllRows<{ id: number; name: string; team_id: number; position: string | null; value: number | null }>(
      () => supabase.schema('rugby').from('players').select('id, name, team_id, position, value')
    ),
    fetchAllRows<{ fixture_id: number; player_id: number; meters_run: number; clean_breaks: number; offloads: number; tackles: number; tackles_missed: number; try_assists: number }>(
      () => supabase.schema('rugby').from('player_match_stats').select('fixture_id, player_id, meters_run, clean_breaks, offloads, tackles, tackles_missed, try_assists').in('fixture_id', fixtureIds)
    ),
    fetchAllRows<{ fixture_id: number; player_id: number | null; event_type: string }>(
      () => supabase.schema('rugby').from('match_events').select('fixture_id, player_id, event_type').in('fixture_id', fixtureIds)
    ),
    fetchAllRows<{ fixture_id: number; player_id: number; raw_score: number; rating: number }>(
      () => supabase.schema('rugby').from('player_match_ratings').select('fixture_id, player_id, raw_score, rating').in('fixture_id', fixtureIds)
    ),
    // value_is_estimated: its own isolated fetch — a newer, optional
    // column, so a problem reading it (or it not existing yet) must only
    // mean every row shows as a real value, never that the whole page
    // breaks.
  ])
  let estimatedById = new Map<number, boolean>()
  try {
    const estimatedRows = await fetchAllRows<{ id: number; value_is_estimated: boolean }>(
      () => supabase.schema('rugby').from('players').select('id, value_is_estimated')
    )
    estimatedById = new Map(estimatedRows.map(r => [r.id, r.value_is_estimated]))
  } catch { /* column not added yet — every value just reads as non-estimated */ }

  const teamName = new Map(teams.map(t => [t.id, t.name]))
  const playerById = new Map(players.map(p => [p.id, p]))

  const eventsByKey = new Map<string, string[]>()
  events.forEach(e => {
    if (e.player_id == null) return
    const k = `${e.fixture_id}::${e.player_id}`
    if (!eventsByKey.has(k)) eventsByKey.set(k, [])
    eventsByKey.get(k)!.push(e.event_type)
  })
  const ratingByKey = new Map(ratings.map(r => [`${r.fixture_id}::${r.player_id}`, r]))

  return statsRows.map(s => {
    const fixture = fixtureById.get(s.fixture_id)!
    const info = roundInfo.get(fixture.round_id)!
    const player = playerById.get(s.player_id)
    const evs = eventsByKey.get(`${s.fixture_id}::${s.player_id}`) ?? []
    const count = (t: string) => evs.filter(e => e === t).length
    const rating = ratingByKey.get(`${s.fixture_id}::${s.player_id}`)
    const playerTeamId = player?.team_id
    const isHome = playerTeamId === fixture.home_team_id
    const opponentTeamId = isHome ? fixture.away_team_id : fixture.home_team_id

    return {
      season: info.season, round: info.round,
      home_team: teamName.get(fixture.home_team_id) ?? '?', away_team: teamName.get(fixture.away_team_id) ?? '?',
      home_score: fixture.home_score, away_score: fixture.away_score,
      player_id: s.player_id, player: player?.name ?? `#${s.player_id}`,
      team: teamName.get(playerTeamId ?? -1) ?? '?', opponent: teamName.get(opponentTeamId) ?? '?', is_home: isHome,
      group: player?.position ?? null,
      value: player?.value ?? null, value_is_estimated: estimatedById.get(s.player_id) ?? false,
      tries: count('try'), conversions: count('conversion'), penalty_goals: count('penalty_goal'), drop_goals: count('drop_goal'),
      yellow_card: count('yellow_card'), red_card: count('red_card'),
      try_assists: s.try_assists ?? 0, clean_breaks: s.clean_breaks ?? 0, offloads: s.offloads ?? 0,
      meters_run: s.meters_run ?? 0, tackles: s.tackles ?? 0, tackles_missed: s.tackles_missed ?? 0,
      raw_score: rating?.raw_score ?? null, rating: rating?.rating ?? null,
    }
  })
}
