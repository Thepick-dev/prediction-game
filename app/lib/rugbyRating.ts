import type { SupabaseClient } from '@supabase/supabase-js'

// Pure-function-first, same pattern as app/lib/rugbyScoring.ts and
// app/lib/scoring.ts — calculation has zero DB access, the orchestrator at
// the bottom wires DB reads/writes around it.
//
// The 0-100 match rating: every real player-match performance is scored on
// the same underlying stats, weighted for what that position is actually
// asked to do, then converted to a 0-100 rating by ranking that raw score
// against every OTHER performance ever recorded for the same position
// group — an ever-growing pool (2024 onward), never reset per season. 5.0
// [on the old 0-10 scale; 50 here] means "an average performance for that
// position," nothing more. This is what makes a prop's 80/100 and a
// winger's 80/100 mean the same thing, despite wildly different raw scores.
//
// Calibrated this session against 43 real Six Nations matches (2024-2026)
// and checked against the real 2026 Team of the Tournament (13/15 picks
// rated above their position's median). Position comes straight from
// rugby.players.position (real squad data, not re-derived per match) — a
// player with no position set simply can't be rated yet.

export type RugbyPositionGroup =
  | 'Prop' | 'Hooker' | 'Second Row' | 'Back Row'
  | 'Scrum-half' | 'Fly-half' | 'Centre' | 'Wing' | 'Fullback'

export type RugbyMatchStatLine = {
  tries: number
  try_assists: number
  clean_breaks: number
  offloads: number
  meters_run: number
  passes: number
  tackles: number
  tackles_missed: number
  yellow_card: number
  red_card: number
  conversions: number
  penalty_goals: number
  drop_goals: number
}

type WeightSet = {
  try: number; try_assist: number; clean_break: number; offload: number
  meters: number; passes: number; tackle: number; tackle_missed: number
  yellow: number; red: number
}

// Prop and Hooker share one weight set — near-identical role (scrum +
// tackle, rarely carry or kick). 8 weight sets across the 9 groups.
const WEIGHTS: Record<string, WeightSet> = {
  PropHooker: { try: 10, try_assist: 3, clean_break: 3, offload: 1.5, meters: 0.06, passes: 0, tackle: 0.35, tackle_missed: -0.6, yellow: -5, red: -10 },
  SecondRow: { try: 10, try_assist: 3, clean_break: 2.5, offload: 1.5, meters: 0.06, passes: 0, tackle: 0.3, tackle_missed: -0.6, yellow: -5, red: -10 },
  BackRow: { try: 10, try_assist: 3, clean_break: 2, offload: 1, meters: 0.06, passes: 0, tackle: 0.25, tackle_missed: -0.5, yellow: -5, red: -10 },
  ScrumHalf: { try: 10, try_assist: 4, clean_break: 2, offload: 1, meters: 0.05, passes: 0.03, tackle: 0.25, tackle_missed: -0.5, yellow: -5, red: -10 },
  FlyHalf: { try: 10, try_assist: 4, clean_break: 2, offload: 1.5, meters: 0.06, passes: 0.02, tackle: 0.2, tackle_missed: -0.5, yellow: -5, red: -10 },
  Centre: { try: 10, try_assist: 3, clean_break: 2.5, offload: 1.5, meters: 0.06, passes: 0, tackle: 0.25, tackle_missed: -0.5, yellow: -5, red: -10 },
  Wing: { try: 12, try_assist: 3, clean_break: 3, offload: 1.5, meters: 0.06, passes: 0, tackle: 0.2, tackle_missed: -0.5, yellow: -5, red: -10 },
  Fullback: { try: 10, try_assist: 3, clean_break: 2.5, offload: 1.5, meters: 0.06, passes: 0, tackle: 0.3, tackle_missed: -0.7, yellow: -5, red: -10 },
}

const WEIGHT_KEY_BY_GROUP: Record<RugbyPositionGroup, string> = {
  'Prop': 'PropHooker', 'Hooker': 'PropHooker', 'Second Row': 'SecondRow', 'Back Row': 'BackRow',
  'Scrum-half': 'ScrumHalf', 'Fly-half': 'FlyHalf', 'Centre': 'Centre', 'Wing': 'Wing', 'Fullback': 'Fullback',
}

// Kicking is deliberately NOT part of each group's own weight table —
// applying it per-position used to mean a fly-half got full running-back
// credit AND nearly every kick in the match (kicking alone was ~49% of an
// average #10's score), while a forward or centre who stepped up to kick
// in a pinch got zero credit. One universal, trimmed weight instead:
// whoever actually kicks is judged on it exactly as a recognised fly-half
// would be, regardless of position.
const KICKING_WEIGHT = { conversion: 1.5, penalty: 2, dropgoal: 3.5 }

export function computeRawScore(stats: RugbyMatchStatLine, group: RugbyPositionGroup): number {
  const w = WEIGHTS[WEIGHT_KEY_BY_GROUP[group]]
  const raw = stats.tries * w.try
    + stats.conversions * KICKING_WEIGHT.conversion + stats.penalty_goals * KICKING_WEIGHT.penalty + stats.drop_goals * KICKING_WEIGHT.dropgoal
    + stats.try_assists * w.try_assist + stats.clean_breaks * w.clean_break + stats.offloads * w.offload
    + stats.meters_run * w.meters + stats.passes * w.passes + stats.tackles * w.tackle
    - stats.tackles_missed * Math.abs(w.tackle_missed) - stats.yellow_card * Math.abs(w.yellow) - stats.red_card * Math.abs(w.red)
  return Math.round(raw * 100) / 100
}

