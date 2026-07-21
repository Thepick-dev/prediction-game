'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import TeamCrest from '../../components/TeamCrest'

type Team = { id: number; name: string; short_name: string | null; crest_url: string | null }
type Player = { id: number; name: string; team_id: number }
type Gameweek = { id: string; number: number; deadline: string; status: string }
type Fixture = { id: number; home_team_id: number; away_team_id: number; kickoff_time: string; home_score: number | null; away_score: number | null; status: string }
type HistoryPick = {
  id: string
  gameweek_id: string
  team_id: number
  player1_id: number
  player2_id: number
  is_banker: boolean
  is_autopick: boolean
  gameweeks: { number: number }
}
type Question = {
  id: string
  question: string
  option_a: string
  option_b: string
  option_c: string | null
  option_d: string | null
}

function teamDisplayName(team: Team | undefined) {
  if (!team) return 'Unknown'
  return team.short_name ?? team.name.replace(' FC', '').replace(' AFC', '')
}

function useCountdown(deadline: string | null) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    if (!deadline) return
    const interval = setInterval(() => {
      const now = new Date().getTime()
      const end = new Date(deadline).getTime()
      const diff = end - now
      if (diff <= 0) { setTimeLeft('Deadline passed'); clearInterval(interval); return }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      if (days > 0) setTimeLeft(`${days}d ${hours}h ${mins}m`)
      else setTimeLeft(`${hours}h ${mins}m`)
    }, 1000)
    return () => clearInterval(interval)
  }, [deadline])

  return timeLeft
}

