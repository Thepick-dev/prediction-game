import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'
import { MINIGAME_MAX_SCORE, MINIGAME_LOCKED_USERS } from '../../../lib/minigame'
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
// actually produce, never let a submission lower an existing best, and —
// the part missing the first time round — require proof that real time
// actually elapsed since a session genuinely started.
//
// History: a friend first inflated their own score to 69696969 by calling
// the old direct-from-the-browser Supabase write with an arbitrary number
// (no server-side check existed at all). Once that was closed with a
// range check + DB constraint, they did it again — submitting exactly 99,
// the range check's own ceiling, seconds after presumably not playing at
// all. A plausible-looking number was never proof a game was actually
// played; the session/timing check below is what actually proves that.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (user.id in MINIGAME_LOCKED_USERS) {
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

  const { data: existing } = await supabase
    .from('minigame_penalty_scores')
    .select('best_score')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing && existing.best_score >= score) {
    return NextResponse.json({ success: true, best_score: existing.best_score })
  }

  const { error } = await supabase
    .from('minigame_penalty_scores')
    .upsert({ user_id: user.id, best_score: score, updated_at: new Date().toISOString() })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ success: true, best_score: score })
}
