import { createServerSupabaseClient } from '../../lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  // Straight to /login, not '/' — '/' redirects to /picks, which then has
  // to load client-side and notice there's no user before it bounces to
  // /login itself, so signing out visibly "hung" on a half-loaded Picks
  // page for a moment before landing anywhere.
  // Derived from the actual request rather than NEXT_PUBLIC_SITE_URL — that
  // env var has already caused a real production-only bug once this
  // session (it's easy to leave unset or stale wherever this is deployed).
  return NextResponse.redirect(new URL('/login', request.url))
}