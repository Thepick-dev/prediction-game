import { createClient } from '@supabase/supabase-js'

// For server-to-server code with no real logged-in user (cron jobs, webhooks)
// — these authenticate via their own secret (e.g. CRON_SECRET), not a Supabase
// session, so there's no auth.uid() for RLS policies to check against. Using
// the service role key bypasses RLS entirely rather than relying on it ever
// granting access to an anonymous request.
export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
