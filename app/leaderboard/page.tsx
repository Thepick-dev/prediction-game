import { createServerSupabaseClient } from '../lib/supabase-server'

export default async function LeaderboardPage() {
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

  const { data: entries } = await supabase
    .from('competition_entries')
    .select('user_id, joined_at')
    .eq('competition_id', competition.id)

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')

  const { data: pointsData } = await supabase
    .from('points')
    .select('user_id, total_points, team_points, player1_points, player2_points, breakdown')
    .eq('competition_id', competition.id)

  const { data: picks } = await supabase
    .from('picks')
    .select('user_id, player1_id, player2_id, is_banker, gameweek_id')
    .eq('competition_id', competition.id)

  const { data: matchEvents } = await supabase
    .from('match_events')
    .select('player_id, event_type')

  const profileMap: Record<string, string> = {}
  profiles?.forEach(p => {
    profileMap[p.id] = p.display_name ?? 'Unknown'
  })

  const goalsByPlayer: Record<number, number> = {}
  matchEvents?.forEach(e => {
    if (e.event_type === 'goal' && e.player_id) {
      goalsByPlayer[e.player_id] = (goalsByPlayer[e.player_id] || 0) + 1
    }
  })

  type PlayerTotals = {
    user_id: string
    display_name: string
    joined_at: string
    total_points: number
    goals: number
    away_wins: number
    points_without_banker: number
  }

  const totals: Record<string, PlayerTotals> = {}

  entries?.forEach(entry => {
    totals[entry.user_id] = {
      user_id: entry.user_id,
      display_name: profileMap[entry.user_id] ?? 'Unknown',
      joined_at: entry.joined_at,
      total_points: 0,
      goals: 0,
      away_wins: 0,
      points_without_banker: 0
    }
  })

  pointsData?.forEach(p => {
    const t = totals[p.user_id]
    if (!t) return
    t.total_points += p.total_points ?? 0

    const breakdown = p.breakdown as any
    if (breakdown?.team?.includes('away_win')) {
      t.away_wins += 1
    }

    if (breakdown?.is_banker) {
      const raw = ((p.team_points ?? 0) + (p.player1_points ?? 0) + (p.player2_points ?? 0)) / 2
      t.points_without_banker += raw
    } else {
      t.points_without_banker += p.total_points ?? 0
    }
  })

  picks?.forEach(pick => {
    const t = totals[pick.user_id]
    if (!t) return
    t.goals += goalsByPlayer[pick.player1_id] ?? 0
    t.goals += goalsByPlayer[pick.player2_id] ?? 0
  })

  const ranked = Object.values(totals).sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points
    if (b.goals !== a.goals) return b.goals - a.goals
    if (b.away_wins !== a.away_wins) return b.away_wins - a.away_wins
    if (b.points_without_banker !== a.points_without_banker) return b.points_without_banker - a.points_without_banker
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
  })

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Leaderboard</h1>
        <p className="text-gray-500 mb-8">{competition.name}</p>

        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Player</th>
                <th className="py-3 px-4 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((player, index) => (
                <tr key={player.user_id} className="border-b last:border-0">
                  <td className="py-3 px-4 font-medium text-gray-400">{index + 1}</td>
                  <td className="py-3 px-4 font-medium">{player.display_name}</td>
                  <td className="py-3 px-4 text-right font-bold">{player.total_points}</td>
                </tr>
              ))}
              {ranked.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-gray-400">No points calculated yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <a href="/" className="block text-center text-sm text-gray-500 hover:text-gray-700 mt-6">
          ← Back to home
        </a>
      </div>
    </main>
  )
}