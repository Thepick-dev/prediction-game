'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '../../lib/supabase'
import Shell from '../../components/ceefax-shell'
import Link from 'next/link'

type RankedPlayer = {
  user_id: string
  display_name: string
  joined_at: string
  home_wins: number
  away_wins: number
  team_points: number
  player_points: number
  banker_points: number
  total_points: number
  points_without_banker: number
}

type PickDetail = {
  gw: number
  team: string
  player1: string
  player2: string
  is_banker: boolean
  is_autopick: boolean
  points: number | null
}

export default function ArchivedCompetitionPage() {
  const params = useParams()
  const competitionId = params.id as string

  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [competition, setCompetition] = useState<any>(null)
  const [ranked, setRanked] = useState<RankedPlayer[]>([])
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [pickDetails, setPickDetails] = useState<Record<string, PickDetail[]>>({})
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)

    if (user) {
      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
      setDisplayName(profile?.display_name ?? '')
    }

    const { data: comp } = await supabase
      .from('competitions')
      .select('id, name, season')
      .eq('id', competitionId)
      .single()

    if (!comp) { setLoading(false); return }
    setCompetition(comp)

    const [{ data: entries }, { data: profiles }, { data: pointsData }, { data: picks }, { data: teams }, { data: players }, { data: gameweeks }] = await Promise.all([
      supabase.from('competition_entries').select('user_id, joined_at').eq('competition_id', comp.id),
      supabase.from('profiles').select('id, display_name'),
      supabase.from('points').select('user_id, pick_id, total_points, team_points, player1_points, player2_points, breakdown').eq('competition_id', comp.id),
      supabase.from('picks').select('id, user_id, gameweek_id, team_id, player1_id, player2_id, is_banker, is_autopick').eq('competition_id', comp.id),
      supabase.from('teams').select('id, name'),
      supabase.from('players').select('id, name'),
      supabase.from('gameweeks').select('id, number').eq('competition_id', comp.id)
    ])

    const profileMap: Record<string, string> = {}
    profiles?.forEach(p => { profileMap[p.id] = p.display_name ?? 'Unknown' })

    const teamMap: Record<number, string> = {}
    teams?.forEach(t => { teamMap[t.id] = t.name })

    const playerMap: Record<number, string> = {}
    players?.forEach(p => { playerMap[p.id] = p.name })

    const gwMap: Record<string, number> = {}
    gameweeks?.forEach(g => { gwMap[g.id] = g.number })

    const pointsByPickId: Record<string, number> = {}
    pointsData?.forEach(p => { pointsByPickId[p.pick_id] = p.total_points })

    const totals: Record<string, RankedPlayer> = {}

    entries?.forEach(entry => {
      totals[entry.user_id] = {
        user_id: entry.user_id,
        display_name: profileMap[entry.user_id] ?? 'Unknown',
        joined_at: entry.joined_at,
        home_wins: 0,
        away_wins: 0,
        team_points: 0,
        player_points: 0,
        banker_points: 0,
        total_points: 0,
        points_without_banker: 0
      }
    })

    pointsData?.forEach(p => {
      const t = totals[p.user_id]
      if (!t) return

      const breakdown = p.breakdown as any
      const isBanker = breakdown?.is_banker === true

      const rawTeam = isBanker ? (p.team_points ?? 0) / 2 : (p.team_points ?? 0)
      const rawP1 = isBanker ? (p.player1_points ?? 0) / 2 : (p.player1_points ?? 0)
      const rawP2 = isBanker ? (p.player2_points ?? 0) / 2 : (p.player2_points ?? 0)
      const rawTotal = rawTeam + rawP1 + rawP2
      const bankerBonus = isBanker ? rawTotal : 0

      t.team_points += rawTeam
      t.player_points += rawP1 + rawP2
      t.banker_points += bankerBonus
      t.total_points += p.total_points ?? 0
      t.points_without_banker += rawTotal

      if (breakdown?.team?.includes('home_win')) t.home_wins += 1
      if (breakdown?.team?.includes('away_win')) t.away_wins += 1
    })

    const rankedList = Object.values(totals).sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points
      if (b.points_without_banker !== a.points_without_banker) return b.points_without_banker - a.points_without_banker
      if (b.away_wins !== a.away_wins) return b.away_wins - a.away_wins
      return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
    })

    setRanked(rankedList)

    const details: Record<string, PickDetail[]> = {}
    picks?.forEach(pick => {
      if (!details[pick.user_id]) details[pick.user_id] = []
      details[pick.user_id].push({
        gw: gwMap[pick.gameweek_id] ?? 0,
        team: teamMap[pick.team_id] ?? 'Unknown',
        player1: playerMap[pick.player1_id] ?? 'Unknown',
        player2: playerMap[pick.player2_id] ?? 'Unknown',
        is_banker: pick.is_banker,
        is_autopick: pick.is_autopick,
        points: pointsByPickId[pick.id] ?? null
      })
    })
    Object.values(details).forEach(list => list.sort((a, b) => a.gw - b.gw))
    setPickDetails(details)

    setLoading(false)
  }

  if (loading) {
    return (
      <Shell active="ARCHIVE">
        <p className="text-gray-500">Loading...</p>
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="ARCHIVE">
        <h1 className="text-2xl font-bold mb-2">Competition Not Found</h1>
        <Link href="/archive" className="text-sm text-gray-500 hover:text-black">← Back to archive</Link>
      </Shell>
    )
  }

  return (
    <Shell active="ARCHIVE" user={user} displayName={displayName}>

      <h1 className="text-3xl font-bold mb-1">{competition.name}</h1>
      <p className="text-gray-500 mb-8">Final standings — {competition.season}</p>

      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="text-left text-gray-500 border-b bg-gray-50">
              <th className="py-3 px-3">#</th>
              <th className="py-3 px-3">Player</th>
              <th className="py-3 px-3 text-center">HW</th>
              <th className="py-3 px-3 text-center">AW</th>
              <th className="py-3 px-3 text-right">Team</th>
              <th className="py-3 px-3 text-right">Players</th>
              <th className="py-3 px-3 text-right">Banker</th>
              <th className="py-3 px-3 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((player, index) => (
              <>
                <tr
                  key={player.user_id}
                  onClick={() => setExpandedUser(expandedUser === player.user_id ? null : player.user_id)}
                  className="border-b cursor-pointer hover:bg-gray-50"
                >
                  <td className="py-3 px-3 text-gray-400">{index + 1}</td>
                  <td className="py-3 px-3 font-bold">
                    {player.display_name}
                    {index === 0 && <span className="ml-2">🏆</span>}
                    <span className="ml-2 text-gray-300 text-xs">{expandedUser === player.user_id ? '▲' : '▼'}</span>
                  </td>
                  <td className="py-3 px-3 text-center text-gray-600">{player.home_wins}</td>
                  <td className="py-3 px-3 text-center text-gray-600">{player.away_wins}</td>
                  <td className="py-3 px-3 text-right text-gray-600">{player.team_points}</td>
                  <td className="py-3 px-3 text-right text-gray-600">{player.player_points}</td>
                  <td className="py-3 px-3 text-right text-gray-600">{player.banker_points}</td>
                  <td className="py-3 px-3 text-right font-bold">{player.total_points}</td>
                </tr>
                {expandedUser === player.user_id && (
                  <tr key={player.user_id + '-detail'}>
                    <td colSpan={8} className="bg-gray-50 px-6 py-4">
                      {(!pickDetails[player.user_id] || pickDetails[player.user_id].length === 0) ? (
                        <p className="text-gray-400 text-xs">No picks recorded.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-400 border-b">
                              <th className="py-1 pr-4">GW</th>
                              <th className="py-1 pr-4">Team</th>
                              <th className="py-1 pr-4">Players</th>
                              <th className="py-1 text-right">Pts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pickDetails[player.user_id].map((d, i) => (
                              <tr key={i} className="border-b last:border-0">
                                <td className="py-1.5 pr-4 font-bold">{d.gw}</td>
                                <td className="py-1.5 pr-4">
                                  {d.team}
                                  {d.is_banker && <span className="ml-1 bg-yellow-200 text-yellow-800 px-1 rounded">B</span>}
                                  {d.is_autopick && <span className="ml-1 bg-gray-200 text-gray-600 px-1 rounded">A</span>}
                                </td>
                                <td className="py-1.5 pr-4 text-gray-500">{d.player1} & {d.player2}</td>
                                <td className="py-1.5 text-right font-bold">{d.points ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <Link href="/archive" className="inline-block mt-6 text-sm text-gray-500 hover:text-black">
        ← Back to archive
      </Link>

    </Shell>
  )
}