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

// Domestic/other-international performances (rugby.player_performances) —
// already flat (every stat inline, no separate match_events table), so
// this is a much shorter mapping than the fixture-based one below. Own
// isolated fetch: a problem here must only mean these are missing from
// the Player Database / average_rating for now, never that the whole
// page breaks.
async function fetchExternalPlayerPerformances(supabase: SupabaseClient): Promise<RugbyPlayerPerformanceRow[]> {
  try {
    const [perfRows, players] = await Promise.all([
      fetchAllRows<{
        id: number; player_id: number; season: number; round_label: string | null; team_name: string | null
        opponent_name: string | null; is_home: boolean | null; tries: number; conversions: number
        penalty_goals: number; drop_goals: number; yellow_card: number; red_card: number; try_assists: number
        clean_breaks: number; offloads: number; meters_run: number; tackles: number; tackles_missed: number
        raw_score: number | null; rating: number | null
      }>(() => supabase.schema('rugby').from('player_performances').select(
        'id, player_id, season, round_label, team_name, opponent_name, is_home, tries, conversions, penalty_goals, drop_goals, yellow_card, red_card, try_assists, clean_breaks, offloads, meters_run, tackles, tackles_missed, raw_score, rating'
      )),
      fetchAllRows<{ id: number; name: string; position: string | null; value: number | null }>(
        () => supabase.schema('rugby').from('players').select('id, name, position, value')
      ),
    ])
    const playerById = new Map(players.map(p => [p.id, p]))
    return perfRows.map(p => {
      const player = playerById.get(p.player_id)
      return {
        season: p.season, round: Number(p.round_label?.match(/\d+/)?.[0] ?? 0),
        home_team: p.is_home ? (p.team_name ?? '?') : (p.opponent_name ?? '?'),
        away_team: p.is_home ? (p.opponent_name ?? '?') : (p.team_name ?? '?'),
        home_score: null, away_score: null,
        player_id: p.player_id, player: player?.name ?? `#${p.player_id}`,
        team: p.team_name ?? '?', opponent: p.opponent_name ?? '?', is_home: p.is_home ?? true,
        group: player?.position ?? null,
        value: player?.value ?? null, value_is_estimated: true,
        tries: p.tries, conversions: p.conversions, penalty_goals: p.penalty_goals, drop_goals: p.drop_goals,
        yellow_card: p.yellow_card, red_card: p.red_card,
        try_assists: p.try_assists, clean_breaks: p.clean_breaks, offloads: p.offloads,
        meters_run: p.meters_run, tackles: p.tackles, tackles_missed: p.tackles_missed,
        raw_score: p.raw_score, rating: p.rating,
      }
    })
  } catch {
    return []
  }
}

export async function fetchRugbyPlayerPerformances(supabase: SupabaseClient): Promise<RugbyPlayerPerformanceRow[]> {
  const externalPerformances = await fetchExternalPlayerPerformances(supabase)

  const { data: comps } = await supabase.schema('rugby').from('competitions').select('id, name').like('name', 'Six Nations % (Historical Archive)')
  const compList = comps ?? []
  if (compList.length === 0) return externalPerformances
  const compIds = compList.map((c: { id: string }) => c.id)
  const seasonByCompId = new Map(compList.map((c: { id: string; name: string }) => [c.id, Number(c.name.match(/Six Nations (\d+)/)?.[1] ?? 0)]))

  const rounds = await fetchAllRows<{ id: string; competition_id: string; number: number }>(
    () => supabase.schema('rugby').from('rounds').select('id, competition_id, number').in('competition_id', compIds)
  )
  const roundInfo = new Map(rounds.map(r => [r.id, { season: seasonByCompId.get(r.competition_id) ?? 0, round: r.number }]))
  const roundIds = rounds.map(r => r.id)
  if (roundIds.length === 0) return externalPerformances

  const fixtures = await fetchAllRows<{ id: number; round_id: string; home_team_id: number; away_team_id: number; home_score: number | null; away_score: number | null }>(
    () => supabase.schema('rugby').from('fixtures').select('id, round_id, home_team_id, away_team_id, home_score, away_score').in('round_id', roundIds)
  )
  const fixtureIds = fixtures.map(f => f.id)
  const fixtureById = new Map(fixtures.map(f => [f.id, f]))
  if (fixtureIds.length === 0) return externalPerformances

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
  }).concat(externalPerformances)
}

