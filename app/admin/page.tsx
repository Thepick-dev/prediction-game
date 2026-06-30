import { createServerSupabaseClient } from '../lib/supabase-server'

export default async function AdminDashboard() {
  const supabase = await createServerSupabaseClient()

  const [
    { count: competitionsCount },
    { count: playersCount },
    { count: teamsCount },
    { count: fixturesCount },
    { data: recentSync }
  ] = await Promise.all([
    supabase.from('competitions').select('*', { count: 'exact', head: true }),
    supabase.from('players').select('*', { count: 'exact', head: true }),
    supabase.from('teams').select('*', { count: 'exact', head: true }),
    supabase.from('fixtures').select('*', { count: 'exact', head: true }),
    supabase.from('api_sync_log').select('*').order('synced_at', { ascending: false }).limit(5)
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Admin Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg p-4 border">
          <div className="text-2xl font-bold">{competitionsCount ?? 0}</div>
          <div className="text-gray-500 text-sm">Competitions</div>
        </div>
        <div className="bg-white rounded-lg p-4 border">
          <div className="text-2xl font-bold">{teamsCount ?? 0}</div>
          <div className="text-gray-500 text-sm">Teams</div>
        </div>
        <div className="bg-white rounded-lg p-4 border">
          <div className="text-2xl font-bold">{playersCount ?? 0}</div>
          <div className="text-gray-500 text-sm">Players</div>
        </div>
        <div className="bg-white rounded-lg p-4 border">
          <div className="text-2xl font-bold">{fixturesCount ?? 0}</div>
          <div className="text-gray-500 text-sm">Fixtures</div>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-6 mb-8">
        <h2 className="font-bold mb-4">Recent Syncs</h2>
        {recentSync && recentSync.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Type</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Records</th>
                <th className="pb-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentSync.map((log) => (
                <tr key={log.id} className="border-b last:border-0">
                  <td className="py-2">{log.sync_type}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${log.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="py-2">{log.records_updated}</td>
                  <td className="py-2 text-gray-500">{new Date(log.synced_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-500 text-sm">No syncs yet.</p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <a href="/admin/competitions" className="bg-white border rounded-lg p-4 hover:border-black transition-colors">
          <div className="font-bold mb-1">Competitions</div>
          <div className="text-sm text-gray-500">Create and manage competitions</div>
        </a>
        <a href="/admin/gameweeks" className="bg-white border rounded-lg p-4 hover:border-black transition-colors">
          <div className="font-bold mb-1">Gameweeks</div>
          <div className="text-sm text-gray-500">Set up gameweeks and deadlines</div>
        </a>
        <a href="/admin/fixtures" className="bg-white border rounded-lg p-4 hover:border-black transition-colors">
          <div className="font-bold mb-1">Fixtures</div>
          <div className="text-sm text-gray-500">Assign fixtures to gameweeks</div>
        </a>
        <a href="/admin/players" className="bg-white border rounded-lg p-4 hover:border-black transition-colors">
          <div className="font-bold mb-1">Players</div>
          <div className="text-sm text-gray-500">View and manage player data</div>
        </a>
        <a href="/admin/sync" className="bg-white border rounded-lg p-4 hover:border-black transition-colors">
          <div className="font-bold mb-1">Data Sync</div>
          <div className="text-sm text-gray-500">Trigger API syncs manually</div>
        </a>
        <a href="/admin/quartiles" className="bg-white border rounded-lg p-4 hover:border-black transition-colors">
          <div className="font-bold mb-1">Quartiles</div>
          <div className="text-sm text-gray-500">Manage team quartile assignments</div>
        </a>
        <a href="/admin/tiers" className="bg-white border rounded-lg p-4 hover:border-black transition-colors">
          <div className="font-bold mb-1">Tier Draft</div>
          <div className="text-sm text-gray-500">View player tier selections</div>
        </a>
      </div>
    </div>
  )
}