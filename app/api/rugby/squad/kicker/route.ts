import { createServerSupabaseClient } from '../../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../../lib/supabase-admin'
import { requireUser } from '../../../../lib/require-admin'
import { NextResponse } from 'next/server'

// Free, unlimited — a squad-membership decision (who's on your 6) and a
// kicker decision (how you use them) are treated as two separate levers,
// so this never touches the sub budget.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const user = await requireUser(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }
  const db = createAdminSupabaseClient()

  const { competition_id, player_id } = await request.json()
  if (!competition_id || !player_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data: pick } = await db.schema('rugby').from('season_squad_picks')
    .select('id').eq('competition_id', competition_id).eq('user_id', user.id).eq('player_id', player_id).eq('active', true).maybeSingle()
  if (!pick) {
    return NextResponse.json({ error: 'That player is not currently in your squad' }, { status: 400 })
  }

  await db.schema('rugby').from('season_squad_picks').update({ is_kicker: false }).eq('competition_id', competition_id).eq('user_id', user.id).eq('active', true)
  const { error } = await db.schema('rugby').from('season_squad_picks').update({ is_kicker: true }).eq('id', pick.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
