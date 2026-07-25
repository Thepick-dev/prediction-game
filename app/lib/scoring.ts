import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveAutopick } from './autopick'

export type ScoringResult =
  | { error: string }
  | { message: string; points_calculated: 0 }
  | { success: true; points_calculated: number; picks_processed: number }

export type Pick = {
  id: string
  user_id: string
  team_id: number
  fixture_id: number | null
  player1_id: number
  player2_id: number
  player1_fixture_id: number | null
  player2_fixture_id: number | null
  is_banker: boolean
  competition_id: string
}

export type PlayerInfo = { id: number; team_id: number }

export type Fixture = {
  id: number
  home_team_id: number
  away_team_id: number
  home_score: number | null
  away_score: number | null
  status: string
  postponed_handling: 'void' | 'repick' | 'custom_points' | null
  postponed_points: number | null
}

export type ScoringRule = { result_type: string; quartile_diff: number; points: number }
export type PlayerScoringRule = { event_type: string; points: number }
export type MatchEvent = { player_id: number | null; event_type: string; fixture_id: number }

export type PickScoreRow = {
  pick_id: string
  user_id: string
  competition_id: string
  gameweek_id: string
  team_points: number
  player1_points: number
  player2_points: number
  total_points: number
  breakdown: {
    team: string
    team_detail: {
      opponent_team_id: number | null
      team_quartile: number
      opponent_quartile: number
      quartile_diff: number
      result_type: string
      team_score: number | null
      opponent_score: number | null
      is_home: boolean | null
    }
    is_banker: boolean
    player1_raw: number
    player2_raw: number
  }
}

