import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'

// Called the moment a Penalty Shootout game actually starts, not when a
// score is submitted — see app/api/minigame/score/route.ts for why. The
// token binds the caller's own user id and a server-trusted start time,
// signed with CRON_SECRET (already a private, server-only value; reused
// here rather than adding a second secret for one more internal purpose).
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: profile } = await supabase.from('profiles').select('is_minigame_banned').eq('id', user.id).maybeSingle()
  if (profile?.is_minigame_banned) {
    return NextResponse.json({ error: 'Banned from this game' }, { status: 403 })
  }

  const payload = `${user.id}.${Date.now()}`
  const signature = createHmac('sha256', process.env.CRON_SECRET!).update(payload).digest('hex')
  return NextResponse.json({ token: `${payload}.${signature}` })
}
