import type { SupabaseClient } from '@supabase/supabase-js'

// Futzy — Phase 1: team + two players, no Banker/All-or-Nothing/Bonus Card
// reasoning yet (deferred to a later phase, see the Futzy plan). Structured
// as a sibling to app/lib/autopick.ts's deriveAutopick/runAutopickForGameweek
// pair, but the SELECTION logic is genuinely different: autopick optimises
// for "recognisable, fair fallback", this optimises for projected points
// against this competition's own scoring rules.

type Fixture = { id: number; home_team_id: number; away_team_id: number }
type PlayerRow = {
  id: number
  team_id: number
  active: boolean | null
  xg: number | null
  xa: number | null
  form: number | null
  chance_of_playing: number | null
}

// A deliberately simple, documented approximation for v1 — not fitted
// against real historical results, just a monotonic win/draw/loss curve by
// quartile gap (favourites win more, but draws stay plausible throughout).
// Keyed by the SAME clamped -3..3 diff the real scoring table uses.
const RESULT_PROBABILITIES: Record<number, { win: number; draw: number }> = {
  '-3': { win: 0.65, draw: 0.20 },
  '-2': { win: 0.60, draw: 0.22 },
  '-1': { win: 0.52, draw: 0.25 },
  '0': { win: 0.42, draw: 0.28 },
  '1': { win: 0.33, draw: 0.27 },
  '2': { win: 0.25, draw: 0.25 },
  '3': { win: 0.18, draw: 0.22 },
}

function clampDiff(d: number) {
  return Math.max(-3, Math.min(3, d))
}

// Expected points for one specific fixture — the real outcome is unknown
// ahead of time, only the quartile gap is, so this averages across a simple
// win/draw/loss model rather than assuming a single result, using the exact
// same scoring-table lookup (result_type_quartileDiff) real scoring uses.
function projectTeamFixture(
  teamId: number,
  fixture: Fixture,
  quartileMap: Record<number, number>,
  scoringMap: Record<string, number>
): number {
  const isHome = fixture.home_team_id === teamId
  const opponentId = isHome ? fixture.away_team_id : fixture.home_team_id
  const diff = clampDiff((quartileMap[teamId] ?? 2) - (quartileMap[opponentId] ?? 2))
  const probs = RESULT_PROBABILITIES[diff] ?? { win: 0.42, draw: 0.28 }
  const winType = isHome ? 'home_win' : 'away_win'
  const drawType = isHome ? 'home_draw' : 'away_draw'
  const winPoints = scoringMap[`${winType}_${diff}`] ?? 0
  const drawPoints = scoringMap[`${drawType}_${diff}`] ?? 0
  return probs.win * winPoints + probs.draw * drawPoints
}

// Expected player points: season xG/xA (from the FPL sync) converted into
// this competition's own goal/assist points, derated by injury/rotation
// doubt (chance_of_playing) and nudged by recent form. FPL's `form` is
// roughly "average points per match recently", typically single digits —
// normalised into a gentle 0.6x-1.4x multiplier rather than used raw, so
// one unusually hot or cold week can't swing the projection wildly.
function projectPlayer(player: PlayerRow, goalPoints: number, assistPoints: number): number {
  const availability = player.chance_of_playing != null ? player.chance_of_playing / 100 : 1
  const formMultiplier = player.form != null ? Math.max(0.6, Math.min(1.4, player.form / 5)) : 1
  return availability * ((player.xg ?? 0) * goalPoints + (player.xa ?? 0) * assistPoints) * formMultiplier
}

export type BotPickReasoning = {
  chosen: { team_id: number; player1_id: number; player2_id: number; projected_total: number }
  top_teams: { team_id: number; projected: number }[]
  top_players: { player_id: number; projected: number }[]
}

export type DerivedBotPick = {
  team_id: number
  fixture_id: number | null
  player1_id: number
  player2_id: number
  player1_fixture_id: number | null
  player2_fixture_id: number | null
  reasoning: BotPickReasoning
}

/**
 * Derives Futzy's pick for one gameweek. Writes nothing — pure projection.
 * Reuses use-count/double-use rules exactly like a human is bound by (team
 * used once, twice for a tier double-use team; player used max twice), read
 * from Futzy's own picks/tier_draft_picks history, same shape deriveAutopick
 * already establishes.
 */
