import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { isValidUsername, USERNAME_RULES_MESSAGE } from '../../../lib/username'
import { checkRateLimit, getClientIp } from '../../../lib/rateLimit'
import { isInviteCodeUsable } from '../../../lib/inviteCodes'
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
  const { userId, username, inviteCode } = await request.json()

  if (!userId || !username || !username.trim()) {
    return NextResponse.json({ error: 'Missing signup details' }, { status: 400 })
  }
  if (!isValidUsername(username)) {
    return NextResponse.json({ error: USERNAME_RULES_MESSAGE }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()

  // Site-wide signup mode — isolated, defensive: a missing table/row
  // behaves exactly like today (open, no code needed).
  let signupMode: 'open' | 'invite_only' | 'closed' = 'open'
  try {
    const { data } = await admin.from('signup_settings').select('mode').eq('id', 'singleton').maybeSingle()
    if (data?.mode === 'invite_only' || data?.mode === 'closed') signupMode = data.mode
  } catch {}

  if (signupMode === 'closed') {
    return NextResponse.json({ error: 'Sign-ups are closed right now' }, { status: 403 })
  }

  // Validated here, server-side, even though the Join form also checks
  // this client-side first — a client-side check is only ever a courtesy
  // message, never the real gate, since it's trivial to skip.
  let matchedCode: { id: string; active: boolean; max_uses: number | null; uses_count: number } | null = null
  const trimmedCode = (inviteCode as string | undefined)?.trim()
  if (trimmedCode) {
    const { data: codeRow } = await admin
      .from('signup_invite_codes')
      .select('id, active, max_uses, uses_count')
      .eq('code', trimmedCode)
      .maybeSingle()
    if (codeRow && isInviteCodeUsable(codeRow)) matchedCode = codeRow
  }

  if (signupMode === 'invite_only' && !matchedCode) {
    return NextResponse.json({ error: 'A valid invite code is needed to sign up right now' }, { status: 403 })
  }

  // Same reasoning as login/reset — generous for a real person retrying
  // after a typo or browser hiccup (see the comment below on why retries
  // are deliberately allowed), a real obstacle for a script trying to
  // mass-create accounts. The actual supabase.auth.signUp() call already
  // happened client-side before this route is ever reached, so this isn't
  // a complete defence against that specifically — just the best one
  // available from this side.
  const allowed = await checkRateLimit(admin, `signup:${getClientIp(request)}`, { max: 5, windowSeconds: 3600 })
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts — please wait a while and try again' }, { status: 429 })
  }

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

  // A valid code skips the pending queue entirely — approved straight
  // away, same as an admin clicking Approve, just automatic.
  const { error } = await admin
    .from('profiles')
    .upsert(
      matchedCode
        ? { id: userId, display_name: username.trim(), approved: true, pending_since: null }
        : { id: userId, display_name: username.trim(), approved: false, pending_since: new Date().toISOString() },
      { onConflict: 'id' }
    )

  if (error) {
    return NextResponse.json({ error: error.message.includes('unique') ? 'That username is already taken' : error.message }, { status: 400 })
  }

  if (matchedCode) {
    // Best-effort — the account is already created and approved at this
    // point either way, so a problem recording the code's use should
    // never undo that or block the signup from completing.
    await admin.from('signup_invite_codes').update({ uses_count: matchedCode.uses_count + 1 }).eq('id', matchedCode.id)
    await admin.from('signup_invite_code_uses').insert({ code_id: matchedCode.id, user_id: userId })
  }

  return NextResponse.json({ success: true, autoApproved: !!matchedCode })
}