// One row per PLAYER (not per performance) — a summary line plus every
// one of their match performances nested underneath, so the Player
// Database and the Dream Team builder (which reuses this same fetch) can
// both show "who is this player" at a glance and drill into "how did they
// actually play" without a second round trip. Covers the FULL live roster,
// not just the ~296 with historical archive data — someone with zero
// historical performances still needs to appear here to be draftable, just
// with appearances: 0 and average_rating: null.
export type RugbyPlayerSummary = {
  player_id: number
  player: string
  team: string
  team_id: number
  group: string | null
  value: number | null
  value_is_estimated: boolean
  appearances: number
  average_rating: number | null
  performances: RugbyPlayerPerformanceRow[]
}

// Recency weighting on a player's average rating — Kit's choice: "light
// taper" (confirmed 2026-09-25). A more recent season counts more, but
// even 2 years back still carries real weight, a gentle nudge toward
// current form rather than a wholesale reset. Relative to whichever
// season is MOST RECENT in the data (not hardcoded), so this keeps
// working correctly once a new season's results get added.
export function seasonWeight(season: number, latestSeason: number): number {
  const yearsBack = latestSeason - season
  if (yearsBack <= 0) return 1.0
  if (yearsBack === 1) return 0.85
  return 0.65
}

// Kit, 2026-09-26, after seeing real data: a player with only 1-3 recorded
// appearances has no OTHER game to blend a big one with, so the
// international-caps rating cap (rugbyRating.ts) doesn't actually stop a
// single capped-at-80 game from becoming their ENTIRE Power Ranking —
// producing a cluster of very-low-appearance players all tied at exactly
// the cap value, near the top of value. This blends in
// SAMPLE_SIZE_SHRINKAGE_GAMES worth of a neutral, average (50) performance
// before averaging — "moderate" per Kit, treated as 4 extra games at full
// (most-recent-season) weight. A real player with a long track record is
// barely affected (their own weight dwarfs 4); one or two games gets
// pulled substantially toward 50 rather than standing on its own.
const SAMPLE_SIZE_SHRINKAGE_GAMES = 4

export async function fetchRugbyPlayerSummaries(supabase: SupabaseClient): Promise<RugbyPlayerSummary[]> {
  const [performances, teams, rosterRaw] = await Promise.all([
    fetchRugbyPlayerPerformances(supabase),
    fetchAllRows<{ id: number; name: string }>(() => supabase.schema('rugby').from('teams').select('id, name')),
    fetchAllRows<{ id: number; name: string; team_id: number; position: string | null; value: number | null }>(
      () => supabase.schema('rugby').from('players').select('id, name, team_id, position, value')
    ),
  ])

  let estimatedById = new Map<number, boolean>()
  try {
    const estimatedRows = await fetchAllRows<{ id: number; value_is_estimated: boolean }>(
      () => supabase.schema('rugby').from('players').select('id, value_is_estimated')
    )
    estimatedById = new Map(estimatedRows.map(r => [r.id, r.value_is_estimated]))
  } catch { /* column not added yet — every value just reads as non-estimated */ }

  const teamName = new Map(teams.map(t => [t.id, t.name]))

  const performancesByPlayerId = new Map<number, RugbyPlayerPerformanceRow[]>()
  performances.forEach(p => {
    if (!performancesByPlayerId.has(p.player_id)) performancesByPlayerId.set(p.player_id, [])
    performancesByPlayerId.get(p.player_id)!.push(p)
  })

  const latestSeason = performances.length ? Math.max(...performances.map(p => p.season)) : 0

  return rosterRaw.map(p => {
    const perfs = (performancesByPlayerId.get(p.id) ?? [])
      .slice()
      .sort((a, b) => (b.season - a.season) || (b.round - a.round))
    const rated = perfs.filter(r => r.rating != null)
    const weightTotal = rated.reduce((sum, r) => sum + seasonWeight(r.season, latestSeason), 0)
    const averageRating = rated.length
      ? (rated.reduce((sum, r) => sum + (r.rating ?? 0) * seasonWeight(r.season, latestSeason), 0) + SAMPLE_SIZE_SHRINKAGE_GAMES * 50)
        / (weightTotal + SAMPLE_SIZE_SHRINKAGE_GAMES)
      : null

    return {
      player_id: p.id,
      player: p.name,
      team: teamName.get(p.team_id) ?? '?',
      team_id: p.team_id,
      group: p.position ?? null,
      value: p.value ?? null,
      value_is_estimated: estimatedById.get(p.id) ?? false,
      appearances: perfs.length,
      average_rating: averageRating,
      performances: perfs,
    }
  })
}

