import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { resolveIdentifier } from '../../../lib/auth-identifier'
import { checkRateLimit, getClientIp } from '../../../lib/rateLimit'
import { NextResponse } from 'next/server'

// Public, unauthenticated by design — the whole point is for someone who
// can't log in to reach it. Always returns the same generic success
// message regardless of whether a match was found, so this can't be used
// to probe which usernames/emails exist.
export async function POST(request: Request) {
  const { identifier } = await request.json()

  if (!identifier || !identifier.trim()) {
    return NextResponse.json({ error: 'Enter your username or email' }, { status: 400 })
  }

  const supabaseAdmin = createAdminSupabaseClient()

  // 5 requests per 10 minutes per IP — this doesn't send an email itself
  // (an admin reviews and actions requests manually), so the real risk is
  // just junk rows flooding the admin's queue, not spamming a third
  // party's inbox.
  const allowed = await checkRateLimit(supabaseAdmin, `reset:${getClientIp(request)}`, { max: 5, windowSeconds: 600 })
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests — please wait a few minutes and try again' }, { status: 429 })
  }

  const resolved = await resolveIdentifier(supabaseAdmin, identifier)

  await supabaseAdmin.from('password_reset_requests').insert({
    identifier: identifier.trim(),
    user_id: resolved?.userId ?? null,
    status: 'pending',
  })

  return NextResponse.json({ success: true })
}
