import type { SupabaseClient } from '@supabase/supabase-js'
import { generateFutzyVoice } from './futzyVoice'

// Futzy — team + two players, Banker, All-or-Nothing, the Bonus Card, and
// tier draft participation, all reasoned from the same xG/xA/fixture-
// strength model. Structured as a sibling to app/lib/autopick.ts's
// deriveAutopick/runAutopickForGameweek pair, but the SELECTION logic is
// genuinely different: autopick optimises for "recognisable, fair
// fallback", this optimises for projected points against this
// competition's own scoring rules.

type Fixture = { id: number; home_team_id: number; away_team_id: number }
type PlayerRow = {
  id: number
  team_id: number
  active: boolean | null
  xg: number | null
  xa: number | null
  form: number | null
  chance_of_playing: number | null
  ep_next: number | null
  points_per_game: number | null
}

// Calibrated against 1,140 real Premier League matches (2022-23 through
// 2024-25, closing odds from football-data.co.uk, de-vigged into fair
// implied probabilities) rather than guessed — the previous version
// meaningfully underrated strong favourites (real big favourites win ~77%
// of the time and lose only ~7%; the old table gave them 65%/15%). Keyed
// by the SAME clamped -3..3 diff the real scoring table uses; positive
// diffs are the mirror of their negative counterpart (win = 1 - favourite's
// win - draw, same draw rate — draws are a property of the match, not
// which side you're asking about).
const RESULT_PROBABILITIES: Record<number, { win: number; draw: number }> = {
  '-3': { win: 0.75, draw: 0.17 },
  '-2': { win: 0.68, draw: 0.20 },
  '-1': { win: 0.55, draw: 0.24 },
  '0': { win: 0.40, draw: 0.26 },
  '1': { win: 0.21, draw: 0.24 },
  '2': { win: 0.12, draw: 0.20 },
  '3': { win: 0.08, draw: 0.17 },
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
//
// Fixture-aware adjustment: FPL publishes `ep_next`, its own next-gameweek
// points projection, which already accounts for the upcoming fixture's
// difficulty — exactly the per-gameweek signal this used to be missing
// (season-cumulative xG/xA alone can't tell a tough fixture from an easy
// one). Rather than trust FPL's absolute point value (a different scoring
// currency to ours), this uses ep_next only as a RATIO against the
// player's own season average (points_per_game) — "how much better or
// worse than usual is this fixture for them" — and applies that ratio as a
// multiplier on top of our own xG/xA-based points conversion, clamped the
// same way form is so one freak fixture rating can't swing things wildly.
// Falls back to no adjustment (1x) when either figure is missing.
function projectPlayer(player: PlayerRow, goalPoints: number, assistPoints: number): number {
  const availability = player.chance_of_playing != null ? player.chance_of_playing / 100 : 1
  const formMultiplier = player.form != null ? Math.max(0.6, Math.min(1.4, player.form / 5)) : 1
  const fixtureMultiplier = (player.ep_next != null && player.points_per_game != null && player.points_per_game > 0.5)
    ? Math.max(0.5, Math.min(1.8, player.ep_next / player.points_per_game))
    : 1
  return availability * ((player.xg ?? 0) * goalPoints + (player.xa ?? 0) * assistPoints) * formMultiplier * fixtureMultiplier
}

export type BotPickReasoning = {
  chosen: { team_id: number; player1_id: number; player2_id: number; projected_total: number }
  top_teams: { team_id: number; projected: number }[]
  top_players: { player_id: number; projected: number }[]
  all_or_nothing_player_id: number | null
  bonus_card_player_id: number | null
}

export type DerivedBotPick = {
  team_id: number
  fixture_id: number | null
  player1_id: number
  player2_id: number
  player1_fixture_id: number | null
  player2_fixture_id: number | null
  all_or_nothing_player_id: number | null
  bonus_card: { player_id: number; fixture_id: number | null } | null
  reasoning: BotPickReasoning
}

/**
 * Derives Futzy's pick for one gameweek. Writes nothing — pure projection,
 * including the Banker/All-or-Nothing/Bonus Card DECISIONS (not the writes
 * themselves, which need a picks.id that doesn't exist until the caller
 * upserts one — see runBotPickForGameweek). Reuses use-count/double-use
 * rules exactly like a human is bound by (team used once, twice for a tier
 * double-use team; player used max twice), read from Futzy's own
 * picks/tier_draft_picks history, same shape deriveAutopick already
 * establishes.
 */
export async function deriveBotPick(
  supabase: SupabaseClient,
  botUserId: string,
  gameweekId: string,
  competitionId: string,
  gameweekNumber: number
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
    { data: competition },
    { data: existingAoN },
    { data: aonExclusions },
    { data: existingBonusCardPlay },
  ] = await Promise.all([
    supabase.from('teams').select('id').eq('active', true),
    supabase.from('tier_assignments').select('team_id, tier').eq('competition_id', competitionId),
    supabase.from('competition_scoring_rules').select('result_type, quartile_diff, points').eq('competition_id', competitionId),
    supabase.from('player_scoring_rules').select('event_type, points').eq('competition_id', competitionId),
    supabase.from('players').select('id, team_id, active, xg, xa, form, chance_of_playing, ep_next, points_per_game'),
    // Excludes THIS gameweek's own (possibly already-existing, from an
    // earlier day's cron run) pick — otherwise re-deriving the same
    // gameweek would count today's not-yet-overwritten row as a prior use
    // of its own two players before recomputing it, inflating their counts
    // by one every single day. Mirrors the exact same exclusion the human
    // submission path uses in app/api/picks/route.ts.
    supabase.from('picks').select('team_id, player1_id, player2_id, is_banker').eq('user_id', botUserId).eq('competition_id', competitionId).neq('gameweek_id', gameweekId),
    supabase.from('tier_draft_picks').select('tier1_team_id, tier2_team_id, tier3_team_id, tier4_team_id').eq('competition_id', competitionId).eq('user_id', botUserId).maybeSingle(),
    supabase.from('fixtures').select('id, home_team_id, away_team_id').eq('gameweek_id', gameweekId),
    supabase.from('competitions').select('bonus_card_enabled, bonus_card_player_id').eq('id', competitionId).single(),
    supabase.from('all_or_nothing_picks').select('id, gameweek_id, player_id').eq('user_id', botUserId).eq('competition_id', competitionId).maybeSingle(),
    supabase.from('all_or_nothing_exclusions').select('player_id'),
    supabase.from('bonus_card_plays').select('id, gameweek_id').eq('user_id', botUserId).eq('competition_id', competitionId).maybeSingle(),
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
  let bankersUsed = 0
  botPicks?.forEach(p => {
    teamUseCounts[p.team_id] = (teamUseCounts[p.team_id] || 0) + 1
    playerUseCounts[p.player1_id] = (playerUseCounts[p.player1_id] || 0) + 1
    playerUseCounts[p.player2_id] = (playerUseCounts[p.player2_id] || 0) + 1
    if (p.is_banker) bankersUsed++
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
        team_id: p.team_id,
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

  // --- All or Nothing -------------------------------------------------
  // Only ever nominates one of THIS week's two picks (same rule a human is
  // bound by), only when it's genuinely never been used before, isn't on
  // the admin's exclusion list, and Futzy hasn't already spent his one
  // per-competition play elsewhere. There's no calibrated per-gameweek
  // "probability of a goal or assist" available from the synced data (see
  // the note on projectPlayer above), so as an honest, documented stand-in
  // this only nominates when the candidate's own projected score is above
  // the average across every candidate considered this week — i.e. a
  // genuinely above-average attacking threat, not just "happened to be
  // picked".
  let aonPlayerId: number | null = null
  const aonAlreadyUsedElsewhere = !!existingAoN && existingAoN.gameweek_id !== gameweekId
  if (!aonAlreadyUsedElsewhere) {
    const excludedIds = new Set((aonExclusions ?? []).map(e => e.player_id))
    const avgProjected = playerCandidates.reduce((s, c) => s + c.projected, 0) / playerCandidates.length
    const eligible = [player1, player2].filter(p =>
      (playerUseCounts[p.player_id] || 0) === 0 &&
      !excludedIds.has(p.player_id) &&
      p.projected > avgProjected
    )
    if (eligible.length > 0) {
      aonPlayerId = eligible.sort((a, b) => b.projected - a.projected)[0].player_id
    }
  }

  // --- Bonus Card -------------------------------------------------------
  // "Best fixture among remaining gameweeks" for the nominated player,
  // using the TEAM projection (which does vary by opponent) as the fixture-
  // quality signal — the closest available proxy since player projections
  // themselves don't vary by opponent. Only ever plays once per
  // competition — an existing row for ANY gameweek (including this one)
  // means it's already decided and is left alone here; the caller is what
  // actually writes a brand new play.
  let bonusCardDecision: { player_id: number; fixture_id: number | null } | null = null
  if (competition?.bonus_card_enabled && competition.bonus_card_player_id != null && !existingBonusCardPlay) {
    const nomineeId = competition.bonus_card_player_id
    const nominee = allPlayers.find(p => p.id === nomineeId)
    const notAlreadyPickedThisWeek = nomineeId !== player1.player_id && nomineeId !== player2.player_id
    const reasonablyFit = nominee ? (nominee.chance_of_playing == null || nominee.chance_of_playing >= 50) : false

    if (nominee && notAlreadyPickedThisWeek && reasonablyFit) {
      const best = await findBestFixtureWindow(supabase, nominee.team_id, competitionId, gameweekNumber, quartileMap, scoringMap)
      if (best && best.gameweekId === gameweekId) {
        const nomineeFixtures = fixturesByTeamId[nominee.team_id] ?? []
        bonusCardDecision = { player_id: nomineeId, fixture_id: nomineeFixtures.length > 0 ? nomineeFixtures[0].id : null }
      }
    }
  }

  return {
    team_id: chosenTeam.team_id,
    fixture_id: chosenTeam.fixture_id,
    player1_id: player1.player_id,
    player2_id: player2.player_id,
    player1_fixture_id: player1.fixture_id,
    player2_fixture_id: player2.fixture_id,
    all_or_nothing_player_id: aonPlayerId,
    bonus_card: bonusCardDecision,
    reasoning: {
      chosen: {
        team_id: chosenTeam.team_id,
        player1_id: player1.player_id,
        player2_id: player2.player_id,
        projected_total: Math.round((chosenTeam.projected + player1.projected + player2.projected) * 100) / 100,
      },
      top_teams: teamCandidates.slice(0, 5).map(c => ({ team_id: c.team_id, projected: Math.round(c.projected * 100) / 100 })),
      top_players: playerCandidates.slice(0, 5).map(c => ({ player_id: c.player_id, projected: Math.round(c.projected * 100) / 100 })),
      all_or_nothing_player_id: aonPlayerId,
      bonus_card_player_id: bonusCardDecision?.player_id ?? null,
    },
  }
}

// Shared lookahead helper for both Banker and the Bonus Card: which
// upcoming gameweek (starting at fromGameweekNumber, current week
// included) gives one specific team its best projected-points fixture.
// Used by the Bonus Card directly (fixture quality for the nominated
// player's team) and conceptually mirrors what the Banker check below does
// for Futzy's own combined pick total.
async function findBestFixtureWindow(
  supabase: SupabaseClient,
  teamId: number,
  competitionId: string,
  fromGameweekNumber: number,
  quartileMap: Record<number, number>,
  scoringMap: Record<string, number>,
  windowSize = 6
): Promise<{ gameweekId: string; gameweekNumber: number; score: number } | null> {
  const { data: futureGws } = await supabase
    .from('gameweeks')
    .select('id, number')
    .eq('competition_id', competitionId)
    .gte('number', fromGameweekNumber)
    .order('number')
    .limit(windowSize)

  if (!futureGws || futureGws.length === 0) return null

  const gwIds = futureGws.map(g => g.id)
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, home_team_id, away_team_id, gameweek_id')
    .in('gameweek_id', gwIds)

  let best: { gameweekId: string; gameweekNumber: number; score: number } | null = null
  for (const gw of futureGws) {
    const fixturesThisGw = (fixtures ?? []).filter(f => f.gameweek_id === gw.id && (f.home_team_id === teamId || f.away_team_id === teamId))
    if (fixturesThisGw.length === 0) continue
    const score = Math.max(...fixturesThisGw.map(f => projectTeamFixture(teamId, f, quartileMap, scoringMap)))
    if (!best || score > best.score) best = { gameweekId: gw.id, gameweekNumber: gw.number, score }
  }
  return best
}

// --- Banker ---------------------------------------------------------------
// "Spend only when this week clearly beats his season average and a
// lookahead shows nothing better" — mirrors a sensible human strategy.
// Recomputes a full derivation for each of the next few gameweeks purely to
// read their projected_total for comparison; none of those calls write
// anything (deriveBotPick is pure), so this is safe to call repeatedly.
async function shouldPlayBanker(
  supabase: SupabaseClient,
  botUserId: string,
  competitionId: string,
  gameweekNumber: number,
  thisWeekProjected: number,
  bankersUsed: number
): Promise<boolean> {
  if (bankersUsed >= 2) return false

  const { data: scoredPoints } = await supabase
    .from('points')
    .select('total_points')
    .eq('user_id', botUserId)
    .eq('competition_id', competitionId)

  const seasonAverage = scoredPoints && scoredPoints.length > 0
    ? scoredPoints.reduce((s, p) => s + (p.total_points ?? 0), 0) / scoredPoints.length
    : null

  // No scored history yet (e.g. gameweek 1) — nothing to compare against,
  // so only the lookahead below decides.
  if (seasonAverage != null && thisWeekProjected <= seasonAverage) return false

  const { data: futureGws } = await supabase
    .from('gameweeks')
    .select('id, number')
    .eq('competition_id', competitionId)
    .gt('number', gameweekNumber)
    .order('number')
    .limit(4)

  for (const gw of futureGws ?? []) {
    const futureDerived = await deriveBotPick(supabase, botUserId, gw.id, competitionId, gw.number)
    if (futureDerived && futureDerived.reasoning.chosen.projected_total > thisWeekProjected) return false
  }

  return true
}

export type BotPickRunResult = { skipped: string } | { success: true }

// Futzy has no tier_draft_picks row until this creates one — chooses the
// strongest available team (lowest/best quartile) in each draft tier,
// deterministic and reused every time this competition's cron runs until a
// row exists. Self-heals: if bot_enabled gets turned on before gameweek 1's
// deadline, the very next cron run gives him double-use teams same as
// everyone else; enabling him after that deadline means (like a late human
// entry) he simply never gets them for this competition.
async function ensureBotTierPicks(supabase: SupabaseClient, botUserId: string, competitionId: string) {
  const { data: existing } = await supabase
    .from('tier_draft_picks')
    .select('user_id')
    .eq('user_id', botUserId)
    .eq('competition_id', competitionId)
    .maybeSingle()
  if (existing) return

  const [{ data: draftAssignments }, { data: quartiles }] = await Promise.all([
    supabase.from('draft_tier_assignments').select('team_id, tier_number').eq('competition_id', competitionId),
    supabase.from('tier_assignments').select('team_id, tier').eq('competition_id', competitionId),
  ])
  if (!draftAssignments || draftAssignments.length === 0) return

  const quartileMap: Record<number, number> = {}
  quartiles?.forEach(q => { quartileMap[q.team_id] = q.tier })

  const byTier: Record<number, number[]> = {}
  draftAssignments.forEach(a => { (byTier[a.tier_number] ??= []).push(a.team_id) })

  const picks: Record<string, number> = {}
  for (const tierNumber of Object.keys(byTier).map(Number)) {
    const teamsInTier = byTier[tierNumber].slice().sort((a, b) => (quartileMap[a] ?? 5) - (quartileMap[b] ?? 5) || a - b)
    if (teamsInTier.length > 0) picks[`tier${tierNumber}_team_id`] = teamsInTier[0]
  }
  if (Object.keys(picks).length === 0) return

  await supabase.from('tier_draft_picks').insert({ user_id: botUserId, competition_id: competitionId, ...picks })
}

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
    .select('id, number, competition_id, deadline, status')
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

  await ensureBotTierPicks(supabase, bot.id, gameweek.competition_id)

  const derived = await deriveBotPick(supabase, bot.id, gameweekId, gameweek.competition_id, gameweek.number)
  if (!derived) return { skipped: 'Could not derive a legal pick' }

  const { data: existingPick } = await supabase
    .from('picks')
    .select('id, is_banker, comments')
    .eq('user_id', bot.id)
    .eq('gameweek_id', gameweekId)
    .maybeSingle()

  const { data: priorPicks } = await supabase
    .from('picks')
    .select('is_banker')
    .eq('user_id', bot.id)
    .eq('competition_id', gameweek.competition_id)
    .neq('gameweek_id', gameweekId)
  const bankersUsedElsewhere = (priorPicks ?? []).filter(p => p.is_banker).length

  const playBanker = await shouldPlayBanker(
    supabase, bot.id, gameweek.competition_id, gameweek.number,
    derived.reasoning.chosen.projected_total, bankersUsedElsewhere
  )

  const pickData: Record<string, unknown> = {
    user_id: bot.id,
    competition_id: gameweek.competition_id,
    gameweek_id: gameweekId,
    team_id: derived.team_id,
    fixture_id: derived.fixture_id,
    player1_id: derived.player1_id,
    player2_id: derived.player2_id,
    player1_fixture_id: derived.player1_fixture_id,
    player2_fixture_id: derived.player2_fixture_id,
    is_banker: playBanker,
    is_autopick: false,
  }

  // His Wall comment/question answer are generated once, the first time
  // this gameweek gets a pick — never regenerated on later daily re-runs,
  // so his "opinion" doesn't change as data refreshes the way his actual
  // pick legitimately does. Best-effort only: generateFutzyVoice always
  // resolves rather than throwing, so a Gemini outage never blocks a pick.
  if (!existingPick?.comments) {
    const [{ data: team }, { data: p1 }, { data: p2 }, { data: question }] = await Promise.all([
      supabase.from('teams').select('name, short_name').eq('id', derived.team_id).single(),
      supabase.from('players').select('name, web_name').eq('id', derived.player1_id).single(),
      supabase.from('players').select('name, web_name').eq('id', derived.player2_id).single(),
      supabase.from('gameweek_questions').select('question, question_type, option_a, option_b, option_c, option_d').eq('gameweek_id', gameweekId).maybeSingle(),
    ])

    const questionInput = question
      ? {
          text: question.question,
          type: (question.question_type ?? 'multiple_choice') as 'multiple_choice' | 'freetext',
          options: question.question_type === 'freetext' ? undefined : [
            { key: 'A', label: question.option_a },
            { key: 'B', label: question.option_b },
            ...(question.option_c ? [{ key: 'C', label: question.option_c }] : []),
            ...(question.option_d ? [{ key: 'D', label: question.option_d }] : []),
          ],
        }
      : null

    const voice = await generateFutzyVoice({
      teamName: team?.short_name ?? team?.name ?? 'my team',
      player1Name: p1?.web_name?.trim() || p1?.name || 'my first pick',
      player2Name: p2?.web_name?.trim() || p2?.name || 'my second pick',
      question: questionInput,
    })

    if (voice.comment) {
      pickData.comments = voice.comment
      pickData.wall_status = 'pending'
      pickData.wall_rating = null
    }
    if (voice.questionAnswer) {
      pickData.question_answer = voice.questionAnswer
    }
  }

  let pickId: string
  if (existingPick) {
    await supabase.from('picks').update(pickData).eq('id', existingPick.id)
    pickId = existingPick.id
  } else {
    const { data: inserted } = await supabase.from('picks').insert(pickData).select('id').single()
    pickId = inserted!.id
  }

  // All or Nothing — same delete-if-changed/insert-if-new shape the human
  // submission path uses, scoped to never touch a row that belongs to a
  // different (and therefore already-resolved-or-frozen) gameweek.
  const { data: existingAoNRow } = await supabase
    .from('all_or_nothing_picks')
    .select('id, gameweek_id, player_id')
    .eq('user_id', bot.id)
    .eq('competition_id', gameweek.competition_id)
    .maybeSingle()

  if (existingAoNRow && existingAoNRow.gameweek_id === gameweekId && existingAoNRow.player_id !== derived.all_or_nothing_player_id) {
    await supabase.from('all_or_nothing_picks').delete().eq('id', existingAoNRow.id)
  }
  if (derived.all_or_nothing_player_id != null && !(existingAoNRow && existingAoNRow.gameweek_id === gameweekId && existingAoNRow.player_id === derived.all_or_nothing_player_id)) {
    // A row for a DIFFERENT gameweek means it's already been spent
    // elsewhere — deriveBotPick already accounts for this when deciding
    // all_or_nothing_player_id, but this is the final guard before writing.
    if (!(existingAoNRow && existingAoNRow.gameweek_id !== gameweekId)) {
      await supabase.from('all_or_nothing_picks').insert({
        competition_id: gameweek.competition_id, user_id: bot.id, gameweek_id: gameweekId,
        pick_id: pickId, player_id: derived.all_or_nothing_player_id, outcome: 'pending',
      })
    }
  }

  // Bonus Card — once played, left alone forever (see deriveBotPick's own
  // comment); this only ever performs the first-time insert.
  if (derived.bonus_card) {
    await supabase.from('bonus_card_plays').insert({
      competition_id: gameweek.competition_id, user_id: bot.id, gameweek_id: gameweekId,
      pick_id: pickId, player_id: derived.bonus_card.player_id, fixture_id: derived.bonus_card.fixture_id,
    })
  }

  await supabase.from('bot_pick_log').upsert({
    competition_id: gameweek.competition_id,
    gameweek_id: gameweekId,
    chosen: derived.reasoning.chosen,
    candidates: {
      teams: derived.reasoning.top_teams,
      players: derived.reasoning.top_players,
      banker: playBanker,
      all_or_nothing_player_id: derived.reasoning.all_or_nothing_player_id,
      bonus_card_player_id: derived.reasoning.bonus_card_player_id,
    },
  }, { onConflict: 'competition_id,gameweek_id' })

  return { success: true }
}
