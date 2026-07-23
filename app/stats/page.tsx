'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import TeamCrest from '../../components/TeamCrest'
import { buildPlayerDisplayNames } from '../lib/players'

type Tab = 'teams' | 'players' | 'me' | 'trends'

type Team = { id: number; name: string; short_name: string | null; short_code: string | null; crest_url: string | null; active: boolean }
type PlayerRow = { id: number; name: string; web_name: string | null; team_id: number; position: string | null }

type TeamStat = {
  team: Team
  timesPicked: number
  timesBanked: number
  totalPoints: number
  avgPoints: number
}

type PlayerStat = {
  player: PlayerRow
  displayName: string
  goals: number
  assists: number
  realWorldPoints: number
  timesPicked: number
  totalPickPoints: number
  avgPickPoints: number
}

const GOLD = '#D9A441'
const CREAM = '#F5ECD9'
const GRID = 'rgba(245,236,217,0.1)'

function axisProps() {
  return { tick: { fill: CREAM, fontSize: 10, opacity: 0.6 }, stroke: 'rgba(245,236,217,0.2)' }
}

function tooltipStyle() {
  return {
    contentStyle: { background: '#1a120b', border: '1px solid rgba(217,164,65,0.4)', borderRadius: 6, fontSize: 12 },
    labelStyle: { color: GOLD },
    itemStyle: { color: CREAM }
  }
}

function teamDisplayName(team: Team | undefined) {
  if (!team) return 'Unknown'
  return team.short_name ?? team.name.replace(' FC', '').replace(' AFC', '')
}

