'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import TeamCrest from '../../components/TeamCrest'
import { buildPlayerDisplayNames } from '../lib/players'
import { useCountdown, type CountdownTime } from '../lib/useCountdown'
import TicketModal from '../../components/TicketModal'

type Team = { id: number; name: string; short_name: string | null; short_code: string | null; crest_url: string | null }
type Player = { id: number; name: string; web_name: string | null; team_id: number; value: number | null; active: boolean | null }
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
  provisional?: boolean
  gameweeks: { number: number }
}
type Question = {
  id: string
  question: string
  question_type: 'multiple_choice' | 'freetext' | null
  option_a: string
  option_b: string
  option_c: string | null
  option_d: string | null
}

function teamDisplayName(team: Team | undefined) {
  if (!team) return 'Unknown'
  return team.short_name ?? team.name.replace(' FC', '').replace(' AFC', '')
}

// A ceefax-teletext-style flip clock in classic mode; a bold comic
// countdown badge in pop-art mode.
function CountdownClock({ time, theme = 'classic' }: { time: CountdownTime | null; theme?: 'classic' | 'pop-art' }) {
  if (!time) return null

  if (theme === 'pop-art') {
    if (time.expired) {
      return <span className="pop-badge pop-badge--red px-3 py-1.5 text-xs">Deadline passed</span>
    }
    const units = [
      { label: 'D', value: time.days },
      { label: 'H', value: time.hours },
      { label: 'M', value: time.mins },
      { label: 'S', value: time.secs },
    ]
    return (
      <div className="flex items-center gap-1.5">
        {units.map(u => (
          <div key={u.label} className="pop-badge flex flex-col items-center px-2 py-1 leading-tight">
            <span className="text-sm">{String(u.value).padStart(2, '0')}</span>
            <span className="text-[8px]">{u.label}</span>
          </div>
        ))}
      </div>
    )
  }

  if (time.expired) {
    return <span className="text-xs uppercase tracking-wider font-bold" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Deadline passed</span>
  }

  const units = [
    { label: 'Days', value: time.days },
    { label: 'Hrs', value: time.hours },
    { label: 'Mins', value: time.mins },
    { label: 'Secs', value: time.secs },
  ]

  return (
    <div className="flex items-center gap-1">
      {units.map((u, i) => (
        <div key={u.label} className="flex items-center gap-1">
          <div className="flex flex-col items-center">
            <div
              className="rounded px-1.5 py-1 min-w-[2rem] text-center font-bold tabular-nums text-sm"
              style={{ backgroundColor: '#1a120b', color: '#D9A441', border: '1px solid #D9A44155', fontFamily: 'var(--font-heading), serif' }}
            >
              {String(u.value).padStart(2, '0')}
            </div>
            <span className="text-[8px] uppercase tracking-wider mt-0.5 text-[#F5ECD9]/40">{u.label}</span>
          </div>
          {i < units.length - 1 && <span className="text-[#D9A441]/40 font-bold -mt-2.5">:</span>}
        </div>
      ))}
    </div>
  )
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
  const [scoringMap, setScoringMap] = useState<Record<string, number>>({})
  const [historyPicks, setHistoryPicks] = useState<HistoryPick[]>([])
  const [pointsByPick, setPointsByPick] = useState<Record<string, number>>({})
  const [question, setQuestion] = useState<Question | null>(null)
  const [questionAnswer, setQuestionAnswer] = useState<string>('')
  const [comments, setComments] = useState<string>('')
  const [hasPick, setHasPick] = useState(false)
  const [showSlip, setShowSlip] = useState(false)

  const [selectedTeam, setSelectedTeam] = useState<number | null>(null)
  const [selectedFixture, setSelectedFixture] = useState<number | null>(null)
  const [player1, setPlayer1] = useState<number | null>(null)
  const [player2, setPlayer2] = useState<number | null>(null)
  const [player1Fixture, setPlayer1Fixture] = useState<number | null>(null)
  const [player2Fixture, setPlayer2Fixture] = useState<number | null>(null)
  const [isBanker, setIsBanker] = useState(false)

  const [usedTeams, setUsedTeams] = useState<number[]>([])
  const [playerCounts, setPlayerCounts] = useState<Record<number, number>>({})
  const [doubleUseTeams, setDoubleUseTeams] = useState<number[]>([])
  const [bankersUsed, setBankersUsed] = useState(0)

  const [playerSearch1, setPlayerSearch1] = useState('')
  const [playerSearch2, setPlayerSearch2] = useState('')
  const [player1Club, setPlayer1Club] = useState<number | null>(null)
  const [player2Club, setPlayer2Club] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [message, setMessage] = useState('')
  const [deadlinePassed, setDeadlinePassed] = useState(false)

  // Pop-art comic theme prototype — a pure presentation toggle, not a
  // preference tied to the account, so it's fine to just live in this
  // browser via localStorage. Lets anyone flip between this and the
  // classic look instantly, with no code change needed to "revert".
  const [popArt, setPopArt] = useState(false)
  useEffect(() => {
    if (localStorage.getItem('lms-pop-art-picks') === 'true') setPopArt(true)
  }, [])
  function togglePopArt() {
    setPopArt(prev => {
      const next = !prev
      localStorage.setItem('lms-pop-art-picks', String(next))
      return next
    })
  }

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

    // Status first, not just the deadline: a gameweek an admin has already
    // locked (or completed) should never be offered for picking, even if
    // its deadline field happens to still read as being in the future.
    const { data: gw } = await supabase
      .from('gameweeks')
      .select('id, number, deadline, status')
      .eq('competition_id', comp.id)
      .in('status', ['upcoming', 'open'])
      .order('deadline', { ascending: true })
      .limit(1)
      .single()

    setGameweek(gw)
    if (gw) setDeadlinePassed(new Date() > new Date(gw.deadline))

    const [{ data: teamsData }, { data: playersData }] = await Promise.all([
      supabase.from('teams').select('id, name, short_name, short_code, crest_url').eq('active', true).order('name'),
      supabase.from('players').select('id, name, web_name, team_id, value').order('name')
    ])
    setTeams(teamsData ?? [])

    // Its own query, deliberately separate from the one above: `active` is
    // a newer column, and this must never be able to take the whole Picks
    // page down with it if it's missing (see the kit_colour_3 lesson —
    // that exact mistake broke the header/leaderboard/settings kit badges
    // earlier this session by sharing one query for an optional column).
    const { data: playerActive } = await supabase.from('players').select('id, active')
    const activeByPlayerId: Record<number, boolean | null> = {}
    playerActive?.forEach(p => { activeByPlayerId[p.id] = p.active })

    setPlayers((playersData ?? []).map(p => ({ ...p, active: activeByPlayerId[p.id] ?? true })))

    if (gw) {
      const [pickRes, { data: fixturesData }, { data: quartilesData }, { data: questionData }, { data: scoringRulesData }] = await Promise.all([
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
          .single(),
        // Same table the admin Scoring page edits — this is what lets each
        // team's win/draw points shown below update the moment an admin
        // changes the rules, with no separate copy of the numbers to
        // keep in sync.
        supabase
          .from('competition_scoring_rules')
          .select('result_type, quartile_diff, points')
          .eq('competition_id', comp.id)
      ])

      const pickData = await pickRes.json()
      if (pickData.pick) {
        setSelectedTeam(pickData.pick.team_id)
        setSelectedFixture(pickData.pick.fixture_id ?? null)
        setPlayer1(pickData.pick.player1_id)
        setPlayer2(pickData.pick.player2_id)
        setPlayer1Fixture(pickData.pick.player1_fixture_id ?? null)
        setPlayer2Fixture(pickData.pick.player2_fixture_id ?? null)
        setIsBanker(pickData.pick.is_banker)
        setQuestionAnswer(pickData.pick.question_answer ?? '')
        setComments(pickData.pick.comments ?? '')
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

      const sMap: Record<string, number> = {}
      scoringRulesData?.forEach(r => { sMap[`${r.result_type}_${r.quartile_diff}`] = r.points })
      setScoringMap(sMap)

      if (questionData) setQuestion(questionData)
    }

    const [{ data: history }, { data: allGameweeks }] = await Promise.all([
      supabase
        .from('picks')
        .select('id, gameweek_id, team_id, player1_id, player2_id, is_banker, is_autopick, gameweeks(number)')
        .eq('user_id', user.id)
        .eq('competition_id', comp.id)
        .order('gameweek_id'),
      supabase
        .from('gameweeks')
        .select('id, number, deadline, status')
        .eq('competition_id', comp.id)
    ])

    const realHistory = (history as any) ?? []
    const pickedGwIds = new Set(realHistory.map((h: any) => h.gameweek_id))

    const nowTime = new Date()
    const pastUnpickedGws = (allGameweeks ?? []).filter(g =>
      new Date(g.deadline) < nowTime && !pickedGwIds.has(g.id)
    )

    const provisionalHistory: any[] = []
    await Promise.all(pastUnpickedGws.map(async g => {
      try {
        const res = await fetch(`/api/autopick/preview?gameweek_id=${g.id}`)
        const data = await res.json()
        const mine = data.previews?.[user.id]
        if (mine) {
          provisionalHistory.push({
            id: `preview-${g.id}`,
            gameweek_id: g.id,
            team_id: mine.team_id,
            player1_id: mine.player1_id,
            player2_id: mine.player2_id,
            is_banker: false,
            is_autopick: true,
            provisional: true,
            gameweeks: { number: g.number }
          })
        }
      } catch {
        // ignore
      }
    }))

    const combinedHistory = [...realHistory, ...provisionalHistory].sort(
      (a, b) => (a.gameweeks?.number ?? 0) - (b.gameweeks?.number ?? 0)
    )

    setHistoryPicks(combinedHistory)

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
    const p1Team = players.find(p => p.id === player1)?.team_id ?? null
    const p2Team = players.find(p => p.id === player2)?.team_id ?? null
    if (fixturesForTeam(p1Team).length >= 2 && !player1Fixture) {
      setMessage(`${playerName(player1)}'s team plays twice this gameweek — choose which match this pick is for`)
      return
    }
    if (fixturesForTeam(p2Team).length >= 2 && !player2Fixture) {
      setMessage(`${playerName(player2)}'s team plays twice this gameweek — choose which match this pick is for`)
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
        player1_fixture_id: player1Fixture,
        player2_fixture_id: player2Fixture,
        is_banker: isBanker,
        question_answer: questionAnswer,
        comments: comments.trim() || null
      })
    })
    const data = await res.json()
    if (data.error) {
      setMessage('Error: ' + data.error)
    } else {
      setHasPick(true)
      setShowSlip(true)
      // Comic-mode-only celebration flash (see popArt render below) — a
      // brief "that worked!" moment on the submit button rather than a
      // silent state change. Harmless to set unconditionally; the classic
      // view never reads this state.
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 1400)
      loadData()
    }
    setSaving(false)
  }

  const getTeam = (id: number | null) => teams.find(t => t.id === id)

  // Fixtures this gameweek for a given team — normally just one, but a
  // rearranged fixture can occasionally land a team two matches in the same
  // gameweek. When that happens for a picked player's team, which match the
  // pick is "for" is genuinely ambiguous and has to be nominated explicitly.
  function fixturesForTeam(teamId: number | null): Fixture[] {
    if (teamId == null) return []
    return fixtures.filter(f => f.home_team_id === teamId || f.away_team_id === teamId)
  }

  function opponentLabel(fixture: Fixture, teamId: number) {
    const isHome = fixture.home_team_id === teamId
    const opponent = getTeam(isHome ? fixture.away_team_id : fixture.home_team_id)
    return `${isHome ? 'H' : 'A'} vs ${teamDisplayName(opponent)}`
  }

  const teamMap: Record<number, Team> = {}
  teams.forEach(t => { teamMap[t.id] = t })
  const displayNames = buildPlayerDisplayNames(players, teamMap)
  const playerName = (id: number | null) => (id != null ? displayNames[id] : undefined) ?? ''

  const questionAnswerLabel = (() => {
    if (!question || !questionAnswer) return ''
    if (question.question_type === 'freetext') return questionAnswer
    const options: Record<string, string | null> = {
      A: question.option_a, B: question.option_b, C: question.option_c, D: question.option_d
    }
    return options[questionAnswer] ?? ''
  })()

  // Only players on currently active teams, who are themselves still active
  // (not departed the club/league entirely per the FPL sync — see
  // app/api/sync/fpl/route.ts), can be newly selected. Neither filter
  // touches past picks/history display elsewhere, which still resolve
  // every player regardless — this only narrows what's offered for a NEW
  // pick.
  const selectablePlayers = players.filter(p => teamMap[p.team_id] && p.active !== false)

  // With a club chosen, show that whole squad — highest FPL price first
  // (the price itself is never shown, just used to order the list) — the
  // typed search then narrows within that club instead of searching all
  // clubs. With no club chosen, fall back to the original any-club name
  // search once at least 2 characters are typed.
  function playersForClub(teamId: number, search: string) {
    return selectablePlayers
      .filter(p => p.team_id === teamId && (search.length === 0 || p.name.toLowerCase().includes(search.toLowerCase())))
      .slice()
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  }

  const filteredPlayers1 = player1Club != null
    ? playersForClub(player1Club, playerSearch1)
    : playerSearch1.length >= 2
    ? selectablePlayers.filter(p => p.name.toLowerCase().includes(playerSearch1.toLowerCase())).slice(0, 8)
    : []
  const filteredPlayers2 = player2Club != null
    ? playersForClub(player2Club, playerSearch2)
    : playerSearch2.length >= 2
    ? selectablePlayers.filter(p => p.name.toLowerCase().includes(playerSearch2.toLowerCase())).slice(0, 8)
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

  // Same maths as the real scoring engine (app/lib/scoring.ts) — quartile
  // diff is "our team's quartile minus the opponent's", clamped to ±3, so a
  // positive diff means we were the weaker side (beating/drawing a stronger
  // opponent is worth more, not less).
  function getWinDrawPoints(teamId: number, opponentId: number, isHome: boolean) {
    const teamQ = quartileMap[teamId] ?? 2
    const opponentQ = quartileMap[opponentId] ?? 2
    const diff = Math.max(-3, Math.min(3, teamQ - opponentQ))
    const win = scoringMap[`${isHome ? 'home_win' : 'away_win'}_${diff}`] ?? 0
    const draw = scoringMap[`${isHome ? 'home_draw' : 'away_draw'}_${diff}`] ?? 0
    return { win, draw }
  }

  const quartileColours: Record<string, string> = {
    Q1: 'bg-blue-500/20 text-blue-300 border-blue-400/40',
    Q2: 'bg-green-500/20 text-green-300 border-green-400/40',
    Q3: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/40',
    Q4: 'bg-red-500/20 text-red-300 border-red-400/40',
  }

  // Same Q1-4 colour meaning as the classic badges above, just in the
  // comic palette — gives blue and green genuine, functional presence
  // on the page rather than being decorative extras.
  const popQuartileBadgeClass: Record<string, string> = {
    Q1: 'pop-badge--blue',
    Q2: 'pop-badge--green',
    Q3: '',
    Q4: 'pop-badge--red',
  }

  // Cycled across fixture rows so the pick grid reads as a wall of colour
  // rather than repeating white boxes. Pink is deliberately left out here —
  // once a team inside a pink row was also selected (previously pink too)
  // the two blurred into "pink on pink" — green/blue/white don't collide
  // with the black-on-white "selected" treatment below.
  const popFixturePanelClass = ['pop-panel--green', 'pop-panel--blue', '']

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

  // Always rendered regardless of which look is showing, so switching back
  // to Classic never depends on remembering where a setting lives — it's
  // right there on the page, in both modes.
  const popArtToggleButton = (
    <button
      onClick={togglePopArt}
      className="fixed bottom-4 right-4 z-40 rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-wider shadow-lg"
      style={
        popArt
          ? { backgroundColor: '#F0328C', color: '#FFFFFF', border: '3px solid #111111', fontFamily: 'var(--font-comic), sans-serif', letterSpacing: '0.04em' }
          : { backgroundColor: '#D9A441', color: '#241a12' }
      }
    >
      {popArt ? '🎨 Comic Mode — Tap for Classic' : '🎨 Try Comic Mode'}
    </button>
  )

  if (popArt) {
    const homeWinDraw = (fixture: Fixture) => getWinDrawPoints(fixture.home_team_id, fixture.away_team_id, true)
    const awayWinDraw = (fixture: Fixture) => getWinDrawPoints(fixture.away_team_id, fixture.home_team_id, false)

    return (
      <>
        {popArtToggleButton}
        <Shell active="PICKS" user={user} displayName={displayName} theme="pop-art">
          <div className="pop-art-theme pop-halftone-bg rounded-2xl p-4 sm:p-6" style={{ border: '6px solid var(--pop-black)' }}>

            <div className="pop-sunburst-bg pop-rotate-l rounded-xl p-5 sm:p-6 mb-6" style={{ border: '5px solid var(--pop-black)', boxShadow: '8px 8px 0 var(--pop-black)' }}>
              <h1 className="pop-headline text-5xl sm:text-6xl mb-1">Picks!</h1>
              <p className="font-black uppercase text-xs sm:text-sm" style={{ color: 'var(--pop-black)' }}>{competition.name}</p>
            </div>

            {gameweek && (
              <div className={`pop-panel ${!deadlinePassed && !hasPick ? 'pop-panel--yellow pop-rotate-r' : 'pop-panel--blue pop-rotate-l'} p-4 mb-6 flex items-center justify-between gap-3 flex-wrap`}>
                <div>
                  <p className="pop-headline text-2xl sm:text-3xl mb-0.5">GW{gameweek.number}</p>
                  <p className="font-black text-xs uppercase">
                    {deadlinePassed ? 'Deadline passed' : hasPick ? 'Pick submitted!' : 'Pick required!'}
                  </p>
                </div>
                {!deadlinePassed && <CountdownClock time={countdown} theme="pop-art" />}
              </div>
            )}

            {deadlinePassed ? (
              <div className="pop-panel pop-panel--blue p-6 text-center">
                <p className="pop-headline text-2xl">Locked — See You Next Gameweek!</p>
              </div>
            ) : (
              <>
                <p className="pop-headline text-2xl sm:text-3xl mb-3">Pick Your Team</p>
                {hasFixtures ? (
                  <div className="grid gap-4 mb-6">
                    {fixtures.map((fixture, i) => {
                      const homeStatus = getTeamStatus(fixture.home_team_id)
                      const awayStatus = getTeamStatus(fixture.away_team_id)
                      const homeTeam = getTeam(fixture.home_team_id)
                      const awayTeam = getTeam(fixture.away_team_id)
                      const homeQ = getQuartileLabel(fixture.home_team_id)
                      const awayQ = getQuartileLabel(fixture.away_team_id)
                      const homeSelected = selectedTeam === fixture.home_team_id && selectedFixture === fixture.id
                      const awaySelected = selectedTeam === fixture.away_team_id && selectedFixture === fixture.id
                      const homeWD = homeWinDraw(fixture)
                      const awayWD = awayWinDraw(fixture)
                      const rotate = i % 2 === 0 ? 'pop-rotate-l' : 'pop-rotate-r'
                      const rowPanel = popFixturePanelClass[i % popFixturePanelClass.length]
                      return (
                        <div key={fixture.id} className={`pop-panel ${rowPanel} ${rotate} p-3 grid grid-cols-2 gap-3`}>
                          <button
                            onClick={() => !homeStatus.isUsed && selectTeamInFixture(fixture.home_team_id, fixture.id)}
                            disabled={homeStatus.isUsed}
                            className={`pop-select-btn rounded-lg p-3 flex flex-col items-center justify-between text-center gap-1.5 h-32 sm:h-36 ${homeSelected ? 'pop-pop-in' : ''}`}
                            style={{
                              border: '4px solid var(--pop-black)',
                              background: homeSelected ? 'var(--pop-black)' : 'var(--pop-white)',
                              color: homeSelected ? 'var(--pop-white)' : 'var(--pop-black)',
                              opacity: homeStatus.isUsed ? 0.4 : 1,
                            }}
                          >
                            <TeamCrest crestUrl={homeTeam?.crest_url ?? null} teamName={teamDisplayName(homeTeam)} size={52} />
                            <div className="flex items-center gap-1.5 flex-wrap justify-center min-h-[18px]">
                              {homeQ && <span className={`pop-badge ${popQuartileBadgeClass[homeQ] ?? ''} px-1.5 py-0.5 text-[9px]`}>{homeQ}</span>}
                              <span className="text-[9px] font-bold uppercase">{homeStatus.isUsed ? 'Used' : `${homeStatus.remaining}/${homeStatus.maxUses} left`}</span>
                            </div>
                            <p className="text-[9px] font-bold uppercase">Win +{homeWD.win} &middot; Draw +{homeWD.draw}</p>
                          </button>
                          <button
                            onClick={() => !awayStatus.isUsed && selectTeamInFixture(fixture.away_team_id, fixture.id)}
                            disabled={awayStatus.isUsed}
                            className={`pop-select-btn rounded-lg p-3 flex flex-col items-center justify-between text-center gap-1.5 h-32 sm:h-36 ${awaySelected ? 'pop-pop-in' : ''}`}
                            style={{
                              border: '4px solid var(--pop-black)',
                              background: awaySelected ? 'var(--pop-black)' : 'var(--pop-white)',
                              color: awaySelected ? 'var(--pop-white)' : 'var(--pop-black)',
                              opacity: awayStatus.isUsed ? 0.4 : 1,
                            }}
                          >
                            <TeamCrest crestUrl={awayTeam?.crest_url ?? null} teamName={teamDisplayName(awayTeam)} size={52} />
                            <div className="flex items-center gap-1.5 flex-wrap justify-center min-h-[18px]">
                              {awayQ && <span className={`pop-badge ${popQuartileBadgeClass[awayQ] ?? ''} px-1.5 py-0.5 text-[9px]`}>{awayQ}</span>}
                              <span className="text-[9px] font-bold uppercase">{awayStatus.isUsed ? 'Used' : `${awayStatus.remaining}/${awayStatus.maxUses} left`}</span>
                            </div>
                            <p className="text-[9px] font-bold uppercase">Win +{awayWD.win} &middot; Draw +{awayWD.draw}</p>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="pop-panel p-4 mb-6 font-bold">No fixtures yet.</p>
                )}

                <div className="grid md:grid-cols-2 gap-4 mb-6">
                  <div className="pop-panel pop-rotate-r p-4">
                    <p className="pop-headline text-xl mb-2">Player 1</p>
                    {player1 ? (
                      <div className="pop-pop-in flex items-center justify-between rounded-lg p-2.5" style={{ border: '3px solid var(--pop-black)', background: 'var(--pop-yellow)' }}>
                        <span className="font-black uppercase text-sm">{playerName(player1)}</span>
                        <button
                          onClick={() => { setPlayer1(null); setPlayer1Fixture(null); setPlayer1Club(null) }}
                          className="pop-burst w-8 h-8 text-[10px] font-black shrink-0"
                        >
                          X
                        </button>
                      </div>
                    ) : (
                      <>
                        <select
                          value={player1Club ?? ''}
                          onChange={e => setPlayer1Club(e.target.value ? Number(e.target.value) : null)}
                          className="w-full rounded-lg p-2 mb-2 font-bold text-sm"
                          style={{ border: '3px solid var(--pop-black)' }}
                        >
                          <option value="">Filter by club...</option>
                          {teams.map(t => <option key={t.id} value={t.id}>{teamDisplayName(t)}</option>)}
                        </select>
                        <input
                          type="text"
                          value={playerSearch1}
                          onChange={e => setPlayerSearch1(e.target.value)}
                          placeholder={player1Club != null ? 'Narrow down...' : 'Search players...'}
                          className="w-full rounded-lg p-2 mb-2 font-bold text-sm"
                          style={{ border: '3px solid var(--pop-black)' }}
                        />
                        {filteredPlayers1.length > 0 && (
                          <div className="rounded-lg overflow-hidden max-h-48 overflow-y-auto" style={{ border: '3px solid var(--pop-black)' }}>
                            {filteredPlayers1.map(p => {
                              const count = playerCounts[p.id] ?? 0
                              const maxed = count >= 2
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => { if (!maxed) { setPlayer1(p.id); setPlayer1Fixture(null); setPlayerSearch1(''); setPlayer1Club(null) } }}
                                  disabled={maxed}
                                  className="block w-full text-left px-3 py-2 font-bold text-sm border-b last:border-0"
                                  style={{ background: maxed ? '#eee' : 'var(--pop-white)', opacity: maxed ? 0.5 : 1, borderColor: 'var(--pop-black)' }}
                                >
                                  {playerName(p.id)} <span className="text-xs">({count}/2)</span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="pop-panel pop-rotate-l p-4">
                    <p className="pop-headline text-xl mb-2">Player 2</p>
                    {player2 ? (
                      <div className="pop-pop-in flex items-center justify-between rounded-lg p-2.5" style={{ border: '3px solid var(--pop-black)', background: 'var(--pop-yellow)' }}>
                        <span className="font-black uppercase text-sm">{playerName(player2)}</span>
                        <button
                          onClick={() => { setPlayer2(null); setPlayer2Fixture(null); setPlayer2Club(null) }}
                          className="pop-burst w-8 h-8 text-[10px] font-black shrink-0"
                        >
                          X
                        </button>
                      </div>
                    ) : (
                      <>
                        <select
                          value={player2Club ?? ''}
                          onChange={e => setPlayer2Club(e.target.value ? Number(e.target.value) : null)}
                          className="w-full rounded-lg p-2 mb-2 font-bold text-sm"
                          style={{ border: '3px solid var(--pop-black)' }}
                        >
                          <option value="">Filter by club...</option>
                          {teams.map(t => <option key={t.id} value={t.id}>{teamDisplayName(t)}</option>)}
                        </select>
                        <input
                          type="text"
                          value={playerSearch2}
                          onChange={e => setPlayerSearch2(e.target.value)}
                          placeholder={player2Club != null ? 'Narrow down...' : 'Search players...'}
                          className="w-full rounded-lg p-2 mb-2 font-bold text-sm"
                          style={{ border: '3px solid var(--pop-black)' }}
                        />
                        {filteredPlayers2.length > 0 && (
                          <div className="rounded-lg overflow-hidden max-h-48 overflow-y-auto" style={{ border: '3px solid var(--pop-black)' }}>
                            {filteredPlayers2.map(p => {
                              const count = playerCounts[p.id] ?? 0
                              const maxed = count >= 2
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => { if (!maxed) { setPlayer2(p.id); setPlayer2Fixture(null); setPlayerSearch2(''); setPlayer2Club(null) } }}
                                  disabled={maxed}
                                  className="block w-full text-left px-3 py-2 font-bold text-sm border-b last:border-0"
                                  style={{ background: maxed ? '#eee' : 'var(--pop-white)', opacity: maxed ? 0.5 : 1, borderColor: 'var(--pop-black)' }}
                                >
                                  {playerName(p.id)} <span className="text-xs">({count}/2)</span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-6 flex-wrap">
                  <button
                    onClick={() => setIsBanker(!isBanker)}
                    disabled={!isBanker && bankersUsed >= 2}
                    className={`pop-button ${isBanker ? 'pop-button--green pop-pop-in' : 'pop-button--yellow'} px-4 py-2.5`}
                  >
                    {isBanker ? '★ Banker Declared' : 'Declare Banker'}
                  </button>
                  <span className="pop-badge pop-badge--blue px-2.5 py-1.5 text-xs">{bankersUsed} of 2 used</span>
                </div>

                {question && (
                  <div className="pop-panel pop-panel--yellow pop-rotate-r p-4 mb-6">
                    <p className="pop-headline text-lg mb-2">This Week's Question</p>
                    <p className="font-bold text-sm mb-3">{question.question}</p>
                    {question.question_type === 'freetext' ? (
                      <input
                        type="text"
                        value={questionAnswer}
                        onChange={e => setQuestionAnswer(e.target.value)}
                        placeholder="Type your answer..."
                        maxLength={200}
                        className="w-full rounded-lg p-2 font-bold text-sm"
                        style={{ border: '3px solid var(--pop-black)' }}
                      />
                    ) : (
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
                            className="pop-select-btn rounded-lg p-2 font-black uppercase text-sm"
                            style={{
                              border: '3px solid var(--pop-black)',
                              background: questionAnswer === opt.key ? 'var(--pop-black)' : 'var(--pop-white)',
                              color: questionAnswer === opt.key ? 'var(--pop-white)' : 'var(--pop-black)',
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="pop-panel p-4 mb-6">
                  <p className="pop-headline text-lg mb-2">Any Comments</p>
                  <textarea
                    value={comments}
                    onChange={e => setComments(e.target.value)}
                    rows={3}
                    placeholder="Banter, a prediction, whatever..."
                    className="w-full rounded-lg p-2 font-bold text-sm"
                    style={{ border: '3px solid var(--pop-black)' }}
                  />
                </div>

                {message && (
                  <p className="pop-badge pop-badge--red px-3 py-2 mb-4 inline-block text-xs">{message}</p>
                )}

                <button
                  onClick={savePick}
                  disabled={saving}
                  className={`pop-button ${justSaved ? 'pop-button--green pop-celebrate' : ''} w-full py-4 text-xl`}
                >
                  {saving ? 'Saving...' : justSaved ? '🎉 Locked In!' : hasPick ? 'Update Pick!' : 'Submit Pick!'}
                </button>
              </>
            )}
          </div>
        </Shell>
      </>
    )
  }

  return (
    <>
      {popArtToggleButton}
      <Shell active="PICKS" user={user} displayName={displayName}>
      <HeroPage wide>
        <div className="w-full text-[#F5ECD9]">

          {gameweek && !deadlinePassed && !hasPick && (
            <div className="bg-red-900/40 border border-red-500/40 rounded-lg px-4 py-3 mb-5 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-lg">⚠️</span>
                <div>
                  <p className="text-sm font-bold text-red-300 uppercase tracking-wider">Pick Required</p>
                  <p className="text-xs text-red-200">Gameweek {gameweek.number} pick not yet submitted.</p>
                </div>
              </div>
              <CountdownClock time={countdown} />
            </div>
          )}

          {gameweek && !deadlinePassed && hasPick && (
            <div className="bg-green-900/40 border border-green-500/40 rounded-lg px-4 py-3 mb-5 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-lg">✅</span>
                <div>
                  <p className="text-sm font-bold text-green-300 uppercase tracking-wider">Pick Submitted</p>
                  <p className="text-xs text-green-200">Gameweek {gameweek.number} pick is in.</p>
                </div>
              </div>
              <CountdownClock time={countdown} />
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
                    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
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
                        const homeWD = getWinDrawPoints(fixture.home_team_id, fixture.away_team_id, true)
                        const awayWD = getWinDrawPoints(fixture.away_team_id, fixture.home_team_id, false)

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
                                <p className="text-[9px] text-[#F5ECD9]/40 mt-0.5">
                                  Win +{homeWD.win} &middot; Draw +{homeWD.draw}
                                </p>
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
                                <p className="text-[9px] text-[#F5ECD9]/40 mt-0.5">
                                  Win +{awayWD.win} &middot; Draw +{awayWD.draw}
                                </p>
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
                          <button onClick={() => { setPlayer1(null); setPlayer1Fixture(null); setPlayer1Club(null) }} className="text-xs text-red-400">✕</button>
                        </div>
                      ) : (
                        <>
                          <select
                            value={player1Club ?? ''}
                            onChange={e => setPlayer1Club(e.target.value ? Number(e.target.value) : null)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 mb-1.5 text-sm text-[#F5ECD9]"
                          >
                            <option value="" style={{ color: '#241a12' }}>Filter by club...</option>
                            {teams.map(t => (
                              <option key={t.id} value={t.id} style={{ color: '#241a12' }}>{teamDisplayName(t)}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={playerSearch1}
                            onChange={e => setPlayerSearch1(e.target.value)}
                            placeholder={player1Club != null ? 'Narrow down within this club...' : 'Search players...'}
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
                                    onClick={() => { if (!maxed) { setPlayer1(p.id); setPlayer1Fixture(null); setPlayerSearch1(''); setPlayer1Club(null) } }}
                                    disabled={maxed}
                                    className={`block w-full text-left px-3 py-2 text-sm ${maxed ? 'text-[#F5ECD9]/30 line-through cursor-not-allowed' : 'hover:bg-white/10'}`}
                                  >
                                    <span className="uppercase">{playerName(p.id)}</span>
                                    <span className="text-xs text-[#F5ECD9]/40 ml-2">({count}/2)</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )}
                      {player1 && fixturesForTeam(players.find(p => p.id === player1)?.team_id ?? null).length >= 2 && (
                        <div className="mt-2 bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-2.5">
                          <p className="text-[10px] uppercase tracking-wider text-yellow-300 font-bold mb-1.5">
                            {playerName(player1)}&apos;s team plays twice this gameweek — which match is this pick for?
                          </p>
                          <div className="flex flex-col gap-1.5">
                            {fixturesForTeam(players.find(p => p.id === player1)?.team_id ?? null).map(f => (
                              <button
                                key={f.id}
                                onClick={() => setPlayer1Fixture(f.id)}
                                className={`text-left px-2.5 py-1.5 rounded text-xs border ${
                                  player1Fixture === f.id
                                    ? 'bg-[#D9A441]/15 border-[#D9A441] text-[#D9A441]'
                                    : 'bg-white/5 border-white/10 hover:border-[#D9A441]/50'
                                }`}
                              >
                                {opponentLabel(f, players.find(p => p.id === player1)?.team_id ?? 0)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block font-bold mb-1.5 uppercase tracking-wider text-xs text-[#F5ECD9]/70">Player 2</label>
                      {player2 ? (
                        <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                          <span className="text-sm uppercase">{playerName(player2)}</span>
                          <button onClick={() => { setPlayer2(null); setPlayer2Fixture(null); setPlayer2Club(null) }} className="text-xs text-red-400">✕</button>
                        </div>
                      ) : (
                        <>
                          <select
                            value={player2Club ?? ''}
                            onChange={e => setPlayer2Club(e.target.value ? Number(e.target.value) : null)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 mb-1.5 text-sm text-[#F5ECD9]"
                          >
                            <option value="" style={{ color: '#241a12' }}>Filter by club...</option>
                            {teams.map(t => (
                              <option key={t.id} value={t.id} style={{ color: '#241a12' }}>{teamDisplayName(t)}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={playerSearch2}
                            onChange={e => setPlayerSearch2(e.target.value)}
                            placeholder={player2Club != null ? 'Narrow down within this club...' : 'Search players...'}
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
                                    onClick={() => { if (!maxed) { setPlayer2(p.id); setPlayer2Fixture(null); setPlayerSearch2(''); setPlayer2Club(null) } }}
                                    disabled={maxed}
                                    className={`block w-full text-left px-3 py-2 text-sm ${maxed ? 'text-[#F5ECD9]/30 line-through cursor-not-allowed' : 'hover:bg-white/10'}`}
                                  >
                                    <span className="uppercase">{playerName(p.id)}</span>
                                    <span className="text-xs text-[#F5ECD9]/40 ml-2">({count}/2)</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )}
                      {player2 && fixturesForTeam(players.find(p => p.id === player2)?.team_id ?? null).length >= 2 && (
                        <div className="mt-2 bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-2.5">
                          <p className="text-[10px] uppercase tracking-wider text-yellow-300 font-bold mb-1.5">
                            {playerName(player2)}&apos;s team plays twice this gameweek — which match is this pick for?
                          </p>
                          <div className="flex flex-col gap-1.5">
                            {fixturesForTeam(players.find(p => p.id === player2)?.team_id ?? null).map(f => (
                              <button
                                key={f.id}
                                onClick={() => setPlayer2Fixture(f.id)}
                                className={`text-left px-2.5 py-1.5 rounded text-xs border ${
                                  player2Fixture === f.id
                                    ? 'bg-[#D9A441]/15 border-[#D9A441] text-[#D9A441]'
                                    : 'bg-white/5 border-white/10 hover:border-[#D9A441]/50'
                                }`}
                              >
                                {opponentLabel(f, players.find(p => p.id === player2)?.team_id ?? 0)}
                              </button>
                            ))}
                          </div>
                        </div>
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
                      {question.question_type === 'freetext' ? (
                        <input
                          type="text"
                          value={questionAnswer}
                          onChange={e => setQuestionAnswer(e.target.value)}
                          placeholder="Type your answer..."
                          maxLength={200}
                          className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-[#F5ECD9] placeholder:text-[#F5ECD9]/40"
                        />
                      ) : (
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
                      )}
                    </div>
                  )}

                  <div className="mb-5">
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-[#D9A441]">Any Other Comments</label>
                    <textarea
                      value={comments}
                      onChange={e => setComments(e.target.value)}
                      placeholder="Anything you want to add — banter, a prediction, whatever..."
                      rows={3}
                      maxLength={500}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F5ECD9] placeholder:text-[#F5ECD9]/30 focus:outline-none focus:border-[#D9A441]/50"
                    />
                  </div>

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
            <div className="bg-white/5 border border-white/10 rounded-lg p-6 mb-6">
              <p className="text-[#F5ECD9]/60 uppercase tracking-wider text-sm font-bold mb-1">No gameweeks currently open for picking</p>
              <p className="text-[#F5ECD9]/40 text-xs">Check back once the next gameweek's deadline has been set.</p>
            </div>
          )}

          <h2 className="text-lg font-bold mt-6 mb-3" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Your Previous Picks</h2>
          <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
            {historyPicks.length === 0 ? (
              <p className="text-[#F5ECD9]/40 text-sm p-4 uppercase tracking-wider">No picks made yet.</p>
            ) : (
              <table className="w-full" style={{ fontSize: '11px' }}>
                <thead>
                  <tr className="text-left border-b border-white/10 uppercase tracking-wider text-[#F5ECD9]/50" style={{ fontSize: '10px' }}>
                    <th className="py-2 px-1.5 sm:px-3">GW</th>
                    <th className="py-2 px-1.5 sm:px-3">Team</th>
                    <th className="py-2 px-1.5 sm:px-3">Players</th>
                    <th className="py-2 px-1.5 sm:px-3 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {historyPicks.map((pick: any) => {
                    const t = getTeam(pick.team_id)
                    return (
                      <tr key={pick.id} className="border-b border-white/5 last:border-0">
                        <td className="py-2 px-1.5 sm:px-3 font-bold">{pick.gameweeks?.number}</td>
                        <td className="py-2 px-1.5 sm:px-3 uppercase">
                          <div className="flex items-center gap-1.5">
                            <TeamCrest crestUrl={t?.crest_url ?? null} teamName={t?.name ?? ''} size={16} />
                            {teamDisplayName(t)}
                            {pick.is_banker && <span className="ml-1 text-[10px] bg-[#D9A441] text-[#241a12] px-1 py-0.5 rounded font-bold">B</span>}
                            {(pick.provisional || pick.is_autopick) && <span className="ml-1 text-[10px] bg-white/20 px-1 py-0.5 rounded" title="No pick was made in time, so the computer picked automatically">AP</span>}
                          </div>
                        </td>
                        <td className="py-2 px-1.5 sm:px-3 text-[#F5ECD9]/50 uppercase" style={{ fontSize: '10px' }}>{playerName(pick.player1_id)} & {playerName(pick.player2_id)}</td>
                        <td className="py-2 px-1.5 sm:px-3 text-right font-bold">{pointsByPick[pick.id] ?? '—'}</td>
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
        <TicketModal
          eyebrow="LMS All-Stars Predictions"
          title="Matchday Ticket"
          subtitle={`Gameweek ${gameweek?.number}`}
          filenameBase={`gameweek-${gameweek?.number}-my-pick`}
          onClose={() => setShowSlip(false)}
        >
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: '#241a1799' }}>Team</span>
              <div className="flex items-center gap-2">
                <TeamCrest crestUrl={getTeam(selectedTeam)?.crest_url ?? null} teamName={getTeam(selectedTeam)?.name ?? ''} size={22} />
                <span className="font-bold uppercase text-sm">{teamDisplayName(getTeam(selectedTeam))}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: '#241a1799' }}>Player 1</span>
              <span className="font-bold uppercase text-sm text-right">
                {playerName(player1)}
                {player1Fixture && (
                  <span className="block font-normal normal-case" style={{ fontSize: '10px', color: '#241a1799' }}>
                    {opponentLabel(fixtures.find(f => f.id === player1Fixture)!, players.find(p => p.id === player1)?.team_id ?? 0)}
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: '#241a1799' }}>Player 2</span>
              <span className="font-bold uppercase text-sm text-right">
                {playerName(player2)}
                {player2Fixture && (
                  <span className="block font-normal normal-case" style={{ fontSize: '10px', color: '#241a1799' }}>
                    {opponentLabel(fixtures.find(f => f.id === player2Fixture)!, players.find(p => p.id === player2)?.team_id ?? 0)}
                  </span>
                )}
              </span>
            </div>
            {isBanker && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] uppercase tracking-widest" style={{ color: '#241a1799' }}>Banker</span>
                <span className="font-bold uppercase text-sm px-2 py-0.5 rounded" style={{ backgroundColor: '#D9A441', color: '#241a12' }}>★ Declared</span>
              </div>
            )}
            {question && questionAnswer && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-[10px] uppercase tracking-widest shrink-0" style={{ color: '#241a1799' }}>Your Answer</span>
                <span className="font-bold uppercase text-sm text-right">{questionAnswerLabel}</span>
              </div>
            )}
            {comments.trim() && (
              <div className="pt-1">
                <span className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: '#241a1799' }}>Your Comments</span>
                <span className="text-sm block">{comments.trim()}</span>
              </div>
            )}
          </div>

          <div className="px-5 py-3 text-center border-t-2 border-dashed" style={{ borderColor: '#241a1733' }}>
            <p className="text-[10px] uppercase tracking-widest mb-0.5 mt-2" style={{ color: '#241a1799' }}>Kick-off Deadline</p>
            <p className="font-bold text-sm">{gameweek ? new Date(gameweek.deadline).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : ''}</p>
          </div>
        </TicketModal>
      )}
      </Shell>
    </>
  )
}