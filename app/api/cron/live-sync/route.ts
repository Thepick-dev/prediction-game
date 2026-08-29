import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { syncEventsForGameweek } from '../../../lib/syncEvents'
import { syncResults } from '../../../lib/syncResults'
import { lockOverdueGameweeks } from '../../../lib/lockGameweeks'
import { NextResponse } from 'next/server'

// Meant to be hit every few minutes by an external scheduler (Vercel's own
// Hobby-plan cron only allows once a day — see the free workaround this
// was built for), so a live gameweek's goals/assists/scores stay current
// without an admin manually clicking "Sync Results"/"Sync from FPL" during
// a match. Deliberately its own route rather than folding into /api/cron —
// that one only ever runs once a day and does unrelated things (Futzy,
// player data refresh); this needs a much tighter interval. Locking an
// overdue gameweek is the one exception shared with the daily cron (see
// lockGameweeks.ts) — a deadline passing is exactly the kind of thing this
// frequent cron exists for, so a gameweek locks (and autopicks) within
// minutes rather than waiting up to 24 hours for the daily run, which
// stays as a safety net if this one ever stops running.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()
  const now = new Date()

  const lockResults = await lockOverdueGameweeks(supabase)

  const { data: comp } = await supabase.from('competitions').select('id').eq('status', 'active').single()
  if (!comp) {
    return NextResponse.json({ success: true, message: 'No active competition', lockResults, results: [] })
  }

  // Same "still live" definition already used by the Leaderboard's own
  // preview-scoring fetch: deadline's passed (so picks are safe to reveal)
  // but not yet marked completed (so there's still something worth
  // refreshing) — normally exactly one gameweek at a time.
  const { data: gameweeks } = await supabase
    .from('gameweeks')
    .select('id, number, deadline')
    .eq('competition_id', comp.id)
    .lt('deadline', now.toISOString())
    .neq('status', 'completed')

  if (!gameweeks || gameweeks.length === 0) {
    return NextResponse.json({ success: true, message: 'No live gameweek right now', lockResults, results: [] })
  }

  // Not gameweek-scoped (football-data.org just returns "everything
  // currently finished" for the season, harmless to re-upsert) — run once,
  // not once per live gameweek, before the per-gameweek events loop below.
  const resultsSync = await syncResults(supabase)

  const results = []
  for (const gw of gameweeks) {
    // Same default the admin's own "FPL Gameweek Number" field starts
    // from (app/admin/events/page.tsx) — this competition's gameweek
    // count matching the real Premier League's, which is true for every
    // competition so far.
    const result = await syncEventsForGameweek(supabase, gw.id, gw.number)
    results.push({ gameweek_id: gw.id, gameweek_number: gw.number, ...result })
  }

  return NextResponse.json({ success: true, lockResults, resultsSync, results })
}
