import { createServerSupabaseClient } from '../../lib/supabase-server'
import PositionEditor from './PositionEditor'

export default async function StandingsPage() {
  const supabase = await createServerSupabaseClient()

  const { data: positions } = await supabase
    .from('team_league_positions')
    .select('*')
    .order('recorded_at', { ascending: false })
    .limit(20)

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, short_name')

  const teamMap: Record<number, string> = {}
  teams?.forEach(t => { teamMap[t.id] = t.short_name ?? t.name })

  const lastSynced = positions && positions.length > 0 ? positions[0].recorded_at : null

  const sorted = [...(positions ?? [])].sort((a, b) => a.position - b.position)

  const editorRows = sorted.map(row => ({
    id: row.id,
    team_id: row.team_id,
    position: row.position,
    teamName: teamMap[row.team_id] ?? `Team ${row.team_id}`
  }))

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">League Standings</h1>
      <p className="text-gray-500 text-sm mb-8">
        {lastSynced
          ? `Last synced: ${new Date(lastSynced).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}`
          : 'No standings data yet — run Sync Standings on the Sync page.'}
      </p>

      <div className="bg-white border rounded-lg overflow-hidden mb-8">
        {sorted.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="py-2 px-4">Pos</th>
                <th className="py-2 px-4">Team</th>
                <th className="py-2 px-4 text-center">P</th>
                <th className="py-2 px-4 text-center">W</th>
                <th className="py-2 px-4 text-center">D</th>
                <th className="py-2 px-4 text-center">L</th>
                <th className="py-2 px-4 text-center">GF</th>
                <th className="py-2 px-4 text-center">GA</th>
                <th className="py-2 px-4 text-center">GD</th>
                <th className="py-2 px-4 text-right font-bold">Pts</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 px-4 font-bold">{row.position}</td>
                  <td className="py-2 px-4">{teamMap[row.team_id] ?? `Team ${row.team_id}`}</td>
                  <td className="py-2 px-4 text-center text-gray-500">{row.played}</td>
                  <td className="py-2 px-4 text-center text-gray-500">{row.won}</td>
                  <td className="py-2 px-4 text-center text-gray-500">{row.drawn}</td>
                  <td className="py-2 px-4 text-center text-gray-500">{row.lost}</td>
                  <td className="py-2 px-4 text-center text-gray-500">{row.goals_for}</td>
                  <td className="py-2 px-4 text-center text-gray-500">{row.goals_against}</td>
                  <td className="py-2 px-4 text-center text-gray-500">{row.goal_difference}</td>
                  <td className="py-2 px-4 text-right font-bold">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-400 text-sm p-6">No standings data yet.</p>
        )}
      </div>

      {editorRows.length > 0 && lastSynced && (
        <PositionEditor initialRows={editorRows} recordedAt={lastSynced} />
      )}
    </div>
  )
}