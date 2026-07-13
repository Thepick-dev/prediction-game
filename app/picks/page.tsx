'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'

type Team = { id: number; name: string; short_name: string | null }
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

function teamAbbr(team: Team | undefined) {
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
      const secs = Math.floor((diff % (1000 * 60)) / 1000)
      if (days > 0) setTimeLeft(`${days}d ${hours}h ${mins}m`)
      else setTimeLeft(`${hours}h ${mins}m ${secs}s`)
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
      supabase.from('teams').select('id, name, short_name').order('name'),
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
  const fixtureTeamIds = new Set(fixtures.flatMap(f => [f.home_team_id, f.away_team_id]))

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

  if (loading) {
    return (
      <Shell active="PICK">
        <p className="text-gray-500">Loading...</p>
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="PICK">
        <h1 className="text-2xl font-bold mb-2">No Active Competition</h1>
        <p className="text-gray-500">There is no active competition right now.</p>
      </Shell>
    )
  }

  return (
    <Shell active="PICK" user={user} displayName={displayName}>
      <HeroPage
        desktopImage="/images/heroes/picks-desktop.png"
        mobileImage="/images/heroes/picks-mobile.png"
      >
        <div className="w-full max-w-2xl">

          {gameweek && !deadlinePassed && !hasPick && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 flex items-center gap-3">
              <span className="text-lg">⚠️</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-red-700 uppercase tracking-wider">Pick Required</p>
                <p className="text-xs text-red-600">You haven't submitted your Gameweek {gameweek.number} pick yet.</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-red-500 uppercase tracking-wider font-bold">{countdown}</p>
                <p className="text-xs text-red-400">remaining</p>
              </div>
            </div>
          )}

          {gameweek && !deadlinePassed && hasPick && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6 flex items-center gap-3">
              <span className="text-lg">✅</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-green-700 uppercase tracking-wider">Pick Submitted</p>
                <p className="text-xs text-green-600">Gameweek {gameweek.number} pick is in. Deadline in {countdown}.</p>
              </div>
            </div>
          )}

          <h1 className="text-3xl font-bold mb-1">Picks</h1>
          <p className="text-gray-500 mb-8 text-sm">{competition.name}</p>

          {gameweek ? (
            <div className="bg-white border rounded-lg p-6 mb-8">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                <h2 className="text-xl font-bold">Gameweek {gameweek.number}</h2>
                <span className="text-sm text-red-600 font-medium">
                  Deadline: {new Date(gameweek.deadline).toLocaleString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>

              {deadlinePassed ? (
                <p className="text-gray-500 uppercase tracking-wider text-sm">The deadline has passed. Picks are locked.</p>
              ) : (
                <>
                  <div className="mb-6">
                    <label className="block font-bold mb-3 uppercase tracking-wider text-sm">Select Your Team</label>

                    {hasFixtures ? (
                      <div className="space-y-2">
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
                            <div key={fixture.id} className="border rounded-lg overflow-hidden">
                              <div className="grid grid-cols-2 divide-x">
                                <button
                                  onClick={() => !homeStatus.isUsed && selectTeamInFixture(fixture.home_team_id, fixture.id)}
                                  disabled={homeStatus.isUsed}
                                  className={`px-3 py-3 text-left text-sm transition-colors ${
                                    homeSelected
                                      ? 'bg-black text-white'
                                      : homeStatus.isUsed
                                      ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                                      : 'hover:bg-gray-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className={`font-medium uppercase text-xs ${homeStatus.isUsed ? 'line-through' : ''}`}>
                                      {teamAbbr(homeTeam)}
                                    </span>
                                    {homeStatus.isDouble && (
                                      <span className={`text-xs ${homeSelected ? 'text-yellow-300' : 'text-yellow-600'}`}>★</span>
                                    )}
                                    {homeQ && (
                                      <span className={`text-xs px-1 rounded font-bold ${
                                        homeSelected
                                          ? 'bg-white text-black'
                                          : homeQ === 'Q1' ? 'bg-blue-100 text-blue-700'
                                          : homeQ === 'Q2' ? 'bg-green-100 text-green-700'
                                          : homeQ === 'Q3' ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-red-100 text-red-700'
                                      }`}>
                                        {homeQ}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs mt-1 opacity-60 uppercase tracking-wider">
                                    {homeStatus.isUsed ? 'Used' : `${homeStatus.remaining}/${homeStatus.maxUses} left`}
                                  </div>
                                </button>
                                <button
                                  onClick={() => !awayStatus.isUsed && selectTeamInFixture(fixture.away_team_id, fixture.id)}
                                  disabled={awayStatus.isUsed}
                                  className={`px-3 py-3 text-left text-sm transition-colors ${
                                    awaySelected
                                      ? 'bg-black text-white'
                                      : awayStatus.isUsed
                                      ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                                      : 'hover:bg-gray-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className={`font-medium uppercase text-xs ${awayStatus.isUsed ? 'line-through' : ''}`}>
                                      {teamAbbr(awayTeam)}
                                    </span>
                                    {awayStatus.isDouble && (
                                      <span className={`text-xs ${awaySelected ? 'text-yellow-300' : 'text-yellow-600'}`}>★</span>
                                    )}
                                    {awayQ && (
                                      <span className={`text-xs px-1 rounded font-bold ${
                                        awaySelected
                                          ? 'bg-white text-black'
                                          : awayQ === 'Q1' ? 'bg-blue-100 text-blue-700'
                                          : awayQ === 'Q2' ? 'bg-green-100 text-green-700'
                                          : awayQ === 'Q3' ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-red-100 text-red-700'
                                      }`}>
                                        {awayQ}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs mt-1 opacity-60 uppercase tracking-wider">
                                    {awayStatus.isUsed ? 'Used' : `${awayStatus.remaining}/${awayStatus.maxUses} left`}
                                  </div>
                                </button>
                              </div>
                            </div>
                          )
                        })}

                        {selectedTeam && !fixtureTeamIds.has(selectedTeam) && (
                          <p className="text-xs text-orange-600 mt-2 uppercase tracking-wider">
                            Your current pick ({teamAbbr(getTeam(selectedTeam))}) is not in this gameweek's fixtures.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {teams.map(team => {
                          const status = getTeamStatus(team.id)
                          const q = getQuartileLabel(team.id)
                          const teamSelected = selectedTeam === team.id
                          return (
                            <button
                              key={team.id}
                              onClick={() => !status.isUsed && selectTeamInFixture(team.id, 0)}
                              disabled={status.isUsed}
                              className={`text-left px-3 py-2 rounded border text-xs ${
                                teamSelected
                                  ? 'bg-black text-white border-black'
                                  : status.isUsed
                                  ? 'bg-gray-100 text-gray-300 cursor-not-allowed line-through'
                                  : 'hover:border-black'
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                <span className="uppercase font-medium">{teamAbbr(team)}</span>
                                {status.isDouble && <span className="text-yellow-600">★</span>}
                                {q && <span className="text-xs text-gray-500">{q}</span>}
                              </div>
                              <div className="text-xs opacity-60 mt-0.5">
                                {status.isUsed ? 'Used' : `${status.remaining}/${status.maxUses} left`}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <label className="block font-bold mb-2 uppercase tracking-wider text-sm">Player 1</label>
                      {player1 ? (
                        <div className="flex items-center justify-between border rounded px-3 py-2">
                          <span className="text-sm uppercase">{playerName(player1)}</span>
                          <button onClick={() => setPlayer1(null)} className="text-xs text-red-500">✕</button>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={playerSearch1}
                            onChange={e => setPlayerSearch1(e.target.value)}
                            placeholder="Search players..."
                            className="w-full border rounded px-3 py-2 text-sm"
                          />
                          {filteredPlayers1.length > 0 && (
                            <div className="border rounded mt-1 divide-y max-h-48 overflow-y-auto">
                              {filteredPlayers1.map(p => {
                                const count = playerCounts[p.id] ?? 0
                                const maxed = count >= 2
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => { if (!maxed) { setPlayer1(p.id); setPlayerSearch1('') } }}
                                    disabled={maxed}
                                    className={`block w-full text-left px-3 py-2 text-sm ${maxed ? 'text-gray-300 line-through cursor-not-allowed' : 'hover:bg-gray-50'}`}
                                  >
                                    <span className="uppercase">{p.name}</span>
                                    <span className="text-xs text-gray-400 ml-2">({count}/2)</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div>
                      <label className="block font-bold mb-2 uppercase tracking-wider text-sm">Player 2</label>
                      {player2 ? (
                        <div className="flex items-center justify-between border rounded px-3 py-2">
                          <span className="text-sm uppercase">{playerName(player2)}</span>
                          <button onClick={() => setPlayer2(null)} className="text-xs text-red-500">✕</button>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={playerSearch2}
                            onChange={e => setPlayerSearch2(e.target.value)}
                            placeholder="Search players..."
                            className="w-full border rounded px-3 py-2 text-sm"
                          />
                          {filteredPlayers2.length > 0 && (
                            <div className="border rounded mt-1 divide-y max-h-48 overflow-y-auto">
                              {filteredPlayers2.map(p => {
                                const count = playerCounts[p.id] ?? 0
                                const maxed = count >= 2
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => { if (!maxed) { setPlayer2(p.id); setPlayerSearch2('') } }}
                                    disabled={maxed}
                                    className={`block w-full text-left px-3 py-2 text-sm ${maxed ? 'text-gray-300 line-through cursor-not-allowed' : 'hover:bg-gray-50'}`}
                                  >
                                    <span className="uppercase">{p.name}</span>
                                    <span className="text-xs text-gray-400 ml-2">({count}/2)</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-6">
                    <button
                      onClick={() => bankersUsed < 2 && setIsBanker(!isBanker)}
                      disabled={bankersUsed >= 2 && !isBanker}
                      className={`px-4 py-2 rounded border text-sm font-bold uppercase tracking-wider ${
                        isBanker
                          ? 'bg-yellow-400 border-yellow-500'
                          : bankersUsed >= 2
                          ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                          : 'hover:border-black'
                      }`}
                    >
                      {isBanker ? '★ Banker Declared' : 'Declare Banker'}
                    </button>
                    <span className="text-xs text-gray-400 uppercase tracking-wider">{bankersUsed} of 2 bankers used</span>
                  </div>

                  {question && (
                    <div className="mb-6 bg-gray-50 border rounded-lg p-4">
                      <p className="text-sm font-bold uppercase tracking-wider mb-3">This Week's Question</p>
                      <p className="text-sm text-gray-700 mb-3">{question.question}</p>
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
                            className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
                              questionAnswer === opt.key
                                ? 'bg-black text-white border-black'
                                : 'hover:border-black bg-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {message && (
                    <p className={`text-sm mb-4 uppercase tracking-wider ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                      {message}
                    </p>
                  )}

                  <button
                    onClick={savePick}
                    disabled={saving}
                    className="bg-black text-white rounded px-6 py-3 font-bold uppercase tracking-wider disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Pick'}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="bg-white border rounded-lg p-6 mb-8">
              <p className="text-gray-500 uppercase tracking-wider text-sm">No upcoming gameweek with an open deadline.</p>
            </div>
          )}

          <h2 className="text-xl font-bold mb-4">Your Previous Picks</h2>
          <div className="bg-white border rounded-lg overflow-hidden">
            {historyPicks.length === 0 ? (
              <p className="text-gray-400 text-sm p-6 uppercase tracking-wider">No picks made yet.</p>
            ) : (
              <table className="w-full" style={{ fontSize: '11px' }}>
                <thead>
                  <tr className="text-left text-gray-500 border-b bg-gray-50 uppercase tracking-wider" style={{ fontSize: '10px' }}>
                    <th className="py-2 px-2">GW</th>
                    <th className="py-2 px-2">Team</th>
                    <th className="py-2 px-2">Players</th>
                    <th className="py-2 px-2 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {historyPicks.map((pick: any) => (
                    <tr key={pick.id} className="border-b last:border-0">
                      <td className="py-2 px-2 font-bold">{pick.gameweeks?.number}</td>
                      <td className="py-2 px-2 uppercase">
                        {teamAbbr(getTeam(pick.team_id))}
                        {pick.is_banker && <span className="ml-1 text-xs bg-yellow-200 text-yellow-800 px-1 py-0.5 rounded">B</span>}
                        {pick.is_autopick && <span className="ml-1 text-xs bg-gray-200 text-gray-600 px-1 py-0.5 rounded">A</span>}
                      </td>
                      <td className="py-2 px-2 text-gray-500 uppercase" style={{ fontSize: '10px' }}>{playerName(pick.player1_id)} & {playerName(pick.player2_id)}</td>
                      <td className="py-2 px-2 text-right font-bold">{pointsByPick[pick.id] ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </HeroPage>

      {showSlip && selectedTeam && player1 && player2 && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">

            <div className="bg-black text-white px-6 py-4 text-center">
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">LMS All-Stars Predictions</p>
              <p className="text-lg font-bold uppercase tracking-wider">Gameweek {gameweek?.number} Pick</p>
              <p className="text-xs text-gray-400 mt-1">{new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            </div>

            <div className="px-6 py-4 space-y-3 border-b">
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase tracking-wider text-gray-500">Team</span>
                <span className="font-bold uppercase">{teamAbbr(getTeam(selectedTeam))}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase tracking-wider text-gray-500">Player 1</span>
                <span className="font-medium uppercase text-sm">{playerName(player1)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase tracking-wider text-gray-500">Player 2</span>
                <span className="font-medium uppercase text-sm">{playerName(player2)}</span>
              </div>
              {isBanker && (
                <div className="flex justify-between items-center">
                  <span className="text-xs uppercase tracking-wider text-gray-500">Banker</span>
                  <span className="font-bold text-yellow-600 uppercase">★ Declared</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Deadline</p>
              <p className="font-bold text-sm">{gameweek ? new Date(gameweek.deadline).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p>
            </div>

            <div className="px-6 py-4">
              <button
                onClick={() => setShowSlip(false)}
                className="w-full bg-black text-white rounded-lg py-3 font-bold uppercase tracking-wider text-sm"
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