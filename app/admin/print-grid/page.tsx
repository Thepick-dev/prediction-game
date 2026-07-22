import { createServerSupabaseClient } from '../../lib/supabase-server'
import { buildPlayerDisplayNames } from '../../lib/players'
import PrintButton from '../components/print-button'

export default async function PrintGridPage() {
  const supabase = await createServerSupabaseClient()

  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name')
    .eq('status', 'active')
    .single()

  if (!competition) {
    return <p className="text-gray-500">No active competition.</p>
  }

  const [{ data: gameweeks }, { data: entries }, { data: profiles }, { data: picks }, { data: teams }, { data: players }] = await Promise.all([
    supabase.from('gameweeks').select('id, number').eq('competition_id', competition.id).order('number'),
    supabase.from('competition_entries').select('user_id').eq('competition_id', competition.id).eq('removed', false),
    supabase.from('profiles').select('id, display_name'),
    supabase.from('picks').select('user_id, gameweek_id, team_id, player1_id, player2_id, is_banker').eq('competition_id', competition.id),
    supabase.from('teams').select('id, name, short_name, short_code'),
    supabase.from('players').select('id, name, web_name, team_id'),
  ])

  const profileMap: Record<string, string> = {}
  profiles?.forEach(p => { profileMap[p.id] = p.display_name ?? 'Unknown' })

  const teamMap: Record<number, { name: string; short_name: string | null; short_code: string | null }> = {}
  teams?.forEach(t => { teamMap[t.id] = t })

  const displayNames = buildPlayerDisplayNames(players ?? [], teamMap)

  const teamLabel = (id: number) => {
    const t = teamMap[id]
    return t ? (t.short_code ?? t.short_name ?? t.name) : '—'
  }

  const pickMap: Record<string, Record<string, { team_id: number; player1_id: number; player2_id: number; is_banker: boolean }>> = {}
  picks?.forEach(p => {
    if (!pickMap[p.user_id]) pickMap[p.user_id] = {}
    pickMap[p.user_id][p.gameweek_id] = p
  })

  const rankedPlayers = (entries ?? [])
    .map(e => ({ id: e.user_id, name: profileMap[e.user_id] ?? 'Unknown' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold mb-1">Printable Picks Grid</h1>
          <p className="text-gray-500 text-sm">{competition.name} — every player&apos;s pick, every gameweek, one page.</p>
        </div>
        <PrintButton />
      </div>

      <p className="hidden print:block text-lg font-bold mb-4">{competition.name} — All Picks</p>

      <div className="overflow-x-auto">
        <table className="border-collapse text-xs w-full">
          <thead>
            <tr>
              <th className="border px-2 py-1 text-left bg-gray-100">Player</th>
              {gameweeks?.map(gw => (
                <th key={gw.id} className="border px-2 py-1 bg-gray-100 whitespace-nowrap">GW{gw.number}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rankedPlayers.map(player => (
              <tr key={player.id}>
                <td className="border px-2 py-1 font-medium bg-white whitespace-nowrap">{player.name}</td>
                {gameweeks?.map(gw => {
                  const pick = pickMap[player.id]?.[gw.id]
                  if (!pick) {
                    return <td key={gw.id} className="border px-2 py-1 text-center text-gray-300">—</td>
                  }
                  return (
                    <td key={gw.id} className="border px-2 py-1 whitespace-nowrap align-top">
                      <div className="font-bold">{teamLabel(pick.team_id)}{pick.is_banker && ' ★'}</div>
                      <div className="text-gray-500">{displayNames[pick.player1_id] ?? '?'}</div>
                      <div className="text-gray-500">{displayNames[pick.player2_id] ?? '?'}</div>
                    </td>
                  )
                })}
              </tr>
            ))}
            {rankedPlayers.length === 0 && (
              <tr>
                <td colSpan={(gameweeks?.length ?? 0) + 1} className="border px-2 py-4 text-center text-gray-400">
                  No players yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
