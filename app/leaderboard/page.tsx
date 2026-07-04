'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'

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
  goals: number
}

type PickDetail = {
  gw: number
  team: string
  player1: string
  player2: string
  player1_id: number
  player2_id: number
  is_banker: boolean
  is_autopick: boolean
  points: number | null
  team_points: number | null
  player1_points: number | null
  player2_points: number | null
}

export default function LeaderboardPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [competition, setCompetition] = useState<any>(null)
  const [ranked, setRanked] = useState<RankedPlayer[]>([])
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [pickDetails, setPickDetails] = useState<Record<string, PickDetail[]>>({})
  const [matchEvents, setMatchEvents] = useState<any[]>([])
  const [potwUserId, setPotwUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)

    if (user) {
      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
      setDisplayName(profile?.display_name ?? '')
    }

    const { data: comp } = await supabase
      .from('competitions')
      .select('id, name')
      .eq('status', 'active')
      .single()

    if (!comp) { setLoading(false); return }
    setCompetition(comp)

    const [{ data: entries }, { data: profiles }, { data: pointsData }, { data: picks }, { data: teams }, { data: players }, { data: gameweeks }, { data: events }] = await Promise.all([
      supabase.from('competition_entries').select('user_id, joined_at').eq('competition_id', comp.id).eq('removed', false),
      supabase.from('profiles').select('id, display_name'),
      supabase.from('points').select('user_id, pick_id, total_points, team_points, player1_points, player2_points, breakdown').eq('competition_id', comp.id),
      supabase.from('picks').select('id, user_id, gameweek_id, team_id, player1_id, player2_id, is_banker, is_autopick').eq('competition_id', comp.id),
      supabase.from('teams').select('id, name'),
      supabase.from('players').select('id, name'),
      supabase.from('gameweeks').select('id, number').eq('competition_id', comp.id),
      supabase.from('match_events').select('player_id, event_type')
    ])

    setMatchEvents(events ?? [])

    const profileMap: Record<string, string> = {}
    profiles?.forEach(p => { profileMap[p.id] = p.display_name ?? 'Unknown' })

    const teamMap: Record<number, string> = {}
    teams?.forEach(t => { teamMap[t.id] = t.name })

    const playerMap: Record<number, string> = {}
    players?.forEach(p => { playerMap[p.id] = p.name })

    const gwMap: Record<string, number> = {}
    gameweeks?.forEach(g => { gwMap[g.id] = g.number })

    const pointsByPickId: Record<string, any> = {}
    pointsData?.forEach(p => { pointsByPickId[p.pick_id] = p })

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
        points_without_banker: 0,
        goals: 0
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
      if (b.goals !== a.goals) return b.goals - a.goals
      return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
    })

    setRanked(rankedList)

    if (rankedList.length > 0) {
      setPotwUserId(rankedList[0].user_id)
    }

    const details: Record<string, PickDetail[]> = {}
    picks?.forEach(pick => {
      if (!details[pick.user_id]) details[pick.user_id] = []
      const pts = pointsByPickId[pick.id]

      details[pick.user_id].push({
        gw: gwMap[pick.gameweek_id] ?? 0,
        team: teamMap[pick.team_id] ?? 'Unknown',
        player1: playerMap[pick.player1_id] ?? 'Unknown',
        player2: playerMap[pick.player2_id] ?? 'Unknown',
        player1_id: pick.player1_id,
        player2_id: pick.player2_id,
        is_banker: pick.is_banker,
        is_autopick: pick.is_autopick,
        points: pts?.total_points ?? null,
        team_points: pts?.team_points ?? null,
        player1_points: pts?.player1_points ?? null,
        player2_points: pts?.player2_points ?? null
      })
    })
    Object.values(details).forEach(list => list.sort((a, b) => a.gw - b.gw))
    setPickDetails(details)

    setLoading(false)
  }

  const goalPlayers = new Set(matchEvents.filter(e => e.event_type === 'goal').map(e => e.player_id))
  const assistPlayers = new Set(matchEvents.filter(e => e.event_type === 'assist').map(e => e.player_id))

  if (loading) {
    return (
      <Shell active="TABLE">
        <p className="text-gray-500">Loading...</p>
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="TABLE">
        <h1 className="text-2xl font-bold mb-2">No Active Competition</h1>
        <p className="text-gray-500">There is no active competition right now.</p>
      </Shell>
    )
  }

  return (
    <Shell active="TABLE" user={user} displayName={displayName}>

      <h1 className="text-3xl font-bold mb-1">League Table</h1>
      <p className="text-gray-500 mb-6 text-sm">{competition.name}</p>

      {potwUserId && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 mb-6 flex items-center gap-3">
          <span className="text-xl">👑</span>
          <div>
            <p className="text-xs text-yellow-700 font-bold uppercase tracking-wide">Current Leader</p>
            <p className="font-bold uppercase">{ranked[0]?.display_name}</p>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50 text-xs uppercase tracking-wider">
                <th className="py-2 px-2">#</th>
                <th className="py-2 px-2">Player</th>
                <th className="py-2 px-2 text-center hidden md:table-cell">HW</th>
                <th className="py-2 px-2 text-center hidden md:table-cell">AW</th>
                <th className="py-2 px-2 text-right hidden md:table-cell">Team</th>
                <th className="py-2 px-2 text-right hidden md:table-cell">Players</th>
                <th className="py-2 px-2 text-right hidden md:table-cell">Banker</th>
                <th className="py-2 px-2 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((player, index) => (
                <React.Fragment key={player.user_id}>
                  <tr
                    onClick={() => setExpandedUser(expandedUser === player.user_id ? null : player.user_id)}
                    className="border-b cursor-pointer hover:bg-gray-50"
                  >
                    <td className="py-2 px-2 text-gray-400 text-xs">{index + 1}</td>
                    <td className="py-2 px-2 font-bold text-sm uppercase">
                      {player.display_name}
                      {index === 0 && <span className="ml-1">👑</span>}
                      <span className="ml-1 text-gray-300 text-xs">{expandedUser === player.user_id ? '▲' : '▼'}</span>
                    </td>
                    <td className="py-2 px-2 text-center text-gray-600 text-xs hidden md:table-cell">{player.home_wins}</td>
                    <td className="py-2 px-2 text-center text-gray-600 text-xs hidden md:table-cell">{player.away_wins}</td>
                    <td className="py-2 px-2 text-right text-gray-600 text-xs hidden md:table-cell">{Math.round(player.team_points)}</td>
                    <td className="py-2 px-2 text-right text-gray-600 text-xs hidden md:table-cell">{Math.round(player.player_points)}</td>
                    <td className="py-2 px-2 text-right text-gray-600 text-xs hidden md:table-cell">{Math.round(player.banker_points)}</td>
                    <td className="py-2 px-2 text-right font-bold text-sm">{player.total_points}</td>
                  </tr>
                  {expandedUser === player.user_id && (
                    <tr>
                      <td colSpan={8} className="bg-gray-50 px-2 py-3">
                        {(!pickDetails[player.user_id] || pickDetails[player.user_id].length === 0) ? (
                          <p className="text-gray-400 text-xs">No picks yet.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full" style={{ fontSize: '11px', minWidth: '500px' }}>
                              <thead>
                                <tr className="text-left text-gray-400 border-b uppercase tracking-wider">
                                  <th className="py-1 pr-2 font-medium">GW</th>
                                  <th className="py-1 pr-2 font-medium">Team</th>
                                  <th className="py-1 pr-2 text-right font-medium">Pts</th>
                                  <th className="py-1 pr-2 font-medium">Player 1</th>
                                  <th className="py-1 pr-2 text-right font-medium">Pts</th>
                                  <th className="py-1 pr-2 font-medium">Player 2</th>
                                  <th className="py-1 pr-2 text-right font-medium">Pts</th>
                                  <th className="py-1 text-right font-bold">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pickDetails[player.user_id].map((d, i) => (
                                  <tr key={i} className="border-b last:border-0">
                                    <td className="py-1.5 pr-2 font-bold">{d.gw}</td>
                                    <td className="py-1.5 pr-2">
                                      {d.team}
                                      {d.is_banker && <span className="ml-1 bg-yellow-400 text-black px-1 rounded font-bold">★</span>}
                                      {d.is_autopick && <span className="ml-1 bg-gray-200 text-gray-500 px-1 rounded">A</span>}
                                    </td>
                                    <td className="py-1.5 pr-2 text-right text-gray-500">{d.team_points ?? '—'}</td>
                                    <td className="py-1.5 pr-2">
                                      {d.player1}
                                      {goalPlayers.has(d.player1_id) && ' ⚽'}
                                      {assistPlayers.has(d.player1_id) && ' 🎯'}
                                    </td>
                                    <td className="py-1.5 pr-2 text-right text-gray-500">{d.player1_points ?? '—'}</td>
                                    <td className="py-1.5 pr-2">
                                      {d.player2}
                                      {goalPlayers.has(d.player2_id) && ' ⚽'}
                                      {assistPlayers.has(d.player2_id) && ' 🎯'}
                                    </td>
                                    <td className="py-1.5 pr-2 text-right text-gray-500">{d.player2_points ?? '—'}</td>
                                    <td className="py-1.5 text-right font-bold">{d.points ?? '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {ranked.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400 text-sm uppercase tracking-wider">No players yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-3 uppercase tracking-wider">
        HW/AW = home/away wins. Banker = bonus points. Click any row to expand.
      </p>

    </Shell>
  )
}