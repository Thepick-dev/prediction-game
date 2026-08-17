import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { MINIGAME_LOCKED_USERS } from '../../../lib/minigame'

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
  if (user.id in MINIGAME_LOCKED_USERS) {
    return NextResponse.json({ error: 'Banned from this game' }, { status: 403 })
  }

  const payload = `${user.id}.${Date.now()}`
  const signature = createHmac('sha256', process.env.CRON_SECRET!).update(payload).digest('hex')
  return NextResponse.json({ token: `${payload}.${signature}` })
}
