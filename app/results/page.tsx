import { createServerSupabaseClient } from '../lib/supabase-server'

export default async function ResultsPage() {
  const supabase = await createServerSupabaseClient()

  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name')
    .eq('status', 'active')
    .single()

  if (!competition) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">No Active Competition</h1>
          <p className="text-gray-500">There is no active competition right now.</p>
        </div>
      </main>
    )
  }

  const now = new Date()

  const { data: gameweeks } = await supabase
    .from('gameweeks')
    .select('id, number, deadline, status')
    .eq('competition_id', competition.id)
    .lt('deadline', now.toISOString())
    .order('number', { ascending: false })

  const gameweekIds = gameweeks?.map(g => g.id) ?? []

  const { data: allPicks } = gameweekIds.length > 0 ? await supabase
    .from('picks')
    .select('id, gameweek_id, team_id, player1_id, player2_id, is_banker, is_autopick, user_id')
    .in('gameweek_id', gameweekIds) : { data: [] }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name')

  const { data: players } = await supabase
    .from('players')
    .select('id, name')

  const { data: pointsData } = await supabase
    .from('points')
    .select('pick_id, total_points, gameweek_id')
    .eq('competition_id', competition.id)

  const profileMap: Record<string, string> = {}
  profiles?.forEach(p => { profileMap[p.id] = p.display_name ?? 'Unknown' })

  const teamMap: Record<number, string> = {}
  teams?.forEach(t => { teamMap[t.id] = t.name })

  const playerMap: Record<number, string> = {}
  players?.forEach(p => { playerMap[p.id] = p.name })

  const pointsMap: Record<string, number> = {}
  pointsData?.forEach(p => { pointsMap[p.pick_id] = p.total_points })

  const picksByGameweek: Record<string, any[]> = {}
  allPicks?.forEach(pick => {
    if (!picksByGameweek[pick.gameweek_id]) picksByGameweek[pick.gameweek_id] = []
    picksByGameweek[pick.gameweek_id].push(pick)
  })

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Results</h1>
        <p className="text-gray-500 mb-8">{competition.name}</p>

        {(!gameweeks || gameweeks.length === 0) && (
          <div className="bg-white border rounded-lg p-6 text-center">
            <p className="text-gray-500 text-sm">No gameweeks have passed their deadline yet.</p>
          </div>
        )}

        <div className="space-y-6">
          {gameweeks?.map(gw => {
            const picks = picksByGameweek[gw.id] ?? []
            const sortedPicks = [...picks].sort((a, b) => {
              const aPoints = pointsMap[a.id] ?? 0
              const bPoints = pointsMap[b.id] ?? 0
              return bPoints - aPoints
            })

            return (
              <div key={gw.id} className="bg-white border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                  <span className="font-bold">Gameweek {gw.number}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${gw.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {gw.status === 'completed' ? 'Scored' : 'Awaiting scoring'}
                  </span>
                </div>
                {sortedPicks.length === 0 ? (
                  <p className="text-sm text-gray-400 p-4">No picks were made this gameweek.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {sortedPicks.map((pick, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 px-4 font-medium">
                            {profileMap[pick.user_id] ?? 'Unknown'}
                          </td>
                          <td className="py-2 px-4 text-gray-500">
                            {teamMap[pick.team_id]} · {playerMap[pick.player1_id]} & {playerMap[pick.player2_id]}
                            {pick.is_banker && <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded">B</span>}
                            {pick.is_autopick && <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">AUTO</span>}
                          </td>
                          <td className="py-2 px-4 text-right font-bold">
                            {pointsMap[pick.id] ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>

        <a href="/" className="block text-center text-sm text-gray-500 hover:text-gray-700 mt-6">
          ← Back to home
        </a>
      </div>
    </main>
  )
}