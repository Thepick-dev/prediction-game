'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import TeamCrest from '../../components/TeamCrest'
import { buildPlayerDisplayNames, bonusCardDisplayName } from '../lib/players'
import { useCountdown, type CountdownTime } from '../lib/useCountdown'
import { usePopArtTheme } from '../lib/usePopArtTheme'
import TicketModal from '../../components/TicketModal'
import PopArtLoading from '../../components/PopArtLoading'
import PenaltyShootout from '../../components/PenaltyShootout'
import { BoltIcon } from '../../components/icons'
import { QUARTILE_RING_COLORS } from '../lib/quartileColors'

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

const AON_INFO_TEXT = "Once per competition, nominate one of your two picks. Score a goal or assist and you get a bonus third use of them for the rest of the competition; blank and you lose all remaining uses of them. Only on your own two picks — never the Bonus Card."
const BANKER_INFO_TEXT = 'Two per competition. Doubles your entire gameweek score — team and both players. Declare it with your pick. Never applied to autopicks.'

// A small "?" trigger that reveals a short explainer beneath it. Not
// portalled — stays inside the normal DOM flow so it keeps resolving the
// theme's CSS variables correctly, and the wizard step content it lives in
// deliberately has no overflow:hidden, so it's free to sit above anything.
function InfoPopover({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex" style={{ verticalAlign: 'middle' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center justify-center rounded-full shrink-0"
        style={{ width: 18, height: 18, fontSize: 11, fontWeight: 800, background: 'rgba(255,255,255,0.18)', color: 'var(--pop-white)', lineHeight: 1 }}
        aria-label="More info"
        aria-expanded={open}
      >
        ?
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="tooltip"
            className="absolute z-50 rounded-lg p-3 text-xs font-normal normal-case text-left"
            style={{
              top: '130%', left: '50%', transform: 'translateX(-50%)',
              width: 'min(240px, 80vw)', background: 'var(--pop-surface)',
              border: '2px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
              color: 'rgba(255,255,255,0.8)', lineHeight: 1.4,
            }}
          >
            {text}
          </div>
        </>
      )}
    </span>
  )
}