// The actual maths, shared by both the real scoring run (frozen quartiles,
// writes to the database) and the live preview (current quartiles, read-only)
// — one calculation, two different quartile sources. Exported so it can be
// unit tested directly without needing a real (or mocked) Supabase client.
export function computePickScores(
  gameweek_id: string,
  picks: Pick[],
  fixtures: Fixture[],
  quartileMap: Record<number, number>,
  scoringRules: ScoringRule[],
  playerScoringRules: PlayerScoringRule[],
  matchEvents: MatchEvent[],
  players: PlayerInfo[] = []
): PickScoreRow[] {
  const scoringMap: Record<string, number> = {}
  scoringRules.forEach(r => {
    scoringMap[`${r.result_type}_${r.quartile_diff}`] = r.points
  })

  const playerPointsMap: Record<string, number> = {}
  playerScoringRules.forEach(r => { playerPointsMap[r.event_type] = r.points })

  const fixtureById: Record<number, Fixture> = {}
  fixtures.forEach(f => { fixtureById[f.id] = f })

  // A team can have more than one fixture in the same gameweek (a genuine
  // "double gameweek" from rearranged fixtures) — both team and player
  // scoring need to know about ALL of a team's fixtures this gameweek to
  // detect that ambiguous case, not just the last one seen.
  const fixturesByTeamId: Record<number, Fixture[]> = {}
  fixtures.forEach(f => {
    if (f.home_team_id) (fixturesByTeamId[f.home_team_id] ??= []).push(f)
    if (f.away_team_id) (fixturesByTeamId[f.away_team_id] ??= []).push(f)
  })

  const teamIdByPlayerId: Record<number, number> = {}
  players.forEach(p => { teamIdByPlayerId[p.id] = p.team_id })

  // goals/assists per player, split out per fixture (not summed across all
  // of them) — needed so a double-gameweek player's two matches can be told
  // apart rather than silently added together.
  const playerEventsByFixture: Record<number, Record<number, { goals: number; assists: number }>> = {}
  matchEvents.forEach(event => {
    if (!event.player_id) return
    const byFixture = (playerEventsByFixture[event.player_id] ??= {})
    const entry = (byFixture[event.fixture_id] ??= { goals: 0, assists: 0 })
    if (event.event_type === 'goal') entry.goals++
    if (event.event_type === 'assist') entry.assists++
  })

  type TeamPointsDetail = { points: number; breakdown: string; detail: PickScoreRow['breakdown']['team_detail'] }

  function getTeamPoints(teamId: number, fixtureId: number | null): TeamPointsDetail {
    // Prefer the exact fixture the pick was made against (always set for a
    // real manual pick — the Picks page ties team selection to a specific
    // fixture row). Without one — an autopick, or a pick made before
    // fixture_id existed — fall back to the team's single fixture this
    // gameweek. If the team has TWO (a double gameweek) and nothing was
    // nominated, that's genuinely ambiguous — same principle as an
    // unnominated double-gameweek player: score zero rather than
    // arbitrarily picking whichever fixture happened to load first.
    const teamFixtures = fixturesByTeamId[teamId] ?? []
    const fixture = fixtureId
      ? fixtureById[fixtureId]
      : teamFixtures.length <= 1 ? teamFixtures[0] : undefined

    if (fixtureId == null && teamFixtures.length >= 2) {
      return {
        points: 0,
        breakdown: 'Double gameweek, no fixture nominated',
        detail: { opponent_team_id: null, team_quartile: quartileMap[teamId] ?? 2, opponent_quartile: 2, quartile_diff: 0, result_type: 'double_gameweek_unresolved', team_score: null, opponent_score: null, is_home: null }
      }
    }

    if (!fixture) {
      return {
        points: 0,
        breakdown: 'No fixture',
        detail: { opponent_team_id: null, team_quartile: quartileMap[teamId] ?? 2, opponent_quartile: 2, quartile_diff: 0, result_type: 'no_fixture', team_score: null, opponent_score: null, is_home: null }
      }
    }

    const isHome = fixture.home_team_id === teamId
    const opponentId = isHome ? fixture.away_team_id : fixture.home_team_id
    const teamQuartile = quartileMap[teamId] ?? 2
    const opponentQuartile = quartileMap[opponentId] ?? 2
    // Higher quartile number = weaker team (Q4 = "Underdogs", Q1 = "Elite").
    // A positive diff means OUR team was the weaker side ("N Up") — beating
    // or drawing a stronger opponent, which is worth more, not less.
    const quartileDiff = teamQuartile - opponentQuartile
    const clampedDiffForNoResult = Math.max(-3, Math.min(3, quartileDiff))

    // Postponements: decided case-by-case by the Sporting Panel (see Rules),
    // implemented on /admin/postponed. "custom_points" is the only handling
    // that awards anything — void and repick both score zero here, with the
    // actual "give the pick back" part done separately by an admin freeing
    // up the affected picks, not by this scoring pass.
    if (fixture.status === 'postponed') {
      if (fixture.postponed_handling === 'custom_points') {
        const points = fixture.postponed_points ?? 0
        return {
          points,
          breakdown: `Postponed — custom points awarded (${points}pts)`,
          detail: { opponent_team_id: opponentId, team_quartile: teamQuartile, opponent_quartile: opponentQuartile, quartile_diff: clampedDiffForNoResult, result_type: 'postponed_custom_points', team_score: null, opponent_score: null, is_home: isHome }
        }
      }
      return {
        points: 0,
        breakdown: fixture.postponed_handling === 'repick' ? 'Postponed — re-pick offered' : 'Postponed — voided',
        detail: { opponent_team_id: opponentId, team_quartile: teamQuartile, opponent_quartile: opponentQuartile, quartile_diff: clampedDiffForNoResult, result_type: 'postponed', team_score: null, opponent_score: null, is_home: isHome }
      }
    }

    // The fixture (and so the opponent/quartiles/home-away) is known well
    // before kickoff — only the scoreline itself is genuinely unknown until
    // the match is played. Show everything we already know rather than
    // waiting for a final result.
    if (fixture.home_score === null || fixture.away_score === null) {
      return {
        points: 0,
        breakdown: 'Not played yet',
        detail: { opponent_team_id: opponentId, team_quartile: teamQuartile, opponent_quartile: opponentQuartile, quartile_diff: clampedDiffForNoResult, result_type: 'not_played', team_score: null, opponent_score: null, is_home: isHome }
      }
    }

    const teamScore = isHome ? fixture.home_score : fixture.away_score
    const opponentScore = isHome ? fixture.away_score : fixture.home_score

    let resultType: string
    if (teamScore > opponentScore) {
      resultType = isHome ? 'home_win' : 'away_win'
    } else if (teamScore === opponentScore) {
      resultType = isHome ? 'home_draw' : 'away_draw'
    } else {
      return {
        points: 0,
        breakdown: 'Loss',
        detail: { opponent_team_id: opponentId, team_quartile: teamQuartile, opponent_quartile: opponentQuartile, quartile_diff: teamQuartile - opponentQuartile, result_type: 'loss', team_score: teamScore, opponent_score: opponentScore, is_home: isHome }
      }
    }

    const clampedDiff = Math.max(-3, Math.min(3, quartileDiff))
    const key = `${resultType}_${clampedDiff}`
    const points = scoringMap[key] ?? 0

    return {
      points,
      breakdown: `${resultType} (Q diff: ${clampedDiff}) = ${points}pts`,
      detail: { opponent_team_id: opponentId, team_quartile: teamQuartile, opponent_quartile: opponentQuartile, quartile_diff: clampedDiff, result_type: resultType, team_score: teamScore, opponent_score: opponentScore, is_home: isHome }
    }
  }

  // If a player's team has 0 or 1 fixtures this gameweek, there's no
  // ambiguity — score normally regardless of any nominated fixture. If they
  // have 2+ (a double gameweek), a nomination is required: with one, only
  // that fixture's events count; without one, the pick scores zero for that
  // player rather than guessing or adding both games together.
  function getPlayerPoints(playerId: number, nominatedFixtureId: number | null): number {
    const teamId = teamIdByPlayerId[playerId]
    // null (not just empty) specifically means "we don't know this player's
    // team at all" — fall back to counting every event for them regardless
    // of fixture, same as before double-gameweek detection existed, rather
    // than wrongly treating "unknown" the same as "definitely no fixtures".
    const teamFixtures = teamId != null ? (fixturesByTeamId[teamId] ?? []) : null

    let relevantFixtureIds: number[] | null
    if (teamFixtures === null) {
      relevantFixtureIds = null
    } else if (teamFixtures.length <= 1) {
      relevantFixtureIds = teamFixtures.map(f => f.id)
    } else if (nominatedFixtureId != null && teamFixtures.some(f => f.id === nominatedFixtureId)) {
      relevantFixtureIds = [nominatedFixtureId]
    } else {
      return 0
    }

    let goals = 0
    let assists = 0
    const byFixture = playerEventsByFixture[playerId] ?? {}
    if (relevantFixtureIds === null) {
      Object.values(byFixture).forEach(events => { goals += events.goals; assists += events.assists })
    } else {
      relevantFixtureIds.forEach(fixtureId => {
        const events = byFixture[fixtureId]
        if (events) {
          goals += events.goals
          assists += events.assists
        }
      })
    }

    const goalPoints = playerPointsMap['goal'] ?? 12
    const assistPoints = playerPointsMap['assist'] ?? 6
    return (goals * goalPoints) + (assists * assistPoints)
  }

  return picks.map(pick => {
    const teamResult = getTeamPoints(pick.team_id, pick.fixture_id)
    const player1Points = getPlayerPoints(pick.player1_id, pick.player1_fixture_id)
    const player2Points = getPlayerPoints(pick.player2_id, pick.player2_fixture_id)

    let teamPoints = teamResult.points
    let p1Points = player1Points
    let p2Points = player2Points

    if (pick.is_banker) {
      teamPoints *= 2
      p1Points *= 2
      p2Points *= 2
    }

    return {
      pick_id: pick.id,
      user_id: pick.user_id,
      competition_id: pick.competition_id,
      gameweek_id,
      team_points: teamPoints,
      player1_points: p1Points,
      player2_points: p2Points,
      total_points: teamPoints + p1Points + p2Points,
      breakdown: {
        team: teamResult.breakdown,
        team_detail: teamResult.detail,
        is_banker: pick.is_banker,
        player1_raw: player1Points,
        player2_raw: player2Points
      }
    }
  })
}

