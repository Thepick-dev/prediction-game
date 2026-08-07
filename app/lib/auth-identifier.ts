import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

// Shared by every server route that has to turn "whatever the user typed
// in the username-or-email box" into a real account — login, forgot
// password, and reset-with-code all need exactly this same lookup, so it
// lives in one place rather than three slightly different copies.
// `supabaseAdmin` must be a service-role client — resolving a username to
// its account needs `auth.admin.getUserById`, which the anon key can't call.
export async function resolveIdentifier(
  supabaseAdmin: SupabaseClient,
  identifier: string
): Promise<{ userId: string; email: string; displayName: string } | null> {
  const trimmed = identifier.trim()
  if (!trimmed) return null

  if (trimmed.includes('@')) {
    // Small user base — a full listUsers() scan is simpler and plenty fast
    // here, and there's no supabase-js admin method to look up by email
    // directly.
    const { data } = await supabaseAdmin.auth.admin.listUsers()
    const match = data?.users?.find(u => u.email?.toLowerCase() === trimmed.toLowerCase())
    if (!match) return null
    const { data: profile } = await supabaseAdmin.from('profiles').select('display_name').eq('id', match.id).single()
    return { userId: match.id, email: match.email!, displayName: profile?.display_name ?? '' }
  }

  const { data: profile } = await supabaseAdmin.from('profiles').select('id, display_name').eq('display_name', trimmed).single()
  if (!profile) return null
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(profile.id)
  if (!userData?.user?.email) return null
  return { userId: profile.id, email: userData.user.email, displayName: profile.display_name ?? '' }
}

// Unambiguous charset — no 0/O or 1/I/L — since this gets read off a
// screen and relayed to someone, usually out loud or by text.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateResetCode(length = 8): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

// Codes are single-use and short-lived, but hashed anyway rather than
// stored as plain text — the same "never store a live credential in the
// open" principle as passwords themselves, just with lower stakes.
export function hashResetCode(code: string): string {
  return createHash('sha256').update(code.toUpperCase().trim()).digest('hex')
}

export const RESET_CODE_TTL_HOURS = 24