export default function PicksPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [competition, setCompetition] = useState<any>(null)
  const [gameweek, setGameweek] = useState<Gameweek | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [quartileMap, setQuartileMap] = useState<Record<number, number>>({})
  const [historyPicks, setHistoryPicks] = useState<HistoryPick[]>([])
  const [pointsByPick, setPointsByPick] = useState<Record<string, number>>({})
  const [question, setQuestion] = useState<Question | null>(null)
  const [questionAnswer, setQuestionAnswer] = useState<string>('')
  const [hasPick, setHasPick] = useState(false)
  const [showSlip, setShowSlip] = useState(false)

  const [selectedTeam, setSelectedTeam] = useState<number | null>(null)
  const [selectedFixture, setSelectedFixture] = useState<number | null>(null)
  const [player1, setPlayer1] = useState<number | null>(null)
  const [player2, setPlayer2] = useState<number | null>(null)
  const [isBanker, setIsBanker] = useState(false)

  const [usedTeams, setUsedTeams] = useState<number[]>([])
  const [playerCounts, setPlayerCounts] = useState<Record<number, number>>({})
  const [doubleUseTeams, setDoubleUseTeams] = useState<number[]>([])
  const [bankersUsed, setBankersUsed] = useState(0)

  const [playerSearch1, setPlayerSearch1] = useState('')
  const [playerSearch2, setPlayerSearch2] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [deadlinePassed, setDeadlinePassed] = useState(false)

  const supabase = createClient()
  const countdown = useCountdown(gameweek?.deadline ?? null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    setUser(user)

    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    setDisplayName(profile?.display_name ?? '')

    const { data: comp } = await supabase
      .from('competitions')
      .select('id, name')
      .eq('status', 'active')
      .single()

    if (!comp) { setLoading(false); return }
    setCompetition(comp)

    const { data: entry } = await supabase
      .from('competition_entries')
      .select('id')
      .eq('competition_id', comp.id)
      .eq('user_id', user.id)
      .single()

    if (!entry) { window.location.href = '/join'; return }

    const now = new Date()

    const { data: gw } = await supabase
      .from('gameweeks')
      .select('id, number, deadline, status')
      .eq('competition_id', comp.id)
      .gt('deadline', now.toISOString())
      .order('deadline', { ascending: true })
      .limit(1)
      .single()

    setGameweek(gw)
    if (gw) setDeadlinePassed(new Date() > new Date(gw.deadline))

    const [{ data: teamsData }, { data: playersData }] = await Promise.all([
      supabase.from('teams').select('id, name, short_name, crest_url').eq('active', true).order('name'),
      supabase.from('players').select('id, name, team_id').order('name')
    ])
    setTeams(teamsData ?? [])
    setPlayers(playersData ?? [])

    if (gw) {
      const [pickRes, { data: fixturesData }, { data: quartilesData }, { data: questionData }] = await Promise.all([
        fetch(`/api/picks?competition_id=${comp.id}&gameweek_id=${gw.id}`),
        supabase
          .from('fixtures')
          .select('id, home_team_id, away_team_id, kickoff_time, home_score, away_score, status')
          .eq('gameweek_id', gw.id)
          .order('kickoff_time', { ascending: true }),
        supabase
          .from('tier_assignments')
          .select('team_id, tier')
          .eq('competition_id', comp.id),
        supabase
          .from('gameweek_questions')
          .select('*')
          .eq('gameweek_id', gw.id)
          .single()
      ])

      const pickData = await pickRes.json()
      if (pickData.pick) {
        setSelectedTeam(pickData.pick.team_id)
        setSelectedFixture(pickData.pick.fixture_id ?? null)
        setPlayer1(pickData.pick.player1_id)
        setPlayer2(pickData.pick.player2_id)
        setIsBanker(pickData.pick.is_banker)
        setQuestionAnswer(pickData.pick.question_answer ?? '')
        setHasPick(true)
      }
      setUsedTeams(pickData.usedTeams ?? [])
      setPlayerCounts(pickData.playerCounts ?? {})
      setDoubleUseTeams(pickData.doubleUseTeams ?? [])
      setBankersUsed(pickData.bankersUsed ?? 0)
      setFixtures(fixturesData ?? [])

      const qMap: Record<number, number> = {}
      quartilesData?.forEach(q => { qMap[q.team_id] = q.tier })
      setQuartileMap(qMap)

      if (questionData) setQuestion(questionData)
    }

    const { data: history } = await supabase
      .from('picks')
      .select('id, gameweek_id, team_id, player1_id, player2_id, is_banker, is_autopick, gameweeks(number)')
      .eq('user_id', user.id)
      .eq('competition_id', comp.id)
      .order('gameweek_id')

    setHistoryPicks((history as any) ?? [])

    const { data: pointsData } = await supabase
      .from('points')
      .select('pick_id, total_points')
      .eq('competition_id', comp.id)
      .eq('user_id', user.id)

    const pMap: Record<string, number> = {}
    pointsData?.forEach(p => { pMap[p.pick_id] = p.total_points })
    setPointsByPick(pMap)

    setLoading(false)
  }

  function selectTeamInFixture(teamId: number, fixtureId: number) {
    setSelectedTeam(teamId)
    setSelectedFixture(fixtureId)
  }

  async function savePick() {
    if (!selectedTeam || !player1 || !player2) {
      setMessage('Please select a team and two players')
      return
    }
    if (player1 === player2) {
      setMessage('Please pick two different players')
      return
    }
    setSaving(true)
    setMessage('')
    const res = await fetch('/api/picks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameweek_id: gameweek!.id,
        competition_id: competition.id,
        team_id: selectedTeam,
        fixture_id: selectedFixture,
        player1_id: player1,
        player2_id: player2,
        is_banker: isBanker,
        question_answer: questionAnswer
      })
    })
    const data = await res.json()
    if (data.error) {
      setMessage('Error: ' + data.error)
    } else {
      setHasPick(true)
      setShowSlip(true)
      loadData()
    }
    setSaving(false)
  }

  const getTeam = (id: number | null) => teams.find(t => t.id === id)
  const playerName = (id: number | null) => players.find(p => p.id === id)?.name ?? ''

  const filteredPlayers1 = playerSearch1.length >= 2
    ? players.filter(p => p.name.toLowerCase().includes(playerSearch1.toLowerCase())).slice(0, 8)
    : []
  const filteredPlayers2 = playerSearch2.length >= 2
    ? players.filter(p => p.name.toLowerCase().includes(playerSearch2.toLowerCase())).slice(0, 8)
    : []

  const hasFixtures = fixtures.length > 0

  function getTeamStatus(teamId: number) {
    const isUsed = usedTeams.includes(teamId)
    const isDouble = doubleUseTeams.includes(teamId)
    const usedCount = isUsed ? (isDouble ? 2 : 1) : 0
    const maxUses = isDouble ? 2 : 1
    const remaining = maxUses - usedCount
    return { isUsed, isDouble, remaining, maxUses }
  }

  function getQuartileLabel(teamId: number) {
    const q = quartileMap[teamId]
    return q ? `Q${q}` : null
  }

  const quartileColours: Record<string, string> = {
    Q1: 'bg-blue-500/20 text-blue-300 border-blue-400/40',
    Q2: 'bg-green-500/20 text-green-300 border-green-400/40',
    Q3: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/40',
    Q4: 'bg-red-500/20 text-red-300 border-red-400/40',
  }

  if (loading) {
    return (
      <Shell active="PICKS">
        <p className="text-gray-500">Loading...</p>
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="PICKS">
        <h1 className="text-2xl font-bold mb-2">No Active Competition</h1>
        <p className="text-gray-500">There is no active competition right now.</p>
      </Shell>
    )
  }

  return (
    <Shell active="PICKS" user={user} displayName={displayName}>
      <HeroPage wide>
        <div className="w-full text-[#F5ECD9]">

          {gameweek && !deadlinePassed && !hasPick && (
            <div className="bg-red-900/40 border border-red-500/40 rounded-lg px-4 py-3 mb-5 flex items-center gap-3">
              <span className="text-lg">⚠️</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-red-300 uppercase tracking-wider">Pick Required</p>
                <p className="text-xs text-red-200">Gameweek {gameweek.number} pick not yet submitted.</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-red-300 uppercase tracking-wider font-bold">{countdown}</p>
              </div>
            </div>
          )}

          {gameweek && !deadlinePassed && hasPick && (
            <div className="bg-green-900/40 border border-green-500/40 rounded-lg px-4 py-3 mb-5 flex items-center gap-3">
              <span className="text-lg">✅</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-green-300 uppercase tracking-wider">Pick Submitted</p>
                <p className="text-xs text-green-200">Gameweek {gameweek.number} pick is in. Deadline in {countdown}.</p>
              </div>
            </div>
          )}

          <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>PICKS</h1>
          <p className="text-[#D9A441]/70 mb-6 text-sm">{competition.name}</p>

          {gameweek ? (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Gameweek {gameweek.number}</h2>
                <span className="text-xs text-[#F5ECD9]/70">
                  Deadline: {new Date(gameweek.deadline).toLocaleString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>

              {deadlinePassed ? (
                <p className="text-[#F5ECD9]/60 uppercase tracking-wider text-sm">The deadline has passed. Picks are locked.</p>
              ) : (
                <>
                  <label className="block font-bold mb-3 uppercase tracking-wider text-xs text-[#F5ECD9]/70">Select Your Team</label>

                  {hasFixtures ? (
                    <div className="space-y-2 mb-6">
                      {fixtures.map(fixture => {
                        const homeStatus = getTeamStatus(fixture.home_team_id)
                        const awayStatus = getTeamStatus(fixture.away_team_id)
                        const homeTeam = getTeam(fixture.home_team_id)
                        const awayTeam = getTeam(fixture.away_team_id)
                        const homeQ = getQuartileLabel(fixture.home_team_id)
                        const awayQ = getQuartileLabel(fixture.away_team_id)
                        const homeSelected = selectedTeam === fixture.home_team_id && selectedFixture === fixture.id
                        const awaySelected = selectedTeam === fixture.away_team_id && selectedFixture === fixture.id

                        return (
                          <div key={fixture.id} className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => !homeStatus.isUsed && selectTeamInFixture(fixture.home_team_id, fixture.id)}
                              disabled={homeStatus.isUsed}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                                homeSelected
                                  ? 'bg-[#D9A441]/15 border-[#D9A441]'
                                  : homeStatus.isUsed
                                  ? 'bg-white/5 border-white/10 opacity-40 cursor-not-allowed'
                                  : 'bg-white/5 border-white/10 hover:border-[#D9A441]/50'
                              }`}
                            >
                              <TeamCrest crestUrl={homeTeam?.crest_url ?? null} teamName={homeTeam?.name ?? ''} size={30} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-xs font-bold uppercase truncate">{teamDisplayName(homeTeam)}</span>
                                  {homeStatus.isDouble && <span className="text-[#D9A441] text-xs">★</span>}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {homeQ && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${quartileColours[homeQ]}`}>{homeQ}</span>
                                  )}
                                  <span className="text-[10px] text-[#F5ECD9]/50">
                                    {homeStatus.isUsed ? 'Used' : `${homeStatus.remaining}/${homeStatus.maxUses} left`}
                                  </span>
                                </div>
                              </div>
                            </button>
                            <button
                              onClick={() => !awayStatus.isUsed && selectTeamInFixture(fixture.away_team_id, fixture.id)}
                              disabled={awayStatus.isUsed}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                                awaySelected
                                  ? 'bg-[#D9A441]/15 border-[#D9A441]'
                                  : awayStatus.isUsed
                                  ? 'bg-white/5 border-white/10 opacity-40 cursor-not-allowed'
                                  : 'bg-white/5 border-white/10 hover:border-[#D9A441]/50'
                              }`}
                            >
                              <TeamCrest crestUrl={awayTeam?.crest_url ?? null} teamName={awayTeam?.name ?? ''} size={30} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-xs font-bold uppercase truncate">{teamDisplayName(awayTeam)}</span>
                                  {awayStatus.isDouble && <span className="text-[#D9A441] text-xs">★</span>}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {awayQ && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${quartileColours[awayQ]}`}>{awayQ}</span>
                                  )}
                                  <span className="text-[10px] text-[#F5ECD9]/50">
                                    {awayStatus.isUsed ? 'Used' : `${awayStatus.remaining}/${awayStatus.maxUses} left`}
                                  </span>
                                </div>
                              </div>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
                      {teams.map(team => {
                        const status = getTeamStatus(team.id)
                        const q = getQuartileLabel(team.id)
                        const teamSelected = selectedTeam === team.id
                        return (
                          <button
                            key={team.id}
                            onClick={() => !status.isUsed && selectTeamInFixture(team.id, 0)}
                            disabled={status.isUsed}
                            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left ${
                              teamSelected
                                ? 'bg-[#D9A441]/15 border-[#D9A441]'
                                : status.isUsed
                                ? 'bg-white/5 border-white/10 opacity-40 cursor-not-allowed'
                                : 'bg-white/5 border-white/10 hover:border-[#D9A441]/50'
                            }`}
                          >
                            <TeamCrest crestUrl={team.crest_url} teamName={team.name} size={24} />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold uppercase truncate">{teamDisplayName(team)}</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                {q && <span className="text-[10px] text-[#F5ECD9]/50">{q}</span>}
                                {status.isDouble && <span className="text-[#D9A441] text-[10px]">★</span>}
                                <span className="text-[10px] text-[#F5ECD9]/50">
                                  {status.isUsed ? 'Used' : `${status.remaining}/${status.maxUses} left`}
                                </span>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-4 mb-5">
                    <div>
                      <label className="block font-bold mb-1.5 uppercase tracking-wider text-xs text-[#F5ECD9]/70">Player 1</label>
                      {player1 ? (
                        <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                          <span className="text-sm uppercase">{playerName(player1)}</span>
                          <button onClick={() => setPlayer1(null)} className="text-xs text-red-400">✕</button>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={playerSearch1}
                            onChange={e => setPlayerSearch1(e.target.value)}
                            placeholder="Search players..."
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[#F5ECD9] placeholder:text-[#F5ECD9]/40"
                          />
                          {filteredPlayers1.length > 0 && (
                            <div className="bg-[#241a12] border border-white/10 rounded-lg mt-1 divide-y divide-white/10 max-h-48 overflow-y-auto">
                              {filteredPlayers1.map(p => {
                                const count = playerCounts[p.id] ?? 0
                                const maxed = count >= 2
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => { if (!maxed) { setPlayer1(p.id); setPlayerSearch1('') } }}
                                    disabled={maxed}
                                    className={`block w-full text-left px-3 py-2 text-sm ${maxed ? 'text-[#F5ECD9]/30 line-through cursor-not-allowed' : 'hover:bg-white/10'}`}
                                  >
                                    <span className="uppercase">{p.name}</span>
                                    <span className="text-xs text-[#F5ECD9]/40 ml-2">({count}/2)</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div>
                      <label className="block font-bold mb-1.5 uppercase tracking-wider text-xs text-[#F5ECD9]/70">Player 2</label>
                      {player2 ? (
                        <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                          <span className="text-sm uppercase">{playerName(player2)}</span>
                          <button onClick={() => setPlayer2(null)} className="text-xs text-red-400">✕</button>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={playerSearch2}
                            onChange={e => setPlayerSearch2(e.target.value)}
                            placeholder="Search players..."
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[#F5ECD9] placeholder:text-[#F5ECD9]/40"
                          />
                          {filteredPlayers2.length > 0 && (
                            <div className="bg-[#241a12] border border-white/10 rounded-lg mt-1 divide-y divide-white/10 max-h-48 overflow-y-auto">
                              {filteredPlayers2.map(p => {
                                const count = playerCounts[p.id] ?? 0
                                const maxed = count >= 2
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => { if (!maxed) { setPlayer2(p.id); setPlayerSearch2('') } }}
                                    disabled={maxed}
                                    className={`block w-full text-left px-3 py-2 text-sm ${maxed ? 'text-[#F5ECD9]/30 line-through cursor-not-allowed' : 'hover:bg-white/10'}`}
                                  >
                                    <span className="uppercase">{p.name}</span>
                                    <span className="text-xs text-[#F5ECD9]/40 ml-2">({count}/2)</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-5">
                    <button
                      onClick={() => bankersUsed < 2 && setIsBanker(!isBanker)}
                      disabled={bankersUsed >= 2 && !isBanker}
                      className={`px-4 py-2 rounded-lg border text-sm font-bold uppercase tracking-wider ${
                        isBanker
                          ? 'bg-[#D9A441] border-[#D9A441] text-[#241a12]'
                          : bankersUsed >= 2
                          ? 'bg-white/5 border-white/10 text-[#F5ECD9]/30 cursor-not-allowed'
                          : 'bg-white/5 border-white/10 hover:border-[#D9A441]/50'
                      }`}
                    >
                      {isBanker ? '★ Banker Declared' : 'Declare Banker'}
                    </button>
                    <span className="text-xs text-[#F5ECD9]/50 uppercase tracking-wider">{bankersUsed} of 2 used</span>
                  </div>

                  {question && (
                    <div className="mb-5 bg-white/5 border border-white/10 rounded-lg p-4">
                      <p className="text-xs font-bold uppercase tracking-wider mb-2 text-[#D9A441]">This Week's Question</p>
                      <p className="text-sm text-[#F5ECD9]/90 mb-3">{question.question}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { key: 'A', label: question.option_a },
                          { key: 'B', label: question.option_b },
                          question.option_c ? { key: 'C', label: question.option_c } : null,
                          question.option_d ? { key: 'D', label: question.option_d } : null,
                        ].filter(Boolean).map((opt: any) => (
                          <button
                            key={opt.key}
                            onClick={() => setQuestionAnswer(opt.key)}
                            className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                              questionAnswer === opt.key
                                ? 'bg-[#D9A441] border-[#D9A441] text-[#241a12]'
                                : 'bg-white/5 border-white/10 hover:border-[#D9A441]/50'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {message && (
                    <p className={`text-sm mb-3 uppercase tracking-wider ${message.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                      {message}
                    </p>
                  )}

                  <button
                    onClick={savePick}
                    disabled={saving}
                    className="w-full rounded-lg px-6 py-3 font-bold uppercase tracking-wider disabled:opacity-50"
                    style={{ backgroundColor: '#D9A441', color: '#241a12', fontFamily: 'var(--font-heading), serif' }}
                  >
                    {saving ? 'Saving...' : 'Lock My Pick'}
                  </button>
                </>
              )}
            </div>
          ) : (
            <p className="text-[#F5ECD9]/60 uppercase tracking-wider text-sm">No upcoming gameweek with an open deadline.</p>
          )}

          <h2 className="text-lg font-bold mt-6 mb-3" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Your Previous Picks</h2>
          <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
            {historyPicks.length === 0 ? (
              <p className="text-[#F5ECD9]/40 text-sm p-4 uppercase tracking-wider">No picks made yet.</p>
            ) : (
              <table className="w-full" style={{ fontSize: '11px' }}>
                <thead>
                  <tr className="text-left border-b border-white/10 uppercase tracking-wider text-[#F5ECD9]/50" style={{ fontSize: '10px' }}>
                    <th className="py-2 px-3">GW</th>
                    <th className="py-2 px-3">Team</th>
                    <th className="py-2 px-3">Players</th>
                    <th className="py-2 px-3 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {historyPicks.map((pick: any) => {
                    const t = getTeam(pick.team_id)
                    return (
                      <tr key={pick.id} className="border-b border-white/5 last:border-0">
                        <td className="py-2 px-3 font-bold">{pick.gameweeks?.number}</td>
                        <td className="py-2 px-3 uppercase">
                          <div className="flex items-center gap-1.5">
                            <TeamCrest crestUrl={t?.crest_url ?? null} teamName={t?.name ?? ''} size={16} />
                            {teamDisplayName(t)}
                            {pick.is_banker && <span className="ml-1 text-[10px] bg-[#D9A441] text-[#241a12] px-1 py-0.5 rounded font-bold">B</span>}
                            {pick.is_autopick && <span className="ml-1 text-[10px] bg-white/20 px-1 py-0.5 rounded">A</span>}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-[#F5ECD9]/50 uppercase" style={{ fontSize: '10px' }}>{playerName(pick.player1_id)} & {playerName(pick.player2_id)}</td>
                        <td className="py-2 px-3 text-right font-bold">{pointsByPick[pick.id] ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </HeroPage>

      {showSlip && selectedTeam && player1 && player2 && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-end md:items-center justify-center z-50 p-4">
          <div className="w-full max-w-sm overflow-hidden shadow-2xl rounded-lg border border-[#D9A441]/40" style={{ backgroundColor: '#1e1914' }}>
            <div className="px-6 py-4 text-center border-b border-white/10">
              <p className="text-xs uppercase tracking-widest text-[#D9A441]/70 mb-1">LMS All-Stars Predictions</p>
              <p className="text-lg font-bold uppercase tracking-wider text-[#F5ECD9]">Gameweek {gameweek?.number} Pick</p>
            </div>

            <div className="px-6 py-4 space-y-3 border-b border-white/10 text-[#F5ECD9]">
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase tracking-wider text-[#F5ECD9]/50">Team</span>
                <div className="flex items-center gap-2">
                  <TeamCrest crestUrl={getTeam(selectedTeam)?.crest_url ?? null} teamName={getTeam(selectedTeam)?.name ?? ''} size={20} />
                  <span className="font-bold uppercase">{teamDisplayName(getTeam(selectedTeam))}</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase tracking-wider text-[#F5ECD9]/50">Player 1</span>
                <span className="font-medium uppercase text-sm">{playerName(player1)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase tracking-wider text-[#F5ECD9]/50">Player 2</span>
                <span className="font-medium uppercase text-sm">{playerName(player2)}</span>
              </div>
              {isBanker && (
                <div className="flex justify-between items-center">
                  <span className="text-xs uppercase tracking-wider text-[#F5ECD9]/50">Banker</span>
                  <span className="font-bold text-[#D9A441] uppercase">★ Declared</span>
                </div>
              )}
            </div>

            <div className="px-6 py-3 text-center border-b border-white/10">
              <p className="text-xs text-[#F5ECD9]/50 uppercase tracking-wider mb-1">Deadline</p>
              <p className="font-bold text-sm text-[#F5ECD9]">{gameweek ? new Date(gameweek.deadline).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p>
            </div>

            <div className="px-6 py-4">
              <button
                onClick={() => setShowSlip(false)}
                className="w-full rounded-lg py-3 font-bold uppercase tracking-wider text-sm"
                style={{ backgroundColor: '#D9A441', color: '#241a12' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}