'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'
import { createClient } from '../../lib/supabase'
import Shell from '../../components/ceefax-shell'
import TeamCrest from '../../../components/TeamCrest'
import PopArtLoading from '../../../components/PopArtLoading'

type Tab = 'players' | 'teams'

type Team = { id: number; name: string; short_name: string | null; active: boolean }
type Player = {
  id: number
  name: string
  web_name: string | null
  team_id: number
  position: string | null
  value: number | null
  minutes_played: number | null
  // Newer, optional columns — fetched in a separate, isolated query (see
  // loadData below), so may simply be absent until the SQL's been run.
  bonus_points?: number | null
  bps?: number | null
  ict_index?: number | null
  selected_by_percent?: number | null
  transfers_in_event?: number | null
  transfers_out_event?: number | null
  form: number | null
}
type HistoryRow = { player_id: number; round: number; total_points: number | null; opponent_team_id: number | null; was_home: boolean | null }
type FixtureRow = {
  id: number; home_team_id: number; away_team_id: number; home_score: number | null; away_score: number | null
  status: string; kickoff_time: string | null; gameweek_id: string
  // Also newer/optional — see the isolated difficulty fetch below.
  home_difficulty?: number | null
  away_difficulty?: number | null
}
type Gameweek = { id: string; number: number; deadline: string; status: string }

const POP_ACCENT = '#00F2FA'

function teamName(teams: Team[], id: number): string {
  const t = teams.find(x => x.id === id)
  return t ? (t.short_name ?? t.name) : '?'
}

function difficultyColour(d: number | null | undefined): string {
  if (d == null) return 'rgba(255,255,255,0.15)'
  if (d <= 2) return 'var(--pop-green)'
  if (d === 3) return 'var(--pop-yellow)'
  return 'var(--pop-red)'
}

function resultBadge(fixture: FixtureRow, teamId: number): { label: string; colour: string } {
  const isHome = fixture.home_team_id === teamId
  const own = isHome ? fixture.home_score : fixture.away_score
  const opp = isHome ? fixture.away_score : fixture.home_score
  if (own == null || opp == null) return { label: '-', colour: 'rgba(255,255,255,0.3)' }
  if (own > opp) return { label: 'W', colour: 'var(--pop-green)' }
  if (own < opp) return { label: 'L', colour: 'var(--pop-red)' }
  return { label: 'D', colour: 'var(--pop-yellow)' }
}

