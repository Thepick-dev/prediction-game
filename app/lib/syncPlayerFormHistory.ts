import type { SupabaseClient } from '@supabase/supabase-js'
import { getFplTeamMapping } from './fplTeamMapping'

export type SyncPlayerFormHistoryResult =
  | { success: true; players_synced: number; cycle_completed: boolean }
  | { success: false; error: string }

// FPL's per-player history endpoint is one call PER PLAYER — with ~700
// active players, syncing everyone in one run would mean 700 near-
// simultaneous requests, which is the "hammering" outcome this is
// deliberately built to avoid. Instead: a small batch (BATCH_SIZE) each
// day, moving a saved cursor forward through the player list and wrapping
// back to the start once it reaches the end — a full refresh cycle takes
// a few days, which is completely fine for "recent form" data that only
// meaningfully changes once a week anyway (when a gameweek completes).
// Within a batch, requests go out in small concurrent groups with a short
// pause between them — a steady trickle over a few seconds, not a burst.
const BATCH_SIZE = 150
const CONCURRENCY = 10
const PAUSE_BETWEEN_GROUPS_MS = 150

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function syncPlayerFormHistory(supabase: SupabaseClient): Promise<SyncPlayerFormHistoryResult> {
  const { data: cursorRow } = await supabase
    .from('sync_cursors')
    .select('cursor_value')
    .eq('sync_name', 'player_form_history')
    .maybeSingle()
  const lastId = cursorRow?.cursor_value ? Number(cursorRow.cursor_value) : 0

  const { data: firstPage } = await supabase
    .from('players')
    .select('id')
    .eq('active', true)
    .gt('id', lastId)
    .order('id', { ascending: true })
    .limit(BATCH_SIZE)

  let batch = firstPage ?? []
  let cycleCompleted = false

  if (batch.length < BATCH_SIZE) {
    // Reached the end of the player list — wrap around and fill the rest
    // of this batch from the start, so a full cycle doesn't stall forever
    // on whichever player happens to have the highest id.
    const { data: wrapPage } = await supabase
      .from('players')
      .select('id')
      .eq('active', true)
      .lte('id', lastId)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE - batch.length)
    if (wrapPage && wrapPage.length > 0) {
      batch = [...batch, ...wrapPage]
    }
    cycleCompleted = true
  }

  if (batch.length === 0) {
    return { success: true, players_synced: 0, cycle_completed: false }
  }

  let fplTeams: { id: number; short_name: string; name: string }[]
  try {
    const bootstrapRes = await fetch(
      'https://fantasy.premierleague.com/api/bootstrap-static/',
      { headers: { 'User-Agent': 'prediction-game/1.0' } }
    )
    fplTeams = (await bootstrapRes.json()).teams
  } catch {
    return { success: false, error: 'Failed to fetch FPL teams for opponent mapping' }
  }
  const fplTeamIdToOurTeamId = await getFplTeamMapping(supabase, fplTeams)

  const historyRows: any[] = []
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const chunk = batch.slice(i, i + CONCURRENCY)
    const results = await Promise.all(chunk.map(async player => {
      try {
        const res = await fetch(
          `https://fantasy.premierleague.com/api/element-summary/${player.id}/`,
          { headers: { 'User-Agent': 'prediction-game/1.0' } }
        )
        if (!res.ok) return []
        const data = await res.json()
        // Last 6 played gameweeks — enough for a "last 5" chart plus one
        // spare, without needing the player's entire season history.
        const recent = (data.history ?? []).slice(-6)
        return recent.map((h: any) => ({
          player_id: player.id,
          round: h.round,
          opponent_team_id: fplTeamIdToOurTeamId[h.opponent_team] ?? null,
          was_home: !!h.was_home,
          total_points: h.total_points ?? null,
          minutes: h.minutes ?? null,
          goals_scored: h.goals_scored ?? null,
          assists: h.assists ?? null,
          bonus: h.bonus ?? null,
          bps: h.bps ?? null,
          ict_index: h.ict_index != null ? parseFloat(h.ict_index) : null,
          updated_at: new Date().toISOString(),
        }))
      } catch {
        return []
      }
    }))
    results.forEach(rows => historyRows.push(...rows))
    if (i + CONCURRENCY < batch.length) await sleep(PAUSE_BETWEEN_GROUPS_MS)
  }

  // Its own isolated write, same defensive convention as the rest of this
  // feature — if the table doesn't exist yet (SQL not run), this quietly
  // does nothing rather than breaking the sync.
  if (historyRows.length > 0) {
    try {
      await supabase.from('player_gameweek_history').upsert(historyRows, { onConflict: 'player_id,round' })
    } catch { /* table may not exist yet */ }
  }

  const newCursor = cycleCompleted ? '0' : String(batch[batch.length - 1].id)
  try {
    await supabase
      .from('sync_cursors')
      .upsert({ sync_name: 'player_form_history', cursor_value: newCursor, updated_at: new Date().toISOString() }, { onConflict: 'sync_name' })
  } catch { /* table may not exist yet */ }

  return { success: true, players_synced: batch.length, cycle_completed: cycleCompleted }
}
