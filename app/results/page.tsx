'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import { abbrFromMap } from '../lib/teams'

type Gameweek = {
  id: string
  number: number
  deadline: string
  status: string
}

type PickRow = {
  id: string
  user_id: string
  team_id: number
  player1_id: number
  player2_id: number
  is_banker: boolean
  is_autopick: boolean
  submitted_at: string
}

type PointsRow = {
  pick_id: string
  total_points: number
  team_points: number
  player1_points: number
  player2_points: number
  breakdown: any
}

type MatchEvent = {
  player_id: number
  event_type: string
}

export default function ResultsPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [competition, setCompetition] = useState<any>(null)
  const [gameweeks, setGameweeks] = useState<Gameweek[]>([])
  const [selectedGw, setSelectedGw] = useState<string | null>(null)
  const [picks, setPicks] = useState<PickRow[]>([])
  const [pointsData, setPointsData] = useState<PointsRow[]>([])
  const [matchEvents, setMatchEvents] = useState<MatchEvent[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [teams, setTeams] = useState<Record<number, { name: string; short_name: string | null }>>({})
  const [players, setPlayers] = useState<Record<number, string>>({})
  const [quartileMap, setQuartileMap] = useState<Record<number, number>>({})
  const [potwUserId, setPotwUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingPicks, setLoadingPicks] = useState(false)

  const supabase = createClient()

  useEffect(() => { loadBase() }, [])
  useEffect(() => { if (selectedGw) loadPicksForGw(selectedGw) }, [selectedGw])

  async function loadBase() {
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

    const now = new Date()

    const [{ data: gws }, { data: profilesData }, { data: teamsData }, { data: playersData }, { data: quartilesData }] = await Promise.all([
      supabase.from('gameweeks').select('id, number, deadline, status').eq('competition_id', comp.id).lt('deadline', now.toISOString()).order('number', { ascending: true }),
      supabase.from('profiles').select('id, display_name'),
      supabase.from('teams').select('id, name, short_name'),
      supabase.from('players').select('id, name'),
      supabase.from('tier_assignments').select('team_id, tier').eq('competition_id', comp.id)
    ])

    const profileMap: Record<string, string> = {}
    profilesData?.forEach(p => { profileMap[p.id] = p.display_name ?? 'Unknown' })

    const teamMap: Record<number, { name: string; short_name: string | null }> = {}
    teamsData?.forEach(t => { teamMap[t.id] = { name: t.name, short_name: t.short_name } })

    const playerMap: Record<number, string> = {}
    playersData?.forEach(p => { playerMap[p.id] = p.name })

    const qMap: Record<number, number> = {}
    quartilesData?.forEach(q => { qMap[q.team_id] = q.tier })

    setProfiles(profileMap)
    setTeams(teamMap)
    setPlayers(playerMap)
    setQuartileMap(qMap)
    setGameweeks(gws ?? [])

    if (gws && gws.length > 0) {
      setSelectedGw(gws[gws.length - 1].id)
    }

    const { data: allPoints } = await supabase
      .from('points')
      .select('user_id, pick_id, total_points, gameweek_id')
      .eq('competition_id', comp.id)

    if (allPoints && allPoints.length > 0) {
      const maxPts = Math.max(...allPoints.map(p => p.total_points ?? 0))
      const topScorer = allPoints.filter(p => (p.total_points ?? 0) === maxPts)[0]
      if (topScorer) setPotwUserId(topScorer.user_id)
    }

    setLoading(false)
  }

  async function loadPicksForGw(gwId: string) {
    setLoadingPicks(true)

    const [{ data: picksData }, { data: pts }, { data: events }] = await Promise.all([
      supabase.from('picks').select('id, user_id, team_id, player1_id, player2_id, is_banker, is_autopick, submitted_at').eq('gameweek_id', gwId),
      supabase.from('points').select('pick_id, total_points, team_points, player1_points, player2_points, breakdown').eq('gameweek_id', gwId),
      supabase.from('match_events').select('player_id, event_type')
    ])

    setPicks(picksData ?? [])
    setPointsData(pts ?? [])
    setMatchEvents(events ?? [])
    setLoadingPicks(false)
  }

  const selectedGameweek = gameweeks.find(g => g.id === selectedGw)
  const isScored = selectedGameweek?.status === 'completed'

  const pointsMap: Record<string, PointsRow> = {}
  pointsData.forEach(p => { pointsMap[p.pick_id] = p })

  const goalPlayers = new Set(matchEvents.filter(e => e.event_type === 'goal').map(e => e.player_id))
  const assistPlayers = new Set(matchEvents.filter(e => e.event_type === 'assist').map(e => e.player_id))

  const sortedPicks = [...picks].sort((a, b) => {
    const apts = pointsMap[a.id]?.total_points ?? 0
    const bpts = pointsMap[b.id]?.total_points ?? 0
    return bpts - apts
  })

  const gwPotwUserId = isScored && sortedPicks.length > 0 ? sortedPicks[0].user_id : null

  function shortName(id: number, map: Record<number, string>) {
    const full = map[id] ?? 'Unknown'
    const parts = full.split(' ')
    return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : full
  }

  function getBoldestPick(): PickRow | null {
    let boldest: PickRow | null = null
    let highestQ = -1
    picks.forEach(pick => {
      const q = quartileMap[pick.team_id] ?? 0
      if (q > highestQ) { highestQ = q; boldest = pick }
    })
    return boldest
  }

  function getSafestPick(): PickRow | null {
    let safest: PickRow | null = null
    let lowestQ = 99
    picks.forEach(pick => {
      const q = quartileMap[pick.team_id] ?? 99
      if (q < lowestQ) { lowestQ = q; safest = pick }
    })
    return safest
  }

  function getContrarianPicks(): PickRow[] {
    const teamCounts: Record<number, number> = {}
    picks.forEach(p => { teamCounts[p.team_id] = (teamCounts[p.team_id] || 0) + 1 })
    return picks.filter(p => teamCounts[p.team_id] === 1)
  }

  const boldest = getBoldestPick()
  const safest = getSafestPick()
  const contrarians = getContrarianPicks()

  if (loading) {
    return (
      <Shell active="RESULTS">
        <p className="text-gray-500">Loading...</p>
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="RESULTS">
        <h1 className="text-2xl font-bold mb-2">No Active Competition</h1>
        <p className="text-gray-500">There is no active competition right now.</p>
      </Shell>
    )
  }

  return (
    <Shell active="RESULTS" user={user} displayName={displayName}>

      <h1 className="text-3xl font-bold mb-1">Results</h1>
      <p className="text-gray-500 mb-6 text-sm">{competition.name}</p>

      {potwUserId && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 mb-6 flex items-center gap-3">
          <span className="text-xl">⭐</span>
          <div>
            <p className="text-xs text-yellow-700 font-bold uppercase tracking-wide">Season Leader</p>
            <p className="font-bold uppercase">{profiles[potwUserId] ?? 'Unknown'}</p>
          </div>
        </div>
      )}

      {gameweeks.length === 0 ? (
        <div className="bg-white border rounded-lg p-6">
          <p className="text-gray-400 text-sm uppercase tracking-wider">No gameweeks have passed their deadline yet.</p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <select
              value={selectedGw ?? ''}
              onChange={e => setSelectedGw(e.target.value)}
              className="border rounded px-3 py-2 text-sm font-bold bg-white w-full md:w-auto uppercase"
            >
              {gameweeks.map(gw => (
                <option key={gw.id} value={gw.id}>
                  Gameweek {gw.number} — {gw.status === 'completed' ? 'Scored' : 'Awaiting scoring'}
                </option>
              ))}
            </select>
          </div>

          {selectedGameweek && (
            <div className="mb-4 flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold uppercase">Gameweek {selectedGameweek.number}</h2>
              <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                isScored ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
              }`}>
                {isScored ? 'Scored' : 'Awaiting scoring'}
              </span>
              {isScored && gwPotwUserId && (
                <span className="text-xs text-yellow-700 font-bold uppercase tracking-wider">
                  ⭐ GW Winner: {profiles[gwPotwUserId]}
                </span>
              )}
            </div>
          )}

          {loadingPicks ? (
            <p className="text-gray-400 text-sm uppercase tracking-wider">Loading picks...</p>
          ) : sortedPicks.length === 0 ? (
            <div className="bg-white border rounded-lg p-6">
              <p className="text-gray-400 text-sm uppercase tracking-wider">No picks for this gameweek.</p>
            </div>
          ) : (
            <>
              <div className="bg-white border rounded-lg overflow-hidden mb-3">
                <table className="w-full" style={{ fontSize: '10px' }}>
                  <thead>
                    <tr className="text-left border-b bg-gray-50 uppercase tracking-wider text-gray-500" style={{ fontSize: '9px' }}>
                      <th className="py-2 px-2">Player</th>
                      <th className="py-2 px-2">Team</th>
                      <th className="py-2 px-2">P1</th>
                      <th className="py-2 px-2">P2</th>
                      {isScored && (
                        <>
                          <th className="py-2 px-1 text-right">Tm</th>
                          <th className="py-2 px-1 text-right">P1</th>
                          <th className="py-2 px-1 text-right">P2</th>
                          <th className="py-2 px-1 text-right font-bold">Tot</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPicks.map((pick, i) => {
                      const pts = pointsMap[pick.id]
                      const isWinner = isScored && pick.user_id === gwPotwUserId && i === 0
                      const isBoldest = boldest?.id === pick.id
                      const isSafest = safest?.id === pick.id && !isBoldest
                      const isContrarian = contrarians.some(c => c.id === pick.id)

                      return (
                        <tr key={pick.id} className={`border-b last:border-0 ${isWinner ? 'bg-yellow-50' : ''}`}>
                          <td className="py-1.5 px-2 font-bold uppercase">
                            <div className="flex items-center gap-0.5 flex-wrap">
                              {profiles[pick.user_id] ?? 'Unknown'}
                              {isWinner && <span>⭐</span>}
                              {isBoldest && <span title="Boldest Pick">🎲</span>}
                              {isSafest && <span title="Safe Hands">🛡️</span>}
                              {isContrarian && <span title="Contrarian">🦄</span>}
                              {pick.is_autopick && <span className="bg-gray-200 text-gray-500 px-0.5 rounded" style={{ fontSize: '8px' }}>A</span>}
                            </div>
                          </td>
                          <td className="py-1.5 px-2 uppercase">
                            <div className="flex items-center gap-0.5">
                              {abbrFromMap(teams, pick.team_id)}
                              {pick.is_banker && <span className="bg-yellow-400 text-black font-bold px-0.5 rounded" style={{ fontSize: '8px' }}>★B</span>}
                            </div>
                          </td>
                          <td className="py-1.5 px-2 uppercase">
                            {shortName(pick.player1_id, players)}
                            {goalPlayers.has(pick.player1_id) && ' ⚽'}
                            {assistPlayers.has(pick.player1_id) && <span className="ml-0.5 bg-green-100 text-green-700 px-0.5 rounded font-bold" style={{ fontSize: '8px' }}>A</span>}
                          </td>
                          <td className="py-1.5 px-2 uppercase">
                            {shortName(pick.player2_id, players)}
                            {goalPlayers.has(pick.player2_id) && ' ⚽'}
                            {assistPlayers.has(pick.player2_id) && <span className="ml-0.5 bg-green-100 text-green-700 px-0.5 rounded font-bold" style={{ fontSize: '8px' }}>A</span>}
                          </td>
                          {isScored && (
                            <>
                              <td className="py-1.5 px-1 text-right text-gray-500">{pts?.team_points ?? '—'}</td>
                              <td className="py-1.5 px-1 text-right text-gray-500">{pts?.player1_points ?? '—'}</td>
                              <td className="py-1.5 px-1 text-right text-gray-500">{pts?.player2_points ?? '—'}</td>
                              <td className="py-1.5 px-1 text-right font-bold">{pts?.total_points ?? '—'}</td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                <div className="px-3 py-2 border-t bg-gray-50 uppercase tracking-wider text-gray-400" style={{ fontSize: '9px' }}>
                  <span className="font-bold mr-2">Key:</span>
                  ⭐ GW Winner
                  <span className="mx-2">·</span>
                  🎲 Boldest Pick
                  <span className="mx-2">·</span>
                  🛡️ Safe Hands
                  <span className="mx-2">·</span>
                  🦄 Contrarian
                  <span className="mx-2">·</span>
                  ⚽ Goal
                  <span className="mx-2">·</span>
                  <span className="bg-green-100 text-green-700 px-0.5 rounded font-bold">A</span> Assist
                  <span className="mx-2">·</span>
                  <span className="bg-yellow-400 text-black px-0.5 rounded font-bold">★B</span> Banker
                </div>
              </div>
            </>
          )}
        </>
      )}

    </Shell>
  )
}