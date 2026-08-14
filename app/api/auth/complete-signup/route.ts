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
  // be none yet), so this route is only as safe as this guard: it must
  // never be usable to rewrite an EXISTING profile — display_name, and
  // especially approved/pending_since — since the request carries nothing
  // proving the caller owns userId. A legitimate call only ever targets a
  // brand new id with no row yet (it's sent straight after signUp()), so
  // refusing whenever one already exists costs the real flow nothing.
  const { data: existing } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (existing) {
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
