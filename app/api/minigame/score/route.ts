import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { NextResponse } from 'next/server'
import { MINIGAME_MAX_SCORE } from '../../../lib/minigame'
import { createHmac, timingSafeEqual } from 'crypto'

// The fastest a round can possibly resolve is MIN_DURATION (0.28s) in
// components/PenaltyShootout.tsx, and every point needs at least one full
// round — 0.15s of real elapsed time per point is a generous floor that
// never blocks a genuinely fast player, but does block claiming a high
// score seconds after a session supposedly started.
const MIN_SECONDS_PER_POINT = 0.15

// The Penalty Shootout runs entirely client-side (hit detection, timing,
// difficulty), so there's no way to fully re-derive a score server-side.
// What this route CAN do: never trust the caller's own user id (always
// the verified session's), reject anything outside what the game can
// actually produce, never let a submission lower an existing best, and
// require proof that real time actually elapsed since a session began.
//
// The write itself goes through the service-role client, not the regular
// session-scoped one — minigame_penalty_scores' RLS no longer grants
// authenticated users direct insert/update at all (see the REVOKE handed
// over alongside this file). That closes the hole that let every fix up
// to this point be bypassed with one raw browser-console call: this
// route's validation used to be the ONLY thing standing between a request
// and the table, and a request that skipped the route skipped everything
// it checked, database constraint aside. Now the database itself refuses
// the write unless it comes from here.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: profile } = await supabase.from('profiles').select('is_minigame_banned').eq('id', user.id).maybeSingle()
  if (profile?.is_minigame_banned) {
    return NextResponse.json({ error: 'Your score is locked' }, { status: 403 })
  }

  const { score, session } = await request.json()
  if (!Number.isInteger(score) || score < 0 || score > MINIGAME_MAX_SCORE) {
    return NextResponse.json({ error: 'Invalid score' }, { status: 400 })
  }

  let elapsedSeconds = 0
  if (typeof session === 'string') {
    const parts = session.split('.')
    if (parts.length === 3) {
      const [sessionUserId, startedAtStr, signature] = parts
      const expected = createHmac('sha256', process.env.CRON_SECRET!).update(`${sessionUserId}.${startedAtStr}`).digest('hex')
      const sigBuf = Buffer.from(signature, 'hex')
      const expBuf = Buffer.from(expected, 'hex')
      const validSignature = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)
      if (validSignature && sessionUserId === user.id) {
        elapsedSeconds = (Date.now() - Number(startedAtStr)) / 1000
      }
    }
  }

  if (score > elapsedSeconds / MIN_SECONDS_PER_POINT) {
    return NextResponse.json({ error: 'Score not plausible for how long this session has been running' }, { status: 400 })
  }

  const adminClient = createAdminSupabaseClient()

  const { data: existing } = await adminClient
    .from('minigame_penalty_scores')
    .select('best_score')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing && existing.best_score >= score) {
    return NextResponse.json({ success: true, best_score: existing.best_score })
  }

  const { error } = await adminClient
    .from('minigame_penalty_scores')
    .upsert({ user_id: user.id, best_score: score, updated_at: new Date().toISOString() })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ success: true, best_score: score })
}
