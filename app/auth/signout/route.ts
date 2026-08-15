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
  //
  // Explicit 303, not the default 307: this request is itself a POST (the
  // Log Out form), and NextResponse.redirect() defaults to a 307, which
  // preserves the original method — the browser would then re-issue the
  // redirect as a POST to /login, a page with no POST handler, and get a
  // blank 405 instead of the login page. 303 forces the follow-up request
  // to GET, which is what a redirect-after-POST to a plain page needs.
  // Confirmed by reproducing this exact failure against the live site.
  return NextResponse.redirect(new URL('/login', request.url), 303)
}