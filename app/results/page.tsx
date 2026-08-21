'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import TeamCrest from '../../components/TeamCrest'
import KitBadge from '../../components/KitBadge'
import BotAvatar from '../../components/BotAvatar'
import { buildPlayerDisplayNames, bonusCardDisplayName } from '../lib/players'
import GameweekRecapCard from '../../components/GameweekRecapCard'
import PopArtLoading from '../../components/PopArtLoading'
import { usePopArtTheme } from '../lib/usePopArtTheme'
import { CrownIcon, CheckIcon, CrossIcon, BoltIcon } from '../../components/icons'

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
  question_answer?: string | null
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

type Team = { id: number; name: string; short_name: string | null; short_code: string | null }

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
  // All or Nothing nominations for the selected gameweek, keyed by user —
  // only ever fetched below the same "deadline passed" gate as picks
  // themselves, same hidden-until-deadline rule.
  const [aonByUser, setAonByUser] = useState<Record<string, { player_id: number; outcome: string }>>({})
  // Bonus Card plays for the selected gameweek, keyed by user — same
  // "deadline passed" gate as everything else on this page.
  const [bonusCardByUser, setBonusCardByUser] = useState<Record<string, { player_id: number; points: number | null }>>({})
  const [bonusCardName, setBonusCardName] = useState<string | null>(null)
  const [matchEvents, setMatchEvents] = useState<MatchEvent[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [isBotByUser, setIsBotByUser] = useState<Record<string, boolean>>({})
  // Users removed from the competition — their historical picks/comments
  // must never resurface anywhere, even after their deadline has passed.
  const [activeUserIds, setActiveUserIds] = useState<Set<string>>(new Set())
  const [kitByUser, setKitByUser] = useState<Record<string, { pattern: string; colour1: string; colour2: string; colour3: string | null; stars: number; earths: number }>>({})
  const [teams, setTeams] = useState<Record<number, Team>>({})
  const [players, setPlayers] = useState<Record<number, string>>({})
  const [potwUserId, setPotwUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingPicks, setLoadingPicks] = useState(false)
  const [showRecap, setShowRecap] = useState(false)
  const [fixtures, setFixtures] = useState<FixtureRow[]>([])
  const [expandedFixture, setExpandedFixture] = useState<number | null>(null)
  const [question, setQuestion] = useState<Question | null>(null)

  const supabase = createClient()
  const { popArt } = usePopArtTheme(user?.id)

  useEffect(() => { loadBase() }, [])
  useEffect(() => { if (selectedGw) loadPicksForGw(selectedGw) }, [selectedGw])

  async function loadBase() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    setUser(user)

    if (user) {
      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
      setDisplayName(profile?.display_name ?? '')
    }

    const { data: comp } = await supabase
      .from('competitions')
      .select('id, name, bonus_card_enabled, bonus_card_player_id, bonus_card_name')
      .eq('status', 'active')
      .single()

    if (!comp) { setLoading(false); return }
    setCompetition(comp)

    const [{ data: gws }, { data: profilesData }, { data: teamsData }, { data: playersData }, { data: entries }] = await Promise.all([
      // All gameweeks, not just ones whose deadline has passed — future
      // gameweeks are still selectable here so their fixtures/schedule are
      // browsable ahead of time; loadPicksForGw is what actually keeps any
      // picks data from ever being fetched for one that isn't due yet.
      supabase.from('gameweeks').select('id, number, deadline, status').eq('competition_id', comp.id).order('number', { ascending: true }),
      supabase.from('profiles').select('id, display_name, kit_pattern, kit_colour_1, kit_colour_2'),
      supabase.from('teams').select('id, name, short_name, short_code'),
      supabase.from('players').select('id, name, web_name, team_id'),
      // Removed entrants must never resurface here — their historical picks
      // stay in the database but shouldn't be shown once they're gone.
      supabase.from('competition_entries').select('user_id').eq('competition_id', comp.id).eq('removed', false),
    ])
    const activeIds = new Set((entries ?? []).map(e => e.user_id))
    setActiveUserIds(activeIds)

    // Kept as its own request, deliberately separate from the profiles query
    // above: if these columns ever have a problem, it should only affect kit
    // badges, never take down display names with it.
    const { data: kitExtras } = await supabase.from('profiles').select('id, kit_stars, kit_earths')
    const kitExtrasMap: Record<string, { stars: number; earths: number }> = {}
    kitExtras?.forEach(k => { kitExtrasMap[k.id] = { stars: k.kit_stars ?? 0, earths: k.kit_earths ?? 0 } })

    // Also its own request, same reason — the trim colour is a newer,
    // optional column, and this must never be able to take display names
    // or the rest of the kit badge down with it if it's missing.
    const { data: kitTrims } = await supabase.from('profiles').select('id, kit_colour_3')
    const kitTrimMap: Record<string, string | null> = {}
    kitTrims?.forEach(k => { kitTrimMap[k.id] = k.kit_colour_3 ?? null })

    // Also its own request, same reason — is_bot is a newer, optional
    // column (Futzy), and this must never be able to take display names
    // down with it if it's missing.
    const { data: botFlags } = await supabase.from('profiles').select('id, is_bot')
    const isBotMap: Record<string, boolean> = {}
    botFlags?.forEach(b => { isBotMap[b.id] = b.is_bot ?? false })

    const profileMap: Record<string, string> = {}
    const kitMap: Record<string, { pattern: string; colour1: string; colour2: string; colour3: string | null; stars: number; earths: number }> = {}
    profilesData?.forEach(p => {
      profileMap[p.id] = p.display_name ?? 'Unknown'
      kitMap[p.id] = {
        pattern: p.kit_pattern ?? 'solid',
        colour1: p.kit_colour_1 ?? '#1E4D6B',
        colour2: p.kit_colour_2 ?? '#F5ECD9',
        colour3: kitTrimMap[p.id] ?? null,
        stars: kitExtrasMap[p.id]?.stars ?? 0,
        earths: kitExtrasMap[p.id]?.earths ?? 0
      }
    })

    const teamMap: Record<number, Team> = {}
    teamsData?.forEach(t => { teamMap[t.id] = t })

    const playerMap = buildPlayerDisplayNames(playersData ?? [], teamMap)

    setProfiles(profileMap)
    setIsBotByUser(isBotMap)
    setKitByUser(kitMap)
    setTeams(teamMap)
    setPlayers(playerMap)
    setBonusCardName(bonusCardDisplayName(comp.bonus_card_name, comp.bonus_card_player_id != null ? playerMap[comp.bonus_card_player_id] : null))
    setGameweeks(gws ?? [])

    if (gws && gws.length > 0) {
      // Default to the most recent gameweek whose deadline has already
      // passed (what you actually want to see on this page most often) —
      // not simply the last one in the list, now that future gameweeks
      // are included too. Falls back to the earliest upcoming one if none
      // have passed yet (e.g. right at the start of a season).
      const now = new Date()
      const pastDue = gws.filter(g => new Date(g.deadline) <= now)
      const defaultGw = pastDue.length > 0 ? pastDue[pastDue.length - 1] : gws[0]
      setSelectedGw(defaultGw.id)
    }

    const { data: allPoints } = await supabase
      .from('points')
      .select('user_id, pick_id, total_points, gameweek_id')
      .eq('competition_id', comp.id)

    // Futzy can top a gameweek like anyone else, but he can't be crowned —
    // exclude bot rows before finding the leader. Also exclude anyone since
    // removed from the competition, same reasoning as everywhere else here.
    const humanPoints = allPoints?.filter(p => !isBotMap[p.user_id] && activeIds.has(p.user_id)) ?? []
    if (humanPoints.length > 0) {
      const maxPts = Math.max(...humanPoints.map(p => p.total_points ?? 0))
      const topScorer = humanPoints.filter(p => (p.total_points ?? 0) === maxPts)[0]
      if (topScorer) setPotwUserId(topScorer.user_id)
    }

    setLoading(false)
  }

  async function loadPicksForGw(gwId: string) {
    setLoadingPicks(true)
    const gw = gameweeks.find(g => g.id === gwId)

    // A gameweek that isn't due yet: only ever fetch its fixtures (public
    // schedule info) — never picks, points, previews or the weekly question,
    // no matter what. This is the one thing that must never leak early.
    if (gw && new Date() < new Date(gw.deadline)) {
      const { data: fixturesData } = await supabase
        .from('fixtures')
        .select('id, home_team_id, away_team_id, kickoff_time, status, home_score, away_score')
        .eq('gameweek_id', gwId)
        .order('kickoff_time')
      setFixtures(fixturesData ?? [])
      setExpandedFixture(null)
      setPicks([])
      setPointsData([])
      setMatchEvents([])
      setQuestion(null)
      setAonByUser({})
      setLoadingPicks(false)
      return
    }

    const [{ data: picksData }, { data: pts }, { data: fixturesData }, { data: questionData }, previewRes] = await Promise.all([
      supabase.from('picks').select('id, user_id, team_id, player1_id, player2_id, is_banker, is_autopick, submitted_at, question_answer').eq('gameweek_id', gwId),
      supabase.from('points').select('pick_id, total_points, team_points, player1_points, player2_points, breakdown').eq('gameweek_id', gwId),
      supabase.from('fixtures').select('id, home_team_id, away_team_id, kickoff_time, status, home_score, away_score').eq('gameweek_id', gwId).order('kickoff_time'),
      supabase.from('gameweek_questions').select('*').eq('gameweek_id', gwId).single(),
      fetch(`/api/autopick/preview?gameweek_id=${gwId}`)
    ])

    setQuestion(questionData ?? null)

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

    const realPicks = (picksData ?? []).filter(p => activeUserIds.has(p.user_id))
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

    // Its own isolated query, same reasoning as everywhere else on this
    // page — a problem here should never take the rest of Results down.
    const { data: aonRows } = await supabase
      .from('all_or_nothing_picks')
      .select('user_id, player_id, outcome')
      .eq('gameweek_id', gwId)
    const aonMap: Record<string, { player_id: number; outcome: string }> = {}
    aonRows?.forEach(a => { aonMap[a.user_id] = { player_id: a.player_id, outcome: a.outcome } })
    setAonByUser(aonMap)

    const { data: bonusCardRows } = await supabase
      .from('bonus_card_plays')
      .select('user_id, player_id, points')
      .eq('gameweek_id', gwId)
    const bonusCardMap: Record<string, { player_id: number; points: number | null }> = {}
    bonusCardRows?.forEach(b => { bonusCardMap[b.user_id] = { player_id: b.player_id, points: b.points } })
    setBonusCardByUser(bonusCardMap)

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
  const isFutureGw = !!selectedGameweek && new Date() < new Date(selectedGameweek.deadline)

  const pointsMap: Record<string, PointsRow> = {}
  pointsData.forEach(p => { pointsMap[p.pick_id] = p })

  const goalPlayers = new Set(matchEvents.filter(e => e.event_type === 'goal').map(e => e.player_id))
  const assistPlayers = new Set(matchEvents.filter(e => e.event_type === 'assist').map(e => e.player_id))

  const sortedPicks = [...picks].sort((a, b) => {
    const apts = pointsMap[a.id]?.total_points ?? 0
    const bpts = pointsMap[b.id]?.total_points ?? 0
    return bpts - apts
  })

  // Same "can't be crowned" rule as the season leader — GW Winner must be
  // the top-scoring human, not simply whoever tops the sorted list.
  const gwPotwUserId = isScored ? (sortedPicks.find(p => !isBotByUser[p.user_id])?.user_id ?? null) : null

  // Autopicked/provisional entries never have a question_answer, so they're
  // naturally excluded here — the poll only reflects people who actually
  // answered, same as the per-row "Answer" column being left blank for them.
  const questionOptions = question
    ? ([
        ['A', question.option_a],
        ['B', question.option_b],
        ['C', question.option_c],
        ['D', question.option_d],
      ] as const).filter(([, label]) => !!label)
    : []
  const questionTally = questionOptions.map(([letter, label]) => ({
    letter,
    label,
    count: sortedPicks.filter(p => p.question_answer === letter).length,
  }))

  // A percentage-bar poll doesn't mean anything for freetext — answers are
  // rarely identical — so this is a plain "who said what" list instead.
  const freetextAnswers = question?.question_type === 'freetext'
    ? sortedPicks
        .filter(p => p.question_answer)
        .map(p => ({ name: profiles[p.user_id] ?? 'Unknown', answer: p.question_answer as string }))
    : []

  const recapWinner = showScoring && sortedPicks[0]
    ? { name: profiles[sortedPicks[0].user_id] ?? 'Unknown', points: pointsMap[sortedPicks[0].id]?.total_points ?? 0 }
    : null
  const recapRunnerUp = showScoring && sortedPicks[1]
    ? { name: profiles[sortedPicks[1].user_id] ?? 'Unknown', points: pointsMap[sortedPicks[1].id]?.total_points ?? 0 }
    : null
  const recapTotalPoints = showScoring
    ? sortedPicks.reduce((sum, p) => sum + (pointsMap[p.id]?.total_points ?? 0), 0)
    : 0
  const recapBestResult = showScoring
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
  const recapFullScores = showScoring
    ? sortedPicks.map(p => ({ name: profiles[p.user_id] ?? 'Unknown', points: pointsMap[p.id]?.total_points ?? 0 }))
    : []

  if (loading) {
    return (
      <Shell active="RESULTS" theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? <PopArtLoading /> : <p className="text-gray-500">Loading...</p>}
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="RESULTS" theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? (
          <div className="pop-art-theme text-center py-12">
            <p className="pop-headline text-2xl mb-2">No Active Competition</p>
            <p style={{ color: 'rgba(255,255,255,0.5)' }}>There is no active competition right now.</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2">No Active Competition</h1>
            <p className="text-gray-500">There is no active competition right now.</p>
          </>
        )}
      </Shell>
    )
  }

  if (popArt) {
    return (
      <Shell active="RESULTS" user={user} displayName={displayName} theme="pop-art">
        <div className="pop-art-theme">

          <h1 className="pop-hero pop-hero--blue text-5xl sm:text-6xl mb-1 mt-2">Results</h1>
          <p className="font-bold text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>{competition.name}</p>

          {potwUserId && (
            <div className="pop-panel pop-panel--yellow p-4 mb-5 flex items-center gap-3">
              <CrownIcon size={26} />
              <div>
                <p className="pop-headline text-xs" style={{ color: 'var(--pop-yellow)' }}>Season Leader</p>
                <p className="font-black uppercase">{profiles[potwUserId] ?? 'Unknown'}</p>
              </div>
            </div>
          )}

          {gameweeks.length === 0 ? (
            <div className="pop-panel p-6">
              <p className="text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>First results land once GW1&apos;s deadline passes.</p>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <select
                  value={selectedGw ?? ''}
                  onChange={e => setSelectedGw(e.target.value)}
                  className="pop-input px-3 py-2 text-sm font-bold w-full md:w-auto uppercase"
                >
                  {gameweeks.map(gw => (
                    <option key={gw.id} value={gw.id}>
                      Gameweek {gw.number} — {
                        gw.status === 'completed' ? 'Scored'
                        : new Date() < new Date(gw.deadline) ? 'Upcoming'
                        : 'Awaiting scoring'
                      }
                    </option>
                  ))}
                </select>
              </div>

              {selectedGameweek && (
                <div className="mb-4 flex items-center gap-3 flex-wrap">
                  <h2 className="pop-headline text-lg">Gameweek {selectedGameweek.number}</h2>
                  <span
                    className={`pop-badge px-2 py-0.5 text-xs ${
                      isScored ? 'pop-badge--green'
                      : isFutureGw ? ''
                      : 'pop-badge--yellow'
                    }`}
                    style={isFutureGw ? { background: 'rgba(255,255,255,0.15)', color: 'var(--pop-white)' } : undefined}
                  >
                    {isScored ? 'Scored' : isFutureGw ? 'Upcoming' : 'Awaiting scoring'}
                  </span>
                  {isLocked && (
                    <span
                      className="pop-badge px-2 py-0.5 text-xs"
                      style={{ background: 'rgba(255,255,255,0.15)', color: 'var(--pop-white)' }}
                      title="Deadline's passed so this is calculated from current results and quartiles, but it's not official until the gameweek is marked completed — it can still change"
                    >
                      Live preview — not final
                    </span>
                  )}
                  {isScored && gwPotwUserId && (
                    <span className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--pop-yellow)' }}>
                      GW Winner: {profiles[gwPotwUserId]}
                    </span>
                  )}
                  {showScoring && (
                    <button
                      onClick={() => setShowRecap(true)}
                      className="pop-button pop-button--yellow px-3 py-1.5 text-xs ml-auto"
                    >
                      Share Recap
                    </button>
                  )}
                </div>
              )}

              {fixtures.length > 0 && (
                <div className="pop-panel mb-4" style={{ overflow: 'hidden' }}>
                  <div className="px-3 py-2 font-black uppercase tracking-wider" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                    Fixtures &amp; Match Events
                  </div>
                  <div>
                    {fixtures.map(f => {
                      const isExpanded = expandedFixture === f.id
                      const fixtureEvents = matchEvents.filter(e => e.fixture_id === f.id)
                      const goals = fixtureEvents.filter(e => e.event_type === 'goal')
                      const assists = fixtureEvents.filter(e => e.event_type === 'assist')
                      const ownGoals = fixtureEvents.filter(e => e.event_type === 'own_goal')
                      const played = f.home_score != null && f.away_score != null

                      return (
                        <div key={f.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <button
                            onClick={() => setExpandedFixture(isExpanded ? null : f.id)}
                            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/[0.04] transition-colors"
                          >
                            <div className="flex items-center gap-1.5 text-xs uppercase flex-wrap min-w-0">
                              <TeamCrest teamId={f.home_team_id} teamName={teams[f.home_team_id]?.name ?? ''} size={16} />
                              <span className="font-black">{teamDisplayName(teams[f.home_team_id])}</span>
                              {played ? (
                                <span
                                  className="font-mono font-bold shrink-0 rounded"
                                  style={{ color: 'var(--pop-white)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', padding: '2px 8px', fontVariantNumeric: 'tabular-nums' }}
                                >
                                  {f.home_score} – {f.away_score}
                                </span>
                              ) : (
                                <span className="font-black shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>vs</span>
                              )}
                              <span className="font-black">{teamDisplayName(teams[f.away_team_id])}</span>
                              <TeamCrest teamId={f.away_team_id} teamName={teams[f.away_team_id]?.name ?? ''} size={16} />
                              {!played && <span className="normal-case shrink-0" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>Not played yet</span>}
                            </div>
                            <span className="text-xs shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>{isExpanded ? '▲' : '▼'}</span>
                          </button>
                          {isExpanded && (
                            <div className="px-3 pb-3 text-xs space-y-1">
                              {fixtureEvents.length === 0 ? (
                                <p style={{ color: 'rgba(255,255,255,0.4)' }}>No goals or assists recorded yet.</p>
                              ) : (
                                <>
                                  {goals.map((e, i) => (
                                    <div key={`g${i}`} className="flex items-center gap-1.5">
                                      <span className="px-1 rounded font-black" style={{ fontSize: '9px', background: 'var(--pop-green)', color: 'var(--pop-black)' }}>G</span>
                                      <span className="uppercase">{players[e.player_id] ?? 'Unknown'}</span>
                                      {e.minute != null && <span style={{ color: 'rgba(255,255,255,0.4)' }}>{e.minute}&apos;</span>}
                                    </div>
                                  ))}
                                  {assists.map((e, i) => (
                                    <div key={`a${i}`} className="flex items-center gap-1.5">
                                      <span className="px-1 rounded font-black" style={{ fontSize: '9px', background: 'rgba(204,250,0,0.25)', color: 'var(--pop-green)' }}>A</span>
                                      <span className="uppercase">{players[e.player_id] ?? 'Unknown'}</span>
                                      {e.minute != null && <span style={{ color: 'rgba(255,255,255,0.4)' }}>{e.minute}&apos;</span>}
                                    </div>
                                  ))}
                                  {ownGoals.map((e, i) => (
                                    <div key={`og${i}`} className="flex items-center gap-1.5">
                                      <span className="px-1 rounded font-black" style={{ fontSize: '9px', background: 'var(--pop-red)', color: 'var(--pop-white)' }}>OG</span>
                                      <span className="uppercase">{players[e.player_id] ?? 'Unknown'}</span>
                                      {e.minute != null && <span style={{ color: 'rgba(255,255,255,0.4)' }}>{e.minute}&apos;</span>}
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

              {question && questionTally.length > 0 && (
                <div className="pop-panel p-3 mb-4">
                  <p className="font-black uppercase tracking-wider mb-2" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{question.question}</p>
                  <div className="space-y-1.5">
                    {(() => {
                      const totalAnswered = questionTally.reduce((sum, t) => sum + t.count, 0)
                      return questionTally.map(t => {
                        const pct = totalAnswered > 0 ? Math.round((t.count / totalAnswered) * 100) : 0
                        return (
                          <div key={t.letter}>
                            <div className="flex items-center justify-between text-xs mb-0.5">
                              <span className="uppercase" style={{ color: 'rgba(255,255,255,0.8)' }}>{t.label}</span>
                              <span style={{ color: 'rgba(255,255,255,0.5)' }}>{t.count}</span>
                            </div>
                            <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--pop-orange)' }} />
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>
              )}

              {question && question.question_type === 'freetext' && freetextAnswers.length > 0 && (
                <div className="pop-panel p-3 mb-4">
                  <p className="font-black uppercase tracking-wider mb-2" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{question.question}</p>
                  <div className="space-y-1 text-xs">
                    {freetextAnswers.map((a, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="font-black uppercase" style={{ color: 'rgba(255,255,255,0.7)' }}>{a.name}:</span>
                        <span className="break-words" style={{ color: 'rgba(255,255,255,0.9)' }}>{a.answer}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loadingPicks ? (
                <p className="text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Loading picks...</p>
              ) : isFutureGw ? (
                <div className="pop-panel p-6">
                  <p className="text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    This gameweek hasn&apos;t reached its deadline yet — picks stay hidden until then. Check the fixtures above for the schedule.
                  </p>
                </div>
              ) : sortedPicks.length === 0 ? (
                <div className="pop-panel p-6">
                  <p className="text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Nobody picked for this one yet.</p>
                </div>
              ) : (
                <div className="pop-panel mb-3" style={{ overflow: 'hidden' }}>
                  {sortedPicks.map((pick) => {
                    const pts = pointsMap[pick.id]
                    const isWinner = isScored && pick.user_id === gwPotwUserId
                    const isOwnPick = pick.user_id === user?.id
                    const t = teams[pick.team_id]
                    const answerLabel = pick.question_answer
                      ? questionOptions.find(([letter]) => letter === pick.question_answer)?.[1] ?? pick.question_answer
                      : null
                    const aon = aonByUser[pick.user_id]
                    const aonStyle = aon?.outcome === 'success'
                      ? { background: 'var(--pop-green)', color: 'var(--pop-black)' }
                      : aon?.outcome === 'failed'
                      ? { background: 'var(--pop-red)', color: 'var(--pop-white)' }
                      : { background: 'var(--pop-pink)', color: 'var(--pop-white)' }
                    const aonIcon = aon?.outcome === 'success'
                      ? <CheckIcon size={9} color="var(--pop-black)" />
                      : aon?.outcome === 'failed'
                      ? <CrossIcon size={9} color="var(--pop-white)" />
                      : <BoltIcon size={9} color="var(--pop-white)" />
                    const bonusCardPlay = bonusCardByUser[pick.user_id]

                    return (
                      <div
                        key={pick.id}
                        className="p-2.5"
                        style={{ fontSize: '11px', borderTop: '1px solid rgba(255,255,255,0.06)', background: isWinner ? 'rgba(125,55,165,0.06)' : isOwnPick ? 'rgba(255,255,255,0.04)' : undefined }}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                          <div className="flex items-center gap-1.5 font-black uppercase min-w-0">
                            {isBotByUser[pick.user_id] ? <BotAvatar size={14} /> : (
                              <KitBadge
                                pattern={kitByUser[pick.user_id]?.pattern ?? 'solid'}
                                colour1={kitByUser[pick.user_id]?.colour1 ?? '#1E4D6B'}
                                colour2={kitByUser[pick.user_id]?.colour2 ?? '#F5ECD9'}
                                colour3={kitByUser[pick.user_id]?.colour3}
                                size={14}
                              />
                            )}
                            <span className="truncate">{profiles[pick.user_id] ?? 'Unknown'}</span>
                            {isOwnPick && <span className="pop-badge pop-badge--pink px-1.5 py-0.5 text-[8px] shrink-0">You</span>}
                            {(pick.provisional || pick.is_autopick) && (
                              <span className="px-1 rounded shrink-0" style={{ fontSize: '9px', background: 'rgba(255,255,255,0.15)' }} title="No pick was made in time, so the computer picked automatically">AP</span>
                            )}
                          </div>
                          {showScoring && (
                            <span className="font-black font-mono shrink-0" style={{ color: 'var(--pop-green)', fontVariantNumeric: 'tabular-nums' }}>{pts?.total_points ?? '—'} pts</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 uppercase flex-wrap">
                          <TeamCrest teamId={t?.id ?? null} teamName={t?.name ?? ''} size={15} />
                          <span>{teamDisplayName(t)}</span>
                          {pick.is_banker && <span className="font-black px-1 rounded" style={{ fontSize: '9px', background: 'var(--pop-yellow)', color: 'var(--pop-white)' }}>★ BANKER</span>}
                          {showScoring && <span className="ml-auto font-mono" style={{ color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>{pts?.team_points ?? '—'} pts</span>}
                        </div>
                        {showScoring && pts?.breakdown?.team_detail?.opponent_team_id != null && (
                          <div className="normal-case mt-0.5" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
                            <span
                              className="inline-block px-1 rounded font-black mr-1"
                              style={pts.breakdown.team_detail.is_home
                                ? { background: 'rgba(0,242,250,0.2)', color: 'var(--pop-blue)' }
                                : { background: 'rgba(250,97,0,0.2)', color: 'var(--pop-orange)' }}
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

                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 uppercase">
                          <span>
                            {players[pick.player1_id] ?? 'Unknown'}
                            {goalPlayers.has(pick.player1_id) && <span className="ml-0.5 px-0.5 rounded font-black" style={{ fontSize: '9px', background: 'var(--pop-green)', color: 'var(--pop-black)' }}>G</span>}
                            {assistPlayers.has(pick.player1_id) && <span className="ml-0.5 px-0.5 rounded font-black" style={{ fontSize: '9px', background: 'rgba(204,250,0,0.25)', color: 'var(--pop-green)' }}>A</span>}
                            {aon?.player_id === pick.player1_id && <span className="ml-0.5 px-1 rounded font-black inline-flex items-center gap-0.5" style={{ fontSize: '9px', ...aonStyle }}>{aonIcon} AoN</span>}
                            {showScoring && <span className="normal-case ml-1 font-mono" style={{ color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>({pts?.player1_points ?? '—'} pts)</span>}
                          </span>
                          <span>
                            {players[pick.player2_id] ?? 'Unknown'}
                            {goalPlayers.has(pick.player2_id) && <span className="ml-0.5 px-0.5 rounded font-black" style={{ fontSize: '9px', background: 'var(--pop-green)', color: 'var(--pop-black)' }}>G</span>}
                            {assistPlayers.has(pick.player2_id) && <span className="ml-0.5 px-0.5 rounded font-black" style={{ fontSize: '9px', background: 'rgba(204,250,0,0.25)', color: 'var(--pop-green)' }}>A</span>}
                            {aon?.player_id === pick.player2_id && <span className="ml-0.5 px-1 rounded font-black inline-flex items-center gap-0.5" style={{ fontSize: '9px', ...aonStyle }}>{aonIcon} AoN</span>}
                            {showScoring && <span className="normal-case ml-1 font-mono" style={{ color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>({pts?.player2_points ?? '—'} pts)</span>}
                          </span>
                        </div>

                        {bonusCardPlay && (
                          <div className="mt-1.5">
                            <span className="pop-badge pop-badge--blue px-1.5 py-0.5 text-[9px] inline-flex items-center gap-1">
                              {bonusCardName}: {players[bonusCardPlay.player_id] ?? 'Unknown'}
                              {showScoring && bonusCardPlay.points != null && <span className="font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>+{bonusCardPlay.points} pts</span>}
                            </span>
                          </div>
                        )}

                        {question && (
                          <div className="normal-case mt-1.5" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
                            <span className="uppercase tracking-wider font-black">Answer:</span> {answerLabel ?? '—'}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <div className="px-3 py-2 uppercase tracking-wider" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                    <span className="font-black mr-2">Key:</span>
                    <span className="px-0.5 rounded font-black" style={{ background: 'var(--pop-green)', color: 'var(--pop-black)' }}>G</span> Goal
                    <span className="mx-2">·</span>
                    <span className="px-0.5 rounded font-black" style={{ background: 'rgba(204,250,0,0.25)', color: 'var(--pop-green)' }}>A</span> Assist
                    <span className="mx-2">·</span>
                    <span className="px-0.5 rounded font-black" style={{ background: 'var(--pop-yellow)', color: 'var(--pop-white)' }}>★B</span> Banker
                    <span className="mx-2">·</span>
                    <span className="px-0.5 rounded font-black" style={{ background: 'rgba(0,242,250,0.2)', color: 'var(--pop-blue)' }}>H</span>/<span className="px-0.5 rounded font-black" style={{ background: 'rgba(250,97,0,0.2)', color: 'var(--pop-orange)' }}>A</span> Home/Away
                    <span className="mx-2">·</span>
                    <span className="px-0.5 rounded" style={{ background: 'rgba(255,255,255,0.15)' }}>AP</span> Autopick — computer picked it (deadline passed, no pick made)
                    <span className="mx-2">·</span>
                    <span className="px-1 rounded font-black inline-flex items-center gap-0.5" style={{ background: 'var(--pop-pink)', color: 'var(--pop-white)' }}><BoltIcon size={9} color="var(--pop-white)" /> AoN</span> All or Nothing played, result pending
                    <span className="mx-2">·</span>
                    <span className="px-1 rounded font-black inline-flex items-center gap-0.5" style={{ background: 'var(--pop-green)', color: 'var(--pop-black)' }}><CheckIcon size={9} color="var(--pop-black)" /> AoN</span> succeeded
                    <span className="mx-2">·</span>
                    <span className="px-1 rounded font-black inline-flex items-center gap-0.5" style={{ background: 'var(--pop-red)', color: 'var(--pop-white)' }}><CrossIcon size={9} color="var(--pop-white)" /> AoN</span> failed
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {showRecap && selectedGameweek && (
          <GameweekRecapCard
            competitionName={competition.name}
            gameweekNumber={selectedGameweek.number}
            winner={recapWinner}
            runnerUp={recapRunnerUp}
            totalPoints={recapTotalPoints}
            bestResult={recapBestResultData}
            fullScores={recapFullScores}
            isFinal={isScored}
            questionText={question?.question ?? null}
            questionPoll={questionTally.map(t => ({ label: t.label as string, count: t.count }))}
            onClose={() => setShowRecap(false)}
          />
        )}
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
                      Gameweek {gw.number} — {
                        gw.status === 'completed' ? 'Scored'
                        : new Date() < new Date(gw.deadline) ? 'Upcoming'
                        : 'Awaiting scoring'
                      }
                    </option>
                  ))}
                </select>
              </div>

              {selectedGameweek && (
                <div className="mb-4 flex items-center gap-3 flex-wrap">
                  <h2 className="text-lg font-bold uppercase" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Gameweek {selectedGameweek.number}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wider border ${
                    isScored ? 'bg-green-500/20 text-green-300 border-green-400/40'
                    : isFutureGw ? 'bg-white/10 text-[#F5ECD9]/60 border-white/20'
                    : 'bg-yellow-500/20 text-yellow-300 border-yellow-400/40'
                  }`}>
                    {isScored ? 'Scored' : isFutureGw ? 'Upcoming' : 'Awaiting scoring'}
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
                  {showScoring && (
                    <button
                      onClick={() => setShowRecap(true)}
                      className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded border border-[#D9A441]/50 text-[#D9A441] hover:bg-[#D9A441]/10 transition-colors ml-auto"
                    >
                      📱 Share Recap
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
                            <div className="flex items-center gap-1.5 text-xs uppercase flex-wrap min-w-0">
                              <TeamCrest teamId={f.home_team_id} teamName={teams[f.home_team_id]?.name ?? ''} size={16} />
                              <span className="font-bold">{teamDisplayName(teams[f.home_team_id])}</span>
                              <span className="text-[#F5ECD9]/40 font-bold shrink-0">
                                {played ? `${f.home_score} - ${f.away_score}` : 'vs'}
                              </span>
                              <span className="font-bold">{teamDisplayName(teams[f.away_team_id])}</span>
                              <TeamCrest teamId={f.away_team_id} teamName={teams[f.away_team_id]?.name ?? ''} size={16} />
                              {!played && <span className="text-[#F5ECD9]/30 normal-case shrink-0" style={{ fontSize: '9px' }}>Not played yet</span>}
                            </div>
                            <span className="text-[#F5ECD9]/30 text-xs shrink-0">{isExpanded ? '▲' : '▼'}</span>
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

              {question && questionTally.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-4">
                  <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold mb-2">{question.question}</p>
                  <div className="space-y-1.5">
                    {(() => {
                      const totalAnswered = questionTally.reduce((sum, t) => sum + t.count, 0)
                      return questionTally.map(t => {
                        const pct = totalAnswered > 0 ? Math.round((t.count / totalAnswered) * 100) : 0
                        return (
                          <div key={t.letter}>
                            <div className="flex items-center justify-between text-xs mb-0.5">
                              <span className="uppercase text-[#F5ECD9]/80">{t.label}</span>
                              <span className="text-[#F5ECD9]/50">{t.count}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: '#D9A441' }} />
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>
              )}

              {question && question.question_type === 'freetext' && freetextAnswers.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-4">
                  <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold mb-2">{question.question}</p>
                  <div className="space-y-1 text-xs">
                    {freetextAnswers.map((a, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="font-bold uppercase text-[#F5ECD9]/70">{a.name}:</span>
                        <span className="text-[#F5ECD9]/90 break-words">{a.answer}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loadingPicks ? (
                <p className="text-[#F5ECD9]/50 text-sm uppercase tracking-wider">Loading picks...</p>
              ) : isFutureGw ? (
                <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                  <p className="text-[#F5ECD9]/50 text-sm uppercase tracking-wider">
                    This gameweek hasn&apos;t reached its deadline yet — picks stay hidden until then. Check the fixtures above for the schedule.
                  </p>
                </div>
              ) : sortedPicks.length === 0 ? (
                <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                  <p className="text-[#F5ECD9]/50 text-sm uppercase tracking-wider">No picks for this gameweek.</p>
                </div>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden mb-3 divide-y divide-white/5">
                  {sortedPicks.map((pick) => {
                    const pts = pointsMap[pick.id]
                    const isWinner = isScored && pick.user_id === gwPotwUserId
                    const t = teams[pick.team_id]
                    const answerLabel = pick.question_answer
                      ? questionOptions.find(([letter]) => letter === pick.question_answer)?.[1] ?? pick.question_answer
                      : null
                    const aon = aonByUser[pick.user_id]
                    const aonClass = aon?.outcome === 'success'
                      ? 'bg-green-600 text-white'
                      : aon?.outcome === 'failed'
                      ? 'bg-red-600 text-white'
                      : 'bg-[#D9A441] text-[#241a12]'
                    const aonLabel = aon?.outcome === 'success' ? '✓ AoN' : aon?.outcome === 'failed' ? '✕ AoN' : '⚡ AoN'

                    return (
                      <div key={pick.id} className={`p-2.5 ${isWinner ? 'bg-[#D9A441]/10' : ''}`} style={{ fontSize: '11px' }}>
                        {/* Player + total: everything wraps, nothing is ever clipped or needs side-scrolling */}
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                          <div className="flex items-center gap-1.5 font-bold uppercase min-w-0">
                            {isBotByUser[pick.user_id] ? <BotAvatar size={14} /> : (
                              <KitBadge
                                pattern={kitByUser[pick.user_id]?.pattern ?? 'solid'}
                                colour1={kitByUser[pick.user_id]?.colour1 ?? '#1E4D6B'}
                                colour2={kitByUser[pick.user_id]?.colour2 ?? '#F5ECD9'}
                                colour3={kitByUser[pick.user_id]?.colour3}
                                size={14}
                              />
                            )}
                            <span className="truncate">{profiles[pick.user_id] ?? 'Unknown'}</span>
                            {(pick.provisional || pick.is_autopick) && (
                              <span className="bg-white/20 px-1 rounded shrink-0" style={{ fontSize: '9px' }} title="No pick was made in time, so the computer picked automatically">AP</span>
                            )}
                          </div>
                          {showScoring && (
                            <span className="font-bold shrink-0" style={{ color: '#D9A441' }}>{pts?.total_points ?? '—'} pts</span>
                          )}
                        </div>

                        {/* Team */}
                        <div className="flex items-center gap-1 uppercase flex-wrap">
                          <TeamCrest teamId={t?.id ?? null} teamName={t?.name ?? ''} size={15} />
                          <span>{teamDisplayName(t)}</span>
                          {pick.is_banker && <span className="bg-[#D9A441] text-[#241a12] font-bold px-1 rounded" style={{ fontSize: '9px' }}>★ BANKER</span>}
                          {showScoring && <span className="text-[#F5ECD9]/50 ml-auto">{pts?.team_points ?? '—'} pts</span>}
                        </div>
                        {showScoring && pts?.breakdown?.team_detail?.opponent_team_id != null && (
                          <div className="normal-case text-[#F5ECD9]/40 mt-0.5" style={{ fontSize: '9px' }}>
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

                        {/* Players */}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 uppercase">
                          <span>
                            {players[pick.player1_id] ?? 'Unknown'}
                            {goalPlayers.has(pick.player1_id) && <span className="ml-0.5 bg-green-600 text-white px-0.5 rounded font-bold" style={{ fontSize: '9px' }}>G</span>}
                            {assistPlayers.has(pick.player1_id) && <span className="ml-0.5 bg-green-500/30 text-green-300 px-0.5 rounded font-bold" style={{ fontSize: '9px' }}>A</span>}
                            {aon?.player_id === pick.player1_id && <span className={`ml-0.5 px-1 rounded font-bold ${aonClass}`} style={{ fontSize: '9px' }}>{aonLabel}</span>}
                            {showScoring && <span className="text-[#F5ECD9]/50 normal-case ml-1">({pts?.player1_points ?? '—'} pts)</span>}
                          </span>
                          <span>
                            {players[pick.player2_id] ?? 'Unknown'}
                            {goalPlayers.has(pick.player2_id) && <span className="ml-0.5 bg-green-600 text-white px-0.5 rounded font-bold" style={{ fontSize: '9px' }}>G</span>}
                            {assistPlayers.has(pick.player2_id) && <span className="ml-0.5 bg-green-500/30 text-green-300 px-0.5 rounded font-bold" style={{ fontSize: '9px' }}>A</span>}
                            {aon?.player_id === pick.player2_id && <span className={`ml-0.5 px-1 rounded font-bold ${aonClass}`} style={{ fontSize: '9px' }}>{aonLabel}</span>}
                            {showScoring && <span className="text-[#F5ECD9]/50 normal-case ml-1">({pts?.player2_points ?? '—'} pts)</span>}
                          </span>
                        </div>

                        {question && (
                          <div className="text-[#F5ECD9]/40 normal-case mt-1.5" style={{ fontSize: '9px' }}>
                            <span className="uppercase tracking-wider font-bold">Answer:</span> {answerLabel ?? '—'}
                          </div>
                        )}
                      </div>
                    )
                  })}

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
                    <span className="bg-white/20 px-0.5 rounded">AP</span> Autopick — computer picked it (deadline passed, no pick made)
                    <span className="mx-2">·</span>
                    <span className="bg-[#D9A441] text-[#241a12] px-1 rounded font-bold">⚡ AoN</span> All or Nothing played, result pending
                    <span className="mx-2">·</span>
                    <span className="bg-green-600 text-white px-1 rounded font-bold">✓ AoN</span> succeeded
                    <span className="mx-2">·</span>
                    <span className="bg-red-600 text-white px-1 rounded font-bold">✕ AoN</span> failed
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
          fullScores={recapFullScores}
          isFinal={isScored}
          questionText={question?.question ?? null}
          questionPoll={questionTally.map(t => ({ label: t.label as string, count: t.count }))}
          onClose={() => setShowRecap(false)}
        />
      )}
    </Shell>
  )
}