// ============================================================
// Dynamic player value — Kit's ask (2026-09-25): "the player's value
// should be dynamic and linked to their average player rating."
// ============================================================

// Linear mapping from average rating (0-100, already percentile-like
// from the rating engine) onto the £ range set when player values were
// FIRST computed (the 196 originally-priced players spanned
// £42,904-£1,000,000) — fixed constants, not re-derived from whatever
// the current pool's own min/max happens to be, so a player's value
// stays stable and comparable over time rather than every single
// player's number shifting whenever the pool's spread changes.
const VALUE_RANGE_MIN = 42904
const VALUE_RANGE_MAX = 1000000
export function computeValueFromRating(averageRating: number): number {
  const clamped = Math.max(0, Math.min(100, averageRating))
  return Math.round(VALUE_RANGE_MIN + (clamped / 100) * (VALUE_RANGE_MAX - VALUE_RANGE_MIN))
}

// Recomputes every non-admin-pinned player's value from their current
// (recency-weighted) average rating — run this AFTER recomputeAllRugbyRatings
// (app/lib/rugbyRating.ts), since it reads whatever's in
// player_match_ratings. A player with no rating data yet (new call-up,
// no historical performances) falls back to their position group's mean
// value among players who DO have a real one this same pass (or the
// overall mean if they have no position at all) — same neutral,
// non-exploitable placeholder approach as the original one-time backfill,
// flagged via value_is_estimated so it's never shown as if it were real.
// value_is_admin_set is Kit's explicit ask: an admin's manual correction
// is "pinned" and this recompute skips it entirely until an admin
// reverts it back to auto (see revertToAutoValue in the admin players page).
export async function recomputeAllRugbyPlayerValues(supabase: SupabaseClient): Promise<{ success: true; rows: number } | { error: string }> {
  const summaries = await fetchRugbyPlayerSummaries(supabase)

  // Isolated fetch: value_is_admin_set is a newer, optional column —
  // missing/unreadable degrades to "nobody is pinned," which just means
  // this recompute overwrites everyone rather than silently corrupting
  // an admin's correction (the safer failure direction either way, since
  // running this recompute at all is an explicit admin action).
  let adminSetById = new Map<number, boolean>()
  try {
    const { data } = await supabase.schema('rugby').from('players').select('id, value_is_admin_set')
    adminSetById = new Map((data ?? []).map((r: { id: number; value_is_admin_set: boolean }) => [r.id, r.value_is_admin_set]))
  } catch { /* column not added yet */ }

  const unpinned = summaries.filter(p => !adminSetById.get(p.player_id))

  const withRating = unpinned.filter(p => p.average_rating != null)
  const realValueById = new Map(withRating.map(p => [p.player_id, computeValueFromRating(p.average_rating as number)]))

  const overallMean = withRating.length
    ? Array.from(realValueById.values()).reduce((s, v) => s + v, 0) / realValueById.size
    : VALUE_RANGE_MIN + (VALUE_RANGE_MAX - VALUE_RANGE_MIN) / 2 // no rated players at all yet — degrade to the range midpoint rather than divide by zero
  const groupMeanByPosition = new Map<string, number>()
  const groups = new Set(withRating.map(p => p.group).filter((g): g is string => !!g))
  groups.forEach(g => {
    const inGroup = withRating.filter(p => p.group === g)
    const mean = inGroup.length ? inGroup.reduce((s, p) => s + (realValueById.get(p.player_id) ?? 0), 0) / inGroup.length : overallMean
    groupMeanByPosition.set(g, mean)
  })

  const updates: { id: number; value: number; value_is_estimated: boolean }[] = []
  unpinned.forEach(p => {
    const real = realValueById.get(p.player_id)
    if (real != null) {
      updates.push({ id: p.player_id, value: real, value_is_estimated: false })
    } else {
      const fallback = (p.group ? groupMeanByPosition.get(p.group) : undefined) ?? overallMean
      updates.push({ id: p.player_id, value: Math.round(fallback), value_is_estimated: true })
    }
  })

  if (updates.length === 0) return { success: true, rows: 0 }

  // No batch upsert-by-arbitrary-column in PostgREST — one update per
  // row. This runs from an explicit admin action (piggybacking on
  // "Calculate Points"), not a hot path, so a loop is fine here.
  for (const u of updates) {
    const { error } = await supabase.schema('rugby').from('players').update({ value: u.value, value_is_estimated: u.value_is_estimated }).eq('id', u.id)
    if (error) return { error: error.message }
  }
  return { success: true, rows: updates.length }
}