export async function deriveBotPick(
  supabase: SupabaseClient,
  botUserId: string,
  gameweekId: string,
  competitionId: string
): Promise<DerivedBotPick | null> {
  const [
    { data: activeTeams },
    { data: assignments },
    { data: scoringRules },
    { data: playerScoringRules },
    { data: allPlayers },
    { data: botPicks },
    { data: tierPicks },
    { data: gwFixtures },
  ] = await Promise.all([
    supabase.from('teams').select('id').eq('active', true),
    supabase.from('tier_assignments').select('team_id, tier').eq('competition_id', competitionId),
    supabase.from('competition_scoring_rules').select('result_type, quartile_diff, points').eq('competition_id', competitionId),
    supabase.from('player_scoring_rules').select('event_type, points').eq('competition_id', competitionId),
    supabase.from('players').select('id, team_id, active, xg, xa, form, chance_of_playing'),
    supabase.from('picks').select('team_id, player1_id, player2_id').eq('user_id', botUserId).eq('competition_id', competitionId),
    supabase.from('tier_draft_picks').select('tier1_team_id, tier2_team_id, tier3_team_id, tier4_team_id').eq('competition_id', competitionId).eq('user_id', botUserId).single(),
    supabase.from('fixtures').select('id, home_team_id, away_team_id').eq('gameweek_id', gameweekId),
  ])

  if (!activeTeams || activeTeams.length === 0) return null
  if (!allPlayers || allPlayers.length < 2) return null

  const quartileMap: Record<number, number> = {}
  assignments?.forEach(a => { quartileMap[a.team_id] = a.tier })

  const scoringMap: Record<string, number> = {}
  scoringRules?.forEach(r => { scoringMap[`${r.result_type}_${r.quartile_diff}`] = r.points })

  const playerRuleMap: Record<string, number> = {}
  playerScoringRules?.forEach(r => { playerRuleMap[r.event_type] = r.points })
  const goalPoints = playerRuleMap['goal'] ?? 12
  const assistPoints = playerRuleMap['assist'] ?? 6

  const fixturesByTeamId: Record<number, Fixture[]> = {}
  gwFixtures?.forEach(f => {
    ;(fixturesByTeamId[f.home_team_id] ??= []).push(f)
    ;(fixturesByTeamId[f.away_team_id] ??= []).push(f)
  })

  const doubleUseTeams = tierPicks
    ? [tierPicks.tier1_team_id, tierPicks.tier2_team_id, tierPicks.tier3_team_id, tierPicks.tier4_team_id].filter((id): id is number => id != null)
    : []

  const teamUseCounts: Record<number, number> = {}
  const playerUseCounts: Record<number, number> = {}
  botPicks?.forEach(p => {
    teamUseCounts[p.team_id] = (teamUseCounts[p.team_id] || 0) + 1
    playerUseCounts[p.player1_id] = (playerUseCounts[p.player1_id] || 0) + 1
    playerUseCounts[p.player2_id] = (playerUseCounts[p.player2_id] || 0) + 1
  })

  // Best available fixture (and its projected points) for every active,
  // still-available team this gameweek. When a team has two fixtures (a
  // rearranged double gameweek), take whichever scores higher — unlike a
  // human-facing autopick default, there's no reason to prefer the tougher
  // match here, since Futzy's only goal is the projection, not "fairness".
  const teamCandidates = activeTeams
    .filter(t => (teamUseCounts[t.id] || 0) < (doubleUseTeams.includes(t.id) ? 2 : 1))
    .map(t => {
      const fixtures = fixturesByTeamId[t.id] ?? []
      if (fixtures.length === 0) return null
      let best = fixtures[0]
      let bestScore = projectTeamFixture(t.id, best, quartileMap, scoringMap)
      for (const f of fixtures.slice(1)) {
        const score = projectTeamFixture(t.id, f, quartileMap, scoringMap)
        if (score > bestScore) { best = f; bestScore = score }
      }
      return { team_id: t.id, fixture_id: best.id, projected: bestScore }
    })
    .filter((c): c is { team_id: number; fixture_id: number; projected: number } => c != null)
    .sort((a, b) => b.projected - a.projected)

  if (teamCandidates.length === 0) return null

  // Player projections don't vary by WHICH of two fixtures they're nominated
  // for (goals/assists are goals/assists regardless) — a fixture still has
  // to be supplied whenever there are two, purely to satisfy the same
  // scoring-time double-gameweek nomination requirement a human pick needs
  // (see buildPlayerPointsCalculator in scoring.ts), not because it changes
  // the projection.
  const playerCandidates = allPlayers
    .filter(p => p.active !== false && (playerUseCounts[p.id] || 0) < 2)
    .map(p => {
      const fixtures = fixturesByTeamId[p.team_id] ?? []
      return {
        player_id: p.id,
        fixture_id: fixtures.length > 0 ? fixtures[0].id : null,
        projected: projectPlayer(p, goalPoints, assistPoints),
      }
    })
    .sort((a, b) => b.projected - a.projected)

  if (playerCandidates.length < 2) return null

  const chosenTeam = teamCandidates[0]
  const player1 = playerCandidates[0]
  // Deliberately not preferring a different team for player2 (unlike
  // autopick's fallback default) — no game rule requires it, and forcing it
  // would de-optimise Futzy's whole point for no scoring reason.
  const player2 = playerCandidates.find(p => p.player_id !== player1.player_id) ?? playerCandidates[1]

  return {
    team_id: chosenTeam.team_id,
    fixture_id: chosenTeam.fixture_id,
    player1_id: player1.player_id,
    player2_id: player2.player_id,
    player1_fixture_id: player1.fixture_id,
    player2_fixture_id: player2.fixture_id,
    reasoning: {
      chosen: {
        team_id: chosenTeam.team_id,
        player1_id: player1.player_id,
        player2_id: player2.player_id,
        projected_total: Math.round((chosenTeam.projected + player1.projected + player2.projected) * 100) / 100,
      },
      top_teams: teamCandidates.slice(0, 5).map(c => ({ team_id: c.team_id, projected: Math.round(c.projected * 100) / 100 })),
      top_players: playerCandidates.slice(0, 5).map(c => ({ player_id: c.player_id, projected: Math.round(c.projected * 100) / 100 })),
    },
  }
}

