import { createServerSupabaseClient } from '../lib/supabase-server'
import Nav from '../components/nav'

export default async function StatsPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user ? await supabase.from('profiles').select('display_name').eq('id', user.id).single() : { data: null }

  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name')
    .eq('status', 'active')
    .single()

  const { data: picks } = competition ? await supabase
    .from('picks')
    .select('team_id, player1_id, player2_id, is_banker, is_autopick, teams(name), player1:players!picks_player1_id_fkey(name), player2:players!picks_player2_id_fkey(name)')
    .eq('competition_id', competition.id) : { data: [] }

  const { data: points } = competition ? await supabase
    .from('points')
    .select('user_id, total_points, team_points, player1_points, player2_points, breakdown')
    .eq('competition_id', competition.id) : { data: [] }

  const { data: matchEvents } = await supabase
    .from('match_events')
    .select('player_id, event_type, players(name)')

  const teamCounts: Record<string, { name: string; count: number }> = {}
  const playerCounts: Record<string, { name: string; count: number }> = {}
  let bankersUsed = 0
  let autopicksUsed = 0
  let awayWins = 0

  picks?.forEach(pick => {
    const teamName = (pick.teams as any)?.name ?? 'Unknown'
    if (!teamCounts[pick.team_id]) teamCounts[pick.team_id] = { name: teamName, count: 0 }
    teamCounts[pick.team_id].count++

    const p1Name = (pick.player1 as any)?.name ?? 'Unknown'
    const p2Name = (pick.player2 as any)?.name ?? 'Unknown'

    if (!playerCounts[pick.player1_id]) playerCounts[pick.player1_id] = { name: p1Name, count: 0 }
    playerCounts[pick.player1_id].count++

    if (!playerCounts[pick.player2_id]) playerCounts[pick.player2_id] = { name: p2Name, count: 0 }
    playerCounts[pick.player2_id].count++

    if (pick.is_banker) bankersUsed++
    if (pick.is_autopick) autopicksUsed++
  })

  points?.forEach(p => {
    const breakdown = p.breakdown as any
    if (breakdown?.team?.includes('away_win')) awayWins++
  })

  const goalScorers: Record<string, { name: string; goals: number }> = {}
  const assistProviders: Record<string, { name: string; assists: number }> = {}

  matchEvents?.forEach(e => {
    if (!e.player_id) return
    const name = (e.players as any)?.name ?? 'Unknown'
    if (e.event_type === 'goal') {
      if (!goalScorers[e.player_id]) goalScorers[e.player_id] = { name, goals: 0 }
      goalScorers[e.player_id].goals++
    }
    if (e.event_type === 'assist') {
      if (!assistProviders[e.player_id]) assistProviders[e.player_id] = { name, assists: 0 }
      assistProviders[e.player_id].assists++
    }
  })

  const topTeams = Object.values(teamCounts).sort((a, b) => b.count - a.count).slice(0, 5)
  const topPlayers = Object.values(playerCounts).sort((a, b) => b.count - a.count).slice(0, 5)
  const topScorers = Object.values(goalScorers).sort((a, b) => b.goals - a.goals).slice(0, 5)
  const topAssisters = Object.values(assistProviders).sort((a, b) => b.assists - a.assists).slice(0, 5)

  const totalPoints = points?.reduce((sum, p) => sum + (p.total_points ?? 0), 0) ?? 0
  const highestWeek = points?.reduce((max, p) => p.total_points > max ? p.total_points : max, 0) ?? 0

  return (
    <>
      <Nav user={user} displayName={profile?.display_name ?? undefined} />

      <main className="max-w-4xl mx-auto px-4 py-8">

        <div className="border-b-2 border-coupon-ink pb-6 mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-coupon-muted mb-2">By The Numbers</p>
          <h1 className="font-display text-4xl font-bold">Statistics</h1>
          {competition && <p className="text-coupon-muted mt-1">{competition.name}</p>}
        </div>

        {!competition || !picks || picks.length === 0 ? (
          <div className="text-center py-16">
            <p className="font-display text-2xl text-coupon-muted">No data yet.</p>
            <p className="font-mono text-xs text-coupon-muted uppercase tracking-widest mt-2">Stats will appear once the competition is underway</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Total Picks', value: picks.length },
                { label: 'Bankers Used', value: bankersUsed },
                { label: 'Away Wins', value: awayWins },
                { label: 'Autopicks', value: autopicksUsed },
              ].map(stat => (
                <div key={stat.label} className="border border-coupon-rule p-4 text-center">
                  <p className="font-mono text-3xl font-bold text-coupon-green">{stat.value}</p>
                  <p className="font-mono text-xs uppercase tracking-widest text-coupon-muted mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

              <div>
                <h2 className="font-display text-xl font-bold mb-4 pb-2 border-b border-coupon-rule">Most Picked Teams</h2>
                <div className="space-y-2">
                  {topTeams.map((team, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-coupon-rule last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-coupon-muted w-4">{i + 1}</span>
                        <span className="text-sm">{team.name}</span>
                      </div>
                      <span className="font-mono text-sm text-coupon-green">{team.count}x</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold mb-4 pb-2 border-b border-coupon-rule">Most Picked Players</h2>
                <div className="space-y-2">
                  {topPlayers.map((player, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-coupon-rule last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-coupon-muted w-4">{i + 1}</span>
                        <span className="text-sm">{player.name}</span>
                      </div>
                      <span className="font-mono text-sm text-coupon-green">{player.count}x</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold mb-4 pb-2 border-b border-coupon-rule">Top Scorers (Picked Players)</h2>
                {topScorers.length === 0 ? (
                  <p className="text-sm text-coupon-muted">No goals recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {topScorers.map((player, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-coupon-rule last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-coupon-muted w-4">{i + 1}</span>
                          <span className="text-sm">{player.name}</span>
                        </div>
                        <span className="font-mono text-sm text-coupon-green">{player.goals} goals</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h2 className="font-display text-xl font-bold mb-4 pb-2 border-b border-coupon-rule">Top Assisters (Picked Players)</h2>
                {topAssisters.length === 0 ? (
                  <p className="text-sm text-coupon-muted">No assists recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {topAssisters.map((player, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-coupon-rule last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-coupon-muted w-4">{i + 1}</span>
                          <span className="text-sm">{player.name}</span>
                        </div>
                        <span className="font-mono text-sm text-coupon-green">{player.assists} assists</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </>
        )}

      </main>

      <footer className="border-t-2 border-coupon-ink mt-16 py-6">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="font-mono text-xs text-coupon-muted uppercase tracking-widest">The Coupon — The Premier League Prediction Game</p>
        </div>
      </footer>
    </>
  )
}