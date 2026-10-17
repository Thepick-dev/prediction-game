import { createServerSupabaseClient } from '../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../lib/supabase-admin'
import { generateInviteCode, isInviteCodeUsable } from '../../lib/inviteCodes'
import { NextResponse } from 'next/server'

// Player-generated invite links — same signup_invite_codes table as
// admin-issued codes (created_by tells them apart), but gated by a
// site-wide toggle + per-player cap an admin controls from /admin/users,
// not by is_admin. RLS on this table has no policy for a regular session
// (same as every admin-side read/write of it), so this always goes
// through the service role once the caller's own session has been
// checked — there's no "is this user allowed to touch this row" question
// here, since every row this route touches is either new or already
// theirs (created_by = their own id).
async function requireApprovedCaller() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('approved').eq('id', user.id).maybeSingle()
  if (!profile?.approved) return null
  return user
}

export async function GET() {
  const user = await requireApprovedCaller()
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  // Defensive, isolated — the whole feature is new, so a missing
  // table/row/column should just mean "invites off", never break Settings.
  let enabled = false
  let cap = 5
  try {
    const { data } = await admin.from('signup_settings').select('player_invites_enabled, player_invite_cap').eq('id', 'singleton').maybeSingle()
    enabled = data?.player_invites_enabled ?? false
    cap = data?.player_invite_cap ?? 5
  } catch {}

  const { data: codes } = await admin
    .from('signup_invite_codes')
    .select('id, code, max_uses, uses_count, active, created_at')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ enabled, cap, codes: codes ?? [] })
}

export async function POST() {
  const user = await requireApprovedCaller()
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  let enabled = false
  let cap = 5
  try {
    const { data } = await admin.from('signup_settings').select('player_invites_enabled, player_invite_cap').eq('id', 'singleton').maybeSingle()
    enabled = data?.player_invites_enabled ?? false
    cap = data?.player_invite_cap ?? 5
  } catch {}

  if (!enabled) {
    return NextResponse.json({ error: 'Player invites are switched off right now' }, { status: 403 })
  }

  const { data: existing } = await admin
    .from('signup_invite_codes')
    .select('active, max_uses, uses_count')
    .eq('created_by', user.id)

  // "Outstanding" — still usable — is what counts against the cap, not
  // every code ever created: one that's already been used by a mate frees
  // up a slot, same as the plan intended.
  const outstanding = (existing ?? []).filter(isInviteCodeUsable).length
  if (outstanding >= cap) {
    return NextResponse.json({ error: `You've reached your limit of ${cap} outstanding invites — wait for one to be used first` }, { status: 403 })
  }

  // Single-use by default — this is "invite a mate", one link per person,
  // unlike admin's own codes which can be single- or multi-use.
  const { data: inserted, error } = await admin
    .from('signup_invite_codes')
    .insert({ code: generateInviteCode(), created_by: user.id, max_uses: 1 })
    .select('id, code, max_uses, uses_count, active, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ code: inserted })
}
