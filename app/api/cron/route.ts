import { createAdminSupabaseClient } from '../../lib/supabase-admin'
import { runBotPickForGameweek } from '../../lib/botPick'
import { syncPlayers } from '../../lib/syncPlayers'
import { lockOverdueGameweeks } from '../../lib/lockGameweeks'
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

  // Runs first, before Futzy's own pick derivation below — so his
  // projections use whatever's freshest from today's run, not yesterday's.
  // Deliberately here on the once-a-day cron rather than the frequent
  // live-sync one (app/api/cron/live-sync): underlying xG/xA/form/injury
  // data doesn't meaningfully change within a few minutes, so polling it
  // that often would just be wasted FPL API calls and DB writes.
  const playerSyncResult = await syncPlayers(supabase)

  // Futzy — re-derive and submit his pick for ONLY the single next
  // gameweek (deadline still ahead) in a bot_enabled competition, every
  // single daily run, so his pick keeps reflecting whatever's freshly
  // synced right up until the deadline passes. Deliberately mirrors
  // exactly what a human sees on /picks — the earliest not-yet-locked
  // gameweek, never every future gameweek at once. Without narrowing to
  // one, he'd pick for every gameweek that already has fixtures assigned,
  // weeks ahead of when a human even can — both looking wrong and letting
  // his team/player use-count accounting drift out of sync with what
  // actually happens in between now and then. Deliberately separate from
  // the post-deadline block below: that one only ever runs once a
  // deadline has already gone, this one only while it hasn't.
  const { data: botCompetitions } = await supabase
    .from('competitions')
    .select('id')
    .eq('bot_enabled', true)

  const botCompetitionIds = new Set((botCompetitions ?? []).map(c => c.id))
  const botResults = []

  if (botCompetitionIds.size > 0) {
    const { data: candidateGameweeks } = await supabase
      .from('gameweeks')
      .select('id, competition_id')
      .in('status', ['open', 'upcoming'])
      .gt('deadline', now.toISOString())
      .order('deadline', { ascending: true })

    const nextGameweekByCompetition = new Map<string, { id: string; competition_id: string }>()
    for (const gw of candidateGameweeks ?? []) {
      if (!botCompetitionIds.has(gw.competition_id)) continue
      if (!nextGameweekByCompetition.has(gw.competition_id)) {
        nextGameweekByCompetition.set(gw.competition_id, gw)
      }
    }

    for (const gw of nextGameweekByCompetition.values()) {
      const result = await runBotPickForGameweek(supabase, gw.id)
      botResults.push({ gameweek_id: gw.id, ...result })
    }
  }

  // Catch any gameweek whose deadline has passed and hasn't been locked
  // yet — not just ones that passed in a narrow recent window. This means
  // a gameweek can never be missed, even if the cron job doesn't run for
  // a day or two, or a deadline falls at an awkward time. Kept here as a
  // safety net even though the frequent live-sync cron now also does this
  // (see lockGameweeks.ts) — this is what still catches it if that one
  // ever stops running for some reason.
  const results = await lockOverdueGameweeks(supabase)

  return NextResponse.json({ success: true, player_sync: playerSyncResult, results, bot_results: botResults })
}