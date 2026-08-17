import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'
import { MINIGAME_MAX_SCORE } from '../../../lib/minigame'

// The Penalty Shootout runs entirely client-side (hit detection, timing,
// difficulty), so there's no way to fully re-derive a score server-side.
// This is the next best thing: a verified endpoint that only ever trusts
// the caller's own session (never a client-supplied user id), rejects
// anything outside what the game can actually produce, and never lets a
// submission lower an existing best. Found via a friend inflating their
// own score to 69696969 by calling the old direct-from-the-browser
// Supabase write with an arbitrary number — that write had no server-side
// check on the value at all.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { score } = await request.json()
  if (!Number.isInteger(score) || score < 0 || score > MINIGAME_MAX_SCORE) {
    return NextResponse.json({ error: 'Invalid score' }, { status: 400 })
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
