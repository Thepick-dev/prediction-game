import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/require-admin'
import { syncEventsForGameweek } from '../../../lib/syncEvents'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const { gameweek_id, fpl_event } = await request.json()
  if (!gameweek_id || !fpl_event) {
    return NextResponse.json({ error: 'Missing gameweek_id or fpl_event' }, { status: 400 })
  }

  const result = await syncEventsForGameweek(supabase, gameweek_id, fpl_event)
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
