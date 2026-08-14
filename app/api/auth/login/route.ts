import { createClient } from '@supabase/supabase-js'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { resolveIdentifier } from '../../../lib/auth-identifier'
import { checkRateLimit, getClientIp } from '../../../lib/rateLimit'
import { NextResponse } from 'next/server'

// Replaces the old username-only /api/auth/username-login — Supabase Auth
// is fundamentally email-based, so logging in with a username OR an email
// both round-trip through this one server route (which alone has the
// service-role access needed to resolve a username to its account) before
// handing off to a normal signInWithPassword.
export async function POST(request: Request) {
  const { identifier, password } = await request.json()

  if (!identifier || !password) {
    return NextResponse.json({ error: 'Enter your username or email, and your password' }, { status: 400 })
  }

  // Deliberately the same generic message for "no such account" and
  // "wrong password" — telling them apart would let someone probe which
  // usernames/emails are registered.
  const genericError = NextResponse.json({ error: 'Incorrect username/email or password' }, { status: 400 })

  const admin = createAdminSupabaseClient()

  // 10 attempts per 5 minutes per IP — generous for a real person who's
  // fat-fingered their password a few times, a real obstacle for a script
  // trying to brute-force one. Bucketed by IP, not by the identifier
  // being attempted, so this can't itself be used to lock a real user out
  // by deliberately failing their login from elsewhere.
  const allowed = await checkRateLimit(admin, `login:${getClientIp(request)}`, { max: 10, windowSeconds: 300 })
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts — please wait a few minutes and try again' }, { status: 429 })
  }

  const resolved = await resolveIdentifier(admin, identifier)
  if (!resolved) return genericError

  const supabasePublic = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: signInData, error: signInError } = await supabasePublic.auth.signInWithPassword({
    email: resolved.email,
    password,
  })

  if (signInError || !signInData.session) return genericError

  return NextResponse.json({
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
  })
}
