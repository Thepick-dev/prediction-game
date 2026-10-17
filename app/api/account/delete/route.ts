import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { NextResponse } from 'next/server'

// Anonymize, never hard-delete — the existing admin deleteUser has a real
// collateral-deletion bug for this exact purpose (deleting a user's row
// cascades through other people's Wall replies on THEIR old picks, not
// just their own data). This scrubs identity and blocks login instead,
// but keeps the profiles row (and everything that references it — picks,
// points, Wall rows) intact for everyone else's history.
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  const { data: profile } = await admin.from('profiles').select('display_name, is_admin, is_super_admin').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  // Admins run this account, so they can't delete themselves out of it —
  // ask another admin instead.
  if (profile.is_admin || profile.is_super_admin) {
    return NextResponse.json({ error: "Admins can't delete their own account this way — ask another admin to do it for you" }, { status: 403 })
  }

  const formerDisplayName = profile.display_name
  const anonName = `Deleted User ${user.id.slice(0, 8)}`

  await admin.from('profiles').update({
    display_name: anonName,
    kit_pattern: null,
    kit_colour_1: null,
    kit_colour_2: null,
    kit_colour_3: null,
  }).eq('id', user.id)

  await admin.from('marketing_consent_answers').delete().eq('user_id', user.id)

  // Scrubbed to a value nobody can receive mail at, rather than nulled —
  // Supabase Auth requires a well-formed, unique email on the row.
  await admin.auth.admin.updateUserById(user.id, { email: `deleted-${user.id}@deleted.invalid` })

  // Banned rather than soft/hard-deleted — blocks every future login
  // without touching the auth.users row that profiles.id (and therefore
  // every pick/point/Wall row) depends on.
  await admin.auth.admin.updateUserById(user.id, { ban_duration: '876000h' })

  // Best-effort — the account's already scrubbed and banned either way,
  // so a problem logging it should never surface as a failure to the
  // person deleting their own account.
  try {
    await admin.from('self_deletions').insert({ user_id: user.id, former_display_name: formerDisplayName })
  } catch {}

  return NextResponse.json({ success: true })
}
