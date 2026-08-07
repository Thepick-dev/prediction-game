import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { resolveIdentifier } from '../../../lib/auth-identifier'
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
  const resolved = await resolveIdentifier(supabaseAdmin, identifier)

  await supabaseAdmin.from('password_reset_requests').insert({
    identifier: identifier.trim(),
    user_id: resolved?.userId ?? null,
    status: 'pending',
  })

  return NextResponse.json({ success: true })
}