async function loadCommonScoringData(supabase: SupabaseClient, gameweek_id: string, competition_id: string) {
  const [{ data: picks }, { data: fixtures }, { data: scoringRules }, { data: playerScoringRules }] = await Promise.all([
    supabase
      .from('picks')
      .select('id, user_id, team_id, fixture_id, player1_id, player2_id, player1_fixture_id, player2_fixture_id, is_banker, competition_id')
      .eq('gameweek_id', gameweek_id),
    supabase
      .from('fixtures')
      .select('id, home_team_id, away_team_id, home_score, away_score, status, postponed_handling, postponed_points')
      .eq('gameweek_id', gameweek_id),
    supabase
      .from('competition_scoring_rules')
      .select('result_type, quartile_diff, points')
      .eq('competition_id', competition_id),
    supabase
      .from('player_scoring_rules')
      .select('event_type, points')
      .eq('competition_id', competition_id),
  ])

  const { data: matchEvents } = await supabase
    .from('match_events')
    .select('player_id, event_type, fixture_id')
    .in('fixture_id', fixtures?.map(f => f.id) ?? [])

  // Kept as its own request, deliberately separate from the core queries
  // above: this is only needed to detect double-gameweek players by team,
  // so if it ever has a problem, scoring should still run — just without
  // that specific safeguard — rather than failing outright.
  const { data: players } = await supabase.from('players').select('id, team_id')

  return { picks: picks ?? [], fixtures: fixtures ?? [], scoringRules: scoringRules ?? [], playerScoringRules: playerScoringRules ?? [], matchEvents: matchEvents ?? [], players: players ?? [] }
}

