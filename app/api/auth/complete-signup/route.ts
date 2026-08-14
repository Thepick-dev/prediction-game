import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { isValidUsername, USERNAME_RULES_MESSAGE } from '../../../lib/username'
import { NextResponse } from 'next/server'

// Setting the new player's username/approval fields has to happen here,
// server-side with the service-role key, not as a client-side .update()
// right after signUp(). Two reasons that client-side version could
// silently do nothing: there's no session yet (whenever Supabase's
// "Confirm email" is switched on, signUp() returns no session until
// that link is clicked, so RLS has no auth.uid() to match against and
// the update quietly affects zero rows — no error, just nothing saved),
// or the profiles row doesn't exist yet at all if nothing's created it
// yet. upsert() with the service role sidesteps both: it bypasses RLS
// entirely and creates the row if it's missing rather than assuming an
// update will find one.
export async function POST(request: Request) {
  const { userId, username } = await request.json()

  if (!userId || !username || !username.trim()) {
    return NextResponse.json({ error: 'Missing signup details' }, { status: 400 })
  }
  if (!isValidUsername(username)) {
    return NextResponse.json({ error: USERNAME_RULES_MESSAGE }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  // No session to check here (see the comment above — there may genuinely
  // be none yet), so this route can't tell "the same person retrying" from
  // "someone else entirely" except by looking at the row itself. Only
  // refuse when it's already APPROVED — a real player an admin has
  // actually let in, where a rename-and-reset-to-pending would be a real
  // disruption. A still-pending row is safe to freely re-complete: nothing
  // external depends on it yet, and a harmless retry (password typo fixed,
  // browser hiccup, wanting to change the username before anyone's looked
  // at it) is common and must not silently fail to save — confirmed this
  // is exactly what broke a real signup on 2026-08-14.
  const { data: existing } = await admin.from('profiles').select('id, approved').eq('id', userId).maybeSingle()
  if (existing?.approved) {
    return NextResponse.json({ error: 'Account already set up' }, { status: 409 })
  }

  const { error } = await admin
    .from('profiles')
    .upsert(
      { id: userId, display_name: username.trim(), approved: false, pending_since: new Date().toISOString() },
      { onConflict: 'id' }
    )

  if (error) {
    return NextResponse.json({ error: error.message.includes('unique') ? 'That username is already taken' : error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