export type BotPickRunResult = { skipped: string } | { success: true }

/**
 * The cron-called orchestrator for one gameweek. Only acts on a gameweek
 * that's genuinely still open and pre-deadline — a passed deadline is the
 * EXISTING post-deadline autopick's territory, not this. Re-derives and
 * OVERWRITES his pick every time it's called (not insert-once), so daily
 * cron runs keep him current with whatever's freshly synced right up until
 * the deadline passes.
 */
export async function runBotPickForGameweek(supabase: SupabaseClient, gameweekId: string): Promise<BotPickRunResult> {
  const { data: gameweek } = await supabase
    .from('gameweeks')
    .select('id, competition_id, deadline, status')
    .eq('id', gameweekId)
    .single()

  if (!gameweek) return { skipped: 'Gameweek not found' }
  // Matches the exact set of "not yet locked" statuses the existing
  // post-deadline cron block already treats as fair game — a fresh
  // gameweek starts as 'upcoming', not 'open', so checking for only
  // 'open' here meant Futzy never picked for it until it later (if ever)
  // moved to 'open'.
  if (!['open', 'upcoming'].includes(gameweek.status)) return { skipped: 'Gameweek not open' }
  if (new Date() >= new Date(gameweek.deadline)) return { skipped: 'Deadline has passed' }

  const { data: competition } = await supabase
    .from('competitions')
    .select('id, bot_enabled')
    .eq('id', gameweek.competition_id)
    .single()

  if (!competition?.bot_enabled) return { skipped: 'Bot not enabled for this competition' }

  const { data: bot } = await supabase.from('profiles').select('id').eq('is_bot', true).single()
  if (!bot) return { skipped: 'No bot profile exists yet' }

  // Defensive — the normal path is the bot_enabled toggle action creating
  // this up front, but a missing entry should never silently block a pick.
  const { data: existingEntry } = await supabase
    .from('competition_entries')
    .select('user_id')
    .eq('competition_id', gameweek.competition_id)
    .eq('user_id', bot.id)
    .maybeSingle()

  if (!existingEntry) {
    await supabase.from('competition_entries').insert({ user_id: bot.id, competition_id: gameweek.competition_id })
  }

  const derived = await deriveBotPick(supabase, bot.id, gameweekId, gameweek.competition_id)
  if (!derived) return { skipped: 'Could not derive a legal pick' }

  const { data: existingPick } = await supabase
    .from('picks')
    .select('id')
    .eq('user_id', bot.id)
    .eq('gameweek_id', gameweekId)
    .maybeSingle()

  const pickData = {
    user_id: bot.id,
    competition_id: gameweek.competition_id,
    gameweek_id: gameweekId,
    team_id: derived.team_id,
    fixture_id: derived.fixture_id,
    player1_id: derived.player1_id,
    player2_id: derived.player2_id,
    player1_fixture_id: derived.player1_fixture_id,
    player2_fixture_id: derived.player2_fixture_id,
    is_banker: false,
    is_autopick: false,
  }

  if (existingPick) {
    await supabase.from('picks').update(pickData).eq('id', existingPick.id)
  } else {
    await supabase.from('picks').insert(pickData)
  }

  await supabase.from('bot_pick_log').upsert({
    competition_id: gameweek.competition_id,
    gameweek_id: gameweekId,
    chosen: derived.reasoning.chosen,
    candidates: { teams: derived.reasoning.top_teams, players: derived.reasoning.top_players },
  }, { onConflict: 'competition_id,gameweek_id' })

  return { success: true }
}
