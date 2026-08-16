import { createServerSupabaseClient } from '../lib/supabase-server'
import { createAdminSupabaseClient } from '../lib/supabase-admin'
import { pastDeadlineGameweekIds } from '../lib/pastDeadlineGameweeks'
import Link from 'next/link'
import ThemeToggleControl from './components/theme-toggle-control'

// Same reasoning as the nav badge this feeds alongside — several of these
// tables only let a regular session see its own pending row via RLS, not
// everyone's, so this needs the service-role client to count accurately.
// A read-only page load like this one is already gated by app/admin's own
// layout (it's not a separately-invokable Server Action), so no extra
// admin check is needed here beyond that.
async function loadPendingSummary() {
  const admin = createAdminSupabaseClient()
  const pastGwIds = await pastDeadlineGameweekIds(admin)
  const [profiles, resets, usernames, comments, replies, standaloneComments, standaloneReplies] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('approved', false),
    admin.from('password_reset_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('username_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    pastGwIds.length > 0
      ? admin.from('picks').select('id', { count: 'exact', head: true }).eq('wall_status', 'pending').not('comments', 'is', null).neq('comments', '').in('gameweek_id', pastGwIds)
      : Promise.resolve({ count: 0 } as { count: number }),
    admin.from('wall_replies').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('wall_comments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('wall_comment_replies').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  return [
    { label: 'Pending user approvals', count: profiles.count ?? 0, href: '/admin/users' },
    { label: 'Password reset requests', count: resets.count ?? 0, href: '/admin/users' },
    { label: 'Username change requests', count: usernames.count ?? 0, href: '/admin/users' },
    { label: 'Wall comments to moderate', count: (comments.count ?? 0) + (standaloneComments.count ?? 0), href: '/admin/wall' },
    { label: 'Wall replies to moderate', count: (replies.count ?? 0) + (standaloneReplies.count ?? 0), href: '/admin/wall' },
  ].filter(item => item.count > 0)
}

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient()

  const [{ data: { user } }, { data: competition }, { data: gameweeks }, { data: entries }, pending] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('competitions').select('id, name, status').eq('status', 'active').single(),
    supabase.from('gameweeks').select('id, number, status, deadline').order('number', { ascending: false }).limit(5),
    supabase.from('competition_entries').select('id'),
    loadPendingSummary(),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Admin Dashboard</h1>

      {user && (
        <div className="mb-6">
          <ThemeToggleControl userId={user.id} />
        </div>
      )}

      {pending.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
          <h2 className="font-bold mb-4 text-red-800">⚠ Needs Your Attention</h2>
          <div className="flex flex-wrap gap-2">
            {pending.map(item => (
              <Link
                key={item.label}
                href={item.href}
                className="bg-white border border-red-200 rounded px-3 py-2 text-sm hover:bg-red-100 flex items-center gap-2"
              >
                <span className="bg-red-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-xs font-bold">
                  {item.count}
                </span>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Active Competition</p>
          <p className="font-bold">{competition?.name ?? 'None'}</p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Players Entered</p>
          <p className="font-bold text-lg">{entries?.length ?? 0}</p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Latest GW</p>
          <p className="font-bold">{gameweeks?.[0] ? `GW${gameweeks[0].number}` : '—'}</p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">GW Status</p>
          <p className="font-bold">{gameweeks?.[0]?.status ?? '—'}</p>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-6 mb-6">
        <h2 className="font-bold mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <Link href="/admin/gameweeks" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Gameweeks</Link>
          <Link href="/admin/fixtures" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Fixtures</Link>
          <Link href="/admin/events" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Events</Link>
          <Link href="/admin/scoring" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Scoring</Link>
          <Link href="/admin/users" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Users</Link>
          <Link href="/admin/picks-log" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Picks Log</Link>
          <Link href="/admin/summary" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Summary</Link>
          <Link href="/admin/sync" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Sync</Link>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-4">Recent Gameweeks</h2>
        {(!gameweeks || gameweeks.length === 0) ? (
          <p className="text-gray-400 text-sm">No gameweeks yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">GW</th>
                <th className="pb-2">Deadline</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {gameweeks.map(gw => (
                <tr key={gw.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">GW{gw.number}</td>
                  <td className="py-2 text-gray-500">
                    {new Date(gw.deadline).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
                    })}
                  </td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      gw.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                      gw.status === 'open' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {gw.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}