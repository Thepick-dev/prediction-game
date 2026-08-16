import type { SupabaseClient } from '@supabase/supabase-js'

// A pick's comment being visible to admin pre-deadline would indirectly
// reveal that the pick was made (and often hint at what it was) — the
// same thing the site's hard "no picks visible before the deadline" rule
// forbids for every other player. Anything sourced from `picks` (comment
// moderation queues, the pending-notification count, the Picks Log detail
// table) must be scoped to gameweeks whose deadline has already passed.
export async function pastDeadlineGameweekIds(client: SupabaseClient): Promise<string[]> {
  const { data } = await client.from('gameweeks').select('id').lt('deadline', new Date().toISOString())
  return (data ?? []).map(g => g.id)
}