// A ceefax-teletext-style flip clock in classic mode; a bold comic
// countdown badge in pop-art mode.
function CountdownClock({ time, theme = 'classic' }: { time: CountdownTime | null; theme?: 'classic' | 'pop-art' }) {
  if (!time) return null

  if (theme === 'pop-art') {
    if (time.expired) {
      return <span className="pop-badge pop-badge--red px-3 py-1.5 text-xs">Deadline passed</span>
    }
    // Each unit gets its own colour off the same palette used everywhere
    // else in this theme, rather than every badge being the same flat
    // yellow. The clock's "this is live" cue lives on the seconds chip
    // alone now (a scale pulse, not a glow) — it used to be a once-a-
    // second border/glow flash on the whole box, but that competed with
    // the deadline panel's own animated pulse right next to it. Seconds
    // is also the only unit actually changing every tick, so tying the
    // motion to it specifically reads as "ticking," not just decoration.
    const units = [
      { label: 'D', value: time.days, bg: 'var(--pop-pink)', fg: 'var(--pop-white)' },
      { label: 'H', value: time.hours, bg: 'var(--pop-blue)', fg: 'var(--pop-black)' },
      { label: 'M', value: time.mins, bg: 'var(--pop-green)', fg: 'var(--pop-black)' },
      { label: 'S', value: time.secs, bg: 'var(--pop-orange)', fg: 'var(--pop-black)', pulse: true },
    ]
    return (
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        {units.map(u => (
          <div
            key={u.label}
            className={`flex flex-col items-center px-2.5 py-1 leading-tight ${u.pulse ? 'pop-second-tick' : ''}`}
            style={{ background: u.bg, color: u.fg, borderRadius: 999 }}
          >
            <span className="font-mono text-sm font-bold">{String(u.value).padStart(2, '0')}</span>
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
  const [isAdmin, setIsAdmin] = useState(false)
  const [competition, setCompetition] = useState<any>(null)
  const [gameweek, setGameweek] = useState<Gameweek | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [playerReactions, setPlayerReactions] = useState<Record<number, { type: 'emoji' | 'text'; content: string }>>({})
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
  // A little easter egg — certain teams and players get a big, brief
  // reaction when picked, purely for fun, no game logic attached. Emoji
  // reactions render huge and centred; text ones use the same glowing
  // display-font treatment as the page's own hero titles.
  const [reaction, setReaction] = useState<{ type: 'emoji' | 'text'; content: string; key: number } | null>(null)
  function fireReaction(type: 'emoji' | 'text', content: string) {
    setReaction({ type, content, key: Date.now() })
    setTimeout(() => setReaction(null), type === 'text' ? 1600 : 1100)
  }
  const [player1, setPlayer1] = useState<number | null>(null)
  const [player2, setPlayer2] = useState<number | null>(null)
  const [player1Fixture, setPlayer1Fixture] = useState<number | null>(null)
  const [player2Fixture, setPlayer2Fixture] = useState<number | null>(null)
  const [isBanker, setIsBanker] = useState(false)

  const [usedTeams, setUsedTeams] = useState<number[]>([])
  const [playerCounts, setPlayerCounts] = useState<Record<number, number>>({})
  const [playerMaxOverride, setPlayerMaxOverride] = useState<Record<number, number>>({})
  const [doubleUseTeams, setDoubleUseTeams] = useState<number[]>([])
  const [bankersUsed, setBankersUsed] = useState(0)

  // All or Nothing — played at most once per competition, on whichever of
  // this week's two picks you nominate. `allOrNothing` is the resolved
  // server-side record (if any exists at all, for ANY gameweek); `aonChoice`
  // is the LOCAL, not-yet-saved choice of which of player1/player2 (by id)
  // to nominate for THIS gameweek's pick specifically.
  const [allOrNothing, setAllOrNothing] = useState<{ player_id: number; gameweek_id: string; outcome: string } | null>(null)
  const [aonUsedGwNumber, setAonUsedGwNumber] = useState<number | null>(null)
  const [aonChoice, setAonChoice] = useState<number | null>(null)
  const [aonExclusions, setAonExclusions] = useState<Record<number, string>>({})
  // The player ids of whatever pick is ALREADY saved for this gameweek (if
  // any) at load time — used only to stop a just-saved pick's own player
  // counting as a "prior use" of itself when checking All or Nothing
  // eligibility (playerCounts, from the API, deliberately includes this
  // week's own saved pick so other on-page counters read correctly).
  const [savedPickPlayers, setSavedPickPlayers] = useState<{ p1: number | null; p2: number | null }>({ p1: null, p2: null })

  // Bonus Card — a whole-competition-once bonus on top of the two normal
  // picks, independent of Banker and All or Nothing. `bonusCard` is the
  // live/current admin nomination; `bonusCardPlay` is this user's own
  // resolved play (if any exists at all, for ANY gameweek); `playBonusCard`
  // is the LOCAL, not-yet-saved choice to play it on THIS gameweek.
  const [bonusCard, setBonusCard] = useState<{ bonus_card_enabled: boolean; bonus_card_player_id: number | null; bonus_card_name: string | null } | null>(null)
  const [bonusCardPlay, setBonusCardPlay] = useState<{ gameweek_id: string; player_id: number; fixture_id: number | null; points: number | null } | null>(null)
  const [playBonusCard, setPlayBonusCard] = useState(false)
  const [bonusCardFixture, setBonusCardFixture] = useState<number | null>(null)

  const [playerSearch1, setPlayerSearch1] = useState('')
  const [playerSearch2, setPlayerSearch2] = useState('')
  const [player1Club, setPlayer1Club] = useState<number | null>(null)
  const [player2Club, setPlayer2Club] = useState<number | null>(null)

  // Pop-art only — the picking process below the fixture grid is a
  // step-by-step wizard rather than everything stacked at once. Classic
  // keeps the old flat layout untouched. Each concern (player 1, player 2,
  // banker, bonus card, weekly question, comments, review) is its own
  // step rather than several grouped together — the step LIST itself is
  // built dynamically further down (see wizardSteps) since Bonus Card and
  // the weekly Question only exist for some competitions/gameweeks.
  // Identifying the current step by KEY (not array index) means jumping
  // straight to "review" when a pick already exists doesn't need to know
  // how many dynamic steps precede it. wizardDirection just tracks which
  // way to slide the incoming step.
  type WizardStepKey = 'player1' | 'player2' | 'banker' | 'bonus' | 'question' | 'comments' | 'review'
  const [wizardStep, setWizardStep] = useState<WizardStepKey>('player1')
  const [wizardDirection, setWizardDirection] = useState<'forward' | 'back'>('forward')
  const wizardRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  // One-shot confetti on a successful save — pieces are regenerated fresh
  // each time rather than reused, so the burst always looks the same
  // random way even if you save twice in a row.
  const [confettiPieces, setConfettiPieces] = useState<{ id: number; dx: number; dy: number; rot: number; color: string }[]>([])
  const [message, setMessage] = useState('')
  const [deadlinePassed, setDeadlinePassed] = useState(false)

  const { popArt } = usePopArtTheme(user?.id)

  // Penalty shootout mini-game popup — entirely separate from the pick
  // itself (own table, own scoring), just a bit of fun reachable from here.
  const [shootoutOpen, setShootoutOpen] = useState(false)
  // Brief loading beat before the game itself renders — also doubles as
  // the moment to make clear this is just a bonus toy, not part of the
  // competition, before the player's even looking at the game screen.
  const [shootoutLoading, setShootoutLoading] = useState(false)

  function openShootout() {
    setShootoutOpen(true)
    setShootoutLoading(true)
    setTimeout(() => setShootoutLoading(false), 1400)
  }

  const supabase = createClient()
  const countdown = useCountdown(gameweek?.deadline ?? null)

  useEffect(() => { loadData() }, [])

  // Changing which player is picked while a nomination is pending on the
  // old choice would otherwise silently keep pointing at a player no
  // longer selected — clear it, matching the same auto-clear the API does
  // server-side if this state is ever stale for some other reason.
  useEffect(() => {
    if (aonChoice != null && aonChoice !== player1 && aonChoice !== player2) setAonChoice(null)
  }, [player1, player2, aonChoice])

  // Same reasoning as the All or Nothing effect above — if either normal
  // pick changes to match the Bonus Card's player, the card can no longer
  // be played this gameweek (can't be both a normal pick and the card),
  // so an already-toggled-on choice needs clearing rather than silently
  // becoming invalid.
  useEffect(() => {
    if (playBonusCard && bonusCard?.bonus_card_player_id != null &&
        (bonusCard.bonus_card_player_id === player1 || bonusCard.bonus_card_player_id === player2)) {
      setPlayBonusCard(false)
    }
  }, [player1, player2, playBonusCard, bonusCard])

  // Jump straight to the wizard the moment a team's picked — the whole
  // point of it living below a long fixture list is that you shouldn't
  // have to go hunting for it yourself.
  useEffect(() => {
    if (selectedTeam != null) wizardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedTeam])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    setUser(user)

    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    setDisplayName(profile?.display_name ?? '')

    // Its own query, same isolation reasoning as everywhere else — only
    // gates the shootout's admin test-mode controls, so a problem here
    // must never be able to take anything else on this page down with it.
    const { data: adminProfile } = await supabase.from('profiles').select('is_admin, is_super_admin').eq('id', user.id).single()
    setIsAdmin(!!(adminProfile?.is_admin || adminProfile?.is_super_admin))

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

    // Also its own query, same reason — a brand new, entirely optional
    // table (admin-managed player easter eggs), so a problem with it must
    // never be able to take the rest of the pick screen down with it.
    const { data: reactionsData } = await supabase.from('player_reactions').select('player_id, type, content')
    const reactionMap: Record<number, { type: 'emoji' | 'text'; content: string }> = {}
    reactionsData?.forEach(r => { reactionMap[r.player_id] = { type: r.type, content: r.content } })
    setPlayerReactions(reactionMap)

    // Same isolated-query reasoning — admin-managed, entirely optional.
    const { data: exclusionsData } = await supabase.from('all_or_nothing_exclusions').select('player_id, reason')
    const exclusionMap: Record<number, string> = {}
    exclusionsData?.forEach(e => { exclusionMap[e.player_id] = e.reason })
    setAonExclusions(exclusionMap)

    let aonFromApi: { player_id: number; gameweek_id: string; outcome: string } | null = null

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
        setSavedPickPlayers({ p1: pickData.pick.player1_id, p2: pickData.pick.player2_id })
        // Returning to an already-submitted pick — land on the review
        // step showing it, not back at square one.
        setWizardStep('review')
      } else {
        setSavedPickPlayers({ p1: null, p2: null })
      }
      setUsedTeams(pickData.usedTeams ?? [])
      setPlayerCounts(pickData.playerCounts ?? {})
      setPlayerMaxOverride(pickData.playerMaxOverride ?? {})
      setDoubleUseTeams(pickData.doubleUseTeams ?? [])
      setBankersUsed(pickData.bankersUsed ?? 0)
      setFixtures(fixturesData ?? [])

      aonFromApi = pickData.allOrNothing ?? null
      setAllOrNothing(aonFromApi)
      setAonChoice(aonFromApi && aonFromApi.gameweek_id === gw.id ? aonFromApi.player_id : null)

      const bonusCardFromApi = pickData.bonusCardPlay ?? null
      setBonusCard(pickData.bonusCard ?? null)
      setBonusCardPlay(bonusCardFromApi)
      setPlayBonusCard(bonusCardFromApi != null && bonusCardFromApi.gameweek_id === gw.id)
      setBonusCardFixture(bonusCardFromApi && bonusCardFromApi.gameweek_id === gw.id ? bonusCardFromApi.fixture_id : null)

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

    setAonUsedGwNumber(
      aonFromApi ? (allGameweeks ?? []).find(g => g.id === aonFromApi!.gameweek_id)?.number ?? null : null
    )

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
    const name = getTeam(teamId)?.name?.toLowerCase() ?? ''
    const emoji = name.includes('arsenal') ? '🙄' : name.includes('tottenham') ? '😎' : null
    if (emoji) fireReaction('emoji', emoji)
  }

  // Player-select easter eggs — same idea as the team ones above, but now
  // admin-managed (see /admin/players) and looked up by player ID rather
  // than name-matching, which used to silently fail whenever a stored
  // name didn't exactly match what was hardcoded here (middle names,
  // accents, misremembered spellings — a whole class of bug this removes).
  function triggerPlayerReaction(playerId: number) {
    const found = playerReactions[playerId]
    if (found) fireReaction(found.type, found.content)
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
        comments: comments.trim() || null,
        all_or_nothing_player_id: aonChoice,
        play_bonus_card: playBonusCard,
        bonus_card_fixture_id: bonusCardFixture
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
      const colors = ['var(--pop-pink)', 'var(--pop-blue)', 'var(--pop-green)', 'var(--pop-yellow)', 'var(--pop-orange)']
      setConfettiPieces(Array.from({ length: 14 }, (_, i) => ({
        id: Date.now() + i,
        dx: Math.cos(Math.random() * Math.PI * 2) * (40 + Math.random() * 50),
        dy: Math.sin(Math.random() * Math.PI * 2) * (40 + Math.random() * 50),
        rot: Math.random() * 360,
        color: colors[i % colors.length],
      })))
      setTimeout(() => setConfettiPieces([]), 750)
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

  // All or Nothing eligibility for whichever two players are currently
  // selected. The card is spent for the rest of the competition once
  // there's a record for any OTHER gameweek — resolved or still pending
  // scoring, it doesn't matter, only one nomination is ever allowed.
  const aonCardSpentElsewhere = !!allOrNothing && (!gameweek || allOrNothing.gameweek_id !== gameweek.id)
  function aonPriorUses(playerId: number | null): number {
    if (playerId == null) return 0
    let count = playerCounts[playerId] ?? 0
    if (savedPickPlayers.p1 === playerId || savedPickPlayers.p2 === playerId) count -= 1
    return count
  }
  const aonExclusion1 = player1 != null ? aonExclusions[player1] : undefined
  const aonExclusion2 = player2 != null ? aonExclusions[player2] : undefined
  const aonEligible1 = player1 != null && !aonExclusion1 && aonPriorUses(player1) <= 0
  const aonEligible2 = player2 != null && !aonExclusion2 && aonPriorUses(player2) <= 0

  // Bonus Card eligibility — same "spent for the rest of the competition
  // once a record exists for any OTHER gameweek" shape as All or Nothing,
  // plus its own extra rule: can't be played on a player who's already one
  // of this gameweek's two normal picks.
  const bonusCardSpentElsewhere = !!bonusCardPlay && (!gameweek || bonusCardPlay.gameweek_id !== gameweek.id)
  const bonusCardPlayerId = bonusCard?.bonus_card_player_id ?? null
  const bonusCardPlayer = bonusCardPlayerId != null ? players.find(p => p.id === bonusCardPlayerId) : undefined
  // The player's own short name — needed specifically for the "X's team
  // plays twice" fixture-disambiguation message, which is about the player,
  // not the card. Everywhere else, `bonusCardName` (the admin-nameable,
  // resolved display name) is what's shown.
  const bonusCardPlayerShortName = bonusCardPlayer ? playerName(bonusCardPlayerId!) : null
  const bonusCardName = bonusCardDisplayName(bonusCard?.bonus_card_name, bonusCardPlayerShortName)
  const bonusCardIsOneOfThisWeeksPicks = bonusCardPlayerId != null && (bonusCardPlayerId === player1 || bonusCardPlayerId === player2)
  const bonusCardAvailable = !!bonusCard?.bonus_card_enabled && bonusCardPlayerId != null
  const bonusCardEligibleThisWeek = bonusCardAvailable && !bonusCardSpentElsewhere && !bonusCardIsOneOfThisWeeksPicks
  const bonusCardFixtures = fixturesForTeam(bonusCardPlayer?.team_id ?? null)
  const bonusCardNeedsFixtureChoice = bonusCardFixtures.length >= 2

  // Pop-art wizard step gating — can't move on until the current step's
  // player is picked, and, for a double-gameweek player, until they've
  // nominated which of the two matches the pick is for too.
  const wizardStep0Valid = player1 != null &&
    (fixturesForTeam(players.find(p => p.id === player1)?.team_id ?? null).length < 2 || player1Fixture != null)
  const wizardStep1Valid = player2 != null && player2 !== player1 &&
    (fixturesForTeam(players.find(p => p.id === player2)?.team_id ?? null).length < 2 || player2Fixture != null)
  const bonusStepValid = !playBonusCard || !bonusCardNeedsFixtureChoice || bonusCardFixture != null

  const bonusInfoText = `One nominated player, playable once across the whole competition, on any gameweek. Points add on top of your normal picks — never doubled by Banker. Can't be played on a player who's already one of this week's two picks.`

  // The step LIST itself — Bonus Card and the weekly Question are only
  // included when this competition/gameweek actually has one, so a
  // competition without the feature (or a week with no question set)
  // simply has a shorter wizard, not an empty step.
  const wizardSteps: { key: WizardStepKey; label: string; valid: boolean }[] = [
    { key: 'player1', label: 'Player 1', valid: wizardStep0Valid },
    { key: 'player2', label: 'Player 2', valid: wizardStep1Valid },
    { key: 'banker', label: 'Banker', valid: true },
    ...(bonusCardAvailable ? [{ key: 'bonus' as const, label: 'Bonus', valid: bonusStepValid }] : []),
    ...(question ? [{ key: 'question' as const, label: 'Question', valid: true }] : []),
    { key: 'comments', label: 'Comments', valid: true },
    { key: 'review', label: 'Review', valid: true },
  ]
  const wizardIndex = Math.max(0, wizardSteps.findIndex(s => s.key === wizardStep))
  const wizardStepsValid = wizardSteps.every(s => s.valid)
  function goToWizardStep(key: WizardStepKey) {
    const targetIndex = wizardSteps.findIndex(s => s.key === key)
    setWizardDirection(targetIndex < wizardIndex ? 'back' : 'forward')
    setWizardStep(key)
  }
  function wizardBack() {
    if (wizardIndex > 0) goToWizardStep(wizardSteps[wizardIndex - 1].key)
  }
  function wizardNext() {
    if (wizardIndex < wizardSteps.length - 1) goToWizardStep(wizardSteps[wizardIndex + 1].key)
  }

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

  function getQuartileRingColor(teamId: number) {
    const q = getQuartileLabel(teamId)
    return q ? QUARTILE_RING_COLORS[q] : undefined
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
    Q4: 'pop-badge--orange',
  }

  // Every fixture row uses the same plain dark card now — cycling a
  // different accent colour per row was exactly the "jumble of colour
  // boxes" that got called out. Colour still shows up functionally (the
  // quartile badge, the bright fill on whichever team is selected), just
  // not as decoration on the row container itself.

  if (loading) {
    return (
      <Shell active="PICKS" theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? <PopArtLoading /> : <p className="text-gray-500">Loading...</p>}
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="PICKS" theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? (
          <PopArtLoading label="No active competition" />
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2">No Active Competition</h1>
            <p className="text-gray-500">There is no active competition right now.</p>
          </>
        )}
      </Shell>
    )
  }

  // Admin-only — everyone else always sees Pop Art with no way to revert,
  // so this control (and the ability to switch back to Classic at all)
  // only exists for admins, who can still flip to Classic for reference.
  if (popArt) {
    const homeWinDraw = (fixture: Fixture) => getWinDrawPoints(fixture.home_team_id, fixture.away_team_id, true)
    const awayWinDraw = (fixture: Fixture) => getWinDrawPoints(fixture.away_team_id, fixture.home_team_id, false)

    return (
      <>
        {shootoutOpen && user && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={() => setShootoutOpen(false)}
          >
            <div
              className="pop-art-theme pop-panel w-full p-4 sm:p-6"
              style={{ maxWidth: 420, maxHeight: '90vh', overflowY: 'auto' }}
              onClick={e => e.stopPropagation()}
            >
              {shootoutLoading ? (
                <div className="text-center py-10">
                  <div className="pop-shoot-spin inline-block" style={{ fontSize: 44 }}>⚽</div>
                  <p className="pop-headline text-sm mt-3 mb-1">Warming up the keeper&hellip;</p>
                  <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    100% pointless, 100% fun — this never touches your league score.
                  </p>
                  <div className="rounded-full overflow-hidden mx-auto" style={{ height: 8, maxWidth: 220, background: 'rgba(255,255,255,0.12)' }}>
                    <div className="pop-shoot-bar" style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--pop-pink), var(--pop-blue))' }} />
                  </div>
                </div>
              ) : (
                <>
                  <PenaltyShootout userId={user.id} isAdmin={isAdmin} />
                  <button
                    onClick={() => setShootoutOpen(false)}
                    className="pop-button pop-button--blue w-full mt-4 py-2 text-sm"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        <Shell active="PICKS" user={user} displayName={displayName} theme="pop-art">
          {/* No wrapping "card" here on purpose — the page already sits on
              Shell's black background, and boxing all of this content in
              ANOTHER bordered panel was exactly the "box inside a box"
              clutter that got called out. Each section below is its own
              card; the page itself is just the black canvas they sit on. */}
          <div className="pop-art-theme">

            {reaction && reaction.type === 'emoji' && (
              <div
                key={reaction.key}
                className="pop-pop-in"
                style={{
                  position: 'fixed', inset: 0, zIndex: 60,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'clamp(90px, 30vw, 260px)', lineHeight: 1, pointerEvents: 'none',
                  textShadow: '0 0 40px rgba(0,0,0,0.6)',
                }}
              >
                {reaction.content}
              </div>
            )}
            {reaction && reaction.type === 'text' && (
              <div
                key={reaction.key}
                className="pop-pop-in"
                style={{
                  position: 'fixed', inset: 0, zIndex: 60,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '5vw', pointerEvents: 'none',
                }}
              >
                <div className="pop-panel pop-panel--pink" style={{ padding: '1.25em 1.5em', maxWidth: '90vw' }}>
                  <p
                    className="pop-hero pop-hero--pink"
                    style={{ fontSize: 'clamp(22px, 6vw, 48px)', textAlign: 'center', lineHeight: 1.15 }}
                  >
                    {reaction.content}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start justify-between gap-3 flex-wrap mb-4 sm:mb-6 mt-2">
              <h1 className="pop-hero pop-hero--blue text-5xl sm:text-6xl">Picks</h1>
              {user && (
                <div className="flex flex-col items-center gap-0.5">
                  <span className="font-mono" style={{ fontSize: '8.5px', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.45)' }}>★ MINI-GAME</span>
                  <button
                    onClick={openShootout}
                    className="pop-button pop-button--green px-3 py-1.5 text-xs inline-flex items-center gap-1.5"
                    style={{ border: '2px dashed rgba(0,0,0,0.35)' }}
                  >
                    <span className="pop-shoot-spin inline-block">⚽</span> Shootout
                  </button>
                </div>
              )}
            </div>

            {gameweek && (
              <div className={`pop-panel pop-panel--pulse ${!deadlinePassed && !hasPick ? 'pop-panel--yellow pop-rotate-r' : 'pop-panel--blue pop-rotate-l'} p-3 sm:p-4 mb-4 sm:mb-6 flex items-center justify-between gap-3 flex-wrap`}>
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
                <p className="pop-headline text-2xl sm:text-3xl mb-2 sm:mb-3">Pick Your Team</p>
                {hasFixtures ? (
                  <div className="grid gap-3 sm:gap-4 mb-4 sm:mb-6">
                    {fixtures.map((fixture) => {
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
                      // Quartile colour now lives on the box itself (border
                      // + a faint tint of the same colour) rather than as a
                      // ring around the crest — keeps the crest looking like
                      // a normal badge. Selected state still wins outright
                      // (solid green fill), so "picked" is never ambiguous
                      // with "this is a Q2 team".
                      const homeRing = getQuartileRingColor(fixture.home_team_id)
                      const awayRing = getQuartileRingColor(fixture.away_team_id)
                      return (
                        <div key={fixture.id} className="pop-panel p-2.5 sm:p-3 grid grid-cols-2 gap-2.5 sm:gap-3">
                          <button
                            onClick={() => !homeStatus.isUsed && selectTeamInFixture(fixture.home_team_id, fixture.id)}
                            disabled={homeStatus.isUsed && !homeSelected}
                            className={`pop-select-btn rounded-lg p-2.5 sm:p-3 flex flex-col items-center justify-between text-center gap-1.5 h-28 sm:h-36 ${homeSelected ? 'pop-pop-in' : ''}`}
                            style={{
                              border: homeSelected ? '2px solid var(--pop-green)' : homeStatus.isUsed ? '2px solid rgba(255,255,255,0.15)' : `2px solid ${homeRing ?? 'rgba(255,255,255,0.15)'}`,
                              boxShadow: homeSelected ? '0 0 20px rgba(204,250,0,0.5)' : 'none',
                              background: homeSelected ? 'var(--pop-green)' : homeStatus.isUsed ? '#111111' : homeRing ? `color-mix(in srgb, ${homeRing} 10%, transparent)` : 'transparent',
                              color: homeSelected ? 'var(--pop-black)' : homeStatus.isUsed ? '#4D4D4D' : 'var(--pop-white)',
                            }}
                          >
                            <TeamCrest crestUrl={homeTeam?.crest_url ?? null} teamName={teamDisplayName(homeTeam)} size={52} />
                            <div className="flex items-center gap-1.5 flex-wrap justify-center min-h-[18px]">
                              {homeQ && <span className={`pop-badge ${popQuartileBadgeClass[homeQ] ?? ''} px-1.5 py-0.5 text-[9px]`}>{homeQ}</span>}
                              <span className="font-mono text-[9px]" style={{ color: homeSelected ? 'rgba(0,0,0,0.6)' : homeStatus.isUsed ? '#4D4D4D' : 'rgba(255,255,255,0.55)' }}>{homeStatus.isUsed ? 'used' : `${homeStatus.remaining}/${homeStatus.maxUses} left`}</span>
                            </div>
                            <p className="font-mono text-[10px] font-bold">WIN +{homeWD.win} · DRAW +{homeWD.draw}</p>
                          </button>
                          <button
                            onClick={() => !awayStatus.isUsed && selectTeamInFixture(fixture.away_team_id, fixture.id)}
                            disabled={awayStatus.isUsed && !awaySelected}
                            className={`pop-select-btn rounded-lg p-2.5 sm:p-3 flex flex-col items-center justify-between text-center gap-1.5 h-28 sm:h-36 ${awaySelected ? 'pop-pop-in' : ''}`}
                            style={{
                              border: awaySelected ? '2px solid var(--pop-green)' : awayStatus.isUsed ? '2px solid rgba(255,255,255,0.15)' : `2px solid ${awayRing ?? 'rgba(255,255,255,0.15)'}`,
                              boxShadow: awaySelected ? '0 0 20px rgba(204,250,0,0.5)' : 'none',
                              background: awaySelected ? 'var(--pop-green)' : awayStatus.isUsed ? '#111111' : awayRing ? `color-mix(in srgb, ${awayRing} 10%, transparent)` : 'transparent',
                              color: awaySelected ? 'var(--pop-black)' : awayStatus.isUsed ? '#4D4D4D' : 'var(--pop-white)',
                            }}
                          >
                            <TeamCrest crestUrl={awayTeam?.crest_url ?? null} teamName={teamDisplayName(awayTeam)} size={52} />
                            <div className="flex items-center gap-1.5 flex-wrap justify-center min-h-[18px]">
                              {awayQ && <span className={`pop-badge ${popQuartileBadgeClass[awayQ] ?? ''} px-1.5 py-0.5 text-[9px]`}>{awayQ}</span>}
                              <span className="font-mono text-[9px]" style={{ color: awaySelected ? 'rgba(0,0,0,0.6)' : awayStatus.isUsed ? '#4D4D4D' : 'rgba(255,255,255,0.55)' }}>{awayStatus.isUsed ? 'used' : `${awayStatus.remaining}/${awayStatus.maxUses} left`}</span>
                            </div>
                            <p className="font-mono text-[10px] font-bold">WIN +{awayWD.win} · DRAW +{awayWD.draw}</p>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="pop-panel p-4 mb-6 font-bold">No fixtures yet.</p>
                )}

                {selectedTeam != null && (
                  <div ref={wizardRef} className="pop-panel p-5 mb-6">
                    <div className="flex items-center justify-center gap-1.5 mb-5 flex-wrap">
                      {wizardSteps.map((step, i) => (
                        <div key={step.key} className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => i < wizardIndex && goToWizardStep(step.key)}
                            disabled={i >= wizardIndex}
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ background: i <= wizardIndex ? 'var(--pop-pink)' : 'rgba(255,255,255,0.15)', cursor: i < wizardIndex ? 'pointer' : 'default' }}
                            aria-label={step.label}
                          />
                          {i < wizardSteps.length - 1 && <div className="w-3 h-0.5" style={{ background: i < wizardIndex ? 'var(--pop-pink)' : 'rgba(255,255,255,0.15)' }} />}
                        </div>
                      ))}
                    </div>

                    {aonCardSpentElsewhere && (
                      <p className="text-center font-mono text-[10px] mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        All or Nothing: already played this competition{aonUsedGwNumber ? ` (GW${aonUsedGwNumber})` : ''} —{' '}
                        {allOrNothing?.outcome === 'success' ? 'succeeded! 🎉' : allOrNothing?.outcome === 'failed' ? 'failed.' : 'result pending.'}
                      </p>
                    )}

                    <div key={wizardStep} className={wizardDirection === 'forward' ? 'pop-wizard-slide-forward' : 'pop-wizard-slide-back'}>

                    {wizardStep === 'player1' && (
                      <div>
                        <p className="pop-headline text-xl mb-3 text-center">Pick Player 1</p>
                        {player1 ? (
                          <>
                            <div className="pop-pop-in flex items-center justify-between rounded-lg p-2.5 mb-3" style={{ border: '2px solid var(--pop-green)', boxShadow: '0 0 16px rgba(204,250,0,0.4)' }}>
                              <span className="font-black uppercase text-sm">{playerName(player1)}</span>
                              <button
                                onClick={() => { setPlayer1(null); setPlayer1Fixture(null); setPlayer1Club(null) }}
                                className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                                style={{ background: 'var(--pop-black)', color: 'var(--pop-white)' }}
                                aria-label="Remove player 1"
                              >
                                ×
                              </button>
                            </div>
                            {fixturesForTeam(players.find(p => p.id === player1)?.team_id ?? null).length >= 2 && (
                              <div className="rounded-lg p-3 mb-3" style={{ background: 'rgba(125,55,165,0.08)', border: '1px solid rgba(125,55,165,0.3)' }}>
                                <p className="font-mono text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--pop-yellow)' }}>
                                  {playerName(player1)}&apos;s team plays twice — which match is this pick for?
                                </p>
                                <div className="flex flex-col gap-1.5">
                                  {fixturesForTeam(players.find(p => p.id === player1)?.team_id ?? null).map(f => (
                                    <button
                                      key={f.id}
                                      onClick={() => setPlayer1Fixture(f.id)}
                                      className="text-left px-2.5 py-1.5 rounded text-xs font-bold"
                                      style={player1Fixture === f.id
                                        ? { background: 'var(--pop-yellow)', color: 'var(--pop-white)' }
                                        : { background: 'rgba(255,255,255,0.05)', color: 'var(--pop-white)', border: '1px solid rgba(255,255,255,0.15)' }}
                                    >
                                      {opponentLabel(f, players.find(p => p.id === player1)?.team_id ?? 0)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {!aonCardSpentElsewhere && (
                              <div className="flex items-center gap-2 flex-wrap">
                                {aonChoice === player1 ? (
                                  <>
                                    <span className="pop-badge pop-badge--pink px-3 py-1.5 text-xs inline-flex items-center gap-1"><BoltIcon size={12} color="var(--pop-white)" /> Playing All or Nothing on {playerName(player1)}</span>
                                    <button onClick={() => setAonChoice(null)} className="pop-button pop-button--yellow px-3 py-1.5 text-xs">Cancel</button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => aonEligible1 && setAonChoice(player1)}
                                    disabled={!aonEligible1}
                                    title={aonExclusion1 ?? (!aonEligible1 ? 'Already used this player this competition' : undefined)}
                                    className="pop-button px-3 py-1.5 text-xs"
                                    style={!aonEligible1 ? { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' } : { background: 'var(--pop-pink)' }}
                                  >
                                    Play All or Nothing on {playerName(player1)}?
                                  </button>
                                )}
                                <InfoPopover text={AON_INFO_TEXT} />
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <select
                              value={player1Club ?? ''}
                              onChange={e => setPlayer1Club(e.target.value ? Number(e.target.value) : null)}
                              className="pop-input w-full p-2 mb-2 font-bold text-sm"
                            >
                              <option value="">Filter by club...</option>
                              {teams.map(t => <option key={t.id} value={t.id}>{teamDisplayName(t)}</option>)}
                            </select>
                            <input
                              type="text"
                              value={playerSearch1}
                              onChange={e => setPlayerSearch1(e.target.value)}
                              placeholder={player1Club != null ? 'Narrow down...' : 'Search players...'}
                              className="pop-input w-full p-2 mb-2 font-bold text-sm"
                            />
                            {filteredPlayers1.length > 0 && (
                              <div className="rounded-lg overflow-hidden max-h-48 overflow-y-auto" style={{ border: '2px solid rgba(255,255,255,0.15)' }}>
                                {filteredPlayers1.map(p => {
                                  const count = playerCounts[p.id] ?? 0
                                  const max = playerMaxOverride[p.id] ?? 2
                                  const maxed = count >= max
                                  return (
                                    <button
                                      key={p.id}
                                      onClick={() => { if (!maxed) { setPlayer1(p.id); setPlayer1Fixture(null); setPlayerSearch1(''); setPlayer1Club(null); triggerPlayerReaction(p.id) } }}
                                      disabled={maxed}
                                      className="block w-full text-left px-3 py-2 font-bold text-sm border-b last:border-0"
                                      style={{ background: maxed ? '#0A0A0A' : 'var(--pop-surface)', color: maxed ? '#555555' : 'var(--pop-white)', borderColor: 'rgba(255,255,255,0.1)' }}
                                    >
                                      {playerName(p.id)} <span className="font-mono text-xs" style={{ color: maxed ? '#555555' : 'rgba(255,255,255,0.5)' }}>({count}/{max})</span>
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {wizardStep === 'player2' && (
                      <div>
                        <p className="pop-headline text-xl mb-3 text-center">Pick Player 2</p>
                        {player2 ? (
                          <>
                            <div className="pop-pop-in flex items-center justify-between rounded-lg p-2.5 mb-3" style={{ border: '2px solid var(--pop-green)', boxShadow: '0 0 16px rgba(204,250,0,0.4)' }}>
                              <span className="font-black uppercase text-sm">{playerName(player2)}</span>
                              <button
                                onClick={() => { setPlayer2(null); setPlayer2Fixture(null); setPlayer2Club(null) }}
                                className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                                style={{ background: 'var(--pop-black)', color: 'var(--pop-white)' }}
                                aria-label="Remove player 2"
                              >
                                ×
                              </button>
                            </div>
                            {fixturesForTeam(players.find(p => p.id === player2)?.team_id ?? null).length >= 2 && (
                              <div className="rounded-lg p-3 mb-3" style={{ background: 'rgba(125,55,165,0.08)', border: '1px solid rgba(125,55,165,0.3)' }}>
                                <p className="font-mono text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--pop-yellow)' }}>
                                  {playerName(player2)}&apos;s team plays twice — which match is this pick for?
                                </p>
                                <div className="flex flex-col gap-1.5">
                                  {fixturesForTeam(players.find(p => p.id === player2)?.team_id ?? null).map(f => (
                                    <button
                                      key={f.id}
                                      onClick={() => setPlayer2Fixture(f.id)}
                                      className="text-left px-2.5 py-1.5 rounded text-xs font-bold"
                                      style={player2Fixture === f.id
                                        ? { background: 'var(--pop-yellow)', color: 'var(--pop-white)' }
                                        : { background: 'rgba(255,255,255,0.05)', color: 'var(--pop-white)', border: '1px solid rgba(255,255,255,0.15)' }}
                                    >
                                      {opponentLabel(f, players.find(p => p.id === player2)?.team_id ?? 0)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {!aonCardSpentElsewhere && (
                              <div className="flex items-center gap-2 flex-wrap">
                                {aonChoice === player2 ? (
                                  <>
                                    <span className="pop-badge pop-badge--pink px-3 py-1.5 text-xs inline-flex items-center gap-1"><BoltIcon size={12} color="var(--pop-white)" /> Playing All or Nothing on {playerName(player2)}</span>
                                    <button onClick={() => setAonChoice(null)} className="pop-button pop-button--yellow px-3 py-1.5 text-xs">Cancel</button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => aonEligible2 && setAonChoice(player2)}
                                    disabled={!aonEligible2}
                                    title={aonExclusion2 ?? (!aonEligible2 ? 'Already used this player this competition' : undefined)}
                                    className="pop-button px-3 py-1.5 text-xs"
                                    style={!aonEligible2 ? { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' } : { background: 'var(--pop-pink)' }}
                                  >
                                    Play All or Nothing on {playerName(player2)}?
                                  </button>
                                )}
                                <InfoPopover text={AON_INFO_TEXT} />
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <select
                              value={player2Club ?? ''}
                              onChange={e => setPlayer2Club(e.target.value ? Number(e.target.value) : null)}
                              className="pop-input w-full p-2 mb-2 font-bold text-sm"
                            >
                              <option value="">Filter by club...</option>
                              {teams.map(t => <option key={t.id} value={t.id}>{teamDisplayName(t)}</option>)}
                            </select>
                            <input
                              type="text"
                              value={playerSearch2}
                              onChange={e => setPlayerSearch2(e.target.value)}
                              placeholder={player2Club != null ? 'Narrow down...' : 'Search players...'}
                              className="pop-input w-full p-2 mb-2 font-bold text-sm"
                            />
                            {filteredPlayers2.length > 0 && (
                              <div className="rounded-lg overflow-hidden max-h-48 overflow-y-auto" style={{ border: '2px solid rgba(255,255,255,0.15)' }}>
                                {filteredPlayers2.map(p => {
                                  const count = playerCounts[p.id] ?? 0
                                  const max = playerMaxOverride[p.id] ?? 2
                                  const maxed = count >= max
                                  return (
                                    <button
                                      key={p.id}
                                      onClick={() => { if (!maxed) { setPlayer2(p.id); setPlayer2Fixture(null); setPlayerSearch2(''); setPlayer2Club(null); triggerPlayerReaction(p.id) } }}
                                      disabled={maxed}
                                      className="block w-full text-left px-3 py-2 font-bold text-sm border-b last:border-0"
                                      style={{ background: maxed ? '#0A0A0A' : 'var(--pop-surface)', color: maxed ? '#555555' : 'var(--pop-white)', borderColor: 'rgba(255,255,255,0.1)' }}
                                    >
                                      {playerName(p.id)} <span className="font-mono text-xs" style={{ color: maxed ? '#555555' : 'rgba(255,255,255,0.5)' }}>({count}/{max})</span>
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {wizardStep === 'banker' && (
                      <div>
                        <p className="pop-headline text-xl mb-3 text-center">Banker</p>
                        <div className="flex items-center gap-3 flex-wrap justify-center">
                          <button
                            onClick={() => setIsBanker(!isBanker)}
                            disabled={!isBanker && bankersUsed >= 2}
                            className={`pop-button ${isBanker ? 'pop-button--green pop-pop-in' : 'pop-button--yellow'} px-4 py-2.5`}
                          >
                            {isBanker ? '★ Banker Declared' : 'Declare Banker'}
                          </button>
                          <span className="pop-badge pop-badge--blue px-2.5 py-1.5 text-xs">{bankersUsed} of 2 used</span>
                          <InfoPopover text={BANKER_INFO_TEXT} />
                        </div>
                      </div>
                    )}

                    {wizardStep === 'bonus' && (
                      <div>
                        <p className="pop-headline text-xl mb-3 text-center inline-flex items-center gap-1.5 justify-center w-full">
                          {bonusCardName}
                          <InfoPopover text={bonusInfoText} />
                        </p>
                        <div className="pop-panel p-4">
                          {/* Admin-managed static file (see /admin/help/deploying-changes) —
                              optional, so a missing file just quietly shows nothing rather
                              than a broken-image icon. */}
                          <img
                            src="/bonus-card-player.png"
                            alt=""
                            className="mx-auto mb-3 rounded-lg"
                            style={{ maxHeight: 170, maxWidth: '100%' }}
                            onError={e => { e.currentTarget.style.display = 'none' }}
                          />
                          {bonusCardSpentElsewhere ? (
                            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                              {bonusCardName} — already played
                              {bonusCardPlay?.points != null ? `, scored ${bonusCardPlay.points} pts` : ' this competition'}.
                            </p>
                          ) : (
                            <>
                              <div className="flex items-center gap-3 mb-2 flex-wrap justify-center">
                                <button
                                  onClick={() => bonusCardEligibleThisWeek && setPlayBonusCard(!playBonusCard)}
                                  disabled={!bonusCardEligibleThisWeek && !playBonusCard}
                                  title={bonusCardIsOneOfThisWeeksPicks ? "Can't play the card on a player who's already one of this week's two picks" : undefined}
                                  className={`pop-button ${playBonusCard ? 'pop-button--green pop-pop-in' : 'pop-button--yellow'} px-4 py-2.5`}
                                  style={!bonusCardEligibleThisWeek && !playBonusCard ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                                >
                                  {playBonusCard ? `★ Playing ${bonusCardName}` : `Play ${bonusCardName}`}
                                </button>
                              </div>
                              <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                One-off bonus on top of your normal picks — never doubled by Banker, usable once across the whole competition.
                              </p>
                            </>
                          )}
                          {playBonusCard && bonusCardNeedsFixtureChoice && (
                            <div className="rounded-lg p-3 mt-3" style={{ background: 'rgba(125,55,165,0.08)', border: '1px solid rgba(125,55,165,0.3)' }}>
                              <p className="font-mono text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--pop-yellow)' }}>
                                {bonusCardPlayerShortName}&apos;s team plays twice — which match is this for?
                              </p>
                              <div className="flex flex-col gap-1.5">
                                {bonusCardFixtures.map(f => (
                                  <button
                                    key={f.id}
                                    onClick={() => setBonusCardFixture(f.id)}
                                    className="text-left px-2.5 py-1.5 rounded text-xs font-bold"
                                    style={bonusCardFixture === f.id
                                      ? { background: 'var(--pop-yellow)', color: 'var(--pop-white)' }
                                      : { background: 'rgba(255,255,255,0.05)', color: 'var(--pop-white)', border: '1px solid rgba(255,255,255,0.15)' }}
                                  >
                                    {opponentLabel(f, bonusCardPlayer?.team_id ?? 0)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {wizardStep === 'question' && question && (
                      <div>
                        <p className="pop-headline text-xl mb-3 text-center">This Week&apos;s Question</p>
                        <div className="pop-panel pop-panel--yellow p-4">
                          <p className="font-bold text-sm mb-3">{question.question}</p>
                          {question.question_type === 'freetext' ? (
                            <input
                              type="text"
                              value={questionAnswer}
                              onChange={e => setQuestionAnswer(e.target.value)}
                              placeholder="Type your answer..."
                              maxLength={200}
                              className="pop-input w-full p-2 font-bold text-sm"
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
                                    border: questionAnswer === opt.key ? '2px solid var(--pop-green)' : '2px solid rgba(255,255,255,0.15)',
                                    boxShadow: questionAnswer === opt.key ? '0 0 16px rgba(204,250,0,0.4)' : 'none',
                                    background: questionAnswer === opt.key ? 'var(--pop-green)' : 'transparent',
                                    color: questionAnswer === opt.key ? 'var(--pop-black)' : 'var(--pop-white)',
                                  }}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {wizardStep === 'comments' && (
                      <div>
                        <p className="pop-headline text-xl mb-3 text-center">Any Comments</p>
                        <div className="pop-panel p-4">
                          <textarea
                            value={comments}
                            onChange={e => setComments(e.target.value)}
                            rows={3}
                            placeholder="Banter, a prediction, whatever..."
                            className="pop-input w-full p-2 font-bold text-sm"
                            style={{ borderColor: 'var(--pop-white)' }}
                          />
                        </div>
                      </div>
                    )}

                    {wizardStep === 'review' && (
                      <div>
                        <p className="pop-headline text-xl mb-3 text-center">Review &amp; Submit</p>
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center justify-between rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <span className="font-mono text-xs uppercase" style={{ color: 'rgba(255,255,255,0.5)' }}>Team</span>
                            <span className="font-black text-sm flex items-center gap-2">
                              <TeamCrest crestUrl={getTeam(selectedTeam)?.crest_url ?? null} teamName={getTeam(selectedTeam)?.name ?? ''} size={20} />
                              {teamDisplayName(getTeam(selectedTeam))}
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <span className="font-mono text-xs uppercase" style={{ color: 'rgba(255,255,255,0.5)' }}>Player 1</span>
                            <span className="font-black text-sm">
                              {playerName(player1)}
                              {aonChoice === player1 && <span className="pop-badge pop-badge--pink ml-2 px-1.5 py-0.5 text-[9px]">AoN</span>}
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <span className="font-mono text-xs uppercase" style={{ color: 'rgba(255,255,255,0.5)' }}>Player 2</span>
                            <span className="font-black text-sm">
                              {playerName(player2)}
                              {aonChoice === player2 && <span className="pop-badge pop-badge--pink ml-2 px-1.5 py-0.5 text-[9px]">AoN</span>}
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <span className="font-mono text-xs uppercase" style={{ color: 'rgba(255,255,255,0.5)' }}>Banker</span>
                            <span className="font-black text-sm">{isBanker ? '★ Declared' : 'Not used'}</span>
                          </div>
                          {bonusCardAvailable && (
                            <div className="flex items-center justify-between rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                              <span className="font-mono text-xs uppercase" style={{ color: 'rgba(255,255,255,0.5)' }}>{bonusCardName}</span>
                              <span className="font-black text-sm">
                                {bonusCardSpentElsewhere ? 'Used elsewhere' : playBonusCard ? '★ Declared' : 'Not used'}
                              </span>
                            </div>
                          )}
                          {question && questionAnswerLabel && (
                            <div className="flex items-center justify-between rounded-lg p-2.5 gap-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                              <span className="font-mono text-xs uppercase shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }}>Answer</span>
                              <span className="font-bold text-sm text-right">{questionAnswerLabel}</span>
                            </div>
                          )}
                        </div>

                        {message && (
                          <p className="pop-badge pop-badge--red px-3 py-2 mb-4 inline-block text-xs">{message}</p>
                        )}

                        <button
                          onClick={savePick}
                          disabled={saving || !wizardStepsValid}
                          className={`pop-button pop-submit-btn ${saving ? '' : justSaved ? 'pop-button--green pop-celebrate' : 'pop-button--yellow'} w-full py-4 text-xl inline-flex items-center justify-center gap-2`}
                          style={saving
                            ? { background: '#CCCCCC', color: 'var(--pop-black)', opacity: 1, position: 'relative' }
                            : { opacity: 1, position: 'relative' }}
                        >
                          {!saving && <span className="pop-submit-kick inline-block">⚽</span>}
                          {saving ? 'Saving...' : justSaved ? 'Locked In!' : hasPick ? 'Update Pick!' : 'Submit Pick!'}
                          {confettiPieces.map(p => (
                            <span
                              key={p.id}
                              className="pop-confetti-piece"
                              style={{
                                position: 'absolute', left: '50%', top: '50%',
                                width: 6, height: 6, borderRadius: 2, background: p.color,
                                // @ts-expect-error custom properties aren't in the CSS typings
                                '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`,
                              }}
                            />
                          ))}
                        </button>
                      </div>
                    )}

                    </div>

                    <div className="flex items-center justify-between mt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
                      <button
                        onClick={wizardBack}
                        disabled={wizardIndex === 0}
                        className="font-bold text-sm px-3 py-2"
                        style={{ color: wizardIndex === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)' }}
                      >
                        ← Back
                      </button>
                      {wizardIndex < wizardSteps.length - 1 && (
                        <button
                          onClick={wizardNext}
                          disabled={!wizardSteps[wizardIndex]?.valid}
                          className="pop-button px-5 py-2 text-sm"
                        >
                          Next →
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </Shell>
      </>
    )
  }

  return (
    <>
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
                                const max = playerMaxOverride[p.id] ?? 2
                                const maxed = count >= max
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => { if (!maxed) { setPlayer1(p.id); setPlayer1Fixture(null); setPlayerSearch1(''); setPlayer1Club(null) } }}
                                    disabled={maxed}
                                    className={`block w-full text-left px-3 py-2 text-sm ${maxed ? 'text-[#F5ECD9]/30 line-through cursor-not-allowed' : 'hover:bg-white/10'}`}
                                  >
                                    <span className="uppercase">{playerName(p.id)}</span>
                                    <span className="text-xs text-[#F5ECD9]/40 ml-2">({count}/{max})</span>
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
                                const max = playerMaxOverride[p.id] ?? 2
                                const maxed = count >= max
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => { if (!maxed) { setPlayer2(p.id); setPlayer2Fixture(null); setPlayerSearch2(''); setPlayer2Club(null) } }}
                                    disabled={maxed}
                                    className={`block w-full text-left px-3 py-2 text-sm ${maxed ? 'text-[#F5ECD9]/30 line-through cursor-not-allowed' : 'hover:bg-white/10'}`}
                                  >
                                    <span className="uppercase">{playerName(p.id)}</span>
                                    <span className="text-xs text-[#F5ECD9]/40 ml-2">({count}/{max})</span>
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

                  {player1 && player2 && (
                    <div className="mb-5 bg-white/5 border border-white/10 rounded-lg p-4">
                      <p className="text-xs font-bold uppercase tracking-wider mb-2 text-[#D9A441]">All or Nothing</p>
                      {aonCardSpentElsewhere ? (
                        <p className="text-sm text-[#F5ECD9]/80">
                          Already played this competition{aonUsedGwNumber ? ` (GW${aonUsedGwNumber})` : ''} —{' '}
                          {allOrNothing?.outcome === 'success' ? 'succeeded! 🎉' : allOrNothing?.outcome === 'failed' ? 'failed.' : 'result pending.'}
                        </p>
                      ) : aonChoice != null ? (
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded bg-[#D9A441]/15 border border-[#D9A441] text-[#D9A441]">
                            Playing on {playerName(aonChoice)}
                          </span>
                          <button
                            onClick={() => setAonChoice(null)}
                            className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded border border-white/10 bg-white/5 hover:border-[#D9A441]/50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => aonEligible1 && setAonChoice(player1)}
                            disabled={!aonEligible1}
                            title={aonExclusion1 ?? (!aonEligible1 ? 'Already used this player this competition' : undefined)}
                            className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded border ${
                              aonEligible1 ? 'bg-white/5 border-white/10 hover:border-[#D9A441]/50' : 'bg-white/5 border-white/10 text-[#F5ECD9]/30 cursor-not-allowed'
                            }`}
                          >
                            Play on {playerName(player1)}
                          </button>
                          <button
                            onClick={() => aonEligible2 && setAonChoice(player2)}
                            disabled={!aonEligible2}
                            title={aonExclusion2 ?? (!aonEligible2 ? 'Already used this player this competition' : undefined)}
                            className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded border ${
                              aonEligible2 ? 'bg-white/5 border-white/10 hover:border-[#D9A441]/50' : 'bg-white/5 border-white/10 text-[#F5ECD9]/30 cursor-not-allowed'
                            }`}
                          >
                            Play on {playerName(player2)}
                          </button>
                        </div>
                      )}
                      <p className="text-[10px] text-[#F5ECD9]/40 mt-2">
                        One nomination per competition. Score or assist this week and you get a bonus 3rd use of them — blank, and you lose all remaining uses.
                      </p>
                    </div>
                  )}

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