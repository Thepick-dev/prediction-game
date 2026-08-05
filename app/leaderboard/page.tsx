'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import TeamCrest from '../../components/TeamCrest'
import KitBadge from '../../components/KitBadge'
import { buildPlayerDisplayNames } from '../lib/players'
import LeaderboardShareCard from '../../components/LeaderboardShareCard'
import { usePopArtTheme } from '../lib/usePopArtTheme'
import PopArtLoading from '../../components/PopArtLoading'

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
  best_gameweek_score: number
}

type Team = { id: number; name: string; short_name: string | null; short_code: string | null; crest_url: string | null }

type PickDetail = {
  gw: number
  team_id: number
  player1: string
  player2: string
  player1_id: number
  player2_id: number
  is_banker: boolean
  is_autopick: boolean
  provisional: boolean
  points: number | null
  team_points: number | null
  player1_points: number | null
  player2_points: number | null
  team_detail: {
    opponent_team_id: number | null
    team_quartile: number
    opponent_quartile: number
    is_home: boolean | null
    team_score: number | null
    opponent_score: number | null
  } | null
}

function teamDisplayName(team: Team | undefined) {
  if (!team) return 'Unknown'
  return team.short_name ?? team.name.replace(' FC', '').replace(' AFC', '')
}

export default function LeaderboardPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [competition, setCompetition] = useState<any>(null)
  const [ranked, setRanked] = useState<RankedPlayer[]>([])
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [pickDetails, setPickDetails] = useState<Record<string, PickDetail[]>>({})
  const [allGameweeks, setAllGameweeks] = useState<{ id: string; number: number; deadline: string }[]>([])
  const [matchEvents, setMatchEvents] = useState<any[]>([])
  const [potwUserId, setPotwUserId] = useState<string | null>(null)
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [teamMap, setTeamMap] = useState<Record<number, Team>>({})
  const [kitByUser, setKitByUser] = useState<Record<string, { pattern: string; colour1: string; colour2: string; colour3: string | null; stars: number; earths: number }>>({})
  const [usedTeamsByPlayer, setUsedTeamsByPlayer] = useState<Record<string, Record<number, number>>>({})
  const [doubleUseByPlayer, setDoubleUseByPlayer] = useState<Record<string, number[]>>({})
  const [avgByGw, setAvgByGw] = useState<Record<number, number>>({})
  const [submittedKeys, setSubmittedKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showShare, setShowShare] = useState(false)

  const supabase = createClient()
  const { popArt } = usePopArtTheme(user?.id)

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

    const [{ data: entries }, { data: profiles }, { data: pointsData }, { data: rawPicks }, { data: teams }, { data: players }, { data: gameweeks }, { data: events }, { data: draftPicks }, { data: fixtures }, { data: submissions }] = await Promise.all([
      supabase.from('competition_entries').select('user_id, joined_at').eq('competition_id', comp.id).eq('removed', false),
      supabase.from('profiles').select('id, display_name, kit_pattern, kit_colour_1, kit_colour_2'),
      supabase.from('points').select('user_id, pick_id, total_points, team_points, player1_points, player2_points, breakdown, gameweek_id').eq('competition_id', comp.id),
      supabase.from('picks').select('id, user_id, gameweek_id, team_id, player1_id, player2_id, is_banker, is_autopick').eq('competition_id', comp.id),
      supabase.from('teams').select('id, name, short_name, short_code, crest_url').eq('active', true),
      supabase.from('players').select('id, name, web_name, team_id'),
      supabase.from('gameweeks').select('id, number, deadline, status').eq('competition_id', comp.id),
      supabase.from('match_events').select('player_id, event_type, fixture_id'),
      supabase.from('tier_draft_picks').select('user_id, tier1_team_id, tier2_team_id, tier3_team_id').eq('competition_id', comp.id),
      supabase.from('fixtures').select('id, gameweek_id'),
      // A separate, always-readable view (never the raw `picks` row) — the
      // database now hides another user's actual pre-deadline selection
      // entirely, so this is the only way left to know THAT they've picked,
      // which is what lets the row below still say "Picked — hidden until
      // deadline" instead of misreading a hidden pick as "Not yet due".
      supabase.from('pick_submission_status').select('user_id, gameweek_id').eq('competition_id', comp.id)
    ])

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

    setMatchEvents(events ?? [])
    setAllTeams(teams ?? [])

    const profileMap: Record<string, string> = {}
    const kitMap: Record<string, { pattern: string; colour1: string; colour2: string; colour3: string | null; stars: number; earths: number }> = {}
    profiles?.forEach(p => {
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
    setKitByUser(kitMap)

    const tMap: Record<number, Team> = {}
    teams?.forEach(t => { tMap[t.id] = t })
    setTeamMap(tMap)

    const playerMap = buildPlayerDisplayNames(players ?? [], tMap)

    const gwMap: Record<string, number> = {}
    gameweeks?.forEach(g => { gwMap[g.id] = g.number })
    setAllGameweeks((gameweeks ?? []).slice().sort((a, b) => a.number - b.number))

    setSubmittedKeys(new Set((submissions ?? []).map(s => `${s.user_id}-${s.gameweek_id}`)))

    const pointsByPickId: Record<string, any> = {}
    pointsData?.forEach(p => { pointsByPickId[p.pick_id] = p })

    const doubleUseMap: Record<string, number[]> = {}
    draftPicks?.forEach(dp => {
      const teamIds = [dp.tier1_team_id, dp.tier2_team_id, dp.tier3_team_id].filter(Boolean) as number[]
      doubleUseMap[dp.user_id] = teamIds
    })
    setDoubleUseByPlayer(doubleUseMap)

    const now = new Date()

    // An admin session can read every row here (the RLS bypass on `picks`
    // exists for the dedicated admin tooling — picks-log, edit-pick,
    // print-grid, summary). The leaderboard isn't admin tooling, so it
    // deliberately throws that extra visibility away before it reaches
    // any component state: an admin browsing the leaderboard should see
    // exactly what any other player sees, with full detail confined to
    // the admin section proper.
    const gwDeadlineById: Record<string, string> = {}
    gameweeks?.forEach(g => { gwDeadlineById[g.id] = g.deadline })
    const picks = (rawPicks ?? []).filter(p =>
      p.user_id === user?.id || new Date(gwDeadlineById[p.gameweek_id]) < now
    )

    // Fetch provisional autopicks for any gameweek past deadline but not yet scored.
    const previewGameweeks = (gameweeks ?? []).filter(g =>
      new Date(g.deadline) < now && g.status !== 'completed'
    )

    const realPickKeys = new Set((picks ?? []).map(p => `${p.user_id}-${p.gameweek_id}`))
    type ProvisionalPick = { user_id: string; gameweek_id: string; team_id: number; player1_id: number; player2_id: number }
    let provisionalPicks: ProvisionalPick[] = []

    await Promise.all(previewGameweeks.map(async gw => {
      try {
        const [previewRes, scoringPreviewRes] = await Promise.all([
          fetch(`/api/autopick/preview?gameweek_id=${gw.id}`),
          fetch(`/api/scoring/preview?gameweek_id=${gw.id}`),
        ])
        const data = await previewRes.json()
        const previews = data.previews ?? {}
        Object.entries(previews).forEach(([userId, p]: [string, any]) => {
          if (!realPickKeys.has(`${userId}-${gw.id}`)) {
            provisionalPicks.push({
              user_id: userId,
              gameweek_id: gw.id,
              team_id: p.team_id,
              player1_id: p.player1_id,
              player2_id: p.player2_id,
            })
          }
        })

        // The scoring preview is scoped to one gameweek, so its rows use a
        // plain `preview-${userId}` id — remap to match this page's own
        // `preview-${userId}-${gameweekId}` convention (it spans several
        // gameweeks at once, so needs the gameweek in the key to stay unique).
        const scoringData = await scoringPreviewRes.json()
        ;(scoringData.rows ?? []).forEach((row: any) => {
          if (row.pick_id.startsWith('preview-')) {
            pointsByPickId[`preview-${row.user_id}-${gw.id}`] = row
          } else {
            pointsByPickId[row.pick_id] = row
          }
        })
      } catch {
        // ignore preview failures
      }
    }))

    // Combined pick list: real picks + provisional autopicks
    const combinedPicks = [
      ...(picks ?? []).map(p => ({ ...p, provisional: false })),
      ...provisionalPicks.map(p => ({
        id: `preview-${p.user_id}-${p.gameweek_id}`,
        user_id: p.user_id,
        gameweek_id: p.gameweek_id,
        team_id: p.team_id,
        player1_id: p.player1_id,
        player2_id: p.player2_id,
        is_banker: false,
        is_autopick: true,
        provisional: true,
      }))
    ]

    const usedMap: Record<string, Record<number, number>> = {}
    combinedPicks.forEach(pick => {
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

    // Goals scored by a picked player only count towards that specific
    // gameweek's pick, not their season total, so we need to know which
    // gameweek each goal's fixture belongs to.
    const fixtureGwMap: Record<number, string> = {}
    fixtures?.forEach(f => { fixtureGwMap[f.id] = f.gameweek_id })

    const goalCountByPlayerGw: Record<string, number> = {}
    events?.forEach(e => {
      if (e.event_type !== 'goal' || !e.player_id || !e.fixture_id) return
      const gwId = fixtureGwMap[e.fixture_id]
      if (!gwId) return
      const key = `${e.player_id}_${gwId}`
      goalCountByPlayerGw[key] = (goalCountByPlayerGw[key] || 0) + 1
    })

    const pickById: Record<string, { player1_id: number; player2_id: number }> = {}
    picks?.forEach(p => { pickById[p.id] = { player1_id: p.player1_id, player2_id: p.player2_id } })

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
        weekly_points: [],
        best_gameweek_score: 0
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

      const pickPlayers = pickById[p.pick_id]
      if (pickPlayers) {
        t.goals += (goalCountByPlayerGw[`${pickPlayers.player1_id}_${p.gameweek_id}`] || 0)
                 + (goalCountByPlayerGw[`${pickPlayers.player2_id}_${p.gameweek_id}`] || 0)
      }

      const gwNum = gwMap[p.gameweek_id]
      if (gwNum) t.weekly_points[gwNum] = p.total_points ?? 0
    })

    // Tiebreaker #3: best single gameweek score, banker included — already
    // exactly what weekly_points holds (the final, banker-doubled total),
    // so no separate tracking needed. weekly_points is sparse (indexed by
    // gameweek number, gaps for gameweeks with no pick yet), so filter
    // those out before taking the max.
    Object.values(totals).forEach(t => {
      const scored = t.weekly_points.filter(v => v !== undefined)
      t.best_gameweek_score = scored.length > 0 ? Math.max(...scored) : 0
    })

    const rankedList = Object.values(totals).sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points
      if (b.points_without_banker !== a.points_without_banker) return b.points_without_banker - a.points_without_banker
      if (b.best_gameweek_score !== a.best_gameweek_score) return b.best_gameweek_score - a.best_gameweek_score
      if (b.away_wins !== a.away_wins) return b.away_wins - a.away_wins
      if (b.goals !== a.goals) return b.goals - a.goals
      return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
    })

    setRanked(rankedList)
    if (rankedList.length > 0) setPotwUserId(rankedList[0].user_id)

    const details: Record<string, PickDetail[]> = {}
    combinedPicks.forEach(pick => {
      if (!details[pick.user_id]) details[pick.user_id] = []
      // Provisional picks now resolve through pointsByPickId too (populated
      // above via the scoring preview) — this used to hard-null them here,
      // which threw away that data before it ever reached the render.
      const pts = pointsByPickId[(pick as any).id]
      details[pick.user_id].push({
        gw: gwMap[pick.gameweek_id] ?? 0,
        team_id: pick.team_id,
        player1: playerMap[pick.player1_id] ?? 'Unknown',
        player2: playerMap[pick.player2_id] ?? 'Unknown',
        player1_id: pick.player1_id,
        player2_id: pick.player2_id,
        is_banker: pick.is_banker,
        is_autopick: pick.is_autopick,
        provisional: (pick as any).provisional ?? false,
        points: pts?.total_points ?? null,
        team_points: pts?.team_points ?? null,
        player1_points: pts?.player1_points ?? null,
        player2_points: pts?.player2_points ?? null,
        team_detail: pts?.breakdown?.team_detail ?? null
      })
    })
    Object.values(details).forEach(list => list.sort((a, b) => a.gw - b.gw))
    setPickDetails(details)
    setLoading(false)
  }

  const goalPlayers = new Set(matchEvents.filter(e => e.event_type === 'goal').map(e => e.player_id))
  const assistPlayers = new Set(matchEvents.filter(e => e.event_type === 'assist').map(e => e.player_id))

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

  type GwRow =
    | { kind: 'run'; from: number; to: number; label: string }
    | { kind: 'gw'; gw: { id: string; number: number; deadline: string } }
    | { kind: 'hidden'; gw: { id: string; number: number; deadline: string } }

  // Collapses consecutive gameweeks with genuinely nothing to show (no pick
  // at all yet, same "not yet due"/"no pick" status) into a single row —
  // with 19+ gameweeks in a season, most of a player's history is blank
  // rows for a long stretch, and that shouldn't cost 19 lines of table.
  function buildGwRows(playerId: string): GwRow[] {
    const rows: GwRow[] = []
    let run: { from: number; to: number; label: string } | null = null

    function flush() {
      if (run) rows.push({ kind: 'run', ...run })
      run = null
    }

    allGameweeks.forEach(gw => {
      const d = pickDetails[playerId]?.find(pd => pd.gw === gw.number)
      if (!d) {
        // Another user's pick for a still-open gameweek: the database no
        // longer returns that row to us at all (RLS), so `d` is missing
        // even though they've genuinely picked — the submission-status
        // view is what tells us that's the case, so this doesn't get
        // mistaken for "Not yet due".
        const isOwnRow = user?.id === playerId
        const deadlinePassed = new Date() > new Date(gw.deadline)
        if (!isOwnRow && !deadlinePassed && submittedKeys.has(`${playerId}-${gw.id}`)) {
          flush()
          rows.push({ kind: 'hidden', gw })
          return
        }
        const label = deadlinePassed ? 'No pick' : 'Not yet due'
        if (run && run.label === label) {
          run.to = gw.number
        } else {
          flush()
          run = { from: gw.number, to: gw.number, label }
        }
      } else {
        flush()
        rows.push({ kind: 'gw', gw })
      }
    })
    flush()
    return rows
  }

  function getTeamsWithAvailability(userId: string) {
    const used = usedTeamsByPlayer[userId] ?? {}
    const doubleUse = doubleUseByPlayer[userId] ?? []
    return allTeams
      .map(team => {
        const usedCount = used[team.id] ?? 0
        const maxUses = doubleUse.includes(team.id) ? 2 : 1
        const remaining = maxUses - usedCount
        return { ...team, remaining, isDouble: doubleUse.includes(team.id) }
      })
      .sort((a, b) => teamDisplayName(a).localeCompare(teamDisplayName(b)))
  }

  if (loading) {
    return (
      <Shell active="LEADERBOARD" theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? <PopArtLoading /> : <p className="text-gray-500">Loading...</p>}
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="LEADERBOARD" theme={popArt ? 'pop-art' : 'classic'}>
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
      <>
        <Shell active="LEADERBOARD" user={user} displayName={displayName} theme="pop-art">
          <div className="pop-art-theme">

            <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
              <h1 className="pop-hero pop-hero--blue text-5xl sm:text-6xl">Leaderboard</h1>
              {ranked.length > 0 && (
                <button
                  onClick={() => setShowShare(true)}
                  className="pop-button pop-button--yellow px-3 py-1.5 text-xs"
                >
                  Share Standings
                </button>
              )}
            </div>
            <p className="font-bold text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>{competition.name}</p>

            {potwUserId && (
              <div className="pop-panel pop-panel--yellow p-4 mb-6 flex items-center gap-3">
                <span className="text-2xl">👑</span>
                <div>
                  <p className="pop-headline text-xs" style={{ color: 'var(--pop-yellow)' }}>Current Leader</p>
                  <p className="font-black uppercase">{ranked[0]?.display_name}</p>
                </div>
              </div>
            )}

            <div className="pop-panel" style={{ overflow: 'hidden' }}>
              {/* table-layout: fixed + explicit column widths, rather than
                  hiding columns on mobile — every stat classic shows stays
                  visible here too. Fixed layout makes the browser wrap a
                  long name instead of stretching the table past 100% width
                  (which is what was clipping the rightmost columns before). */}
              <table className="w-full" style={{ fontSize: '10.5px', tableLayout: 'fixed' }}>
                <thead>
                  <tr className="text-left" style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                    <th className="py-2 pl-1 pr-0.5 sm:px-2 uppercase tracking-wider" style={{ width: '7%' }}>#</th>
                    <th className="py-2 px-0.5 sm:px-2 uppercase tracking-wider" style={{ width: '32%' }}>Player</th>
                    <th className="py-2 px-0.5 sm:px-2 text-center uppercase tracking-wider" style={{ width: '8.5%' }}>HW</th>
                    <th className="py-2 px-0.5 sm:px-2 text-center uppercase tracking-wider" style={{ width: '8.5%' }}>AW</th>
                    <th className="py-2 px-0.5 sm:px-2 text-right uppercase tracking-wider" style={{ width: '9%' }} title="Best single-gameweek score (tiebreaker #3)">Best</th>
                    <th className="py-2 px-0.5 sm:px-2 text-right uppercase tracking-wider" style={{ width: '8.5%' }}>Tm</th>
                    <th className="py-2 px-0.5 sm:px-2 text-right uppercase tracking-wider" style={{ width: '8.5%' }}>Pl</th>
                    <th className="py-2 px-0.5 sm:px-2 text-right uppercase tracking-wider" style={{ width: '8.5%' }}>Bk</th>
                    <th className="py-2 pl-0.5 pr-1 sm:px-2 text-right uppercase tracking-wider font-black" style={{ width: '9.5%' }}>Tot</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((player, index) => {
                    const streak = getStreak(player)
                    const teamsWithAvailability = getTeamsWithAvailability(player.user_id)
                    return (
                      <React.Fragment key={player.user_id}>
                        <tr
                          onClick={() => setExpandedUser(expandedUser === player.user_id ? null : player.user_id)}
                          className="cursor-pointer"
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                        >
                          <td className="py-2 pl-1 pr-0.5 sm:px-2" style={{ color: 'rgba(255,255,255,0.35)' }}>{index + 1}</td>
                          <td className="py-2 px-0.5 sm:px-2 font-black uppercase" style={{ wordBreak: 'break-word' }}>
                            <div className="flex items-center gap-1 flex-wrap">
                              <KitBadge
                                pattern={kitByUser[player.user_id]?.pattern ?? 'solid'}
                                colour1={kitByUser[player.user_id]?.colour1 ?? '#1E4D6B'}
                                colour2={kitByUser[player.user_id]?.colour2 ?? '#F5ECD9'}
                                colour3={kitByUser[player.user_id]?.colour3}
                                size={14}
                              />
                              <span>{player.display_name}</span>
                              {index === 0 && <span style={{ color: 'var(--pop-yellow)' }}>👑</span>}
                              {streak && <span title={`${streak} weeks above average`}>🔥</span>}
                              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '8px' }}>{expandedUser === player.user_id ? '▲' : '▼'}</span>
                            </div>
                          </td>
                          <td className="py-2 px-0.5 sm:px-2 text-center" style={{ color: 'rgba(255,255,255,0.6)' }}>{player.home_wins}</td>
                          <td className="py-2 px-0.5 sm:px-2 text-center" style={{ color: 'rgba(255,255,255,0.6)' }}>{player.away_wins}</td>
                          <td className="py-2 px-0.5 sm:px-2 text-right" style={{ color: 'rgba(255,255,255,0.6)' }}>{player.best_gameweek_score}</td>
                          <td className="py-2 px-0.5 sm:px-2 text-right" style={{ color: 'rgba(255,255,255,0.6)' }}>{Math.round(player.team_points)}</td>
                          <td className="py-2 px-0.5 sm:px-2 text-right" style={{ color: 'rgba(255,255,255,0.6)' }}>{Math.round(player.player_points)}</td>
                          <td className="py-2 px-0.5 sm:px-2 text-right" style={{ color: 'rgba(255,255,255,0.6)' }}>{Math.round(player.banker_points)}</td>
                          <td className="py-2 pl-0.5 pr-1 sm:px-2 text-right font-black" style={{ color: 'var(--pop-green)' }}>{player.total_points}</td>
                        </tr>
                        {expandedUser === player.user_id && (
                          <tr>
                            <td colSpan={9} className="px-1.5 sm:px-3 py-3" style={{ background: 'rgba(0,0,0,0.35)' }}>
                              <div className="flex items-center justify-between gap-3 mb-4 pb-3 flex-wrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                                <KitBadge
                                  pattern={kitByUser[player.user_id]?.pattern ?? 'solid'}
                                  colour1={kitByUser[player.user_id]?.colour1 ?? '#1E4D6B'}
                                  colour2={kitByUser[player.user_id]?.colour2 ?? '#F5ECD9'}
                                  colour3={kitByUser[player.user_id]?.colour3}
                                  stars={kitByUser[player.user_id]?.stars ?? 0}
                                  earths={kitByUser[player.user_id]?.earths ?? 0}
                                  size={40}
                                  iconTextClass="text-base sm:text-xl"
                                  starColor="var(--pop-pink)"
                                />
                                <div className="text-right">
                                  <p className="text-[9px] uppercase tracking-widest font-black" style={{ color: 'rgba(255,255,255,0.4)' }}>Best Gameweek (tiebreaker #3)</p>
                                  <p className="text-sm font-black" style={{ color: 'var(--pop-green)' }}>{player.best_gameweek_score} pts</p>
                                </div>
                              </div>
                              {allGameweeks.length === 0 ? (
                                <p className="mb-3" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>No picks yet.</p>
                              ) : (
                                <table className="w-full mb-4" style={{ fontSize: '9px' }}>
                                  <thead>
                                    <tr className="text-left uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                                      <th className="py-1 pr-1">GW</th>
                                      <th className="py-1 pr-1">Team</th>
                                      <th className="py-1 pr-1 text-right">Pts</th>
                                      <th className="py-1 pr-1">P1</th>
                                      <th className="py-1 pr-1 text-right">Pts</th>
                                      <th className="py-1 pr-1">P2</th>
                                      <th className="py-1 pr-1 text-right">Pts</th>
                                      <th className="py-1 text-right font-black">Tot</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {buildGwRows(player.user_id).map(row => {
                                      if (row.kind === 'run') {
                                        if (row.from === row.to) {
                                          return (
                                            <tr key={`gw-${row.from}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }}>
                                              <td className="py-1 pr-1 font-black">{row.from}</td>
                                              <td className="py-1 pr-1 uppercase" colSpan={6}>{row.label}</td>
                                              <td className="py-1 text-right font-black">—</td>
                                            </tr>
                                          )
                                        }
                                        return (
                                          <tr key={`run-${row.from}-${row.to}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.2)' }}>
                                            <td className="py-1 pr-1 font-black" colSpan={7}>
                                              GW {row.from}&ndash;{row.to} <span className="normal-case" style={{ color: 'rgba(255,255,255,0.3)' }}>({row.to - row.from + 1} gameweeks)</span> &mdash; {row.label}
                                            </td>
                                            <td className="py-1 text-right font-black">—</td>
                                          </tr>
                                        )
                                      }
                                      if (row.kind === 'hidden') {
                                        return (
                                          <tr key={row.gw.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }}>
                                            <td className="py-1 pr-1 font-black">{row.gw.number}</td>
                                            <td className="py-1 pr-1 uppercase" colSpan={6}>Picked — hidden until deadline</td>
                                            <td className="py-1 text-right font-black">—</td>
                                          </tr>
                                        )
                                      }
                                      const gw = row.gw
                                      const d = pickDetails[player.user_id]?.find(pd => pd.gw === gw.number)!
                                      return (
                                        <tr key={gw.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                          <td className="py-1 pr-1 font-black">{d.gw}</td>
                                          <td className="py-1 pr-1 uppercase">
                                            <div className="flex items-center gap-1">
                                              <TeamCrest crestUrl={teamMap[d.team_id]?.crest_url ?? null} teamName={teamMap[d.team_id]?.name ?? ''} size={14} />
                                              {teamDisplayName(teamMap[d.team_id])}
                                              {d.is_banker && <span className="px-0.5 rounded font-black" style={{ background: 'var(--pop-yellow)', color: 'var(--pop-black)' }}>★</span>}
                                              {(d.provisional || d.is_autopick) && <span className="px-0.5 rounded" style={{ background: 'rgba(255,255,255,0.15)' }} title="No pick was made in time, so the computer picked automatically">AP</span>}
                                            </div>
                                            {d.team_detail?.opponent_team_id != null && (
                                              <div className="normal-case" style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)' }}>
                                                <span
                                                  className="inline-block px-0.5 rounded font-black mr-1"
                                                  style={d.team_detail.is_home
                                                    ? { background: 'rgba(0,176,255,0.2)', color: 'var(--pop-blue)' }
                                                    : { background: 'rgba(255,61,0,0.2)', color: 'var(--pop-orange)' }}
                                                  title={d.team_detail.is_home ? 'Played at home' : 'Played away'}
                                                >
                                                  {d.team_detail.is_home ? 'H' : 'A'}
                                                </span>
                                                vs {teamMap[d.team_detail.opponent_team_id]?.short_code
                                                  ?? teamMap[d.team_detail.opponent_team_id]?.short_name
                                                  ?? '?'}
                                                {' '}(Q{d.team_detail.team_quartile}→Q{d.team_detail.opponent_quartile})
                                                {d.team_detail.team_score != null
                                                  ? <>{' '}· {d.team_detail.team_score}-{d.team_detail.opponent_score}</>
                                                  : <>{' '}· not played yet</>}
                                              </div>
                                            )}
                                          </td>
                                          <td className="py-1 pr-1 text-right" style={{ color: 'rgba(255,255,255,0.5)' }}>{d.team_points ?? '—'}</td>
                                          <td className="py-1 pr-1 uppercase">
                                            {d.player1}
                                            {goalPlayers.has(d.player1_id) && <span className="ml-0.5 px-0.5 rounded font-black" style={{ background: 'var(--pop-green)', color: 'var(--pop-black)' }}>G</span>}
                                            {assistPlayers.has(d.player1_id) && <span className="ml-0.5 px-0.5 rounded font-black" style={{ background: 'rgba(0,230,118,0.25)', color: 'var(--pop-green)' }}>A</span>}
                                          </td>
                                          <td className="py-1 pr-1 text-right" style={{ color: 'rgba(255,255,255,0.5)' }}>{d.player1_points ?? '—'}</td>
                                          <td className="py-1 pr-1 uppercase">
                                            {d.player2}
                                            {goalPlayers.has(d.player2_id) && <span className="ml-0.5 px-0.5 rounded font-black" style={{ background: 'var(--pop-green)', color: 'var(--pop-black)' }}>G</span>}
                                            {assistPlayers.has(d.player2_id) && <span className="ml-0.5 px-0.5 rounded font-black" style={{ background: 'rgba(0,230,118,0.25)', color: 'var(--pop-green)' }}>A</span>}
                                          </td>
                                          <td className="py-1 pr-1 text-right" style={{ color: 'rgba(255,255,255,0.5)' }}>{d.player2_points ?? '—'}</td>
                                          <td className="py-1 text-right font-black">{d.points ?? '—'}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              )}

                              <div style={{ fontSize: '9px' }}>
                                <p className="uppercase tracking-wider font-black mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                  Teams ({teamsWithAvailability.filter(t => t.remaining > 0).length} available)
                                </p>
                                {teamsWithAvailability.length === 0 ? (
                                  <p style={{ color: 'rgba(255,255,255,0.4)' }}>No teams.</p>
                                ) : (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                                    {teamsWithAvailability.map(team => {
                                      const used = team.remaining <= 0
                                      return (
                                        <div
                                          key={team.id}
                                          className="flex items-center gap-1 rounded px-1.5 py-1"
                                          style={used
                                            ? { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', opacity: 0.4 }
                                            : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
                                        >
                                          <TeamCrest crestUrl={team.crest_url} teamName={team.name} size={14} />
                                          <span className="uppercase truncate">{teamDisplayName(team)}</span>
                                          {team.isDouble && !used && team.remaining === 2 && (
                                            <span className="font-black shrink-0" style={{ color: 'var(--pop-yellow)' }}>×2</span>
                                          )}
                                        </div>
                                      )
                                    })}
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
                      <td colSpan={9} className="py-8 text-center uppercase tracking-wider" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>No players yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 uppercase tracking-wider" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
              <span className="font-black mr-2">Key:</span>
              👑 Leader
              <span className="mx-2">·</span>
              🔥 Streak (3+ wks above avg)
              <span className="mx-2">·</span>
              <span className="px-0.5 rounded" style={{ background: 'rgba(255,255,255,0.15)' }}>AP</span> Autopick — computer picked it (deadline passed, no pick made)
              <span className="mx-2">·</span>
              Click a row to expand
            </div>

          </div>
        </Shell>

        {showShare && (
          <LeaderboardShareCard
            competitionName={competition.name}
            standings={ranked.map(p => ({ name: p.display_name, points: p.total_points }))}
            onClose={() => setShowShare(false)}
          />
        )}
      </>
    )
  }

  return (
    <Shell active="LEADERBOARD" user={user} displayName={displayName}>
      <HeroPage wide>
        <div className="w-full text-[#F5ECD9]">

          <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
            <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>LEADERBOARD</h1>
            {ranked.length > 0 && (
              <button
                onClick={() => setShowShare(true)}
                className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded border border-[#D9A441]/50 text-[#D9A441] hover:bg-[#D9A441]/10 transition-colors"
              >
                📱 Share Standings
              </button>
            )}
          </div>
          <p className="text-[#D9A441]/70 mb-6 text-sm">{competition.name}</p>

          {potwUserId && (
            <div className="bg-[#D9A441]/15 border border-[#D9A441]/40 rounded-lg px-4 py-3 mb-5 flex items-center gap-3">
              <span className="text-xl">👑</span>
              <div>
                <p className="text-xs text-[#D9A441] font-bold uppercase tracking-wide">Current Leader</p>
                <p className="font-bold uppercase">{ranked[0]?.display_name}</p>
              </div>
            </div>
          )}

          <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
            <table className="w-full" style={{ fontSize: '12px' }}>
              <thead>
                <tr className="text-left border-b border-white/10 text-[#F5ECD9]/50" style={{ fontSize: '10px' }}>
                  <th className="py-2 px-1 sm:px-2 uppercase tracking-wider">#</th>
                  <th className="py-2 px-1 sm:px-2 uppercase tracking-wider">Player</th>
                  <th className="py-2 px-1 sm:px-2 text-center uppercase tracking-wider">HW</th>
                  <th className="py-2 px-1 sm:px-2 text-center uppercase tracking-wider">AW</th>
                  <th className="py-2 px-1 sm:px-2 text-right uppercase tracking-wider" title="Best single-gameweek score (tiebreaker #3)">Best</th>
                  <th className="py-2 px-1 sm:px-2 text-right uppercase tracking-wider">Tm</th>
                  <th className="py-2 px-1 sm:px-2 text-right uppercase tracking-wider">Pl</th>
                  <th className="py-2 px-1 sm:px-2 text-right uppercase tracking-wider">Bk</th>
                  <th className="py-2 px-1 sm:px-2 text-right uppercase tracking-wider font-bold">Tot</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((player, index) => {
                  const streak = getStreak(player)
                  const teamsWithAvailability = getTeamsWithAvailability(player.user_id)
                  return (
                    <React.Fragment key={player.user_id}>
                      <tr
                        onClick={() => setExpandedUser(expandedUser === player.user_id ? null : player.user_id)}
                        className="border-b border-white/5 cursor-pointer hover:bg-white/5"
                      >
                        <td className="py-2 px-1 sm:px-2 text-[#F5ECD9]/40">{index + 1}</td>
                        <td className="py-2 px-1 sm:px-2 font-bold uppercase">
                          <div className="flex items-center gap-1.5">
                            <KitBadge
                              pattern={kitByUser[player.user_id]?.pattern ?? 'solid'}
                              colour1={kitByUser[player.user_id]?.colour1 ?? '#1E4D6B'}
                              colour2={kitByUser[player.user_id]?.colour2 ?? '#F5ECD9'}
                              colour3={kitByUser[player.user_id]?.colour3}
                              size={16}
                            />
                            {player.display_name}
                            {index === 0 && <span className="text-[#D9A441]">👑</span>}
                            {streak && <span title={`${streak} weeks above average`}>🔥</span>}
                            <span className="text-[#F5ECD9]/30" style={{ fontSize: '9px' }}>{expandedUser === player.user_id ? '▲' : '▼'}</span>
                          </div>
                        </td>
                        <td className="py-2 px-1 sm:px-2 text-center text-[#F5ECD9]/60">{player.home_wins}</td>
                        <td className="py-2 px-1 sm:px-2 text-center text-[#F5ECD9]/60">{player.away_wins}</td>
                        <td className="py-2 px-1 sm:px-2 text-right text-[#F5ECD9]/60">{player.best_gameweek_score}</td>
                        <td className="py-2 px-1 sm:px-2 text-right text-[#F5ECD9]/60">{Math.round(player.team_points)}</td>
                        <td className="py-2 px-1 sm:px-2 text-right text-[#F5ECD9]/60">{Math.round(player.player_points)}</td>
                        <td className="py-2 px-1 sm:px-2 text-right text-[#F5ECD9]/60">{Math.round(player.banker_points)}</td>
                        <td className="py-2 px-1 sm:px-2 text-right font-bold" style={{ color: '#D9A441' }}>{player.total_points}</td>
                      </tr>
                      {expandedUser === player.user_id && (
                        <tr>
                          <td colSpan={9} className="bg-black/20 px-1.5 sm:px-3 py-3">
                            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10 flex-wrap">
                              <KitBadge
                                pattern={kitByUser[player.user_id]?.pattern ?? 'solid'}
                                colour1={kitByUser[player.user_id]?.colour1 ?? '#1E4D6B'}
                                colour2={kitByUser[player.user_id]?.colour2 ?? '#F5ECD9'}
                                colour3={kitByUser[player.user_id]?.colour3}
                                stars={kitByUser[player.user_id]?.stars ?? 0}
                                earths={kitByUser[player.user_id]?.earths ?? 0}
                                size={40}
                                iconTextClass="text-base sm:text-xl"
                              />
                              <div className="text-right">
                                <p className="text-[9px] uppercase tracking-widest text-[#F5ECD9]/40 font-bold">Best Gameweek (tiebreaker #3)</p>
                                <p className="text-sm font-bold" style={{ color: '#D9A441' }}>{player.best_gameweek_score} pts</p>
                              </div>
                            </div>
                            {allGameweeks.length === 0 ? (
                              <p className="text-[#F5ECD9]/40 mb-3" style={{ fontSize: '10px' }}>No picks yet.</p>
                            ) : (
                              <table className="w-full mb-4" style={{ fontSize: '9px' }}>
                                <thead>
                                  <tr className="text-left text-[#F5ECD9]/40 border-b border-white/10 uppercase tracking-wider">
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
                                  {buildGwRows(player.user_id).map(row => {
                                    if (row.kind === 'run') {
                                      if (row.from === row.to) {
                                        return (
                                          <tr key={`gw-${row.from}`} className="border-b border-white/5 last:border-0 text-[#F5ECD9]/30">
                                            <td className="py-1 pr-1 font-bold">{row.from}</td>
                                            <td className="py-1 pr-1 uppercase" colSpan={6}>{row.label}</td>
                                            <td className="py-1 text-right font-bold">—</td>
                                          </tr>
                                        )
                                      }
                                      return (
                                        <tr key={`run-${row.from}-${row.to}`} className="border-b border-white/5 last:border-0 text-[#F5ECD9]/20">
                                          <td className="py-1 pr-1 font-bold" colSpan={7}>
                                            GW {row.from}&ndash;{row.to} <span className="normal-case text-[#F5ECD9]/30">({row.to - row.from + 1} gameweeks)</span> &mdash; {row.label}
                                          </td>
                                          <td className="py-1 text-right font-bold">—</td>
                                        </tr>
                                      )
                                    }
                                    if (row.kind === 'hidden') {
                                      return (
                                        <tr key={row.gw.id} className="border-b border-white/5 last:border-0 text-[#F5ECD9]/30">
                                          <td className="py-1 pr-1 font-bold">{row.gw.number}</td>
                                          <td className="py-1 pr-1 uppercase" colSpan={6}>Picked — hidden until deadline</td>
                                          <td className="py-1 text-right font-bold">—</td>
                                        </tr>
                                      )
                                    }
                                    const gw = row.gw
                                    const d = pickDetails[player.user_id]?.find(pd => pd.gw === gw.number)!
                                    return (
                                      <tr key={gw.id} className="border-b border-white/5 last:border-0">
                                        <td className="py-1 pr-1 font-bold">{d.gw}</td>
                                        <td className="py-1 pr-1 uppercase">
                                          <div className="flex items-center gap-1">
                                            <TeamCrest crestUrl={teamMap[d.team_id]?.crest_url ?? null} teamName={teamMap[d.team_id]?.name ?? ''} size={14} />
                                            {teamDisplayName(teamMap[d.team_id])}
                                            {d.is_banker && <span className="bg-[#D9A441] text-[#241a12] px-0.5 rounded font-bold">★</span>}
                                            {(d.provisional || d.is_autopick) && <span className="bg-white/20 px-0.5 rounded" title="No pick was made in time, so the computer picked automatically">AP</span>}
                                          </div>
                                          {d.team_detail?.opponent_team_id != null && (
                                            <div className="normal-case text-[#F5ECD9]/40" style={{ fontSize: '8px' }}>
                                              <span
                                                className={`inline-block px-0.5 rounded font-bold mr-1 ${d.team_detail.is_home ? 'bg-blue-500/20 text-blue-300' : 'bg-orange-500/20 text-orange-300'}`}
                                                title={d.team_detail.is_home ? 'Played at home' : 'Played away'}
                                              >
                                                {d.team_detail.is_home ? 'H' : 'A'}
                                              </span>
                                              vs {teamMap[d.team_detail.opponent_team_id]?.short_code
                                                ?? teamMap[d.team_detail.opponent_team_id]?.short_name
                                                ?? '?'}
                                              {' '}(Q{d.team_detail.team_quartile}→Q{d.team_detail.opponent_quartile})
                                              {d.team_detail.team_score != null
                                                ? <>{' '}· {d.team_detail.team_score}-{d.team_detail.opponent_score}</>
                                                : <>{' '}· not played yet</>}
                                            </div>
                                          )}
                                        </td>
                                        <td className="py-1 pr-1 text-right text-[#F5ECD9]/50">{d.team_points ?? '—'}</td>
                                        <td className="py-1 pr-1 uppercase">
                                          {d.player1}
                                          {goalPlayers.has(d.player1_id) && <span className="ml-0.5 bg-green-600 text-white px-0.5 rounded font-bold">G</span>}
                                          {assistPlayers.has(d.player1_id) && <span className="ml-0.5 bg-green-500/30 text-green-300 px-0.5 rounded font-bold">A</span>}
                                        </td>
                                        <td className="py-1 pr-1 text-right text-[#F5ECD9]/50">{d.player1_points ?? '—'}</td>
                                        <td className="py-1 pr-1 uppercase">
                                          {d.player2}
                                          {goalPlayers.has(d.player2_id) && <span className="ml-0.5 bg-green-600 text-white px-0.5 rounded font-bold">G</span>}
                                          {assistPlayers.has(d.player2_id) && <span className="ml-0.5 bg-green-500/30 text-green-300 px-0.5 rounded font-bold">A</span>}
                                        </td>
                                        <td className="py-1 pr-1 text-right text-[#F5ECD9]/50">{d.player2_points ?? '—'}</td>
                                        <td className="py-1 text-right font-bold">{d.points ?? '—'}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            )}

                            <div style={{ fontSize: '9px' }}>
                              <p className="text-[#F5ECD9]/40 uppercase tracking-wider font-bold mb-1.5">
                                Teams ({teamsWithAvailability.filter(t => t.remaining > 0).length} available)
                              </p>
                              {teamsWithAvailability.length === 0 ? (
                                <p className="text-[#F5ECD9]/40">No teams.</p>
                              ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                                  {teamsWithAvailability.map(team => {
                                    const used = team.remaining <= 0
                                    return (
                                      <div
                                        key={team.id}
                                        className={`flex items-center gap-1 rounded px-1.5 py-1 border ${
                                          used ? 'bg-white/[0.02] border-white/5 opacity-40' : 'bg-white/5 border-white/10'
                                        }`}
                                      >
                                        <TeamCrest crestUrl={team.crest_url} teamName={team.name} size={14} />
                                        <span className="uppercase truncate">{teamDisplayName(team)}</span>
                                        {team.isDouble && !used && team.remaining === 2 && (
                                          <span className="text-[#D9A441] font-bold shrink-0">×2</span>
                                        )}
                                      </div>
                                    )
                                  })}
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
                    <td colSpan={9} className="py-8 text-center text-[#F5ECD9]/40 uppercase tracking-wider" style={{ fontSize: '11px' }}>No players yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 uppercase tracking-wider text-[#F5ECD9]/40" style={{ fontSize: '10px' }}>
            <span className="font-bold mr-2">Key:</span>
            👑 Leader
            <span className="mx-2">·</span>
            🔥 Streak (3+ wks above avg)
            <span className="mx-2">·</span>
            <span className="bg-white/20 px-0.5 rounded">AP</span> Autopick — computer picked it (deadline passed, no pick made)
            <span className="mx-2">·</span>
            Click a row to expand
          </div>

        </div>
      </HeroPage>

      {showShare && (
        <LeaderboardShareCard
          competitionName={competition.name}
          standings={ranked.map(p => ({ name: p.display_name, points: p.total_points }))}
          onClose={() => setShowShare(false)}
        />
      )}
    </Shell>
  )
}