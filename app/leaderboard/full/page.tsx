'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import Shell from '../../components/ceefax-shell'
import { CrownIcon, FlameIcon, BoltIcon, CheckIcon, CrossIcon, ShadesIcon, PoundCoinIcon, ScalesIcon, BlockedIcon, TopDogIcon } from '../../../components/icons'
import HeroPage from '../../../components/HeroPage'
import TeamCrest from '../../../components/TeamCrest'
import KitBadge from '../../../components/KitBadge'
import BotAvatar from '../../../components/BotAvatar'
import { buildPlayerDisplayNames, bonusCardDisplayName } from '../../lib/players'
import { computeTopDog } from '../../lib/topDog'
import { computeAvgByGw, computeStreaks } from '../../lib/leaderboardBadges'
import { usePopArtTheme } from '../../lib/usePopArtTheme'
import { RULES_TEXT } from '../../lib/rulesText'
import PopArtLoading from '../../../components/PopArtLoading'
import Link from 'next/link'

type RankedPlayer = {
  user_id: string
  display_name: string
  is_bot: boolean
  is_reigning_champ: boolean
  is_vibes_champion: boolean
  in_cash_pool: boolean
  is_sporting_panel: boolean
  is_minigame_banned: boolean
  joined_at: string
  home_wins: number
  away_wins: number
  team_points: number
  player_points: number
  banker_points: number
  bonus_card_points: number
  total_points: number
  points_without_banker: number
  goals: number
  weekly_points: number[]
  best_gameweek_score: number
}

type Team = { id: number; name: string; short_name: string | null; short_code: string | null }

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
  aon: { player_id: number; outcome: string } | null
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