export type RatingPoolEntry = { id: string; group: RugbyPositionGroup; rawScore: number }

// Ranks every entry against every OTHER entry in the same group — the
// "ever-growing historical pool" that establishes what an average/good/bad
// performance looks like for that position. Pure and side-effect free:
// call it with the CURRENT full pool every time, never incrementally —
// cheap enough (a sort) to just always recompute from scratch, and it
// means adding more historical data (autumn internationals, a new season)
// automatically sharpens every rating next time this runs, not just new
// ones.
export function computeRatings(pool: RatingPoolEntry[]): Map<string, number> {
  const ratingById = new Map<string, number>()
  const byGroup = new Map<string, number[]>()
  pool.forEach(e => {
    if (!byGroup.has(e.group)) byGroup.set(e.group, [])
    byGroup.get(e.group)!.push(e.rawScore)
  })
  byGroup.forEach(scores => scores.sort((a, b) => a - b))

  pool.forEach(e => {
    const scores = byGroup.get(e.group)!
    let below = 0
    for (const v of scores) { if (v < e.rawScore) below++; else break }
    const pctile = scores.length > 1 ? below / (scores.length - 1) : 0.5
    ratingById.set(e.id, Math.round(pctile * 1000) / 10) // 0.0-100.0
  })
  return ratingById
}

// ---------- Orchestrator (DB-touching) ----------

export type RugbyMatchRatingRow = { fixture_id: number; player_id: number; group: string; raw_score: number; rating: number }

// Recomputes ratings for EVERY player-match performance we have real stats
// for, using each player's current rugby.players.position — not just new
// ones, since the whole point of the ever-growing pool is that adding more
// data can shift where an older performance ranks too. Cheap enough (a
// sort per position group) to always run in full rather than try to patch
// incrementally. Players with no position set are skipped, not guessed.
export async function recomputeAllRugbyRatings(supabase: SupabaseClient): Promise<{ success: true; rows: number } | { error: string }> {
  const [{ data: statsRows }, { data: players }, { data: matchEvents }] = await Promise.all([
    supabase.schema('rugby').from('player_match_stats').select('fixture_id, player_id, meters_run, clean_breaks, offloads, tackles, tackles_missed, try_assists'),
    supabase.schema('rugby').from('players').select('id, position'),
    supabase.schema('rugby').from('match_events').select('fixture_id, player_id, event_type'),
  ])

  if (!statsRows || statsRows.length === 0) return { success: true, rows: 0 }

  const positionByPlayerId = new Map<number, string>()
  ;(players ?? []).forEach((p: { id: number; position: string | null }) => { if (p.position) positionByPlayerId.set(p.id, p.position) })

  const eventsByFixtureAndPlayer = new Map<string, { event_type: string }[]>()
  ;(matchEvents ?? []).forEach((e: { fixture_id: number; player_id: number | null; event_type: string }) => {
    if (e.player_id == null) return
    const key = `${e.fixture_id}::${e.player_id}`
    if (!eventsByFixtureAndPlayer.has(key)) eventsByFixtureAndPlayer.set(key, [])
    eventsByFixtureAndPlayer.get(key)!.push({ event_type: e.event_type })
  })

  const pool: RatingPoolEntry[] = []
  const rawByEntryId = new Map<string, { fixture_id: number; player_id: number; group: RugbyPositionGroup }>()

  statsRows.forEach((s: { fixture_id: number; player_id: number; meters_run: number; clean_breaks: number; offloads: number; tackles: number; tackles_missed: number; try_assists: number }) => {
    const position = positionByPlayerId.get(s.player_id)
    if (!position || !(position in WEIGHT_KEY_BY_GROUP)) return // no real position yet — skip, don't guess
    const group = position as RugbyPositionGroup
    const events = eventsByFixtureAndPlayer.get(`${s.fixture_id}::${s.player_id}`) ?? []
    const statLine: RugbyMatchStatLine = {
      tries: events.filter(e => e.event_type === 'try').length,
      conversions: events.filter(e => e.event_type === 'conversion').length,
      penalty_goals: events.filter(e => e.event_type === 'penalty_goal').length,
      drop_goals: events.filter(e => e.event_type === 'drop_goal').length,
      yellow_card: events.filter(e => e.event_type === 'yellow_card').length,
      red_card: events.filter(e => e.event_type === 'red_card').length,
      try_assists: s.try_assists ?? 0, clean_breaks: s.clean_breaks ?? 0, offloads: s.offloads ?? 0,
      meters_run: s.meters_run ?? 0, passes: 0, tackles: s.tackles ?? 0, tackles_missed: s.tackles_missed ?? 0,
    }
    const id = `${s.fixture_id}::${s.player_id}`
    const rawScore = computeRawScore(statLine, group)
    pool.push({ id, group, rawScore })
    rawByEntryId.set(id, { fixture_id: s.fixture_id, player_id: s.player_id, group })
  })

  if (pool.length === 0) return { success: true, rows: 0 }

  const ratings = computeRatings(pool)
  const rows: RugbyMatchRatingRow[] = pool.map(e => ({
    fixture_id: rawByEntryId.get(e.id)!.fixture_id,
    player_id: rawByEntryId.get(e.id)!.player_id,
    group: e.group,
    raw_score: e.rawScore,
    rating: ratings.get(e.id) ?? 50,
  }))

  const { error } = await supabase.schema('rugby').from('player_match_ratings').upsert(rows, { onConflict: 'fixture_id,player_id' })
  if (error) return { error: error.message }
  return { success: true, rows: rows.length }
}
