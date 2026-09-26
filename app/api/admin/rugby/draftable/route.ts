import { createServerSupabaseClient } from '../../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../../lib/supabase-admin'
import { requireAdmin } from '../../../../lib/require-admin'
import { NextResponse } from 'next/server'

// Toggles rugby.players.is_draftable — the single evolving list Kit
// confirmed (2026-09-26): no per-gameweek reset, admin adds/removes
// whenever. A plain UPDATE, either one player or a whole filtered batch
// (the admin page's "set all visible" action) in one call.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  const db = createAdminSupabaseClient()

  const { player_ids, draftable } = await request.json() as { player_ids: number[]; draftable: boolean }
  if (!Array.isArray(player_ids) || player_ids.length === 0 || typeof draftable !== 'boolean') {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { error } = await db.schema('rugby').from('players').update({ is_draftable: draftable }).in('id', player_ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
