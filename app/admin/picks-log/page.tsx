import { createServerSupabaseClient } from '../../lib/supabase-server'
import { pastDeadlineGameweekIds } from '../../lib/pastDeadlineGameweeks'
import PicksStatusPanel from './PicksStatusPanel'

export default async function PicksLogPage() {
  const supabase = await createServerSupabaseClient()

  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name')
    .eq('status', 'active')
    .single()

  const { data: gameweeks } = competition ? await supabase
    .from('gameweeks')
    .select('id, number, deadline, status')
    .eq('competition_id', competition.id)
    .order('number', { ascending: true }) : { data: [] }

  // Detail rows (team/players/comments) only ever show for a gameweek once
  // its own deadline has passed — showing them earlier would let admin see
  // a pick before anyone else can, breaking the site's "hidden until
  // deadline" rule same as for any other player. Nothing here changes once
  // a gameweek's deadline has passed; only the still-open one is withheld.
  const pastGwIds = await pastDeadlineGameweekIds(supabase)
  const { data: picks } = (competition && pastGwIds.length > 0) ? await supabase
    .from('picks')
    .select('id, user_id, gameweek_id, team_id, player1_id, player2_id, is_banker, is_autopick, submitted_at, comments, gameweeks(number), teams(name), player1:players!picks_player1_id_fkey(name), player2:players!picks_player2_id_fkey(name)')
    .eq('competition_id', competition.id)
    .in('gameweek_id', pastGwIds)
    .order('gameweek_id', { ascending: true }) : { data: [] }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')

  const { data: authUsers } = await supabase.auth.admin.listUsers()

  const profileMap: Record<string, string> = {}
  profiles?.forEach(p => { profileMap[p.id] = p.display_name ?? 'Unknown' })

  const emailMap: Record<string, string> = {}
  authUsers?.users?.forEach(u => { emailMap[u.id] = u.email ?? '' })

  // Who's-picked presence data — safe to show regardless of deadline (it
  // says THAT someone submitted, never what they picked), sourced from the
  // same content-free view the leaderboard already relies on for this.
  const { data: entries } = competition ? await supabase
    .from('competition_entries')
    .select('user_id')
    .eq('competition_id', competition.id)
    .eq('removed', false) : { data: [] }

  const { data: submissions } = competition ? await supabase
    .from('pick_submission_status')
    .select('user_id, gameweek_id')
    .eq('competition_id', competition.id) : { data: [] }

  const submittedByGw: Record<string, string[]> = {}
  submissions?.forEach(s => {
    if (!submittedByGw[s.gameweek_id]) submittedByGw[s.gameweek_id] = []
    submittedByGw[s.gameweek_id].push(s.user_id)
  })

  const allUserIds = (entries ?? []).map(e => e.user_id)
  const openGw = gameweeks?.find(g => g.status === 'open')
  const defaultGwId = openGw?.id ?? gameweeks?.[gameweeks.length - 1]?.id ?? ''

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Picks Log</h1>
      <p className="text-gray-500 text-sm mb-8">
        All picks for {competition?.name ?? 'current competition'}. Detail below only appears once a
        gameweek&apos;s own deadline has passed — you have no way of seeing anyone&apos;s pick before then,
        same as every other player. Use &quot;Who&apos;s Picked&quot; below to check submission progress
        on the current gameweek without seeing what anyone chose.
      </p>

      {gameweeks && gameweeks.length > 0 && (
        <PicksStatusPanel
          competitionName={competition?.name ?? 'Competition'}
          gameweeks={gameweeks.map(g => ({ id: g.id, number: g.number, deadline: g.deadline }))}
          defaultGwId={defaultGwId}
          namesByUser={profileMap}
          allUserIds={allUserIds}
          submittedByGw={submittedByGw}
        />
      )}

      {(!picks || picks.length === 0) ? (
        <div className="bg-white border rounded-lg p-6">
          <p className="text-gray-400 text-sm">No picks visible yet — nothing has reached its deadline.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="py-2 px-3">GW</th>
                <th className="py-2 px-3">Player</th>
                <th className="py-2 px-3">Email</th>
                <th className="py-2 px-3">Team</th>
                <th className="py-2 px-3">Player 1</th>
                <th className="py-2 px-3">Player 2</th>
                <th className="py-2 px-3">Banker</th>
                <th className="py-2 px-3">Auto</th>
                <th className="py-2 px-3">Submitted</th>
                <th className="py-2 px-3">Comments</th>
              </tr>
            </thead>
            <tbody>
              {picks?.map((pick: any) => (
                <tr key={pick.id} className="border-b last:border-0">
                  <td className="py-2 px-3 font-bold">{pick.gameweeks?.number}</td>
                  <td className="py-2 px-3">{profileMap[pick.user_id] ?? 'Unknown'}</td>
                  <td className="py-2 px-3 text-xs text-gray-500">{emailMap[pick.user_id] ?? '—'}</td>
                  <td className="py-2 px-3">{pick.teams?.name ?? '—'}</td>
                  <td className="py-2 px-3">{pick.player1?.name ?? '—'}</td>
                  <td className="py-2 px-3">{pick.player2?.name ?? '—'}</td>
                  <td className="py-2 px-3">
                    {pick.is_banker ? <span className="bg-yellow-200 text-yellow-800 text-xs px-1.5 py-0.5 rounded">★</span> : '—'}
                  </td>
                  <td className="py-2 px-3">
                    {pick.is_autopick ? <span className="bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded">A</span> : '—'}
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-500">
                    {pick.submitted_at ? new Date(pick.submitted_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
                    }) : '—'}
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-600 max-w-xs">{pick.comments ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
