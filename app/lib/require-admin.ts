import type { SupabaseClient } from '@supabase/supabase-js'

// API routes aren't covered by proxy.ts (it explicitly skips everything
// under /api/*, leaving each route to guard itself) — every route that
// writes data or is only meant for admin use must call this itself.
export async function requireAdmin(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

// For read-only routes any logged-in player is allowed to call (they back
// pages already gated behind login) — just needs a real session, not admin.
export async function requireUser(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
