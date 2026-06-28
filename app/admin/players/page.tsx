import { createServerSupabaseClient } from '../../lib/supabase-server'

export default async function PlayersPage() {
  const supabase = await createServerSupabaseClient()

  const { data: players } = await supabase
    .from('players')
    .select('*, teams(name, short_name)')
    .order('name', { ascending: true })

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name')
    .order('name', { ascending: true })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Players</h1>
      <p className="text-gray-500 text-sm mb-6">{players?.length ?? 0} players imported.</p>

      <div className="bg-white border rounded-lg p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Name</th>
              <th className="pb-2">Team</th>
              <th className="pb-2">Position</th>
            </tr>
          </thead>
          <tbody>
            {players?.map((player) => (
              <tr key={player.id} className="border-b last:border-0">
                <td className="py-1.5">{player.name}</td>
                <td className="py-1.5">{(player.teams as any)?.short_name ?? '—'}</td>
                <td className="py-1.5">{player.position}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}