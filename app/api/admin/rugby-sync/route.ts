import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { parseRugbyWorkbook } from '../../../lib/rugbySheetSync'
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// Re-reads public/rugby-data.xlsx from scratch every time and reconciles
// it into the rugby.* tables. Deliberately upsert-only for teams/players/
// fixtures — a name removed from the spreadsheet is never deleted here,
// only additions and score/date updates are applied, per an explicit
// requirement (squads only ever grow, they don't get pruned by a sync).
// match_events is the one exception: since a fixture's scorers are fully
// re-derivable from the sheet each time, that fixture's existing events
// are replaced wholesale rather than merged, so re-running a sync never
// duplicates a try that was already recorded.
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const db = createAdminSupabaseClient()

  const filePath = path.join(process.cwd(), 'public', 'rugby-data.xlsx')
  let buffer: Buffer
  try {
    buffer = fs.readFileSync(filePath)
  } catch {
    return NextResponse.json({ error: 'rugby-data.xlsx not found in the public folder' }, { status: 404 })
  }

  const parsed = await parseRugbyWorkbook(buffer)
  const warnings: string[] = []

  // ---------- Teams ----------
  const { data: teamRows } = await db.schema('rugby').from('teams').select('id, name')
  const teamIdByName: Record<string, number> = {}
  teamRows?.forEach(t => { teamIdByName[t.name] = t.id })

  function teamId(name: string): number | null {
    return teamIdByName[name] ?? null
  }

  // ---------- Competition (must already exist and be active) ----------
  // Deliberately does NOT auto-create one — /admin/rugby is the one place
  // a new season actually starts (create, then Activate there), so the
  // sync always writes into whichever competition an admin explicitly
  // made active, never a silently-invented one.
  const { data: activeComp } = await db.schema('rugby').from('competitions').select('id').eq('status', 'active').maybeSingle()
  if (!activeComp) {
    return NextResponse.json({ error: 'No active rugby competition — create and activate one in /admin/rugby first' }, { status: 400 })
  }
  const competitionId = activeComp.id as string

  // ---------- Players (add-only by team+name, never delete or overwrite) ----------
  const { data: existingPlayers } = await db.schema('rugby').from('players').select('id, team_id, name')
  const playerKey = (teamIdVal: number, name: string) => `${teamIdVal}::${name.toLowerCase()}`
  const playerByKey = new Map<string, { id: number }>()
  existingPlayers?.forEach(p => playerByKey.set(playerKey(p.team_id, p.name), { id: p.id }))

  const playersToInsert: { team_id: number; name: string }[] = []

  parsed.squads.forEach(s => {
    const tId = teamId(s.team)
    if (!tId) { warnings.push(`Squads: unknown team "${s.team}" for player "${s.playerName}"`); return }
    const key = playerKey(tId, s.playerName)
    if (!playerByKey.has(key)) {
      playersToInsert.push({ team_id: tId, name: s.playerName })
      playerByKey.set(key, { id: -1 }) // provisional, avoids inserting the same new name twice within one sync
    }
  })

  if (playersToInsert.length) await db.schema('rugby').from('players').insert(playersToInsert)

  // Re-read players (including anything just inserted) for the scorer step below.
  const { data: allPlayers } = await db.schema('rugby').from('players').select('id, team_id, name')
  const playerIdByTeamAndName = new Map<string, number>()
  allPlayers?.forEach(p => playerIdByTeamAndName.set(playerKey(p.team_id, p.name), p.id))

  // ---------- Rounds (find-or-create, deadline = earliest kickoff in that round) ----------
  const { data: existingRounds } = await db.schema('rugby').from('rounds').select('id, number').eq('competition_id', competitionId)
  const roundIdByNumber = new Map<number, string>()
  existingRounds?.forEach(r => roundIdByNumber.set(r.number, r.id))

  const roundNumbers = Array.from(new Set(parsed.fixtures.map(f => f.round)))
  for (const num of roundNumbers) {
    if (roundIdByNumber.has(num)) continue
    const kickoffs = parsed.fixtures.filter(f => f.round === num).map(f => f.kickoff).filter((d): d is Date => d != null)
    if (kickoffs.length === 0) { warnings.push(`Round ${num}: no fixture has a kickoff time yet, skipped creating it for now`); continue }
    const deadline = new Date(Math.min(...kickoffs.map(d => d.getTime()))).toISOString()
    const { data: created, error } = await db.schema('rugby').from('rounds').insert({ competition_id: competitionId, number: num, deadline }).select('id').single()
    if (error || !created) { warnings.push(`Round ${num}: could not create — ${error?.message}`); continue }
    roundIdByNumber.set(num, created.id)
  }

  // ---------- Fixtures (upsert by round+home+away) ----------
  const { data: existingFixtures } = await db.schema('rugby').from('fixtures').select('id, round_id, home_team_id, away_team_id, kickoff_time')
  const fixtureKey = (roundId: string, home: number, away: number) => `${roundId}::${home}::${away}`
  const fixtureByKey = new Map<string, { id: number; kickoff_time: string | null }>()
  existingFixtures?.forEach(f => fixtureByKey.set(fixtureKey(f.round_id, f.home_team_id, f.away_team_id), { id: f.id, kickoff_time: f.kickoff_time }))

  async function resolveFixtureId(round: number, homeTeam: string, awayTeam: string, kickoff: Date | null): Promise<number | null> {
    const roundId = roundIdByNumber.get(round)
    const home = teamId(homeTeam)
    const away = teamId(awayTeam)
    if (!roundId || !home || !away) return null
    const key = fixtureKey(roundId, home, away)
    const existing = fixtureByKey.get(key)
    if (existing) {
      if (kickoff && existing.kickoff_time !== kickoff.toISOString()) {
        await db.schema('rugby').from('fixtures').update({ kickoff_time: kickoff.toISOString() }).eq('id', existing.id)
      }
      return existing.id
    }
    const { data: created, error } = await db.schema('rugby').from('fixtures').insert({
      round_id: roundId, home_team_id: home, away_team_id: away, kickoff_time: kickoff ? kickoff.toISOString() : null,
    }).select('id').single()
    if (error || !created) { warnings.push(`Fixture ${homeTeam} v ${awayTeam} (round ${round}): could not create — ${error?.message}`); return null }
    fixtureByKey.set(key, { id: created.id, kickoff_time: kickoff ? kickoff.toISOString() : null })
    return created.id
  }

  for (const f of parsed.fixtures) {
    await resolveFixtureId(f.round, f.homeTeam, f.awayTeam, f.kickoff)
  }

  // ---------- Results (find-or-create fixture, then set scores) ----------
  for (const r of parsed.results) {
    const fixtureId = await resolveFixtureId(r.round, r.homeTeam, r.awayTeam, null)
    if (!fixtureId) { warnings.push(`Result ${r.homeTeam} v ${r.awayTeam} (round ${r.round}): fixture not found/creatable`); continue }
    await db.schema('rugby').from('fixtures').update({ home_score: r.homeScore, away_score: r.awayScore, status: 'finished' }).eq('id', fixtureId)
  }

  // ---------- Scorers (full replace per fixture touched) ----------
  const scorersByFixture = new Map<number, typeof parsed.scorers>()
  for (const s of parsed.scorers) {
    const roundId = roundIdByNumber.get(s.round)
    const home = teamId(s.homeTeam)
    const away = teamId(s.awayTeam)
    if (!roundId || !home || !away) { warnings.push(`Scorer row for "${s.player}": unknown round/team`); continue }
    const existing = fixtureByKey.get(fixtureKey(roundId, home, away))
    if (!existing) { warnings.push(`Scorer row for "${s.player}": fixture ${s.homeTeam} v ${s.awayTeam} (round ${s.round}) not found`); continue }
    if (!scorersByFixture.has(existing.id)) scorersByFixture.set(existing.id, [])
    scorersByFixture.get(existing.id)!.push(s)
  }

  for (const [fixtureId, rows] of scorersByFixture) {
    await db.schema('rugby').from('match_events').delete().eq('fixture_id', fixtureId)
    const homeAway = parsed.fixtures.find(f => {
      const roundId = roundIdByNumber.get(f.round)
      return roundId && fixtureByKey.get(fixtureKey(roundId, teamId(f.homeTeam) ?? -1, teamId(f.awayTeam) ?? -1))?.id === fixtureId
    })
    const candidateTeamIds = homeAway ? [teamId(homeAway.homeTeam), teamId(homeAway.awayTeam)].filter((x): x is number => x != null) : []

    const eventsToInsert: { fixture_id: number; player_id: number | null; event_type: string; minute: number | null }[] = []
    for (const row of rows) {
      let playerId: number | null = null
      for (const tId of candidateTeamIds) {
        const found = playerIdByTeamAndName.get(playerKey(tId, row.player))
        if (found) { playerId = found; break }
      }
      if (!playerId) warnings.push(`Scorer "${row.player}" not found in either team's squad for ${row.homeTeam} v ${row.awayTeam} — recorded with no player link`)
      eventsToInsert.push({ fixture_id: fixtureId, player_id: playerId, event_type: row.eventType, minute: row.minute })
    }
    if (eventsToInsert.length) await db.schema('rugby').from('match_events').insert(eventsToInsert)
  }

  return NextResponse.json({
    success: true,
    summary: {
      players_added: playersToInsert.length,
      fixtures_seen: parsed.fixtures.length,
      results_applied: parsed.results.length,
      scorer_rows_applied: parsed.scorers.length,
    },
    warnings,
  })
}
