'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import { abbrFromMap } from '../lib/teams'

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
  weekly_points: number[]
}

type PickDetail = {
  gw: number
  team_id: number
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
  const [allTeams, setAllTeams] = useState<{ id: number; name: string; short_name: string | null }[]>([])
  const [teamMap, setTeamMap] = useState<Record<number, { name: string; short_name: string | null }>>({})
  const [usedTeamsByPlayer, setUsedTeamsByPlayer] = useState<Record<string, Record<number, number>>>({})
  const [doubleUseByPlayer, setDoubleUseByPlayer] = useState<Record<string, number[]>>({})
  const [avgByGw, setAvgByGw] = useState<Record<number, number>>({})
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

    const [{ data: entries }, { data: profiles }, { data: pointsData }, { data: picks }, { data: teams }, { data: players }, { data: gameweeks }, { data: events }, { data: draftPicks }] = await Promise.all([
      supabase.from('competition_entries').select('user_id, joined_at').eq('competition_id', comp.id).eq('removed', false),
      supabase.from('profiles').select('id, display_name'),
      supabase.from('points').select('user_id, pick_id, total_points, team_points, player1_points, player2_points, breakdown, gameweek_id').eq('competition_id', comp.id),
      supabase.from('picks').select('id, user_id, gameweek_id, team_id, player1_id, player2_id, is_banker, is_autopick').eq('competition_id', comp.id),
      supabase.from('teams').select('id, name, short_name'),
      supabase.from('players').select('id, name'),
      supabase.from('gameweeks').select('id, number').eq('competition_id', comp.id),
      supabase.from('match_events').select('player_id, event_type'),
      supabase.from('draft_picks').select('user_id, team_id').eq('competition_id', comp.id)
    ])

    setMatchEvents(events ?? [])
    setAllTeams(teams ?? [])

    const profileMap: Record<string, string> = {}
    profiles?.forEach(p => { profileMap[p.id] = p.display_name ?? 'Unknown' })

    const tMap: Record<number, { name: string; short_name: string | null }> = {}
    teams?.forEach(t => { tMap[t.id] = { name: t.name, short_name: t.short_name } })
    setTeamMap(tMap)

    const playerMap: Record<number, string> = {}
    players?.forEach(p => { playerMap[p.id] = p.name })

    const gwMap: Record<string, number> = {}
    gameweeks?.forEach(g => { gwMap[g.id] = g.number })

    const pointsByPickId: Record<string, any> = {}
    pointsData?.forEach(p => { pointsByPickId[p.pick_id] = p })

    const doubleUseMap: Record<string, number[]> = {}
    draftPicks?.forEach(dp => {
      if (!doubleUseMap[dp.user_id]) doubleUseMap[dp.user_id] = []
      doubleUseMap[dp.user_id].push(dp.team_id)
    })
    setDoubleUseByPlayer(doubleUseMap)

    const usedMap: Record<string, Record<number, number>> = {}
    picks?.forEach(pick => {
      if (!usedMap[pick.user_id]) usedMap[pick.user_id] = {}
      usedMap[pick.user_id][pick.team_id] = (usedMap[pick.user_id][pick.team_id] || 0) + 1
    })
    setUsedTeamsByPlayer(usedMap)

    const gwPointsMap: Record<string, Record<string, number>> = {}
    pointsData?.forEach(p => {
      if (!gwPointsMap[p.gameweek_id]) gwPointsMap[p.gameweek_id] = {}
      gwPointsMap[p.gameweek_id][p.user_id] = p.total_points ?? 0
    })

    const avgMap: Record<number, number> = {}
    Object.entries(gwPointsMap).forEach(([gwId, userPts]) => {
      const vals = Object.values(userPts)
      if (vals.length > 0) {
        avgMap[gwMap[gwId]] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      }
    })
    setAvgByGw(avgMap)

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
        goals: 0,
        weekly_points: []
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

      const gwNum = gwMap[p.gameweek_id]
      if (gwNum) t.weekly_points[gwNum] = p.total_points ?? 0
    })

    const rankedList = Object.values(totals).sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points
      if (b.points_without_banker !== a.points_without_banker) return b.points_without_banker - a.points_without_banker
      if (b.away_wins !== a.away_wins) return b.away_wins - a.away_wins
      if (b.goals !== a.goals) return b.goals - a.goals
      return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
    })

    setRanked(rankedList)
    if (rankedList.length > 0) setPotwUserId(rankedList[0].user_id)

    const details: Record<string, PickDetail[]> = {}
    picks?.forEach(pick => {
      if (!details[pick.user_id]) details[pick.user_id] = []
      const pts = pointsByPickId[pick.id]
      const team = tMap[pick.team_id]
      details[pick.user_id].push({
        gw: gwMap[pick.gameweek_id] ?? 0,
        team_id: pick.team_id,
        team: team?.name ?? 'Unknown',
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

  function shortName(name: string) {
    const parts = name.split(' ')
    return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : name
  }

  function getStreak(player: RankedPlayer) {
    const weeks = Object.keys(avgByGw).map(Number).sort((a, b) => b - a)
    if (weeks.length < 2) return null
    let streak = 0
    for (const gw of weeks) {
      const playerPts = player.weekly_points[gw]
      const avg = avgByGw[gw]
      if (playerPts === undefined || avg === undefined) break
      if (playerPts > avg) streak++
      else break
    }
    return streak >= 3 ? streak : null
  }

  function getAvailableTeams(userId: string) {
    const used = usedTeamsByPlayer[userId] ?? {}
    const doubleUse = doubleUseByPlayer[userId] ?? []
    return allTeams
      .map(team => {
        const usedCount = used[team.id] ?? 0
        const maxUses = doubleUse.includes(team.id) ? 2 : 1
        const remaining = maxUses - usedCount
        return { ...team, remaining, isDouble: doubleUse.includes(team.id) }
      })
      .filter(team => team.remaining > 0)
      .sort((a, b) => {
        const nameA = a.short_name ?? a.name
        const nameB = b.short_name ?? b.name
        return nameA.localeCompare(nameB)
      })
  }

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
        <table className="w-full" style={{ fontSize: '12px' }}>
          <thead>
            <tr className="text-left text-gray-500 border-b bg-gray-50" style={{ fontSize: '10px' }}>
              <th className="py-2 px-2 uppercase tracking-wider">#</th>
              <th className="py-2 px-2 uppercase tracking-wider">Player</th>
              <th className="py-2 px-2 text-center uppercase tracking-wider">HW</th>
              <th className="py-2 px-2 text-center uppercase tracking-wider">AW</th>
              <th className="py-2 px-2 text-right uppercase tracking-wider">Tm</th>
              <th className="py-2 px-2 text-right uppercase tracking-wider">Pl</th>
              <th className="py-2 px-2 text-right uppercase tracking-wider">Bk</th>
              <th className="py-2 px-2 text-right uppercase tracking-wider font-bold">Tot</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((player, index) => {
              const streak = getStreak(player)
              const availableTeams = getAvailableTeams(player.user_id)
              return (
                <React.Fragment key={player.user_id}>
                  <tr
                    onClick={() => setExpandedUser(expandedUser === player.user_id ? null : player.user_id)}
                    className="border-b cursor-pointer hover:bg-gray-50"
                  >
                    <td className="py-2 px-2 text-gray-400">{index + 1}</td>
                    <td className="py-2 px-2 font-bold uppercase">
                      {player.display_name}
                      {index === 0 && <span className="ml-1">👑</span>}
                      {streak && <span className="ml-1" title={`${streak} weeks above average`}>🔥</span>}
                      <span className="ml-1 text-gray-300" style={{ fontSize: '9px' }}>{expandedUser === player.user_id ? '▲' : '▼'}</span>
                    </td>
                    <td className="py-2 px-2 text-center text-gray-600">{player.home_wins}</td>
                    <td className="py-2 px-2 text-center text-gray-600">{player.away_wins}</td>
                    <td className="py-2 px-2 text-right text-gray-600">{Math.round(player.team_points)}</td>
                    <td className="py-2 px-2 text-right text-gray-600">{Math.round(player.player_points)}</td>
                    <td className="py-2 px-2 text-right text-gray-600">{Math.round(player.banker_points)}</td>
                    <td className="py-2 px-2 text-right font-bold">{player.total_points}</td>
                  </tr>
                  {expandedUser === player.user_id && (
                    <tr>
                      <td colSpan={8} className="bg-gray-50 px-2 py-3">
                        {(!pickDetails[player.user_id] || pickDetails[player.user_id].length === 0) ? (
                          <p className="text-gray-400 mb-3" style={{ fontSize: '10px' }}>No picks yet.</p>
                        ) : (
                          <table className="w-full mb-4" style={{ fontSize: '9px' }}>
                            <thead>
                              <tr className="text-left text-gray-400 border-b uppercase tracking-wider">
                                <th className="py-1 pr-1">GW</th>
                                <th className="py-1 pr-1">Team</th>
                                <th className="py-1 pr-1 text-right">Pts</th>
                                <th className="py-1 pr-1">P1</th>
                                <th className="py-1 pr-1 text-right">Pts</th>
                                <th className="py-1 pr-1">P2</th>
                                <th className="py-1 pr-1 text-right">Pts</th>
                                <th className="py-1 text-right font-bold">Tot</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pickDetails[player.user_id].map((d, i) => (
                                <tr key={i} className="border-b last:border-0">
                                  <td className="py-1 pr-1 font-bold">{d.gw}</td>
                                  <td className="py-1 pr-1 uppercase">
                                    {abbrFromMap(teamMap, d.team_id)}
                                    {d.is_banker && <span className="ml-0.5 bg-yellow-400 text-black px-0.5 rounded font-bold">★</span>}
                                    {d.is_autopick && <span className="ml-0.5 bg-gray-200 text-gray-500 px-0.5 rounded">A</span>}
                                  </td>
                                  <td className="py-1 pr-1 text-right text-gray-500">{d.team_points ?? '—'}</td>
                                  <td className="py-1 pr-1 uppercase">
                                    {shortName(d.player1)}
                                    {goalPlayers.has(d.player1_id) && ' ⚽'}
                                    {assistPlayers.has(d.player1_id) && <span className="ml-0.5 bg-green-100 text-green-700 px-0.5 rounded font-bold">A</span>}
                                  </td>
                                  <td className="py-1 pr-1 text-right text-gray-500">{d.player1_points ?? '—'}</td>
                                  <td className="py-1 pr-1 uppercase">
                                    {shortName(d.player2)}
                                    {goalPlayers.has(d.player2_id) && ' ⚽'}
                                    {assistPlayers.has(d.player2_id) && <span className="ml-0.5 bg-green-100 text-green-700 px-0.5 rounded font-bold">A</span>}
                                  </td>
                                  <td className="py-1 pr-1 text-right text-gray-500">{d.player2_points ?? '—'}</td>
                                  <td className="py-1 text-right font-bold">{d.points ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}

                        <div style={{ fontSize: '9px' }}>
                          <p className="text-gray-400 uppercase tracking-wider font-bold mb-1">
                            Available Teams ({availableTeams.length})
                          </p>
                          {availableTeams.length === 0 ? (
                            <p className="text-gray-400">No teams remaining.</p>
                          ) : (
                            <div className="grid grid-cols-4 gap-1">
                              {availableTeams.map(team => (
                                <div
                                  key={team.id}
                                  className="bg-white border rounded px-1.5 py-1 uppercase text-center"
                                >
                                  {team.short_name ?? team.name}
                                  {team.isDouble && team.remaining === 2 && (
                                    <span className="ml-0.5 text-yellow-600 font-bold">(x2)</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
            {ranked.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-400 uppercase tracking-wider" style={{ fontSize: '11px' }}>No players yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 uppercase tracking-wider text-gray-400" style={{ fontSize: '10px' }}>
        <span className="font-bold mr-2">Key:</span>
        👑 Leader
        <span className="mx-2">·</span>
        🔥 On a streak (3+ weeks above average)
        <span className="mx-2">·</span>
        HW/AW = home/away wins
        <span className="mx-2">·</span>
        Bk = banker bonus
        <span className="mx-2">·</span>
        Click any row to expand
      </div>

    </Shell>
  )
}