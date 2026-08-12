import { createServerSupabaseClient } from '../../lib/supabase-server'
import { NextResponse } from 'next/server'

// Set or change your rival for a competition — one row per user per
// competition, upserted (never more than one rival at a time). Fully
// public once set (see the SELECT policy) since the whole point is being
// visible on the leaderboard, not a private thing.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { competition_id, rival_user_id } = await request.json()

  if (!competition_id || !rival_user_id) {
    return NextResponse.json({ error: 'Missing competition or rival' }, { status: 400 })
  }
  if (rival_user_id === user.id) {
    return NextResponse.json({ error: "You can't rival yourself" }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('rivalries')
    .select('id')
    .eq('competition_id', competition_id)
    .eq('user_id', user.id)
    .maybeSingle()

  const { error } = existing
    ? await supabase.from('rivalries').update({ rival_user_id }).eq('id', existing.id)
    : await supabase.from('rivalries').insert({ competition_id, user_id: user.id, rival_user_id })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { competition_id } = await request.json()
  if (!competition_id) {
    return NextResponse.json({ error: 'Missing competition' }, { status: 400 })
  }

  await supabase.from('rivalries').delete().eq('competition_id', competition_id).eq('user_id', user.id)
  return NextResponse.json({ success: true })
}
