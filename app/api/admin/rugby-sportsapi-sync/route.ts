import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { fetchRugbyResultsFromApi, type DueFixture } from '../../../lib/rugbySportsApiSync'
import { NextResponse } from 'next/server'

// Finds our own fixtures that have kicked off but aren't marked 'finished'
// yet, pulls their real result + full player stats from SportsAPI Pro, and
// reconciles them into fixtures/match_events/player_match_stats. Mirrors
// the spreadsheet sync's reconciliation shape (app/api/admin/rugby-sync) —
// full-replace of a touched fixture's match_events and player_match_stats,
// never a merge, so re-running never duplicates anything. Unlike the
// spreadsheet sync, this never creates teams/players/rounds/fixtures
// itself — it only fills in results for a schedule that already exists.
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const apiKey = process.env.SPORTS_API_PRO_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'SPORTS_API_PRO_KEY is not set' }, { status: 500 })
  }
  const db = createAdminSupabaseClient()

  const { data: activeComp } = await db.schema('rugby').from('competitions').select('id').eq('status', 'active').maybeSingle()
  if (!activeComp) {
    return NextResponse.json({ error: 'No active rugby competition — create and activate one in /admin/rugby first' }, { status: 400 })
  }
  const competitionId = activeComp.id as string

  const [{ data: teams }, { data: rounds }] = await Promise.all([
    db.schema('rugby').from('teams').select('id, name'),
    db.schema('rugby').from('rounds').select('id, number').eq('competition_id', competitionId),
  ])
  const teamNameById = new Map<number, string>((teams ?? []).map(t => [t.id, t.name]))
  const roundNumberById = new Map<string, number>((rounds ?? []).map(r => [r.id, r.number]))
  const roundIds = (rounds ?? []).map(r => r.id)

  const { data: dueFixtureRows } = roundIds.length
    ? await db.schema('rugby').from('fixtures')
      .select('id, round_id, home_team_id, away_team_id, kickoff_time, status')
      .in('round_id', roundIds)
      .neq('status', 'finished')
      .not('kickoff_time', 'is', null)
      .lt('kickoff_time', new Date().toISOString())
    : { data: [] }

  const dueFixtures: DueFixture[] = (dueFixtureRows ?? []).map(f => ({
    fixtureId: f.id,
    round: roundNumberById.get(f.round_id) ?? 0,
    homeTeamName: teamNameById.get(f.home_team_id) ?? '?',
    awayTeamName: teamNameById.get(f.away_team_id) ?? '?',
    kickoffTime: f.kickoff_time as string,
  }))

  if (dueFixtures.length === 0) {
    return NextResponse.json({ success: true, summary: { fixtures_checked: 0, results_applied: 0 }, warnings: [] })
  }

  const fetchResult = await fetchRugbyResultsFromApi(apiKey, dueFixtures)
  const warnings = [...fetchResult.apiErrors, ...fetchResult.unmatchedFixtures.map(f => `Not found on SportsAPI Pro yet: ${f}`)]

  // ---------- Results ----------
  for (const r of fetchResult.results) {
    const fixture = dueFixtures.find(f => f.homeTeamName === r.homeTeam && f.awayTeamName === r.awayTeam && f.round === r.round)
    if (!fixture) continue
    await db.schema('rugby').from('fixtures').update({ home_score: r.homeScore, away_score: r.awayScore, status: 'finished' }).eq('id', fixture.fixtureId)
  }

  // ---------- Player lookup (team + case-insensitive name, same as the spreadsheet sync) ----------
  const { data: allPlayers } = await db.schema('rugby').from('players').select('id, team_id, name')
  const playerKey = (teamId: number, name: string) => `${teamId}::${name.toLowerCase()}`
  const playerIdByTeamAndName = new Map<string, number>()
  allPlayers?.forEach(p => playerIdByTeamAndName.set(playerKey(p.team_id, p.name), p.id))
  const teamIdByName = new Map<string, number>((teams ?? []).map(t => [t.name, t.id]))

  function resolvePlayerId(homeTeam: string, awayTeam: string, name: string): number | null {
    const candidateTeamIds = [teamIdByName.get(homeTeam), teamIdByName.get(awayTeam)].filter((x): x is number => x != null)
    for (const tId of candidateTeamIds) {
      const found = playerIdByTeamAndName.get(playerKey(tId, name))
      if (found) return found
    }
    return null
  }

  // ---------- Scorers (full replace per touched fixture, same as spreadsheet sync) ----------
  const scorersByFixture = new Map<number, typeof fetchResult.scorers>()
  fetchResult.scorers.forEach(s => {
    const fixture = dueFixtures.find(f => f.homeTeamName === s.homeTeam && f.awayTeamName === s.awayTeam && f.round === s.round)
    if (!fixture) return
    if (!scorersByFixture.has(fixture.fixtureId)) scorersByFixture.set(fixture.fixtureId, [])
    scorersByFixture.get(fixture.fixtureId)!.push(s)
  })
  let scorerRowsApplied = 0
  for (const [fixtureId, rows] of scorersByFixture) {
    await db.schema('rugby').from('match_events').delete().eq('fixture_id', fixtureId)
    const fixture = dueFixtures.find(f => f.fixtureId === fixtureId)!
    const eventsToInsert = rows.map(row => {
      const playerId = resolvePlayerId(fixture.homeTeamName, fixture.awayTeamName, row.player)
      if (!playerId) warnings.push(`Scorer "${row.player}" not found in either team's squad for ${row.homeTeam} v ${row.awayTeam} — recorded with no player link`)
      return { fixture_id: fixtureId, player_id: playerId, event_type: row.eventType, minute: row.minute }
    })
    if (eventsToInsert.length) await db.schema('rugby').from('match_events').insert(eventsToInsert)
    scorerRowsApplied += eventsToInsert.length
  }

  // ---------- Player match stats (upsert per player per fixture) ----------
  const statsByFixture = new Map<number, typeof fetchResult.playerStats>()
  fetchResult.playerStats.forEach(s => {
    const fixture = dueFixtures.find(f => f.homeTeamName === s.homeTeam && f.awayTeamName === s.awayTeam && f.round === s.round)
    if (!fixture) return
    if (!statsByFixture.has(fixture.fixtureId)) statsByFixture.set(fixture.fixtureId, [])
    statsByFixture.get(fixture.fixtureId)!.push(s)
  })
  let statRowsApplied = 0
  for (const [fixtureId, rows] of statsByFixture) {
    const fixture = dueFixtures.find(f => f.fixtureId === fixtureId)!
    const statsToUpsert = rows.map(row => {
      const playerId = resolvePlayerId(fixture.homeTeamName, fixture.awayTeamName, row.player)
      if (!playerId) return null
      return {
        fixture_id: fixtureId, player_id: playerId,
        meters_run: row.meters_run, clean_breaks: row.clean_breaks, offloads: row.offloads,
        tackles: row.tackles, tackles_missed: row.tackles_missed, try_assists: row.try_assists,
      }
    }).filter((r): r is NonNullable<typeof r> => r != null)
    if (statsToUpsert.length) {
      const { error } = await db.schema('rugby').from('player_match_stats').upsert(statsToUpsert, { onConflict: 'fixture_id,player_id' })
      if (error) warnings.push(`player_match_stats for fixture ${fixtureId}: ${error.message}`)
      else statRowsApplied += statsToUpsert.length
    }
  }

  return NextResponse.json({
    success: true,
    summary: {
      fixtures_checked: dueFixtures.length,
      results_applied: fetchResult.results.length,
      scorer_rows_applied: scorerRowsApplied,
      player_match_stats_applied: statRowsApplied,
    },
    warnings,
  })
}
