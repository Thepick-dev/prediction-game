import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireUser } from '../../../lib/require-admin'
import { NextResponse } from 'next/server'

// Goes through the service-role client for the same reason as the squad
// draft: a normal session's RLS can't see anyone else's answers before
// the deadline, but the underdog bonus needs to. Upserts one-by-one so a
// player can save partial progress and finish later — the Picks page
// itself decides when "every active question answered" counts as done.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const user = await requireUser(supabase)
  if (!user) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const db = createAdminSupabaseClient()

  const { competition_id, answers } = await request.json()
  if (!competition_id || !Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: 'No answers submitted' }, { status: 400 })
  }

  const { data: round1 } = await db.schema('rugby').from('rounds').select('deadline').eq('competition_id', competition_id).eq('number', 1).maybeSingle()
  if (round1 && new Date() >= new Date(round1.deadline)) {
    return NextResponse.json({ error: "Round 1's deadline has passed — tournament predictions can no longer be changed" }, { status: 400 })
  }

  const rows = answers.map((a: { type_key: string; answer_team_id?: number; answer_player_id?: number; answer_numeric?: number; answer_fixture_id?: number }) => ({
    competition_id,
    user_id: user.id,
    type_key: a.type_key,
    answer_team_id: a.answer_team_id ?? null,
    answer_player_id: a.answer_player_id ?? null,
    answer_numeric: a.answer_numeric ?? null,
    answer_fixture_id: a.answer_fixture_id ?? null,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await db.schema('rugby').from('season_predictions').upsert(rows, { onConflict: 'competition_id,user_id,type_key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
