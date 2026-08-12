import { createAdminSupabaseClient } from '../../lib/supabase-admin'
import { runAutopickForGameweek } from '../../lib/autopick'
import { runBotPickForGameweek } from '../../lib/botPick'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // No Supabase user session exists here at all (this is authenticated via
  // CRON_SECRET above, not a login) — use the service role client rather
  // than one keyed to a cookie session that will never be present.
  const supabase = createAdminSupabaseClient()
  const now = new Date()

  // Futzy — re-derive and submit his pick for every still-OPEN gameweek
  // (deadline still ahead) in a bot_enabled competition, every single daily
  // run, so his pick keeps reflecting whatever's freshly synced right up
  // until the deadline passes. Deliberately separate from the post-deadline
  // block below: that one only ever runs once a deadline has already gone,
  // this one only while it hasn't. Two plain queries + a JS filter rather
  // than an embedded-join filter, matching how the rest of this codebase
  // does cross-table lookups.
  const { data: botCompetitions } = await supabase
    .from('competitions')
    .select('id')
    .eq('bot_enabled', true)

  const botCompetitionIds = new Set((botCompetitions ?? []).map(c => c.id))
  const botResults = []

  if (botCompetitionIds.size > 0) {
    const { data: openGameweeks } = await supabase
      .from('gameweeks')
      .select('id, competition_id')
      .in('status', ['open', 'upcoming'])
      .gt('deadline', now.toISOString())

    for (const gw of (openGameweeks ?? []).filter(g => botCompetitionIds.has(g.competition_id))) {
      const result = await runBotPickForGameweek(supabase, gw.id)
      botResults.push({ gameweek_id: gw.id, ...result })
    }
  }

  // Catch any gameweek whose deadline has passed and hasn't been locked
  // yet — not just ones that passed in a narrow recent window. This means
  // a gameweek can never be missed, even if the cron job doesn't run for
  // a day or two, or a deadline falls at an awkward time.
  const { data: gameweeks } = await supabase
    .from('gameweeks')
    .select('id, competition_id, deadline, status, number')
    .in('status', ['open', 'upcoming'])
    .lt('deadline', now.toISOString())

  if (!gameweeks || gameweeks.length === 0) {
    return NextResponse.json({ success: true, message: 'No gameweeks to process', bot_results: botResults })
  }

  const results = []

  for (const gw of gameweeks) {
    await supabase
      .from('gameweeks')
      .update({ status: 'locked' })
      .eq('id', gw.id)

    // Once the very first gameweek's deadline passes for a competition,
    // permanently lock every player's tier draft picks so double-use
    // team selections can no longer be changed for the rest of the season.
    if (gw.number === 1) {
      await supabase
        .from('tier_draft_picks')
        .update({ locked: true })
        .eq('competition_id', gw.competition_id)
        .eq('locked', false)
    }

    const data = await runAutopickForGameweek(supabase, gw.id)
    results.push({ gameweek_id: gw.id, ...data })
  }

  return NextResponse.json({ success: true, results, bot_results: botResults })
}