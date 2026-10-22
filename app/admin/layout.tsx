import { createServerSupabaseClient } from '../lib/supabase-server'
import { createAdminSupabaseClient } from '../lib/supabase-admin'
import { pastDeadlineGameweekIds } from '../lib/pastDeadlineGameweeks'
import { redirect } from 'next/navigation'
import AdminNav from './components/AdminNav'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, is_super_admin')
    .eq('id', user.id)
    .single()

  // Super Admin = full Admin access + article approval — not a narrower,
  // separate permission. Everything under /admin is available to either.
  if (!profile?.is_admin && !profile?.is_super_admin) {
    redirect('/')
  }

  // Things that genuinely need admin attention without them having to go
  // looking for it: new signups awaiting approval, password reset
  // requests, and anything waiting in The Wall's moderation queue. Each is
  // its own isolated count (same reasoning as everywhere else this
  // pattern shows up) — if a newer, optional table isn't there yet, that
  // count just quietly reads 0 rather than breaking the nav on every
  // admin page.
  // Same reasoning as pastDeadlineGameweeks.ts's own comment: even just a
  // pending-comment COUNT that includes a still-live gameweek indirectly
  // reveals that at least one pick has been made there before the deadline
  // — scoped the same way the Wall moderation queue and pending-count API
  // already are, for consistency.
  //
  // Service-role client, not the session one — every table here belongs
  // to OTHER users (another player's pending profile, their reset
  // request, their Wall comment), and RLS scopes all of them to "your own
  // row or an approved one." The session client silently returns 0 for
  // all of it, same bug class already fixed on /admin/wall and
  // /admin/page.tsx's own pending summary — this file was the one place
  // that never got the same fix, so this badge could under-report pending
  // Wall items specifically even though the real moderation queue and its
  // approve/discard actions work correctly.
  const admin = createAdminSupabaseClient()
  const pastGwIds = await pastDeadlineGameweekIds(admin)
  const [{ count: pendingApprovals }, { count: pendingResets }, { count: pendingWallComments }, { count: pendingWallReplies }, { count: pendingStandaloneComments }, { count: pendingStandaloneReplies }] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('approved', false),
    admin.from('password_reset_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    pastGwIds.length
      ? admin.from('picks').select('id', { count: 'exact', head: true }).eq('wall_status', 'pending').not('comments', 'is', null).neq('comments', '').in('gameweek_id', pastGwIds)
      : Promise.resolve({ count: 0 }),
    admin.from('wall_replies').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('wall_comments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('wall_comment_replies').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])
  const pendingWallTotal = (pendingWallComments ?? 0) + (pendingWallReplies ?? 0) + (pendingStandaloneComments ?? 0) + (pendingStandaloneReplies ?? 0)
  const notificationCount = (pendingApprovals ?? 0) + (pendingResets ?? 0) + pendingWallTotal

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav
        notificationCount={notificationCount}
        pendingApprovals={pendingApprovals ?? 0}
        pendingResets={pendingResets ?? 0}
        pendingWallTotal={pendingWallTotal}
      />
      <main className="max-w-6xl mx-auto px-6 py-8 print:max-w-none print:px-0 print:py-0">
        {children}
      </main>
    </div>
  )
}