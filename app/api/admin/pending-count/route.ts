import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { pastDeadlineGameweekIds } from '../../../lib/pastDeadlineGameweeks'
import { NextResponse } from 'next/server'

// Powers the little red counter on the Admin nav link, so the admin can
// tell something needs attention without going into /admin first. Uses
// the service-role client, not the caller's own session — several of
// these tables (password_reset_requests, username_change_requests, the
// two standalone-comment tables) only let a regular session see its OWN
// pending row via RLS, not everyone's, which would silently undercount
// here exactly the same way it broke the reset-requests list earlier.
// Each count is read independently so one missing table (this session's
// newest features, if their SQL hasn't been run yet) never zeroes out
// the whole badge.
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) return NextResponse.json({ count: 0 })

  const service = createAdminSupabaseClient()
  const pastGwIds = await pastDeadlineGameweekIds(service)

  const counts = await Promise.all([
    service.from('profiles').select('id', { count: 'exact', head: true }).eq('approved', false),
    service.from('password_reset_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    service.from('username_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    pastGwIds.length > 0
      ? service.from('picks').select('id', { count: 'exact', head: true }).eq('wall_status', 'pending').not('comments', 'is', null).neq('comments', '').in('gameweek_id', pastGwIds)
      : Promise.resolve({ count: 0 } as { count: number }),
    service.from('wall_replies').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    service.from('wall_comments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    service.from('wall_comment_replies').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  const total = counts.reduce((sum, r) => sum + (r.count ?? 0), 0)
  return NextResponse.json({ count: total })
}
