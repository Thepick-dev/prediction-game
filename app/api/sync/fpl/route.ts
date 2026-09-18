import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/require-admin'
import { syncPlayers } from '../../../lib/syncPlayers'
import { syncFixtureDifficulty } from '../../../lib/syncFixtureDifficulty'
import { syncPlayerFormHistory } from '../../../lib/syncPlayerFormHistory'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createServerSupabaseClient()
  if (!(await requireAdmin(supabase))) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const result = await syncPlayers(supabase)
  // Both isolated and non-blocking — a problem in either must never stop
  // this button reporting the main player sync's own result, which is
  // what admin actually cares about seeing succeed or fail.
  const fixtureDifficultyResult = await syncFixtureDifficulty(supabase)
  const playerFormHistoryResult = await syncPlayerFormHistory(supabase)
  return NextResponse.json(
    { ...result, fixture_difficulty_sync: fixtureDifficultyResult, player_form_history_sync: playerFormHistoryResult },
    { status: result.success ? 200 : 500 }
  )
}
