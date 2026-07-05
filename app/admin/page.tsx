import { createServerSupabaseClient } from '../lib/supabase-server'
import Link from 'next/link'

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient()

  const [{ data: competition }, { data: gameweeks }, { data: entries }] = await Promise.all([
    supabase.from('competitions').select('id, name, status').eq('status', 'active').single(),
    supabase.from('gameweeks').select('id, number, status, deadline').order('number', { ascending: false }).limit(5),
    supabase.from('competition_entries').select('id')
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Admin Dashboard</h1>

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
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
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