// Pulled out of the /api/scoring route so it can be called directly from
// server code (e.g. marking a gameweek "completed") instead of over an
// internal HTTP fetch — that fetch needed NEXT_PUBLIC_SITE_URL to build the
// right URL, which only exists if it's been separately configured wherever
// this is deployed, and silently fails if it hasn't.
export async function calculateScoring(supabase: SupabaseClient, gameweek_id: string): Promise<ScoringResult> {
  const { data: gameweek } = await supabase
    .from('gameweeks')
    .select('id, number, competition_id')
    .eq('id', gameweek_id)
    .single()

  if (!gameweek) {
    return { error: 'Gameweek not found' }
  }

  const { picks, fixtures, scoringRules, playerScoringRules, matchEvents, players } = await loadCommonScoringData(supabase, gameweek_id, gameweek.competition_id)

  if (picks.length === 0) {
    return { message: 'No picks found for this gameweek', points_calculated: 0 }
  }

  // The frozen snapshot taken when this gameweek was marked "completed" —
  // not live tier_assignments, so a real scoring run never shifts under you.
  const { data: quartiles } = await supabase
    .from('gameweek_quartiles')
    .select('team_id, quartile')
    .eq('gameweek_id', gameweek_id)

  const quartileMap: Record<number, number> = {}
  quartiles?.forEach(q => { quartileMap[q.team_id] = q.quartile })

  const pointsToUpsert = computePickScores(gameweek_id, picks, fixtures, quartileMap, scoringRules, playerScoringRules, matchEvents, players)

  const { error: upsertError } = await supabase
    .from('points')
    .upsert(pointsToUpsert, { onConflict: 'pick_id' })

  if (upsertError) {
    return { error: upsertError.message }
  }

  return {
    success: true,
    points_calculated: pointsToUpsert.length,
    picks_processed: picks.length
  }
}

export type PreviewScoringResult =
  | { error: string }
  | { rows: PickScoreRow[] }

// Read-only version for a gameweek that's locked (deadline passed) but not
// yet marked "completed" — no gameweek_quartiles snapshot exists yet, so
// this uses whatever the live tier_assignments say right now. Nothing is
// written to the database; if picks or quartiles change before the gameweek
// is actually completed, calling this again reflects that, on purpose.
//
// Also covers anyone who hasn't made a real pick yet: their would-be
// autopick is deterministic (see deriveAutopick), so there's no reason the
// same opponent/quartile/home-away detail shouldn't be visible for them
// too — the row id follows the `preview-${userId}` convention the client
// already uses for provisional picks, so it lines up automatically.
export async function previewGameweekScoring(supabase: SupabaseClient, gameweek_id: string): Promise<PreviewScoringResult> {
  const { data: gameweek } = await supabase
    .from('gameweeks')
    .select('id, competition_id, deadline')
    .eq('id', gameweek_id)
    .single()

  if (!gameweek) {
    return { error: 'Gameweek not found' }
  }

  // Independent of whatever `status` says — an admin can set that field
  // ahead of the real deadline (as happened during testing), and callers
  // shouldn't have to gate this correctly themselves. Nothing about a
  // gameweek, autopick included, is shown before its deadline actually passes.
  if (new Date() < new Date(gameweek.deadline)) {
    return { rows: [] }
  }

  const { picks, fixtures, scoringRules, playerScoringRules, matchEvents, players } = await loadCommonScoringData(supabase, gameweek_id, gameweek.competition_id)

  const { data: assignments } = await supabase
    .from('tier_assignments')
    .select('team_id, tier')
    .eq('competition_id', gameweek.competition_id)

  const quartileMap: Record<number, number> = {}
  assignments?.forEach(a => { quartileMap[a.team_id] = a.tier })

  const realRows = computePickScores(gameweek_id, picks, fixtures, quartileMap, scoringRules, playerScoringRules, matchEvents, players)

  const { data: entries } = await supabase
    .from('competition_entries')
    .select('user_id')
    .eq('competition_id', gameweek.competition_id)
    .eq('removed', false)

  const pickedUserIds = new Set(picks.map(p => p.user_id))
  const missingUsers = (entries ?? []).filter(e => !pickedUserIds.has(e.user_id))

  const provisionalPicks: Pick[] = []
  for (const entry of missingUsers) {
    const derived = await deriveAutopick(supabase, entry.user_id, gameweek_id, gameweek.competition_id)
    if (!derived) continue
    provisionalPicks.push({
      id: `preview-${entry.user_id}`,
      user_id: entry.user_id,
      team_id: derived.team_id,
      fixture_id: null,
      player1_id: derived.player1_id,
      player2_id: derived.player2_id,
      player1_fixture_id: null,
      player2_fixture_id: null,
      is_banker: false,
      competition_id: gameweek.competition_id,
    })
  }

  const provisionalRows = computePickScores(gameweek_id, provisionalPicks, fixtures, quartileMap, scoringRules, playerScoringRules, matchEvents, players)

  return { rows: [...realRows, ...provisionalRows] }
}
