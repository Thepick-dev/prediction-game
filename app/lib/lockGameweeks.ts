import type { SupabaseClient } from '@supabase/supabase-js'
import { runAutopickForGameweek } from './autopick'

export type LockGameweeksResult = { gameweek_id: string; [key: string]: unknown }[]

// Shared by the once-a-day cron (app/api/cron, the original home of this —
// kept as a safety net so a gameweek can never be missed even if the
// frequent cron below stops running for some reason) and the every-few-
// minutes live-sync cron (app/api/cron/live-sync, added so a deadline
// passing during the day gets locked and autopicked within minutes, not
// up to 24 hours later at the next daily run). Idempotent by construction
// — only ever selects gameweeks still in 'open'/'upcoming', so calling
// this every 5 minutes just does nothing extra once a gameweek's already
// been locked.
export async function lockOverdueGameweeks(supabase: SupabaseClient): Promise<LockGameweeksResult> {
  const now = new Date()

  const { data: gameweeks } = await supabase
    .from('gameweeks')
    .select('id, competition_id, deadline, status, number')
    .in('status', ['open', 'upcoming'])
    .lt('deadline', now.toISOString())

  if (!gameweeks || gameweeks.length === 0) return []

  const results: LockGameweeksResult = []

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

  return results
}
