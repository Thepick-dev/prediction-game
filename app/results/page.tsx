'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import TeamCrest from '../../components/TeamCrest'
import KitBadge from '../../components/KitBadge'
import { buildPlayerDisplayNames } from '../lib/players'
import GameweekRecapCard from '../../components/GameweekRecapCard'

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
  provisional?: boolean
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
  fixture_id: number
  minute: number | null
}

type FixtureRow = {
  id: number
  home_team_id: number
  away_team_id: number
  kickoff_time: string
  status: string
  home_score: number | null
  away_score: number | null
}

type Team = { id: number; name: string; short_name: string | null; short_code: string | null; crest_url: string | null }

function teamDisplayName(team: Team | undefined) {
  if (!team) return 'Unknown'
  return team.short_name ?? team.name.replace(' FC', '').replace(' AFC', '')
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
  const [kitByUser, setKitByUser] = useState<Record<string, { pattern: string; colour1: string; colour2: string; stars: number; earths: number }>>({})
  const [teams, setTeams] = useState<Record<number, Team>>({})
  const [players, setPlayers] = useState<Record<number, string>>({})
  const [potwUserId, setPotwUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingPicks, setLoadingPicks] = useState(false)
  const [showRecap, setShowRecap] = useState(false)
  const [fixtures, setFixtures] = useState<FixtureRow[]>([])
  const [expandedFixture, setExpandedFixture] = useState<number | null>(null)

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

    const [{ data: gws }, { data: profilesData }, { data: teamsData }, { data: playersData }] = await Promise.all([
      supabase.from('gameweeks').select('id, number, deadline, status').eq('competition_id', comp.id).lt('deadline', now.toISOString()).order('number', { ascending: true }),
      supabase.from('profiles').select('id, display_name, kit_pattern, kit_colour_1, kit_colour_2'),
      supabase.from('teams').select('id, name, short_name, short_code, crest_url'),
      supabase.from('players').select('id, name, web_name, team_id')
    ])

    // Kept as its own request, deliberately separate from the profiles query
    // above: if these columns ever have a problem, it should only affect kit
    // badges, never take down display names with it.
    const { data: kitExtras } = await supabase.from('profiles').select('id, kit_stars, kit_earths')
    const kitExtrasMap: Record<string, { stars: number; earths: number }> = {}
    kitExtras?.forEach(k => { kitExtrasMap[k.id] = { stars: k.kit_stars ?? 0, earths: k.kit_earths ?? 0 } })

    const profileMap: Record<string, string> = {}
    const kitMap: Record<string, { pattern: string; colour1: string; colour2: string; stars: number; earths: number }> = {}
    profilesData?.forEach(p => {
      profileMap[p.id] = p.display_name ?? 'Unknown'
      kitMap[p.id] = {
        pattern: p.kit_pattern ?? 'solid',
        colour1: p.kit_colour_1 ?? '#1E4D6B',
        colour2: p.kit_colour_2 ?? '#F5ECD9',
        stars: kitExtrasMap[p.id]?.stars ?? 0,
        earths: kitExtrasMap[p.id]?.earths ?? 0
      }
    })

    const teamMap: Record<number, Team> = {}
    teamsData?.forEach(t => { teamMap[t.id] = t })

    const playerMap = buildPlayerDisplayNames(playersData ?? [], teamMap)

    setProfiles(profileMap)
    setKitByUser(kitMap)
    setTeams(teamMap)
    setPlayers(playerMap)
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
    const gw = gameweeks.find(g => g.id === gwId)

    const [{ data: picksData }, { data: pts }, { data: fixturesData }, previewRes] = await Promise.all([
      supabase.from('picks').select('id, user_id, team_id, player1_id, player2_id, is_banker, is_autopick, submitted_at').eq('gameweek_id', gwId),
      supabase.from('points').select('pick_id, total_points, team_points, player1_points, player2_points, breakdown').eq('gameweek_id', gwId),
      supabase.from('fixtures').select('id, home_team_id, away_team_id, kickoff_time, status, home_score, away_score').eq('gameweek_id', gwId).order('kickoff_time'),
      fetch(`/api/autopick/preview?gameweek_id=${gwId}`)
    ])

    const fixtureList = fixturesData ?? []
    setFixtures(fixtureList)
    setExpandedFixture(null)

    // Scoped to this gameweek's own fixtures — without this, "who scored"
    // badges and the match-events panel would mix in goals from every
    // other gameweek and competition ever played.
    const fixtureIds = fixtureList.map(f => f.id)
    const { data: events } = fixtureIds.length > 0
      ? await supabase.from('match_events').select('player_id, event_type, fixture_id, minute').in('fixture_id', fixtureIds)
      : { data: [] as MatchEvent[] }

    const realPicks = picksData ?? []
    const realPickUserIds = new Set(realPicks.map(p => p.user_id))

    let previewPicks: PickRow[] = []
    try {
      const previewData = await previewRes.json()
      const previews = previewData.previews ?? {}
      previewPicks = Object.entries(previews)
        .filter(([userId]) => !realPickUserIds.has(userId))
        .map(([userId, p]: [string, any]) => ({
          id: `preview-${userId}`,
          user_id: userId,
          team_id: p.team_id,
          player1_id: p.player1_id,
          player2_id: p.player2_id,
          is_banker: false,
          is_autopick: true,
          submitted_at: '',
          provisional: true,
        }))
    } catch {
      previewPicks = []
    }

    setPicks([...realPicks, ...previewPicks])
    setMatchEvents(events ?? [])

    // Once the deadline's passed but before a gameweek is marked "completed",
    // there's no frozen points row yet — show a live calculation instead,
    // using whatever quartiles/results currently stand. Recalculated fresh
    // every time this loads, so it moves if picks or quartiles do too.
    if (gw?.status === 'locked') {
      try {
        const previewScoringRes = await fetch(`/api/scoring/preview?gameweek_id=${gwId}`)
        const previewScoringData = await previewScoringRes.json()
        setPointsData(previewScoringData.rows ?? [])
      } catch {
        setPointsData([])
      }
    } else {
      setPointsData(pts ?? [])
    }

    setLoadingPicks(false)
  }

  const selectedGameweek = gameweeks.find(g => g.id === selectedGw)
  const isScored = selectedGameweek?.status === 'completed'
  const isLocked = selectedGameweek?.status === 'locked'
  const showScoring = isScored || isLocked

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

  const recapWinner = isScored && sortedPicks[0]
    ? { name: profiles[sortedPicks[0].user_id] ?? 'Unknown', points: pointsMap[sortedPicks[0].id]?.total_points ?? 0 }
    : null
  const recapRunnerUp = isScored && sortedPicks[1]
    ? { name: profiles[sortedPicks[1].user_id] ?? 'Unknown', points: pointsMap[sortedPicks[1].id]?.total_points ?? 0 }
    : null
  const recapTotalPoints = isScored
    ? sortedPicks.reduce((sum, p) => sum + (pointsMap[p.id]?.total_points ?? 0), 0)
    : 0
  const recapBestResult = isScored
    ? sortedPicks
        .map(p => ({ pick: p, detail: pointsMap[p.id]?.breakdown?.team_detail, teamPts: pointsMap[p.id]?.team_points ?? 0 }))
        .filter(r => r.detail?.opponent_team_id != null && r.detail?.team_score != null)
        .sort((a, b) => b.teamPts - a.teamPts)[0]
    : null
  const recapBestResultData = recapBestResult ? {
    team: teamDisplayName(teams[recapBestResult.pick.team_id]),
    opponent: teamDisplayName(teams[recapBestResult.detail.opponent_team_id]),
    teamScore: recapBestResult.detail.team_score,
    opponentScore: recapBestResult.detail.opponent_score,
    isHome: !!recapBestResult.detail.is_home,
    teamPoints: Math.round(recapBestResult.teamPts),
  } : null

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
      <HeroPage wide>
        <div className="w-full text-[#F5ECD9]">

          <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>RESULTS</h1>
          <p className="text-[#D9A441]/70 mb-6 text-sm">{competition.name}</p>

          {potwUserId && (
            <div className="bg-[#D9A441]/15 border border-[#D9A441]/40 rounded-lg px-4 py-3 mb-5 flex items-center gap-3">
              <span className="text-xl">👑</span>
              <div>
                <p className="text-xs text-[#D9A441] font-bold uppercase tracking-wide">Season Leader</p>
                <p className="font-bold uppercase">{profiles[potwUserId] ?? 'Unknown'}</p>
              </div>
            </div>
          )}

          {gameweeks.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-lg p-6">
              <p className="text-[#F5ECD9]/50 text-sm uppercase tracking-wider">No gameweeks have passed their deadline yet.</p>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <select
                  value={selectedGw ?? ''}
                  onChange={e => setSelectedGw(e.target.value)}
                  className="border border-white/20 rounded px-3 py-2 text-sm font-bold w-full md:w-auto uppercase"
                  style={{ backgroundColor: '#241a12', color: '#F5ECD9' }}
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
                  <h2 className="text-lg font-bold uppercase" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Gameweek {selectedGameweek.number}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wider border ${
                    isScored ? 'bg-green-500/20 text-green-300 border-green-400/40' : 'bg-yellow-500/20 text-yellow-300 border-yellow-400/40'
                  }`}>
                    {isScored ? 'Scored' : 'Awaiting scoring'}
                  </span>
                  {isLocked && (
                    <span
                      className="text-xs border border-white/30 text-[#F5ECD9]/70 px-2 py-0.5 rounded font-bold uppercase tracking-wider"
                      title="Deadline's passed so this is calculated from current results and quartiles, but it's not official until the gameweek is marked completed — it can still change"
                    >
                      Live preview — not final
                    </span>
                  )}
                  {isScored && gwPotwUserId && (
                    <span className="text-xs text-[#D9A441] font-bold uppercase tracking-wider">
                      GW Winner: {profiles[gwPotwUserId]}
                    </span>
                  )}
                  {isScored && (
                    <button
                      onClick={() => setShowRecap(true)}
                      className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded border border-[#D9A441]/50 text-[#D9A441] hover:bg-[#D9A441]/10 transition-colors ml-auto"
                    >
                      Share Recap
                    </button>
                  )}
                </div>
              )}

              {fixtures.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden mb-4">
                  <div className="px-3 py-2 border-b border-white/10 text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold">
                    Fixtures &amp; Match Events
                  </div>
                  <div className="divide-y divide-white/5">
                    {fixtures.map(f => {
                      const isExpanded = expandedFixture === f.id
                      const fixtureEvents = matchEvents.filter(e => e.fixture_id === f.id)
                      const goals = fixtureEvents.filter(e => e.event_type === 'goal')
                      const assists = fixtureEvents.filter(e => e.event_type === 'assist')
                      const ownGoals = fixtureEvents.filter(e => e.event_type === 'own_goal')
                      const played = f.home_score != null && f.away_score != null

                      return (
                        <div key={f.id}>
                          <button
                            onClick={() => setExpandedFixture(isExpanded ? null : f.id)}
                            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
                          >
                            <div className="flex items-center gap-2 text-xs uppercase">
                              <TeamCrest crestUrl={teams[f.home_team_id]?.crest_url ?? null} teamName={teams[f.home_team_id]?.name ?? ''} size={16} />
                              <span className="font-bold">{teamDisplayName(teams[f.home_team_id])}</span>
                              <span className="text-[#F5ECD9]/40 font-bold">
                                {played ? `${f.home_score} - ${f.away_score}` : 'vs'}
                              </span>
                              <span className="font-bold">{teamDisplayName(teams[f.away_team_id])}</span>
                              <TeamCrest crestUrl={teams[f.away_team_id]?.crest_url ?? null} teamName={teams[f.away_team_id]?.name ?? ''} size={16} />
                              {!played && <span className="text-[#F5ECD9]/30 normal-case" style={{ fontSize: '9px' }}>Not played yet</span>}
                            </div>
                            <span className="text-[#F5ECD9]/30 text-xs">{isExpanded ? '▲' : '▼'}</span>
                          </button>
                          {isExpanded && (
                            <div className="px-3 pb-3 text-xs space-y-1">
                              {fixtureEvents.length === 0 ? (
                                <p className="text-[#F5ECD9]/40">No goals or assists recorded yet.</p>
                              ) : (
                                <>
                                  {goals.map((e, i) => (
                                    <div key={`g${i}`} className="flex items-center gap-1.5">
                                      <span className="bg-green-600 text-white px-1 rounded font-bold" style={{ fontSize: '9px' }}>G</span>
                                      <span className="uppercase">{players[e.player_id] ?? 'Unknown'}</span>
                                      {e.minute != null && <span className="text-[#F5ECD9]/40">{e.minute}&apos;</span>}
                                    </div>
                                  ))}
                                  {assists.map((e, i) => (
                                    <div key={`a${i}`} className="flex items-center gap-1.5">
                                      <span className="bg-green-500/30 text-green-300 px-1 rounded font-bold" style={{ fontSize: '9px' }}>A</span>
                                      <span className="uppercase">{players[e.player_id] ?? 'Unknown'}</span>
                                      {e.minute != null && <span className="text-[#F5ECD9]/40">{e.minute}&apos;</span>}
                                    </div>
                                  ))}
                                  {ownGoals.map((e, i) => (
                                    <div key={`og${i}`} className="flex items-center gap-1.5">
                                      <span className="bg-red-600/60 text-white px-1 rounded font-bold" style={{ fontSize: '9px' }}>OG</span>
                                      <span className="uppercase">{players[e.player_id] ?? 'Unknown'}</span>
                                      {e.minute != null && <span className="text-[#F5ECD9]/40">{e.minute}&apos;</span>}
                                    </div>
                                  ))}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {loadingPicks ? (
                <p className="text-[#F5ECD9]/50 text-sm uppercase tracking-wider">Loading picks...</p>
              ) : sortedPicks.length === 0 ? (
                <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                  <p className="text-[#F5ECD9]/50 text-sm uppercase tracking-wider">No picks for this gameweek.</p>
                </div>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden mb-3">
                  <table className="w-full" style={{ fontSize: '10px' }}>
                    <thead>
                      <tr className="text-left border-b border-white/10 uppercase tracking-wider text-[#F5ECD9]/50" style={{ fontSize: '9px' }}>
                        <th className="py-2 px-1 sm:px-2">Player</th>
                        <th className="py-2 px-1 sm:px-2">Team</th>
                        <th className="py-2 px-1 sm:px-2">P1</th>
                        <th className="py-2 px-1 sm:px-2">P2</th>
                        {showScoring && (
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
                        const t = teams[pick.team_id]

                        return (
                          <tr key={pick.id} className={`border-b border-white/5 last:border-0 ${isWinner ? 'bg-[#D9A441]/10' : ''}`}>
                            <td className="py-1.5 px-1 sm:px-2 font-bold uppercase">
                              <div className="flex items-center gap-1.5">
                                <KitBadge
                                  pattern={kitByUser[pick.user_id]?.pattern ?? 'solid'}
                                  colour1={kitByUser[pick.user_id]?.colour1 ?? '#1E4D6B'}
                                  colour2={kitByUser[pick.user_id]?.colour2 ?? '#F5ECD9'}
                                  size={14}
                                />
                                {profiles[pick.user_id] ?? 'Unknown'}
                                {(pick.provisional || pick.is_autopick) && <span className="bg-white/20 px-0.5 rounded" style={{ fontSize: '8px' }} title="No pick was made in time, so the computer picked automatically">AUTOPICK</span>}
                              </div>
                            </td>
                            <td className="py-1.5 px-1 sm:px-2 uppercase">
                              <div className="flex items-center gap-1">
                                <TeamCrest crestUrl={t?.crest_url ?? null} teamName={t?.name ?? ''} size={16} />
                                {teamDisplayName(t)}
                                {pick.is_banker && <span className="bg-[#D9A441] text-[#241a12] font-bold px-0.5 rounded" style={{ fontSize: '8px' }}>★B</span>}
                              </div>
                              {showScoring && pts?.breakdown?.team_detail?.opponent_team_id != null && (
                                <div className="normal-case text-[#F5ECD9]/40" style={{ fontSize: '8px' }}>
                                  <span
                                    className={`inline-block px-1 rounded font-bold mr-1 ${pts.breakdown.team_detail.is_home ? 'bg-blue-500/20 text-blue-300' : 'bg-orange-500/20 text-orange-300'}`}
                                    title={pts.breakdown.team_detail.is_home ? 'Played at home' : 'Played away'}
                                  >
                                    {pts.breakdown.team_detail.is_home ? 'H' : 'A'}
                                  </span>
                                  vs {teams[pts.breakdown.team_detail.opponent_team_id]?.short_code
                                    ?? teams[pts.breakdown.team_detail.opponent_team_id]?.short_name
                                    ?? '?'}
                                  {' '}(Q{pts.breakdown.team_detail.team_quartile}→Q{pts.breakdown.team_detail.opponent_quartile})
                                  {pts.breakdown.team_detail.team_score != null
                                    ? <>{' '}· {pts.breakdown.team_detail.team_score}-{pts.breakdown.team_detail.opponent_score}</>
                                    : <>{' '}· not played yet</>}
                                </div>
                              )}
                            </td>
                            <td className="py-1.5 px-1 sm:px-2 uppercase">
                              {players[pick.player1_id] ?? 'Unknown'}
                              {goalPlayers.has(pick.player1_id) && <span className="ml-0.5 bg-green-600 text-white px-0.5 rounded font-bold" style={{ fontSize: '8px' }}>G</span>}
                              {assistPlayers.has(pick.player1_id) && <span className="ml-0.5 bg-green-500/30 text-green-300 px-0.5 rounded font-bold" style={{ fontSize: '8px' }}>A</span>}
                            </td>
                            <td className="py-1.5 px-1 sm:px-2 uppercase">
                              {players[pick.player2_id] ?? 'Unknown'}
                              {goalPlayers.has(pick.player2_id) && <span className="ml-0.5 bg-green-600 text-white px-0.5 rounded font-bold" style={{ fontSize: '8px' }}>G</span>}
                              {assistPlayers.has(pick.player2_id) && <span className="ml-0.5 bg-green-500/30 text-green-300 px-0.5 rounded font-bold" style={{ fontSize: '8px' }}>A</span>}
                            </td>
                            {showScoring && (
                              <>
                                <td className="py-1.5 px-1 text-right text-[#F5ECD9]/50">{pts?.team_points ?? '—'}</td>
                                <td className="py-1.5 px-1 text-right text-[#F5ECD9]/50">{pts?.player1_points ?? '—'}</td>
                                <td className="py-1.5 px-1 text-right text-[#F5ECD9]/50">{pts?.player2_points ?? '—'}</td>
                                <td className="py-1.5 px-1 text-right font-bold" style={{ color: '#D9A441' }}>{pts?.total_points ?? '—'}</td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  <div className="px-3 py-2 border-t border-white/10 uppercase tracking-wider text-[#F5ECD9]/40" style={{ fontSize: '9px' }}>
                    <span className="font-bold mr-2">Key:</span>
                    <span className="bg-green-600 text-white px-0.5 rounded font-bold">G</span> Goal
                    <span className="mx-2">·</span>
                    <span className="bg-green-500/30 text-green-300 px-0.5 rounded font-bold">A</span> Assist
                    <span className="mx-2">·</span>
                    <span className="bg-[#D9A441] text-[#241a12] px-0.5 rounded font-bold">★B</span> Banker
                    <span className="mx-2">·</span>
                    <span className="bg-blue-500/20 text-blue-300 px-0.5 rounded font-bold">H</span>/<span className="bg-orange-500/20 text-orange-300 px-0.5 rounded font-bold">A</span> Home/Away
                    <span className="mx-2">·</span>
                    <span className="bg-white/20 px-0.5 rounded">AUTOPICK</span> Computer picked it (deadline passed, no pick made)
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </HeroPage>

      {showRecap && selectedGameweek && (
        <GameweekRecapCard
          competitionName={competition.name}
          gameweekNumber={selectedGameweek.number}
          winner={recapWinner}
          runnerUp={recapRunnerUp}
          totalPoints={recapTotalPoints}
          bestResult={recapBestResultData}
          onClose={() => setShowRecap(false)}
        />
      )}
    </Shell>
  )
}