export default function FormGuidePage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [tab, setTab] = useState<Tab>('players')
  const [loading, setLoading] = useState(true)
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [historyByPlayer, setHistoryByPlayer] = useState<Record<number, HistoryRow[]>>({})
  const [recentFixtures, setRecentFixtures] = useState<FixtureRow[]>([])
  const [nextFixtureByTeam, setNextFixtureByTeam] = useState<Record<number, FixtureRow>>({})
  const [nextGwNumber, setNextGwNumber] = useState<number | null>(null)
  const [quartileByTeam, setQuartileByTeam] = useState<Record<number, number>>({})
  const [search, setSearch] = useState('')
  const [expandedPlayerId, setExpandedPlayerId] = useState<number | null>(null)
  const [showCount, setShowCount] = useState(40)

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { window.location.href = '/login'; return }
    setUser(authUser)
    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', authUser.id).single()
    setDisplayName(profile?.display_name ?? '')

    const { data: comp } = await supabase.from('competitions').select('id').eq('status', 'active').maybeSingle()

    const [{ data: teamsData }, { data: playersData }, { data: gameweeksData }] = await Promise.all([
      supabase.from('teams').select('id, name, short_name, active').eq('active', true).order('name'),
      supabase.from('players').select('id, name, web_name, team_id, position, value, minutes_played, form').eq('active', true),
      comp ? supabase.from('gameweeks').select('id, number, deadline, status').eq('competition_id', comp.id) : Promise.resolve({ data: [] as Gameweek[] }),
    ])
    setTeams(teamsData ?? [])

    // Its own isolated, defensive fetch — bonus_points/bps/ict_index/
    // selected_by_percent/transfers_in_event/transfers_out_event are
    // newer, optional columns (see the SQL handed over alongside this
    // feature). A missing-column failure here must never take down the
    // base player list above, so it's a separate query, merged in memory,
    // never bundled into the same select.
    const basePlayers = playersData ?? []
    const { data: extraPlayerData } = await supabase
      .from('players')
      .select('id, bonus_points, bps, ict_index, selected_by_percent, transfers_in_event, transfers_out_event')
      .eq('active', true)
    const extraById = new Map((extraPlayerData ?? []).map(p => [p.id, p]))
    setPlayers(basePlayers.map(p => ({ ...p, ...(extraById.get(p.id) ?? {}) })))

    const gameweeks: Gameweek[] = gameweeksData ?? []
    const now = new Date()
    const upcoming = gameweeks
      .filter(g => new Date(g.deadline) > now)
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())[0]
    const recentGwIds = gameweeks
      .filter(g => new Date(g.deadline) <= now)
      .sort((a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime())
      .slice(0, 6)
      .map(g => g.id)

    if (comp) {
      const [{ data: nextFixtures }, { data: pastFixtures }, { data: assignments }] = await Promise.all([
        upcoming
          ? supabase.from('fixtures').select('id, home_team_id, away_team_id, home_score, away_score, status, kickoff_time, gameweek_id').eq('gameweek_id', upcoming.id)
          : Promise.resolve({ data: [] as FixtureRow[] }),
        recentGwIds.length > 0
          ? supabase.from('fixtures').select('id, home_team_id, away_team_id, home_score, away_score, status, kickoff_time, gameweek_id').in('gameweek_id', recentGwIds).order('kickoff_time', { ascending: false })
          : Promise.resolve({ data: [] as FixtureRow[] }),
        supabase.from('tier_assignments').select('team_id, tier').eq('competition_id', comp.id),
      ])

      // Its own isolated, defensive fetch — home_difficulty/away_difficulty
      // are newer, optional columns (see syncFixtureDifficulty.ts). Merged
      // in memory rather than bundled into the selects above, so a missing
      // column never breaks next-fixture/recent-results, only the
      // difficulty colour badge.
      const fixtureIds = [...(nextFixtures ?? []), ...(pastFixtures ?? [])].map(f => f.id)
      const difficultyById = new Map<number, { home_difficulty: number | null; away_difficulty: number | null }>()
      if (fixtureIds.length > 0) {
        const { data: difficultyRows } = await supabase.from('fixtures').select('id, home_difficulty, away_difficulty').in('id', fixtureIds)
        ;(difficultyRows ?? []).forEach(d => difficultyById.set(d.id, d))
      }
      const withDifficulty = (f: FixtureRow): FixtureRow => ({ ...f, ...(difficultyById.get(f.id) ?? { home_difficulty: null, away_difficulty: null }) })

      setNextGwNumber(upcoming?.number ?? null)
      const nextMap: Record<number, FixtureRow> = {}
      ;(nextFixtures ?? []).forEach(f => { const fd = withDifficulty(f); nextMap[f.home_team_id] = fd; nextMap[f.away_team_id] = fd })
      setNextFixtureByTeam(nextMap)
      setRecentFixtures((pastFixtures ?? []).filter(f => f.status === 'finished').map(withDifficulty))
      const qMap: Record<number, number> = {}
      ;(assignments ?? []).forEach(a => { qMap[a.team_id] = a.tier })
      setQuartileByTeam(qMap)
    }

    // Its own isolated fetch — a brand new, optional table (see the SQL
    // handed over alongside this feature); a problem here should never
    // break the rest of the page, it just means no sparkline yet.
    const { data: historyData } = await supabase
      .from('player_gameweek_history')
      .select('player_id, round, total_points, opponent_team_id, was_home')
      .order('round', { ascending: true })
    const grouped: Record<number, HistoryRow[]> = {}
    ;(historyData ?? []).forEach((h: HistoryRow) => {
      ;(grouped[h.player_id] ??= []).push(h)
    })
    setHistoryByPlayer(grouped)

    setLoading(false)
  }

  const teamFormRows = useMemo(() => {
    return teams.map(t => {
      const results = recentFixtures.filter(f => f.home_team_id === t.id || f.away_team_id === t.id).slice(0, 5)
      return { team: t, results, next: nextFixtureByTeam[t.id] }
    })
  }, [teams, recentFixtures, nextFixtureByTeam])

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = players
    if (q) {
      list = players.filter(p => p.name.toLowerCase().includes(q) || (p.web_name ?? '').toLowerCase().includes(q) || teamName(teams, p.team_id).toLowerCase().includes(q))
    } else {
      list = [...players].sort((a, b) => (b.selected_by_percent ?? 0) - (a.selected_by_percent ?? 0))
    }
    return list
  }, [players, search, teams])

  if (loading) {
    return (
      <Shell active="STATS HUB" user={user} displayName={displayName} theme="pop-art">
        <PopArtLoading />
      </Shell>
    )
  }

  return (
    <Shell active="STATS HUB" user={user} displayName={displayName} theme="pop-art">
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <h1 className="pop-hero pop-hero--blue text-3xl md:text-4xl mb-1">Form Guide</h1>
        <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Real-world recent form, straight from the Fantasy Premier League feed — not competition points.
        </p>

        <div className="flex gap-2 mb-5">
          {(['players', 'teams'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pop-button ${tab === t ? 'pop-button--green' : 'pop-button--yellow'} px-4 py-2 text-sm capitalize`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'players' && (
          <div>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search player or team..."
              className="pop-input px-3 py-2 text-sm w-full mb-4"
            />
            <div className="space-y-2">
              {filteredPlayers.slice(0, search ? filteredPlayers.length : showCount).map(p => {
                const history = (historyByPlayer[p.id] ?? []).slice(-5)
                const next = nextFixtureByTeam[p.team_id]
                const isExpanded = expandedPlayerId === p.id
                const momentum = (p.transfers_in_event ?? 0) - (p.transfers_out_event ?? 0)
                return (
                  <div key={p.id} className="pop-panel p-3">
                    <button
                      onClick={() => setExpandedPlayerId(isExpanded ? null : p.id)}
                      className="w-full flex items-center justify-between gap-2 text-left"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <TeamCrest teamId={p.team_id} teamName={teamName(teams, p.team_id)} size={20} />
                        <div className="min-w-0">
                          <p className="pop-name text-sm truncate" style={{ color: 'var(--pop-white)' }}>
                            {p.web_name || p.name}
                            {p.position && <span className="ml-1.5 text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>{p.position}</span>}
                          </p>
                          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                            {teamName(teams, p.team_id)} {p.value != null && `· £${p.value.toFixed(1)}m`} {p.selected_by_percent != null && `· ${p.selected_by_percent.toFixed(1)}% owned`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {momentum !== 0 && (
                          <span className="text-[10px] font-mono" style={{ color: momentum > 0 ? 'var(--pop-green)' : 'var(--pop-red)' }}>
                            {momentum > 0 ? '↑' : '↓'} transfers
                          </span>
                        )}
                        {next && (
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{ background: difficultyColour(next.home_team_id === p.team_id ? next.home_difficulty : next.away_difficulty), color: 'var(--pop-black)' }}
                          >
                            vs {teamName(teams, next.home_team_id === p.team_id ? next.away_team_id : next.home_team_id)}
                          </span>
                        )}
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        {history.length > 0 ? (
                          <div style={{ height: 90 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={history.map(h => ({ round: `R${h.round}`, points: h.total_points ?? 0 }))}>
                                <XAxis dataKey="round" tick={{ fill: '#ffffff', fontSize: 10, opacity: 0.6 }} stroke="rgba(255,255,255,0.2)" />
                                <YAxis tick={{ fill: '#ffffff', fontSize: 10, opacity: 0.6 }} stroke="rgba(255,255,255,0.2)" width={24} />
                                <Tooltip contentStyle={{ background: '#242424', border: '1px solid rgba(0,242,250,0.5)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: POP_ACCENT }} itemStyle={{ color: '#fff' }} />
                                <Line type="monotone" dataKey="points" stroke={POP_ACCENT} strokeWidth={2} dot={{ r: 3, fill: POP_ACCENT }} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>No recent-form history synced yet.</p>
                        )}
                        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                          <div>
                            <p className="text-[10px] uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>Bonus</p>
                            <p className="pop-name text-sm">{p.bonus_points ?? '-'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>BPS</p>
                            <p className="pop-name text-sm">{p.bps ?? '-'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>ICT Index</p>
                            <p className="pop-name text-sm">{p.ict_index != null ? p.ict_index.toFixed(1) : '-'}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {!search && filteredPlayers.length > showCount && (
              <button onClick={() => setShowCount(c => c + 40)} className="pop-button pop-button--blue w-full mt-3 py-2 text-sm">
                Show more
              </button>
            )}
          </div>
        )}

        {tab === 'teams' && (
          <div className="space-y-2">
            {teamFormRows.map(({ team, results, next }) => (
              <div key={team.id} className="pop-panel p-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  <TeamCrest teamId={team.id} teamName={team.name} size={22} />
                  <div>
                    <p className="pop-name text-sm" style={{ color: 'var(--pop-white)' }}>{teamName(teams, team.id)}</p>
                    {quartileByTeam[team.id] && (
                      <p className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>Q{quartileByTeam[team.id]}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {results.length === 0 && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>No results yet</span>}
                  {results.map(f => {
                    const b = resultBadge(f, team.id)
                    return (
                      <span key={f.id} className="w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-black" style={{ background: b.colour, color: 'var(--pop-black)' }}>
                        {b.label}
                      </span>
                    )
                  })}
                </div>
                {next && (
                  <span
                    className="text-[10px] font-mono px-2 py-1 rounded shrink-0"
                    style={{ background: difficultyColour(next.home_team_id === team.id ? next.home_difficulty : next.away_difficulty), color: 'var(--pop-black)' }}
                  >
                    {nextGwNumber ? `GW${nextGwNumber}: ` : ''}vs {teamName(teams, next.home_team_id === team.id ? next.away_team_id : next.home_team_id)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}