// The full, all-stats breakdown — a copy of what the main Leaderboard used
// to show inline before that page was simplified down to name + points.
// Reachable via the "Full Table" button there. Kept as a near-duplicate of
// that page's data-loading logic rather than a shared hook, so a change to
// one can't silently break the other.
export default function FullLeaderboardPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [competition, setCompetition] = useState<any>(null)
  const [ranked, setRanked] = useState<RankedPlayer[]>([])
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [teamsExpandedUsers, setTeamsExpandedUsers] = useState<Set<string>>(new Set())
  const [pickDetails, setPickDetails] = useState<Record<string, PickDetail[]>>({})
  const [allGameweeks, setAllGameweeks] = useState<{ id: string; number: number; deadline: string; status: string }[]>([])
  const [matchEvents, setMatchEvents] = useState<any[]>([])
  const [potwUserId, setPotwUserId] = useState<string | null>(null)
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [teamMap, setTeamMap] = useState<Record<number, Team>>({})
  const [kitByUser, setKitByUser] = useState<Record<string, { pattern: string; colour1: string; colour2: string; colour3: string | null; stars: number; earths: number }>>({})
  const [usedTeamsByPlayer, setUsedTeamsByPlayer] = useState<Record<string, Record<number, number>>>({})
  const [doubleUseByPlayer, setDoubleUseByPlayer] = useState<Record<string, number[]>>({})
  const [bankersUsedByPlayer, setBankersUsedByPlayer] = useState<Record<string, number>>({})
  const [aonUsedByPlayer, setAonUsedByPlayer] = useState<Set<string>>(new Set())
  const [bonusCardPlayedByUser, setBonusCardPlayedByUser] = useState<Set<string>>(new Set())
  const [bonusCardPlayByUser, setBonusCardPlayByUser] = useState<Record<string, { gameweek_id: string; player_id: number; fixture_id: number | null; points: number | null }>>({})
  const [bonusCardName, setBonusCardName] = useState<string | null>(null)
  const [avgByGw, setAvgByGw] = useState<Record<number, number>>({})
  const [streakByUser, setStreakByUser] = useState<Record<string, number>>({})
  const [submittedKeys, setSubmittedKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  // Top Dog — the current leaderboard leader and how many completed
  // gameweeks running they've held it, recomputed fresh on every load.
  const [topDogUserId, setTopDogUserId] = useState<string | null>(null)
  const [topDogReignWeeks, setTopDogReignWeeks] = useState(0)
  // Penalty shootout minigame personal best, keyed by user_id — shown as
  // a shirt number on the kit badge in the expanded row.
  const [topScoreByUser, setTopScoreByUser] = useState<Record<string, number>>({})

  const supabase = createClient()
  const { popArt } = usePopArtTheme(user?.id)

  useEffect(() => { loadData() }, [])

  // While any gameweek is genuinely live (deadline passed, not yet marked
  // completed), re-run loadData every minute so this page updates the same
  // way the main Leaderboard does, rather than only reflecting a fresh
  // recompute on the next manual page load. Re-arms itself each time
  // loadData() updates allGameweeks, and stops scheduling once nothing is
  // live anymore.
  useEffect(() => {
    if (!allGameweeks.some(g => g.status === 'locked')) return
    const interval = setInterval(() => { loadData() }, 60000)
    return () => clearInterval(interval)
  }, [allGameweeks])

  async function loadData() {
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

    const [{ data: entries }, { data: profiles }, { data: pointsData }, { data: rawPicks }, { data: teams }, { data: players }, { data: gameweeks }, { data: events }, { data: draftPicks }, { data: fixtures }, { data: submissions }, { data: aonPicks }, { data: bonusCardPlays }] = await Promise.all([
      supabase.from('competition_entries').select('user_id, joined_at').eq('competition_id', comp.id).eq('removed', false),
      supabase.from('profiles').select('id, display_name, kit_pattern, kit_colour_1, kit_colour_2'),
      supabase.from('points').select('user_id, pick_id, total_points, team_points, player1_points, player2_points, breakdown, gameweek_id').eq('competition_id', comp.id),
      supabase.from('picks').select('id, user_id, gameweek_id, team_id, player1_id, player2_id, is_banker, is_autopick').eq('competition_id', comp.id),
      supabase.from('teams').select('id, name, short_name, short_code').eq('active', true),
      supabase.from('players').select('id, name, web_name, team_id'),
      supabase.from('gameweeks').select('id, number, deadline, status').eq('competition_id', comp.id),
      supabase.from('match_events').select('player_id, event_type, fixture_id'),
      supabase.from('tier_draft_picks').select('user_id, tier1_team_id, tier2_team_id, tier3_team_id').eq('competition_id', comp.id),
      supabase.from('fixtures').select('id, gameweek_id'),
      supabase.from('pick_submission_status').select('user_id, gameweek_id').eq('competition_id', comp.id),
      supabase.from('all_or_nothing_picks').select('user_id, gameweek_id, player_id, outcome').eq('competition_id', comp.id),
      supabase.from('bonus_card_plays').select('user_id, gameweek_id, player_id, fixture_id, points').eq('competition_id', comp.id)
    ])

    const { data: kitExtras } = await supabase.from('profiles').select('id, kit_stars, kit_earths')
    const kitExtrasMap: Record<string, { stars: number; earths: number }> = {}
    kitExtras?.forEach(k => { kitExtrasMap[k.id] = { stars: k.kit_stars ?? 0, earths: k.kit_earths ?? 0 } })

    const { data: kitTrims } = await supabase.from('profiles').select('id, kit_colour_3')
    const kitTrimMap: Record<string, string | null> = {}
    kitTrims?.forEach(k => { kitTrimMap[k.id] = k.kit_colour_3 ?? null })

    // Also its own request, same reason — is_bot is a newer, optional
    // column (Futzy), and this must never be able to take display names
    // down with it if it's missing.
    const { data: botFlags } = await supabase.from('profiles').select('id, is_bot')
    const isBotMap: Record<string, boolean> = {}
    botFlags?.forEach(b => { isBotMap[b.id] = b.is_bot ?? false })

    // Its own request, same reason — the minigame shirt-number is a
    // separate, entirely optional feature, so a problem reading it should
    // never take display names or points down with it.
    const { data: topScores } = await supabase.from('minigame_penalty_scores').select('user_id, best_score')
    const topScoreMap: Record<string, number> = {}
    topScores?.forEach(s => { topScoreMap[s.user_id] = s.best_score ?? 0 })
    setTopScoreByUser(topScoreMap)

    // Its own request, same reason — these are newer, optional,
    // admin-assigned leaderboard badges, and a problem reading them should
    // never take display names or points down with it.
    const { data: badgeFlags } = await supabase.from('profiles').select('id, is_reigning_champ, is_vibes_champion, in_cash_pool, is_sporting_panel')
    const badgeMap: Record<string, { is_reigning_champ: boolean; is_vibes_champion: boolean; in_cash_pool: boolean; is_sporting_panel: boolean }> = {}
    badgeFlags?.forEach(b => {
      badgeMap[b.id] = {
        is_reigning_champ: b.is_reigning_champ ?? false,
        is_vibes_champion: b.is_vibes_champion ?? false,
        in_cash_pool: b.in_cash_pool ?? false,
        is_sporting_panel: b.is_sporting_panel ?? false,
      }
    })

    // Its own request too — brand new column, and a problem reading it
    // must never be able to take the other badges above down with it.
    const { data: minigameBanFlags } = await supabase.from('profiles').select('id, is_minigame_banned')
    const minigameBanMap: Record<string, boolean> = {}
    minigameBanFlags?.forEach(b => { minigameBanMap[b.id] = b.is_minigame_banned ?? false })

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

    const gwDeadlineById: Record<string, string> = {}
    gameweeks?.forEach(g => { gwDeadlineById[g.id] = g.deadline })
    const picks = (rawPicks ?? []).filter(p =>
      p.user_id === user?.id || new Date(gwDeadlineById[p.gameweek_id]) < now
    )

    const previewGameweeks = (gameweeks ?? []).filter(g =>
      new Date(g.deadline) < now && g.status !== 'completed'
    )

    const realPickKeys = new Set((picks ?? []).map(p => `${p.user_id}-${p.gameweek_id}`))
    type ProvisionalPick = { user_id: string; gameweek_id: string; team_id: number; player1_id: number; player2_id: number }
    let provisionalPicks: ProvisionalPick[] = []

    // Bonus Card points only land in bonus_card_plays.points once a gameweek
    // is actually completed/recalculated — without this, a card played in a
    // still-live gameweek would show 0 here even though the preview below
    // already knows its live value (mirrors the same fallback on the main
    // Leaderboard page).
    const bonusCardPreviewPoints: Record<string, number> = {}

    await Promise.all(previewGameweeks.map(async gw => {
      try {
        // /api/scoring/preview's own autopick derivation (for whoever
        // hasn't picked yet) is reused here instead of also calling
        // /api/autopick/preview separately — that second call was
        // re-deriving the exact same picks for the exact same missing
        // users a second time, plus paying for a whole extra round-trip.
        const scoringPreviewRes = await fetch(`/api/scoring/preview?gameweek_id=${gw.id}`)
        const scoringData = await scoringPreviewRes.json()
        const previews = scoringData.previews ?? {}
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

        ;(scoringData.rows ?? []).forEach((row: any) => {
          if (row.pick_id.startsWith('preview-')) {
            pointsByPickId[`preview-${row.user_id}-${gw.id}`] = row
          } else {
            pointsByPickId[row.pick_id] = row
          }
        })
        ;(scoringData.bonusCardRows ?? []).forEach((row: any) => {
          bonusCardPreviewPoints[row.user_id] = row.points
        })
      } catch {
        // ignore preview failures
      }
    }))

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

    const bankerMap: Record<string, number> = {}
    combinedPicks.forEach(pick => {
      if (pick.is_banker) bankerMap[pick.user_id] = (bankerMap[pick.user_id] || 0) + 1
    })
    setBankersUsedByPlayer(bankerMap)

    const { data: aonStatus } = await supabase.from('all_or_nothing_status').select('user_id').eq('competition_id', comp.id)
    setAonUsedByPlayer(new Set((aonStatus ?? []).map(a => a.user_id)))

    setBonusCardPlayedByUser(new Set((bonusCardPlays ?? []).map(p => p.user_id)))
    const bonusCardPlayMap: Record<string, { gameweek_id: string; player_id: number; fixture_id: number | null; points: number | null }> = {}
    bonusCardPlays?.forEach(p => { bonusCardPlayMap[p.user_id] = p })
    setBonusCardPlayByUser(bonusCardPlayMap)
    setBonusCardName(bonusCardDisplayName(comp.bonus_card_name, comp.bonus_card_player_id != null ? playerMap[comp.bonus_card_player_id] : null))

    const avgMap = computeAvgByGw(pointsData, gwMap)
    setAvgByGw(avgMap)

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
        is_bot: isBotMap[entry.user_id] ?? false,
        is_reigning_champ: badgeMap[entry.user_id]?.is_reigning_champ ?? false,
        is_vibes_champion: badgeMap[entry.user_id]?.is_vibes_champion ?? false,
        in_cash_pool: badgeMap[entry.user_id]?.in_cash_pool ?? false,
        is_sporting_panel: badgeMap[entry.user_id]?.is_sporting_panel ?? false,
        is_minigame_banned: minigameBanMap[entry.user_id] ?? false,
        joined_at: entry.joined_at,
        home_wins: 0,
        away_wins: 0,
        team_points: 0,
        player_points: 0,
        banker_points: 0,
        bonus_card_points: 0,
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

    bonusCardPlays?.forEach(play => {
      const t = totals[play.user_id]
      if (!t) return
      const points = play.points ?? bonusCardPreviewPoints[play.user_id] ?? null
      if (points == null) return
      t.bonus_card_points += points
      t.total_points += points
      t.points_without_banker += points
    })

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

    // Top Dog — see app/lib/topDog.ts for the reign-tracking rules.
    const scoredGwNumbers = Object.keys(avgMap).map(Number).sort((a, b) => a - b)
    const weeklyPointsByUser: Record<string, number[]> = {}
    Object.values(totals).forEach(t => { weeklyPointsByUser[t.user_id] = t.weekly_points })
    const topDog = computeTopDog(scoredGwNumbers, weeklyPointsByUser, isBotMap, bonusCardPlays, gwMap)
    setTopDogUserId(topDog.leaderUserId)
    setTopDogReignWeeks(topDog.reignWeeks)
    setStreakByUser(computeStreaks(weeklyPointsByUser, avgMap))

    const aonMap: Record<string, { player_id: number; outcome: string }> = {}
    aonPicks?.forEach(a => { aonMap[`${a.user_id}_${a.gameweek_id}`] = { player_id: a.player_id, outcome: a.outcome } })

    const details: Record<string, PickDetail[]> = {}
    combinedPicks.forEach(pick => {
      if (!details[pick.user_id]) details[pick.user_id] = []
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
        team_detail: pts?.breakdown?.team_detail ?? null,
        aon: aonMap[`${pick.user_id}_${pick.gameweek_id}`] ?? null
      })
    })
    Object.values(details).forEach(list => list.sort((a, b) => a.gw - b.gw))
    setPickDetails(details)
    setLoading(false)
  }

  const goalPlayers = new Set(matchEvents.filter(e => e.event_type === 'goal').map(e => e.player_id))
  const assistPlayers = new Set(matchEvents.filter(e => e.event_type === 'assist').map(e => e.player_id))

  function getStreak(player: RankedPlayer) {
    return streakByUser[player.user_id] ?? null
  }

  type GwRow =
    | { kind: 'run'; from: number; to: number; label: string }
    | { kind: 'gw'; gw: { id: string; number: number; deadline: string } }
    | { kind: 'hidden'; gw: { id: string; number: number; deadline: string } }

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

  const showBonusCard = competition?.bonus_card_player_id != null

  return (
    <Shell active="LEADERBOARD" user={user} displayName={displayName} theme="pop-art">
      <div className="pop-art-theme">

        <Link href="/leaderboard" className="text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1 mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
          ← Back to Leaderboard
        </Link>
        <h1 className="pop-hero pop-hero--blue text-5xl sm:text-6xl mb-1">Full Table</h1>
        <p className="font-bold text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>{competition.name} — every stat, broken down</p>

        {allGameweeks.some(g => g.status === 'locked') && (
          <div className="pop-panel pop-panel--blue p-3 mb-4 flex items-center gap-2.5">
            <span className="inline-block rounded-full shrink-0" style={{ width: 8, height: 8, background: 'var(--pop-blue)' }} />
            <p className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.8)' }}>
              <strong style={{ color: 'var(--pop-blue)' }}>GW{allGameweeks.filter(g => g.status === 'locked').map(g => g.number).join(', ')} live</strong> — points below update automatically as goals and assists are confirmed, and can go up or down if something gets corrected. Final once the gameweek's marked complete.
            </p>
          </div>
        )}

        <div className="pop-panel" style={{ overflow: 'hidden' }}>
          <table className="w-full" style={{ fontSize: '11.5px', tableLayout: 'fixed' }}>
            <thead>
              <tr className="text-left" style={{ fontSize: '9.5px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                <th className="py-2 pl-1.5 pr-1 sm:px-2 uppercase tracking-wider" style={{ width: '6%' }}>#</th>
                <th className="py-2 px-1 sm:px-2 uppercase tracking-wider" style={{ width: showBonusCard ? '38%' : '42.5%' }}>Player</th>
                <th className="py-2 px-1 sm:px-2 text-center uppercase tracking-wider" style={{ width: '7%' }}>HW</th>
                <th className="py-2 px-1 sm:px-2 text-center uppercase tracking-wider" style={{ width: '7%' }}>AW</th>
                <th className="py-2 px-1 sm:px-2 text-right uppercase tracking-wider" style={{ width: '8%' }} title="Best single-gameweek score (tiebreaker #3)">Best</th>
                <th className="py-2 px-1 sm:px-2 text-right uppercase tracking-wider" style={{ width: '7%' }}>Tm</th>
                <th className="py-2 px-1 sm:px-2 text-right uppercase tracking-wider" style={{ width: '7%' }}>Pl</th>
                <th className="py-2 px-1 sm:px-2 text-right uppercase tracking-wider" style={{ width: '7%' }}>Bk</th>
                {showBonusCard && (
                  <th className="py-2 px-1 sm:px-2 text-right uppercase tracking-wider" style={{ width: '4.5%' }} title={bonusCardName ?? undefined}>BC</th>
                )}
                <th className="py-2 pl-1 pr-1.5 sm:px-2 text-right uppercase tracking-wider font-black" style={{ width: '8.5%' }}>Tot</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((player, index) => {
                const streak = getStreak(player)
                const teamsWithAvailability = getTeamsWithAvailability(player.user_id)
                const isOwnRow = player.user_id === user?.id
                return (
                  <React.Fragment key={player.user_id}>
                    <tr
                      onClick={() => setExpandedUser(expandedUser === player.user_id ? null : player.user_id)}
                      className="cursor-pointer hover:bg-white/[0.04] transition-colors"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: isOwnRow ? 'rgba(160,0,250,0.06)' : undefined }}
                    >
                      <td className="py-2 pl-1.5 pr-1 sm:px-2" style={{ color: 'rgba(255,255,255,0.35)' }}>{index + 1}</td>
                      <td className="py-2 px-1 sm:px-2 font-black uppercase" style={{ maxWidth: 0 }}>
                        <div className="flex items-center gap-1">
                          {player.is_bot ? <BotAvatar size={14} /> : (
                            <span className="shrink-0">
                              <KitBadge
                                pattern={kitByUser[player.user_id]?.pattern ?? 'solid'}
                                colour1={kitByUser[player.user_id]?.colour1 ?? '#1E4D6B'}
                                colour2={kitByUser[player.user_id]?.colour2 ?? '#F5ECD9'}
                                colour3={kitByUser[player.user_id]?.colour3}
                                size={14}
                              />
                            </span>
                          )}
                          <span className="inline-flex flex-col leading-tight min-w-0" style={{ flex: '0 1 auto' }}>
                            <span className="truncate block">{player.display_name}</span>
                            {((kitByUser[player.user_id]?.stars ?? 0) > 0 || (kitByUser[player.user_id]?.earths ?? 0) > 0) && (
                              <span className="normal-case font-normal" style={{ fontSize: '7px', letterSpacing: '1px' }}>
                                <span style={{ color: 'var(--pop-green)' }}>{'★'.repeat(kitByUser[player.user_id]?.stars ?? 0)}</span>
                                {'🌍'.repeat(kitByUser[player.user_id]?.earths ?? 0)}
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            {isOwnRow && <span className="pop-badge pop-badge--pink px-1.5 py-0.5 text-[8px]">You</span>}
                            {player.is_reigning_champ && <CrownIcon size={13} color="var(--pop-green)" />}
                            {player.is_vibes_champion && <span title="Vibes Champion"><ShadesIcon size={13} /></span>}
                            {player.in_cash_pool && <span title="In the cash pool"><PoundCoinIcon size={13} /></span>}
                            {player.is_sporting_panel && <span title="Sporting Panel member"><ScalesIcon size={13} /></span>}
                            {player.is_minigame_banned && <span title="Banned from minigame"><BlockedIcon size={13} /></span>}
                            {streak && <span title={`${streak} weeks above average`} className="inline-flex"><FlameIcon size={13} /></span>}
                            {topDogUserId === player.user_id && topDogReignWeeks > 0 && (
                              <span title={`Top Dog — leading for ${topDogReignWeeks} week${topDogReignWeeks === 1 ? '' : 's'}`} className="inline-flex items-center gap-0.5">
                                <TopDogIcon size={13} />
                                <span className="font-mono" style={{ fontSize: '9px', color: 'var(--pop-orange)' }}>{topDogReignWeeks}</span>
                              </span>
                            )}
                          </span>
                          <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.25)', fontSize: '8px' }}>{expandedUser === player.user_id ? '▲' : '▼'}</span>
                        </div>
                      </td>
                      <td className="py-2 px-1 sm:px-2 text-center font-mono" style={{ color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{player.home_wins}</td>
                      <td className="py-2 px-1 sm:px-2 text-center font-mono" style={{ color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{player.away_wins}</td>
                      <td className="py-2 px-1 sm:px-2 text-right font-mono" style={{ color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{player.best_gameweek_score}</td>
                      <td className="py-2 px-1 sm:px-2 text-right font-mono" style={{ color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(player.team_points)}</td>
                      <td className="py-2 px-1 sm:px-2 text-right font-mono" style={{ color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(player.player_points)}</td>
                      <td className="py-2 px-1 sm:px-2 text-right font-mono" style={{ color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(player.banker_points)}</td>
                      {showBonusCard && (
                        <td className="py-2 px-1 sm:px-2 text-right font-mono" style={{ color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(player.bonus_card_points) || '—'}</td>
                      )}
                      <td className="py-2 pl-1 pr-1.5 sm:px-2 text-right font-black font-mono" style={{ color: 'var(--pop-green)', fontVariantNumeric: 'tabular-nums' }}>{player.total_points}</td>
                    </tr>
                    {expandedUser === player.user_id && (
                      <tr>
                        <td colSpan={showBonusCard ? 10 : 9} className="px-1.5 sm:px-3 py-3" style={{ background: 'rgba(0,0,0,0.35)' }}>
                          <p className="sec-label">This Season</p>
                          <div className="flex items-center justify-between gap-3 mb-4 pb-3 flex-wrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                            {player.is_bot ? <BotAvatar size={40} /> : (
                              <KitBadge
                                pattern={kitByUser[player.user_id]?.pattern ?? 'solid'}
                                colour1={kitByUser[player.user_id]?.colour1 ?? '#1E4D6B'}
                                colour2={kitByUser[player.user_id]?.colour2 ?? '#F5ECD9'}
                                colour3={kitByUser[player.user_id]?.colour3}
                                stars={kitByUser[player.user_id]?.stars ?? 0}
                                earths={kitByUser[player.user_id]?.earths ?? 0}
                                size={40}
                                iconTextClass="text-base sm:text-xl"
                                starColor="var(--pop-green)"
                                topScore={topScoreByUser[player.user_id] ?? 0}
                              />
                            )}
                            <div className="flex items-start gap-4 flex-wrap justify-end">
                              <div className="text-right">
                                <p className="text-[9px] uppercase tracking-widest font-black" style={{ color: 'rgba(255,255,255,0.6)' }}>Best Gameweek (tiebreaker #3)</p>
                                <p className="text-sm font-black" style={{ color: 'var(--pop-green)' }}>{player.best_gameweek_score} pts</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] uppercase tracking-widest font-black" style={{ color: 'rgba(255,255,255,0.6)' }}>Bankers Left</p>
                                <p className="text-sm font-black" style={{ color: 'var(--pop-orange)' }}>{Math.max(0, 2 - (bankersUsedByPlayer[player.user_id] ?? 0))} / 2</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] uppercase tracking-widest font-black" style={{ color: 'rgba(255,255,255,0.6)' }}>All or Nothing</p>
                                <p className="text-sm font-black" style={{ color: 'var(--pop-green)' }}>{aonUsedByPlayer.has(player.user_id) ? 'Used' : 'Available'}</p>
                              </div>
                              {showBonusCard && (
                                <div className="text-right">
                                  <p className="text-[9px] uppercase tracking-widest font-black" style={{ color: 'rgba(255,255,255,0.6)' }}>{bonusCardName}</p>
                                  <p className="text-sm font-black" style={{ color: 'var(--pop-blue)' }}>
                                    {bonusCardPlayedByUser.has(player.user_id)
                                      ? `Used${bonusCardPlayByUser[player.user_id] ? ` — GW${allGameweeks.find(g => g.id === bonusCardPlayByUser[player.user_id].gameweek_id)?.number ?? '?'}` : ''}${bonusCardPlayByUser[player.user_id]?.points != null ? ` — ${bonusCardPlayByUser[player.user_id].points}pts` : ''}`
                                      : 'Available'}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                          <p className="sec-label">Pick History</p>
                          {allGameweeks.length === 0 ? (
                            <p className="mb-3" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>No picks yet.</p>
                          ) : (
                            <table className="w-full mb-4" style={{ fontSize: '9px' }}>
                              <thead>
                                <tr className="text-left uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.6)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
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
                                        <tr key={`gw-${row.from}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)' }}>
                                          <td className="py-1 pr-1 font-black">{row.from}</td>
                                          <td className="py-1 pr-1 uppercase" colSpan={6}>{row.label}</td>
                                          <td className="py-1 text-right font-black">—</td>
                                        </tr>
                                      )
                                    }
                                    return (
                                      <tr key={`run-${row.from}-${row.to}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
                                        <td className="py-1 pr-1 font-black" colSpan={7}>
                                          GW {row.from}&ndash;{row.to} <span className="normal-case" style={{ color: 'rgba(255,255,255,0.55)' }}>({row.to - row.from + 1} gameweeks)</span> &mdash; {row.label}
                                        </td>
                                        <td className="py-1 text-right font-black">—</td>
                                      </tr>
                                    )
                                  }
                                  if (row.kind === 'hidden') {
                                    return (
                                      <tr key={row.gw.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)' }}>
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
                                          <TeamCrest teamId={d.team_id} teamName={teamMap[d.team_id]?.name ?? ''} size={14} />
                                          {teamDisplayName(teamMap[d.team_id])}
                                          {d.is_banker && <span className="px-0.5 rounded font-black" style={{ background: 'var(--pop-orange)', color: 'var(--pop-white)' }}>★</span>}
                                          {(d.provisional || d.is_autopick) && <span className="px-0.5 rounded" style={{ background: 'rgba(255,255,255,0.15)' }} title="No pick was made in time, so the computer picked automatically">AP</span>}
                                        </div>
                                        {d.team_detail?.opponent_team_id != null && (
                                          <div className="normal-case" style={{ fontSize: '8px', color: 'rgba(255,255,255,0.6)' }}>
                                            <span
                                              className="inline-block px-0.5 rounded font-black mr-1"
                                              style={d.team_detail.is_home
                                                ? { background: 'rgba(0,242,250,0.2)', color: 'var(--pop-blue)' }
                                                : { background: 'rgba(250,97,0,0.2)', color: 'var(--pop-orange)' }}
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
                                      <td className="py-1 pr-1 text-right" style={{ color: 'rgba(255,255,255,0.68)' }}>{d.team_points ?? '—'}</td>
                                      <td className="py-1 pr-1 uppercase">
                                        {d.player1}
                                        {goalPlayers.has(d.player1_id) && <span className="ml-0.5 px-0.5 rounded font-black" style={{ background: 'var(--pop-green)', color: 'var(--pop-black)' }}>G</span>}
                                        {assistPlayers.has(d.player1_id) && <span className="ml-0.5 px-0.5 rounded font-black" style={{ background: 'rgba(204,250,0,0.25)', color: 'var(--pop-green)' }}>A</span>}
                                        {d.aon?.player_id === d.player1_id && (
                                          <span className="ml-0.5 px-1 rounded font-black inline-flex items-center gap-0.5" style={{ fontSize: '8px', ...(d.aon.outcome === 'success' ? { background: 'var(--pop-green)', color: 'var(--pop-black)' } : d.aon.outcome === 'failed' ? { background: 'var(--pop-red)', color: 'var(--pop-white)' } : { background: 'var(--pop-blue)', color: 'var(--pop-black)' }) }}>
                                            {d.aon.outcome === 'success' ? <CheckIcon size={8} color="var(--pop-black)" /> : d.aon.outcome === 'failed' ? <CrossIcon size={8} color="var(--pop-white)" /> : <BoltIcon size={8} color="var(--pop-black)" />} AoN
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-1 pr-1 text-right" style={{ color: 'rgba(255,255,255,0.68)' }}>{d.player1_points ?? '—'}</td>
                                      <td className="py-1 pr-1 uppercase">
                                        {d.player2}
                                        {goalPlayers.has(d.player2_id) && <span className="ml-0.5 px-0.5 rounded font-black" style={{ background: 'var(--pop-green)', color: 'var(--pop-black)' }}>G</span>}
                                        {assistPlayers.has(d.player2_id) && <span className="ml-0.5 px-0.5 rounded font-black" style={{ background: 'rgba(204,250,0,0.25)', color: 'var(--pop-green)' }}>A</span>}
                                        {d.aon?.player_id === d.player2_id && (
                                          <span className="ml-0.5 px-1 rounded font-black inline-flex items-center gap-0.5" style={{ fontSize: '8px', ...(d.aon.outcome === 'success' ? { background: 'var(--pop-green)', color: 'var(--pop-black)' } : d.aon.outcome === 'failed' ? { background: 'var(--pop-red)', color: 'var(--pop-white)' } : { background: 'var(--pop-blue)', color: 'var(--pop-black)' }) }}>
                                            {d.aon.outcome === 'success' ? <CheckIcon size={8} color="var(--pop-black)" /> : d.aon.outcome === 'failed' ? <CrossIcon size={8} color="var(--pop-white)" /> : <BoltIcon size={8} color="var(--pop-black)" />} AoN
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-1 pr-1 text-right" style={{ color: 'rgba(255,255,255,0.68)' }}>{d.player2_points ?? '—'}</td>
                                      <td className="py-1 text-right font-black">{d.points ?? '—'}</td>
                                    </tr>
                                  )
                                })}
                                {/* Bonus Card points land in the same Tot column as every GW
                                    row above, on its own line — so anyone adding that column
                                    by eye lands on the real season total. Always shown, not
                                    just once played, so its presence in the column is
                                    consistent rather than something that only appears later. */}
                                {showBonusCard && (
                                  <tr style={{ color: 'rgba(255,255,255,0.5)' }}>
                                    <td className="py-1 pr-1 uppercase" colSpan={7}>
                                      {bonusCardName}
                                      {bonusCardPlayByUser[player.user_id] ? (
                                        <>
                                          {' — GW'}{allGameweeks.find(g => g.id === bonusCardPlayByUser[player.user_id].gameweek_id)?.number ?? '?'}
                                        </>
                                      ) : ' — Not yet played'}
                                    </td>
                                    <td className="py-1 text-right font-black" style={{ color: 'var(--pop-blue)' }}>
                                      {bonusCardPlayByUser[player.user_id]?.points != null ? `+${bonusCardPlayByUser[player.user_id].points}` : '—'}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          )}

                          <p className="sec-label">Teams Used</p>
                          <button
                            type="button"
                            onClick={() => setTeamsExpandedUsers(prev => {
                              const next = new Set(prev)
                              if (next.has(player.user_id)) next.delete(player.user_id)
                              else next.add(player.user_id)
                              return next
                            })}
                            className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2"
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)' }}
                          >
                            <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--pop-white)' }}>
                              {teamsExpandedUsers.has(player.user_id) ? '▾' : '▸'} {teamsWithAvailability.length} teams · {teamsWithAvailability.filter(t => t.remaining <= 0).length} used
                            </span>
                            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
                              {teamsExpandedUsers.has(player.user_id) ? 'Hide' : 'Tap to view'}
                            </span>
                          </button>
                          {teamsExpandedUsers.has(player.user_id) && (
                            <div className="mt-2" style={{ fontSize: '9px' }}>
                              {teamsWithAvailability.length === 0 ? (
                                <p style={{ color: 'rgba(255,255,255,0.6)' }}>No teams.</p>
                              ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                                  {teamsWithAvailability.map(team => {
                                    const used = team.remaining <= 0
                                    return (
                                      <div
                                        key={team.id}
                                        className="flex items-center gap-1 rounded px-1.5 py-1 min-w-0"
                                        style={used
                                          ? { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', opacity: 0.4 }
                                          : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
                                      >
                                        <TeamCrest teamId={team.id} teamName={team.name} size={14} />
                                        <span className="uppercase truncate flex-1 min-w-0">{teamDisplayName(team)}</span>
                                        {team.isDouble && !used && team.remaining === 2 && (
                                          <span className="font-black shrink-0" style={{ color: 'var(--pop-orange)' }}>×2</span>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}
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

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 uppercase tracking-wider" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
          <span className="font-black" style={{ color: 'rgba(255,255,255,0.6)' }}>Key</span>
          <span className="inline-flex items-center gap-1"><CrownIcon size={11} color="var(--pop-green)" /> Reigning champ</span>
          <span className="inline-flex items-center gap-1"><ShadesIcon size={11} /> Vibes champion</span>
          <span className="inline-flex items-center gap-1"><PoundCoinIcon size={11} /> In the cash pool</span>
          <span className="inline-flex items-center gap-1"><ScalesIcon size={11} /> Sporting Panel member</span>
          <span className="inline-flex items-center gap-1"><BlockedIcon size={11} /> Banned from minigame</span>
          <span className="inline-flex items-center gap-1"><FlameIcon size={11} /> Streak (3+ wks above avg)</span>
          <span className="inline-flex items-center gap-1"><TopDogIcon size={11} /> Top Dog — current leader, number = weeks leading</span>
          <span className="inline-flex items-center gap-1"><span style={{ color: 'var(--pop-green)' }}>★</span>🌍 Kit stars / earths</span>
          <span className="inline-flex items-center gap-1">
            <span className="px-0.5 rounded" style={{ background: 'rgba(255,255,255,0.15)' }}>AP</span> Autopick — no pick made
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="px-0.5 rounded font-black" style={{ background: 'var(--pop-orange)', color: 'var(--pop-white)' }}>★</span> Banker — doubles that gameweek
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="px-1 rounded font-black inline-flex items-center gap-0.5" style={{ background: 'var(--pop-blue)', color: 'var(--pop-black)' }}><BoltIcon size={9} color="var(--pop-black)" /> AoN</span> pending
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="px-1 rounded font-black inline-flex items-center gap-0.5" style={{ background: 'var(--pop-green)', color: 'var(--pop-black)' }}><CheckIcon size={9} color="var(--pop-black)" /> AoN</span> succeeded
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="px-1 rounded font-black inline-flex items-center gap-0.5" style={{ background: 'var(--pop-red)', color: 'var(--pop-white)' }}><CrossIcon size={9} color="var(--pop-white)" /> AoN</span> failed
          </span>
          <span>Click a row to expand</span>
        </div>

        <div className="pop-panel p-4 mt-4">
          <p className="sec-label">How Ties Are Split</p>
          <p className="mb-2" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
            When two or more players are level, these criteria are applied in order until the tie breaks.
          </p>
          <ol className="space-y-1" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
            {RULES_TEXT.tiebreakers.map((criterion, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-black shrink-0" style={{ color: 'var(--pop-green)' }}>{i + 1}.</span>
                <span>{criterion}</span>
              </li>
            ))}
          </ol>
        </div>

      </div>
    </Shell>
  )
}