export default function StatsHubPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [competition, setCompetition] = useState<any>(null)
  const [tab, setTab] = useState<Tab>('teams')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [teamStats, setTeamStats] = useState<TeamStat[]>([])
  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([])
  const [avgByGw, setAvgByGw] = useState<{ gw: number; avg: number }[]>([])
  const [teamPopularity, setTeamPopularity] = useState<{ name: string; count: number }[]>([])
  const [pickMethod, setPickMethod] = useState<{ gw: number; manual: number; autopick: number }[]>([])
  const [mostBankedTeam, setMostBankedTeam] = useState<{ name: string; count: number } | null>(null)
  const [mostBankedPlayer, setMostBankedPlayer] = useState<{ name: string; count: number } | null>(null)

  const [myWeekly, setMyWeekly] = useState<{ gw: number; points: number }[]>([])
  const [myCumulative, setMyCumulative] = useState<{ gw: number; cumulative: number; rank: number }[]>([])
  const [myBest, setMyBest] = useState<{ gw: number; points: number } | null>(null)
  const [myWorst, setMyWorst] = useState<{ gw: number; points: number } | null>(null)

  const [teamSearch, setTeamSearch] = useState('')
  const [playerSearch, setPlayerSearch] = useState('')
  const [playerPositionFilter, setPlayerPositionFilter] = useState<string>('ALL')

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    setUser(authUser)

    if (authUser) {
      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', authUser.id).single()
      setDisplayName(profile?.display_name ?? '')
    }

    const { data: comp } = await supabase
      .from('competitions')
      .select('id, name')
      .eq('status', 'active')
      .single()

    if (!comp) { setLoading(false); return }
    setCompetition(comp)

    try {
      const [
        { data: teams }, { data: players }, { data: gameweeks },
        { data: entries }, { data: picks }, { data: points }, { data: events },
        { data: fixtures }, { data: playerRules }
      ] = await Promise.all([
        supabase.from('teams').select('id, name, short_name, short_code, crest_url, active'),
        supabase.from('players').select('id, name, web_name, team_id, position'),
        supabase.from('gameweeks').select('id, number, deadline, status').eq('competition_id', comp.id),
        supabase.from('competition_entries').select('user_id, joined_at').eq('competition_id', comp.id).eq('removed', false),
        supabase.from('picks').select('id, user_id, gameweek_id, team_id, player1_id, player2_id, is_banker, is_autopick').eq('competition_id', comp.id),
        supabase.from('points').select('user_id, pick_id, gameweek_id, total_points, team_points, player1_points, player2_points, breakdown').eq('competition_id', comp.id),
        supabase.from('match_events').select('player_id, event_type, fixture_id'),
        supabase.from('fixtures').select('id, gameweek_id'),
        supabase.from('player_scoring_rules').select('event_type, points').eq('competition_id', comp.id),
      ])

      const tMap: Record<number, Team> = {}
      teams?.forEach(t => { tMap[t.id] = t })

      const pMap: Record<number, PlayerRow> = {}
      players?.forEach(p => { pMap[p.id] = p })
      const displayNames = buildPlayerDisplayNames(players ?? [], tMap)

      const gwMap: Record<string, number> = {}
      gameweeks?.forEach(g => { gwMap[g.id] = g.number })

      // match_events isn't tagged with a competition directly (only with a
      // fixture), so without this filter goals/assists from every past
      // competition's fixtures would bleed into this one's player stats.
      const currentCompFixtureIds = new Set(
        (fixtures ?? []).filter(f => gwMap[f.gameweek_id] !== undefined).map(f => f.id)
      )
      const scopedEvents = (events ?? []).filter(e => e.fixture_id != null && currentCompFixtureIds.has(e.fixture_id))

      const pickById: Record<string, { user_id: string; team_id: number; player1_id: number; player2_id: number; is_banker: boolean; is_autopick: boolean; gameweek_id: string }> = {}
      picks?.forEach(p => { pickById[p.id] = p })

      const goalRule = playerRules?.find(r => r.event_type === 'goal')?.points ?? 0
      const assistRule = playerRules?.find(r => r.event_type === 'assist')?.points ?? 0

      // --- Team stats ---
      const teamAgg: Record<number, { picked: number; banked: number; total: number }> = {}
      points?.forEach(pt => {
        const pick = pickById[pt.pick_id]
        if (!pick) return
        const isBanker = (pt.breakdown as any)?.is_banker === true
        const raw = isBanker ? (pt.team_points ?? 0) / 2 : (pt.team_points ?? 0)
        if (!teamAgg[pick.team_id]) teamAgg[pick.team_id] = { picked: 0, banked: 0, total: 0 }
        teamAgg[pick.team_id].picked += 1
        teamAgg[pick.team_id].total += raw
        if (isBanker) teamAgg[pick.team_id].banked += 1
      })
      const teamStatList: TeamStat[] = Object.entries(teamAgg)
        .filter(([teamId]) => tMap[Number(teamId)])
        .map(([teamId, agg]) => ({
          team: tMap[Number(teamId)],
          timesPicked: agg.picked,
          timesBanked: agg.banked,
          totalPoints: Math.round(agg.total),
          avgPoints: agg.picked > 0 ? Math.round((agg.total / agg.picked) * 10) / 10 : 0
        }))
        .sort((a, b) => b.totalPoints - a.totalPoints)
      setTeamStats(teamStatList)

      // --- Player stats (real-world goals/assists + pick performance) ---
      const goalCount: Record<number, number> = {}
      const assistCount: Record<number, number> = {}
      scopedEvents.forEach(e => {
        if (e.event_type === 'goal') goalCount[e.player_id] = (goalCount[e.player_id] ?? 0) + 1
        if (e.event_type === 'assist') assistCount[e.player_id] = (assistCount[e.player_id] ?? 0) + 1
      })

      const playerPickAgg: Record<number, { picked: number; total: number }> = {}
      points?.forEach(pt => {
        const pick = pickById[pt.pick_id]
        if (!pick) return
        const isBanker = (pt.breakdown as any)?.is_banker === true
        const p1 = isBanker ? (pt.player1_points ?? 0) / 2 : (pt.player1_points ?? 0)
        const p2 = isBanker ? (pt.player2_points ?? 0) / 2 : (pt.player2_points ?? 0)
        ;[[pick.player1_id, p1], [pick.player2_id, p2]].forEach(([pid, val]) => {
          const playerId = pid as number
          if (!playerPickAgg[playerId]) playerPickAgg[playerId] = { picked: 0, total: 0 }
          playerPickAgg[playerId].picked += 1
          playerPickAgg[playerId].total += val as number
        })
      })

      const allPlayerIds = new Set<number>([
        ...Object.keys(goalCount).map(Number),
        ...Object.keys(assistCount).map(Number),
        ...Object.keys(playerPickAgg).map(Number)
      ])
      const playerStatList: PlayerStat[] = Array.from(allPlayerIds)
        .filter(id => pMap[id])
        .map(id => {
          const goals = goalCount[id] ?? 0
          const assists = assistCount[id] ?? 0
          const pickAgg = playerPickAgg[id] ?? { picked: 0, total: 0 }
          return {
            player: pMap[id],
            displayName: displayNames[id] ?? 'Unknown',
            goals,
            assists,
            realWorldPoints: goals * goalRule + assists * assistRule,
            timesPicked: pickAgg.picked,
            totalPickPoints: Math.round(pickAgg.total),
            avgPickPoints: pickAgg.picked > 0 ? Math.round((pickAgg.total / pickAgg.picked) * 10) / 10 : 0
          }
        })
        .sort((a, b) => b.realWorldPoints - a.realWorldPoints)
      setPlayerStats(playerStatList)

      // --- League trends ---
      const gwPointsByUser: Record<number, Record<string, number>> = {}
      points?.forEach(pt => {
        const gwNum = gwMap[pt.gameweek_id]
        if (!gwNum) return
        if (!gwPointsByUser[gwNum]) gwPointsByUser[gwNum] = {}
        gwPointsByUser[gwNum][pt.user_id] = (gwPointsByUser[gwNum][pt.user_id] ?? 0) + (pt.total_points ?? 0)
      })
      const avgList = Object.entries(gwPointsByUser)
        .map(([gw, byUser]) => {
          const vals = Object.values(byUser)
          return { gw: Number(gw), avg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0 }
        })
        .sort((a, b) => a.gw - b.gw)
      setAvgByGw(avgList)

      const teamPickCount: Record<number, number> = {}
      picks?.forEach(p => { teamPickCount[p.team_id] = (teamPickCount[p.team_id] ?? 0) + 1 })
      const popularity = Object.entries(teamPickCount)
        .filter(([teamId]) => tMap[Number(teamId)])
        .map(([teamId, count]) => ({ name: teamDisplayName(tMap[Number(teamId)]), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
      setTeamPopularity(popularity)

      const methodByGw: Record<number, { manual: number; autopick: number }> = {}
      picks?.forEach(p => {
        const gwNum = gwMap[p.gameweek_id]
        if (!gwNum) return
        if (!methodByGw[gwNum]) methodByGw[gwNum] = { manual: 0, autopick: 0 }
        if (p.is_autopick) methodByGw[gwNum].autopick += 1
        else methodByGw[gwNum].manual += 1
      })
      setPickMethod(Object.entries(methodByGw).map(([gw, v]) => ({ gw: Number(gw), ...v })).sort((a, b) => a.gw - b.gw))

      const teamBankCount: Record<number, number> = {}
      const playerBankCount: Record<number, number> = {}
      picks?.forEach(p => {
        if (!p.is_banker) return
        teamBankCount[p.team_id] = (teamBankCount[p.team_id] ?? 0) + 1
      })
      const topBankedTeamEntry = Object.entries(teamBankCount).sort((a, b) => b[1] - a[1])[0]
      setMostBankedTeam(topBankedTeamEntry ? { name: teamDisplayName(tMap[Number(topBankedTeamEntry[0])]), count: topBankedTeamEntry[1] } : null)

      // Bankers boost the whole pick, including both players — count both toward "most banked player" too.
      picks?.forEach(p => {
        if (!p.is_banker) return
        playerBankCount[p.player1_id] = (playerBankCount[p.player1_id] ?? 0) + 1
        playerBankCount[p.player2_id] = (playerBankCount[p.player2_id] ?? 0) + 1
      })
      const topBankedPlayerEntry = Object.entries(playerBankCount).sort((a, b) => b[1] - a[1])[0]
      setMostBankedPlayer(topBankedPlayerEntry
        ? { name: displayNames[Number(topBankedPlayerEntry[0])] ?? 'Unknown', count: topBankedPlayerEntry[1] }
        : null)

      // --- My performance ---
      if (authUser) {
        const weekly: { gw: number; points: number }[] = []
        Object.entries(gwPointsByUser).forEach(([gw, byUser]) => {
          if (byUser[authUser.id] !== undefined) weekly.push({ gw: Number(gw), points: byUser[authUser.id] })
        })
        weekly.sort((a, b) => a.gw - b.gw)
        setMyWeekly(weekly)

        if (weekly.length > 0) {
          const sortedByPts = [...weekly].sort((a, b) => b.points - a.points)
          setMyBest(sortedByPts[0])
          setMyWorst(sortedByPts[sortedByPts.length - 1])
        }

        const allGwNumbers = Array.from(new Set(Object.keys(gwPointsByUser).map(Number))).sort((a, b) => a - b)
        const userIds = Array.from(new Set(picks?.map(p => p.user_id) ?? entries?.map(e => e.user_id) ?? []))
        const cumByUser: Record<string, number> = {}
        const cumulative: { gw: number; cumulative: number; rank: number }[] = []
        allGwNumbers.forEach(gwNum => {
          userIds.forEach(uid => {
            cumByUser[uid] = (cumByUser[uid] ?? 0) + (gwPointsByUser[gwNum]?.[uid] ?? 0)
          })
          const ranked = userIds
            .map(uid => ({ uid, total: cumByUser[uid] ?? 0 }))
            .sort((a, b) => b.total - a.total)
          const myRank = ranked.findIndex(r => r.uid === authUser.id) + 1
          cumulative.push({ gw: gwNum, cumulative: Math.round(cumByUser[authUser.id] ?? 0), rank: myRank || ranked.length })
        })
        setMyCumulative(cumulative)
      }

      setLoading(false)
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong loading stats')
      setLoading(false)
    }
  }

  const filteredTeamStats = useMemo(() => {
    if (!teamSearch.trim()) return teamStats
    const q = teamSearch.toLowerCase()
    return teamStats.filter(t => teamDisplayName(t.team).toLowerCase().includes(q))
  }, [teamStats, teamSearch])

  const filteredPlayerStats = useMemo(() => {
    let list = playerStats
    if (playerPositionFilter !== 'ALL') list = list.filter(p => p.player.position === playerPositionFilter)
    if (playerSearch.trim()) {
      const q = playerSearch.toLowerCase()
      list = list.filter(p => p.displayName.toLowerCase().includes(q))
    }
    return list
  }, [playerStats, playerSearch, playerPositionFilter])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'teams', label: 'Teams' },
    { id: 'players', label: 'Players' },
    { id: 'me', label: 'My Performance' },
    { id: 'trends', label: 'League Trends' },
  ]

  if (loading) {
    return (
      <Shell active="STATS HUB">
        <p className="text-gray-500">Loading...</p>
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="STATS HUB">
        <h1 className="text-2xl font-bold mb-2">No Active Competition</h1>
        <p className="text-gray-500">There is no active competition right now.</p>
      </Shell>
    )
  }

  return (
    <Shell active="STATS HUB" user={user} displayName={displayName}>
      <HeroPage wide>
        <div className="w-full text-[#F5ECD9]">
          <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-heading), serif', color: GOLD }}>STATS HUB</h1>
          <p className="text-[#D9A441]/70 mb-6 text-sm">{competition.name} — every number the game has generated so far.</p>

          {error && (
            <div className="bg-red-900/30 border border-red-700/40 rounded-lg px-4 py-3 mb-5 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex gap-1 mb-5 overflow-x-auto border-b border-white/10">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-xs font-bold tracking-widest whitespace-nowrap border-b-2 uppercase transition-colors ${
                  tab === t.id ? 'border-[#D9A441] text-[#D9A441]' : 'border-transparent text-[#F5ECD9]/60 hover:text-[#F5ECD9]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'teams' && (
            <div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4" style={{ height: 260 }}>
                <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">Top 10 teams by total points contributed</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={teamStats.slice(0, 10).map(t => ({ name: teamDisplayName(t.team), points: t.totalPoints }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="name" {...axisProps()} interval={0} angle={-35} textAnchor="end" height={50} />
                    <YAxis {...axisProps()} />
                    <Tooltip {...tooltipStyle()} />
                    <Bar dataKey="points" fill={GOLD} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <input
                type="text"
                placeholder="Search teams..."
                value={teamSearch}
                onChange={e => setTeamSearch(e.target.value)}
                className="w-full mb-3 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-[#F5ECD9] placeholder:text-[#F5ECD9]/30 focus:outline-none focus:border-[#D9A441]/50"
              />

              <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden overflow-x-auto">
                <table className="w-full" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr className="text-left border-b border-white/10 text-[#F5ECD9]/50" style={{ fontSize: '10px' }}>
                      <th className="py-2 px-2 uppercase tracking-wider">Team</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Picked</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Banked</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Total Pts</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider font-bold">Avg / Pick</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeamStats.map(t => (
                      <tr key={t.team.id} className="border-b border-white/5 last:border-0">
                        <td className="py-2 px-2 font-bold uppercase">
                          <div className="flex items-center gap-1.5">
                            <TeamCrest crestUrl={t.team.crest_url} teamName={t.team.name} size={16} />
                            {teamDisplayName(t.team)}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right text-[#F5ECD9]/60">{t.timesPicked}</td>
                        <td className="py-2 px-2 text-right text-[#F5ECD9]/60">{t.timesBanked}</td>
                        <td className="py-2 px-2 text-right text-[#F5ECD9]/60">{t.totalPoints}</td>
                        <td className="py-2 px-2 text-right font-bold" style={{ color: GOLD }}>{t.avgPoints}</td>
                      </tr>
                    ))}
                    {filteredTeamStats.length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center text-[#F5ECD9]/40 uppercase tracking-wider" style={{ fontSize: '11px' }}>No data yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'players' && (
            <div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4" style={{ height: 260 }}>
                <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">Top 12 players by real-world points (goals &amp; assists)</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={playerStats.slice(0, 12).map(p => ({ name: p.displayName, points: p.realWorldPoints }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="name" {...axisProps()} interval={0} angle={-35} textAnchor="end" height={60} />
                    <YAxis {...axisProps()} />
                    <Tooltip {...tooltipStyle()} />
                    <Bar dataKey="points" fill={GOLD} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Search players..."
                  value={playerSearch}
                  onChange={e => setPlayerSearch(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-[#F5ECD9] placeholder:text-[#F5ECD9]/30 focus:outline-none focus:border-[#D9A441]/50"
                />
                <select
                  value={playerPositionFilter}
                  onChange={e => setPlayerPositionFilter(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-[#F5ECD9] focus:outline-none focus:border-[#D9A441]/50"
                >
                  <option value="ALL">All positions</option>
                  <option value="GK">GK</option>
                  <option value="DEF">DEF</option>
                  <option value="MID">MID</option>
                  <option value="FWD">FWD</option>
                </select>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden overflow-x-auto">
                <table className="w-full" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr className="text-left border-b border-white/10 text-[#F5ECD9]/50" style={{ fontSize: '10px' }}>
                      <th className="py-2 px-2 uppercase tracking-wider">Player</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Goals</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Assists</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Real Pts</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Picked</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider font-bold">Avg Pick Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayerStats.slice(0, 100).map(p => (
                      <tr key={p.player.id} className="border-b border-white/5 last:border-0">
                        <td className="py-2 px-2 font-bold uppercase">{p.displayName}</td>
                        <td className="py-2 px-2 text-right text-[#F5ECD9]/60">{p.goals}</td>
                        <td className="py-2 px-2 text-right text-[#F5ECD9]/60">{p.assists}</td>
                        <td className="py-2 px-2 text-right font-bold" style={{ color: GOLD }}>{p.realWorldPoints}</td>
                        <td className="py-2 px-2 text-right text-[#F5ECD9]/60">{p.timesPicked}</td>
                        <td className="py-2 px-2 text-right text-[#F5ECD9]/60">{p.timesPicked > 0 ? p.avgPickPoints : '—'}</td>
                      </tr>
                    ))}
                    {filteredPlayerStats.length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center text-[#F5ECD9]/40 uppercase tracking-wider" style={{ fontSize: '11px' }}>No data yet.</td></tr>
                    )}
                  </tbody>
                </table>
                {filteredPlayerStats.length > 100 && (
                  <p className="px-2 py-2 text-[#F5ECD9]/30" style={{ fontSize: '10px' }}>Showing top 100 of {filteredPlayerStats.length} — narrow your search to see more specific players.</p>
                )}
              </div>
            </div>
          )}

          {tab === 'me' && (
            <div>
              {!user ? (
                <p className="text-[#F5ECD9]/50 text-sm">Log in to see your personal performance.</p>
              ) : myWeekly.length === 0 ? (
                <p className="text-[#F5ECD9]/50 text-sm">No scored gameweeks yet — check back once results come in.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold mb-1">Best Gameweek</p>
                      <p className="text-xl font-bold" style={{ color: GOLD }}>GW{myBest?.gw} · {myBest?.points} pts</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold mb-1">Worst Gameweek</p>
                      <p className="text-xl font-bold text-[#F5ECD9]/70">GW{myWorst?.gw} · {myWorst?.points} pts</p>
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4" style={{ height: 240 }}>
                    <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">Points per gameweek</p>
                    <ResponsiveContainer width="100%" height="90%">
                      <BarChart data={myWeekly.map(w => ({ name: `GW${w.gw}`, points: w.points }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                        <XAxis dataKey="name" {...axisProps()} />
                        <YAxis {...axisProps()} />
                        <Tooltip {...tooltipStyle()} />
                        <Bar dataKey="points" fill={GOLD} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-lg p-4" style={{ height: 240 }}>
                    <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">Your rank over the competition (lower = better)</p>
                    <ResponsiveContainer width="100%" height="90%">
                      <LineChart data={myCumulative.map(c => ({ name: `GW${c.gw}`, rank: c.rank }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                        <XAxis dataKey="name" {...axisProps()} />
                        <YAxis {...axisProps()} reversed allowDecimals={false} />
                        <Tooltip {...tooltipStyle()} />
                        <Line type="monotone" dataKey="rank" stroke={GOLD} strokeWidth={2} dot={{ r: 3, fill: GOLD }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'trends' && (
            <div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold mb-1">Most Banked Team</p>
                  <p className="text-base font-bold" style={{ color: GOLD }}>{mostBankedTeam ? `${mostBankedTeam.name} (${mostBankedTeam.count}x)` : '—'}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold mb-1">Most Banked Player</p>
                  <p className="text-base font-bold" style={{ color: GOLD }}>{mostBankedPlayer ? `${mostBankedPlayer.name} (${mostBankedPlayer.count}x)` : '—'}</p>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4" style={{ height: 240 }}>
                <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">Average score across all players, per gameweek</p>
                <ResponsiveContainer width="100%" height="90%">
                  <LineChart data={avgByGw.map(a => ({ name: `GW${a.gw}`, avg: a.avg }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="name" {...axisProps()} />
                    <YAxis {...axisProps()} />
                    <Tooltip {...tooltipStyle()} />
                    <Line type="monotone" dataKey="avg" stroke={GOLD} strokeWidth={2} dot={{ r: 3, fill: GOLD }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4" style={{ height: 260 }}>
                <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">Most popular teams (all-time picks)</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={teamPopularity}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="name" {...axisProps()} interval={0} angle={-35} textAnchor="end" height={50} />
                    <YAxis {...axisProps()} allowDecimals={false} />
                    <Tooltip {...tooltipStyle()} />
                    <Bar dataKey="count" fill={GOLD} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-4" style={{ height: 240 }}>
                <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">Manual picks vs autopicks, per gameweek</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={pickMethod.map(m => ({ name: `GW${m.gw}`, Manual: m.manual, Autopick: m.autopick }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="name" {...axisProps()} />
                    <YAxis {...axisProps()} allowDecimals={false} />
                    <Tooltip {...tooltipStyle()} />
                    <Legend wrapperStyle={{ fontSize: 11, color: CREAM }} />
                    <Bar dataKey="Manual" stackId="a" fill={GOLD} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Autopick" stackId="a" fill="rgba(245,236,217,0.3)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </HeroPage>
    </Shell>
  )
}
