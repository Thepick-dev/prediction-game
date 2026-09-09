'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import TeamCrest from '../../components/TeamCrest'
import { buildPlayerDisplayNames, bonusCardDisplayName } from '../lib/players'
import PopArtLoading from '../../components/PopArtLoading'
import ShareableCard from '../../components/ShareableCard'
import { usePopArtTheme } from '../lib/usePopArtTheme'
import { pastDeadlineGameweekIds } from '../lib/pastDeadlineGameweeks'

type Tab = 'teams' | 'players' | 'me' | 'trends'

type Team = { id: number; name: string; short_name: string | null; short_code: string | null; active: boolean }
type PlayerRow = { id: number; name: string; web_name: string | null; team_id: number }

type TeamStat = {
  team: Team
  timesPicked: number
  timesBanked: number
  totalPoints: number
  avgPoints: number
  totalPointsRaw: number
  avgPointsRaw: number
}

type PlayerStat = {
  player: PlayerRow
  displayName: string
  goals: number
  assists: number
  timesPicked: number
  totalPickPoints: number
  avgPickPoints: number
  totalPickPointsRaw: number
  avgPickPointsRaw: number
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

// Pop-art equivalents of the two helpers above — same shape, different
// palette, so every chart just switches which pair it calls rather than
// duplicating the chart JSX itself.
// Literal hex, not var(--pop-blue): these values are read as raw SVG fill/
// stroke attributes by Recharts, and the share-to-image capture renders the
// chart in an isolated context where CSS custom properties don't resolve —
// an unresolved var() there silently drops the bar/line colour entirely.
const POP_ACCENT = '#00F2FA'
const POP_GRID = 'rgba(255,255,255,0.15)'
function popAxisProps() {
  return { tick: { fill: '#ffffff', fontSize: 10, opacity: 0.75 }, stroke: 'rgba(255,255,255,0.3)' }
}
function popTooltipStyle() {
  return {
    contentStyle: { background: '#242424', border: '1px solid rgba(0,242,250,0.5)', borderRadius: 10, fontSize: 12 },
    labelStyle: { color: POP_ACCENT },
    itemStyle: { color: '#ffffff' }
  }
}

// Six real hues in the site's own palette (excludes black/white/surface,
// which don't work as line colours on a dark chart) — cycled, with a
// dimmer second pass of the same six if there are ever more than six
// entrants, so every line still reads as "this site's palette" rather
// than reaching for an unrelated colour scale.
const RANK_LINE_COLOURS = ['#FA6100', '#7D37A5', '#CCFA00', '#00F2FA', '#A000FA', '#FA003C']
function rankLineColour(index: number): string {
  const base = RANK_LINE_COLOURS[index % RANK_LINE_COLOURS.length]
  return index < RANK_LINE_COLOURS.length ? base : `${base}99`
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
  const [bankerValueLeader, setBankerValueLeader] = useState<{ name: string; points: number } | null>(null)
  const [bestBankerGameweek, setBestBankerGameweek] = useState<{ name: string; gw: number; points: number } | null>(null)
  const [aonSuccessRate, setAonSuccessRate] = useState<{ rate: number; success: number; total: number } | null>(null)
  const [mostNominatedAon, setMostNominatedAon] = useState<{ name: string; count: number } | null>(null)
  const [bonusCardName, setBonusCardName] = useState<string | null>(null)
  const [bonusCardUsage, setBonusCardUsage] = useState<{ used: number; total: number } | null>(null)
  const [bonusCardAvgPoints, setBonusCardAvgPoints] = useState<number | null>(null)
  const [bestBonusCardPlay, setBestBonusCardPlay] = useState<{ name: string; gw: number; points: number } | null>(null)

  // Every participant's weekly points and cumulative rank, keyed by user id
  // — powers both the classic "my own performance" view (derived below,
  // looked up by the logged-in user's own id) and the pop-art Player Stats
  // tab's "pick anyone from a menu" view.
  const [weeklyByUser, setWeeklyByUser] = useState<Record<string, { gw: number; points: number }[]>>({})
  const [cumulativeByUser, setCumulativeByUser] = useState<Record<string, { gw: number; cumulative: number; rank: number }[]>>({})
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [compareUserId, setCompareUserId] = useState('')
  const [teamsIncludeBanker, setTeamsIncludeBanker] = useState(true)
  const [playersIncludeBanker, setPlayersIncludeBanker] = useState(true)

  // Who picked this team/player each gameweek, and for how many points —
  // shown when a Teams/Players row is expanded.
  const [teamPickDetail, setTeamPickDetail] = useState<Record<number, { gw: number; userName: string; points: number; isBanker: boolean }[]>>({})
  const [playerPickDetail, setPlayerPickDetail] = useState<Record<number, { gw: number; userName: string; points: number; isBanker: boolean; role: 'player1' | 'player2' }[]>>({})
  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null)
  const [expandedPlayerId, setExpandedPlayerId] = useState<number | null>(null)

  type TeamSortKey = 'name' | 'picked' | 'banked' | 'total' | 'avg'
  type PlayerSortKey = 'name' | 'picked' | 'total' | 'avg' | 'goals' | 'assists'
  const [teamSortKey, setTeamSortKey] = useState<TeamSortKey>('total')
  const [teamSortDir, setTeamSortDir] = useState<'asc' | 'desc'>('desc')
  const [playerSortKey, setPlayerSortKey] = useState<PlayerSortKey>('total')
  const [playerSortDir, setPlayerSortDir] = useState<'asc' | 'desc'>('desc')

  // Everyone's rank each gameweek, for the League Trends "race" chart —
  // one row per gameweek, one numeric column per user id (their rank that
  // week), plus their display name for the end-of-line labels.
  const [allRanksChartData, setAllRanksChartData] = useState<Record<string, number | string>[]>([])
  const [rankedUserMeta, setRankedUserMeta] = useState<{ uid: string; name: string; finalRank: number }[]>([])

  const [teamSearch, setTeamSearch] = useState('')
  const [playerSearch, setPlayerSearch] = useState('')
  const supabase = createClient()
  const { popArt } = usePopArtTheme(user?.id)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { window.location.href = '/login'; return }
    setUser(authUser)

    if (authUser) {
      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', authUser.id).single()
      setDisplayName(profile?.display_name ?? '')
    }

    const { data: comp } = await supabase
      .from('competitions')
      .select('id, name, bonus_card_enabled, bonus_card_player_id, bonus_card_name')
      .eq('status', 'active')
      .single()

    if (!comp) { setLoading(false); return }
    setCompetition(comp)

    try {
      const [
        { data: teams }, { data: players }, { data: gameweeks },
        { data: entries }, { data: picksRaw }, { data: pointsRaw }, { data: events },
        { data: fixtures }, { data: profiles }, { data: aonPicksRaw }, { data: bonusCardPlaysRaw },
        pastDeadlineIds
      ] = await Promise.all([
        supabase.from('teams').select('id, name, short_name, short_code, active'),
        supabase.from('players').select('id, name, web_name, team_id'),
        supabase.from('gameweeks').select('id, number, deadline, status').eq('competition_id', comp.id),
        supabase.from('competition_entries').select('user_id, joined_at').eq('competition_id', comp.id).eq('removed', false),
        supabase.from('picks').select('id, user_id, gameweek_id, team_id, player1_id, player2_id, is_banker, is_autopick').eq('competition_id', comp.id),
        supabase.from('points').select('user_id, pick_id, gameweek_id, total_points, team_points, player1_points, player2_points, breakdown').eq('competition_id', comp.id),
        supabase.from('match_events').select('player_id, event_type, fixture_id'),
        supabase.from('fixtures').select('id, gameweek_id'),
        supabase.from('profiles').select('id, display_name'),
        supabase.from('all_or_nothing_picks').select('user_id, gameweek_id, player_id, outcome').eq('competition_id', comp.id),
        supabase.from('bonus_card_plays').select('user_id, gameweek_id, points').eq('competition_id', comp.id),
        pastDeadlineGameweekIds(supabase),
      ])
      const profileMap: Record<string, string> = {}
      profiles?.forEach(p => { profileMap[p.id] = p.display_name ?? 'Unknown' })
      const pastDeadlineIdSet = new Set(pastDeadlineIds)

      // A removed entrant's historical rows must never surface anywhere on
      // this page — team/player popularity, banker leaders, AoN/Bonus Card
      // stats, all of it. Filtering the four raw arrays once here, right
      // after fetch, means every aggregation below (all keyed off these
      // same names) is automatically scoped to current entrants without
      // having to touch each one individually.
      const activeUserIds = new Set((entries ?? []).map(e => e.user_id))
      const picks = (picksRaw ?? []).filter(p => activeUserIds.has(p.user_id))
      const points = (pointsRaw ?? []).filter(p => activeUserIds.has(p.user_id))
      const aonPicks = (aonPicksRaw ?? []).filter(p => activeUserIds.has(p.user_id))
      const bonusCardPlays = (bonusCardPlaysRaw ?? []).filter(p => activeUserIds.has(p.user_id))
      // Team/player point tables below are already safe (they only count
      // picks that have a matching `points` row, which can't exist before
      // a gameweek is scored). But the raw `picks` table itself has no
      // such gate — anything built straight from it (which team/player got
      // picked, who's banked, manual-vs-autopick) has to be scoped to
      // past-deadline gameweeks by hand, or it reveals live picks for the
      // still-open gameweek exactly like every other backdoor this site
      // has had to close.
      const pastDeadlinePicks = (picks ?? []).filter(p => pastDeadlineIdSet.has(p.gameweek_id))

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

      // The `points` table only gets written once an admin marks a gameweek
      // "completed" (or runs Recalculate Points) — nothing fills it in as
      // events come in live. Without this, anyone picked only in a still-
      // live gameweek (e.g. scored last night, gameweek not yet completed)
      // is invisible on this whole page until it's finalised — same gap
      // already fixed on the Leaderboard and the Picks page's live table.
      // previewGameweekScoring itself refuses anything before its deadline,
      // so this is safe to call unconditionally for every gameweek here.
      const previewGameweeks = (gameweeks ?? []).filter(g =>
        new Date(g.deadline) < new Date() && g.status !== 'completed'
      )
      const realPickKeys = new Set(picks.map(p => `${p.user_id}-${p.gameweek_id}`))
      await Promise.all(previewGameweeks.map(async gw => {
        try {
          // /api/scoring/preview's own autopick derivation (for whoever
          // hasn't picked yet) is reused here instead of also calling
          // /api/autopick/preview separately — that second call was
          // re-deriving the exact same picks for the exact same missing
          // users a second time, plus paying for a whole extra round-trip.
          const scoringPreviewRes = await fetch(`/api/scoring/preview?gameweek_id=${gw.id}`)
          const scoringData = await scoringPreviewRes.json()
          Object.entries(scoringData.previews ?? {}).forEach(([userId, p]: [string, any]) => {
            if (!activeUserIds.has(userId) || realPickKeys.has(`${userId}-${gw.id}`)) return
            const previewPickId = `preview-${userId}`
            pickById[previewPickId] = {
              user_id: userId, team_id: p.team_id, player1_id: p.player1_id, player2_id: p.player2_id,
              is_banker: false, is_autopick: true, gameweek_id: gw.id,
            }
            pastDeadlinePicks.push({
              id: previewPickId, user_id: userId, gameweek_id: gw.id, team_id: p.team_id,
              player1_id: p.player1_id, player2_id: p.player2_id, is_banker: false, is_autopick: true,
            })
          })

          ;(scoringData.rows ?? []).forEach((row: any) => {
            if (activeUserIds.has(row.user_id)) points.push(row)
          })
        } catch {
          // A problem previewing one still-live gameweek must never take the
          // rest of this page down — worst case, its numbers stay stale
          // until that gameweek is completed for real.
        }
      }))

      // --- Team stats ---
      // Totals here are the actual points a pick of this team earned,
      // Banker doubling included — not the pre-doubling raw score — so
      // this matches what everyone actually won, made explicit in the
      // column header below rather than silently stripped back out.
      // totalRaw tracks the same thing with the doubling undone (halved
      // for a banker pick), so the Teams tab's toggle can switch between
      // the two without a second query.
      const teamAgg: Record<number, { picked: number; banked: number; total: number; totalRaw: number }> = {}
      const teamDetailMap: Record<number, { gw: number; userName: string; points: number; isBanker: boolean }[]> = {}
      points?.forEach(pt => {
        const pick = pickById[pt.pick_id]
        if (!pick) return
        const isBanker = (pt.breakdown as any)?.is_banker === true
        if (!teamAgg[pick.team_id]) teamAgg[pick.team_id] = { picked: 0, banked: 0, total: 0, totalRaw: 0 }
        const teamPts = pt.team_points ?? 0
        teamAgg[pick.team_id].picked += 1
        teamAgg[pick.team_id].total += teamPts
        teamAgg[pick.team_id].totalRaw += isBanker ? teamPts / 2 : teamPts
        if (isBanker) teamAgg[pick.team_id].banked += 1

        const gwNum = gwMap[pick.gameweek_id]
        if (gwNum) {
          if (!teamDetailMap[pick.team_id]) teamDetailMap[pick.team_id] = []
          teamDetailMap[pick.team_id].push({
            gw: gwNum,
            userName: profileMap[pick.user_id] ?? 'Unknown',
            points: Math.round(teamPts),
            isBanker
          })
        }
      })
      Object.values(teamDetailMap).forEach(list => list.sort((a, b) => a.gw - b.gw))
      setTeamPickDetail(teamDetailMap)
      const teamStatList: TeamStat[] = Object.entries(teamAgg)
        .filter(([teamId]) => tMap[Number(teamId)])
        .map(([teamId, agg]) => ({
          team: tMap[Number(teamId)],
          timesPicked: agg.picked,
          timesBanked: agg.banked,
          totalPoints: Math.round(agg.total),
          avgPoints: agg.picked > 0 ? Math.round((agg.total / agg.picked) * 10) / 10 : 0,
          totalPointsRaw: Math.round(agg.totalRaw),
          avgPointsRaw: agg.picked > 0 ? Math.round((agg.totalRaw / agg.picked) * 10) / 10 : 0
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

      // Same reasoning as team totals above — the actual (Banker-doubled
      // where applicable) points a pick of this player earned, not the
      // stripped-back raw score. totalRaw undoes the doubling, same as
      // teamAgg.totalRaw, for the Players tab's toggle.
      const playerPickAgg: Record<number, { picked: number; total: number; totalRaw: number }> = {}
      const playerDetailMap: Record<number, { gw: number; userName: string; points: number; isBanker: boolean; role: 'player1' | 'player2' }[]> = {}
      points?.forEach(pt => {
        const pick = pickById[pt.pick_id]
        if (!pick) return
        const isBanker = (pt.breakdown as any)?.is_banker === true
        const gwNum = gwMap[pick.gameweek_id]
        ;([
          [pick.player1_id, pt.player1_points ?? 0, 'player1'],
          [pick.player2_id, pt.player2_points ?? 0, 'player2'],
        ] as [number, number, 'player1' | 'player2'][]).forEach(([pid, val, role]) => {
          const playerId = pid
          const v = val
          if (!playerPickAgg[playerId]) playerPickAgg[playerId] = { picked: 0, total: 0, totalRaw: 0 }
          playerPickAgg[playerId].picked += 1
          playerPickAgg[playerId].total += v
          playerPickAgg[playerId].totalRaw += isBanker ? v / 2 : v

          if (gwNum) {
            if (!playerDetailMap[playerId]) playerDetailMap[playerId] = []
            playerDetailMap[playerId].push({
              gw: gwNum,
              userName: profileMap[pick.user_id] ?? 'Unknown',
              points: Math.round(v),
              isBanker,
              role
            })
          }
        })
      })

      // Ranked by points earned for the users who picked them, not by raw
      // real-world goals/assists — this is a game stats page, not a general
      // football stats site, so it's scoped to players who were actually
      // picked in this competition.
      const playerStatList: PlayerStat[] = Object.keys(playerPickAgg)
        .map(Number)
        .filter(id => pMap[id])
        .map(id => {
          const goals = goalCount[id] ?? 0
          const assists = assistCount[id] ?? 0
          const pickAgg = playerPickAgg[id]
          return {
            player: pMap[id],
            displayName: displayNames[id] ?? 'Unknown',
            goals,
            assists,
            timesPicked: pickAgg.picked,
            totalPickPoints: Math.round(pickAgg.total),
            avgPickPoints: pickAgg.picked > 0 ? Math.round((pickAgg.total / pickAgg.picked) * 10) / 10 : 0,
            totalPickPointsRaw: Math.round(pickAgg.totalRaw),
            avgPickPointsRaw: pickAgg.picked > 0 ? Math.round((pickAgg.totalRaw / pickAgg.picked) * 10) / 10 : 0
          }
        })
        .sort((a, b) => b.totalPickPoints - a.totalPickPoints)
      setPlayerStats(playerStatList)
      Object.values(playerDetailMap).forEach(list => list.sort((a, b) => a.gw - b.gw))
      setPlayerPickDetail(playerDetailMap)

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
      pastDeadlinePicks.forEach(p => { teamPickCount[p.team_id] = (teamPickCount[p.team_id] ?? 0) + 1 })
      const popularity = Object.entries(teamPickCount)
        .filter(([teamId]) => tMap[Number(teamId)])
        .map(([teamId, count]) => ({ name: teamDisplayName(tMap[Number(teamId)]), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
      setTeamPopularity(popularity)

      const methodByGw: Record<number, { manual: number; autopick: number }> = {}
      pastDeadlinePicks.forEach(p => {
        const gwNum = gwMap[p.gameweek_id]
        if (!gwNum) return
        if (!methodByGw[gwNum]) methodByGw[gwNum] = { manual: 0, autopick: 0 }
        if (p.is_autopick) methodByGw[gwNum].autopick += 1
        else methodByGw[gwNum].manual += 1
      })
      setPickMethod(Object.entries(methodByGw).map(([gw, v]) => ({ gw: Number(gw), ...v })).sort((a, b) => a.gw - b.gw))

      const teamBankCount: Record<number, number> = {}
      const playerBankCount: Record<number, number> = {}
      pastDeadlinePicks.forEach(p => {
        if (!p.is_banker) return
        teamBankCount[p.team_id] = (teamBankCount[p.team_id] ?? 0) + 1
      })
      const topBankedTeamEntry = Object.entries(teamBankCount).sort((a, b) => b[1] - a[1])[0]
      setMostBankedTeam(topBankedTeamEntry ? { name: teamDisplayName(tMap[Number(topBankedTeamEntry[0])]), count: topBankedTeamEntry[1] } : null)

      // Bankers boost the whole pick, including both players — count both toward "most banked player" too.
      pastDeadlinePicks.forEach(p => {
        if (!p.is_banker) return
        playerBankCount[p.player1_id] = (playerBankCount[p.player1_id] ?? 0) + 1
        playerBankCount[p.player2_id] = (playerBankCount[p.player2_id] ?? 0) + 1
      })
      const topBankedPlayerEntry = Object.entries(playerBankCount).sort((a, b) => b[1] - a[1])[0]
      setMostBankedPlayer(topBankedPlayerEntry
        ? { name: displayNames[Number(topBankedPlayerEntry[0])] ?? 'Unknown', count: topBankedPlayerEntry[1] }
        : null)

      // Banker "value added" — the doubling adds back exactly the pick's
      // own raw (undoubled) total, so that raw total IS the extra points
      // Bankering earned that week. Sourced from `points`, which only
      // exists once a gameweek is scored — safe by the same reasoning as
      // the team/player stats above, no separate deadline gate needed.
      const bankerValueByUser: Record<string, number> = {}
      let bestBankerGw: { userId: string; gw: number; points: number } | null = null
      points?.forEach(pt => {
        if ((pt.breakdown as any)?.is_banker !== true) return
        const extra = (pt.total_points ?? 0) / 2
        bankerValueByUser[pt.user_id] = (bankerValueByUser[pt.user_id] ?? 0) + extra
        const gwNum = gwMap[pt.gameweek_id]
        if (gwNum && (!bestBankerGw || (pt.total_points ?? 0) > bestBankerGw.points)) {
          bestBankerGw = { userId: pt.user_id, gw: gwNum, points: pt.total_points ?? 0 }
        }
      })
      const topBankerValueEntry = Object.entries(bankerValueByUser).sort((a, b) => b[1] - a[1])[0]
      setBankerValueLeader(topBankerValueEntry ? { name: profileMap[topBankerValueEntry[0]] ?? 'Unknown', points: Math.round(topBankerValueEntry[1]) } : null)
      const finalBestBankerGw = bestBankerGw as { userId: string; gw: number; points: number } | null
      setBestBankerGameweek(finalBestBankerGw ? { name: profileMap[finalBestBankerGw.userId] ?? 'Unknown', gw: finalBestBankerGw.gw, points: finalBestBankerGw.points } : null)

      // --- All or Nothing: site-wide success rate + most-nominated player ---
      // Scoped to resolved outcomes in past-deadline gameweeks only, on
      // both counts deliberately — a pending nomination hasn't been scored
      // yet, and the nominated player IS one of that user's two picks for
      // the week, so showing it before the deadline would leak part of a
      // still-secret pick exactly like the picks-table gap fixed above.
      const resolvedAon = (aonPicks ?? []).filter(a => a.outcome !== 'pending' && pastDeadlineIdSet.has(a.gameweek_id))
      const aonSuccessCount = resolvedAon.filter(a => a.outcome === 'success').length
      setAonSuccessRate(resolvedAon.length > 0 ? { rate: Math.round((aonSuccessCount / resolvedAon.length) * 100), success: aonSuccessCount, total: resolvedAon.length } : null)

      const aonPlayerCount: Record<number, number> = {}
      resolvedAon.forEach(a => { aonPlayerCount[a.player_id] = (aonPlayerCount[a.player_id] ?? 0) + 1 })
      const topAonPlayerEntry = Object.entries(aonPlayerCount).sort((a, b) => b[1] - a[1])[0]
      setMostNominatedAon(topAonPlayerEntry ? { name: displayNames[Number(topAonPlayerEntry[0])] ?? 'Unknown', count: topAonPlayerEntry[1] } : null)

      // --- Bonus Card ---
      // Usage count is presence-only (how many, not which gameweek), safe
      // regardless of deadline — mirrors the existing bonus_card_status
      // view's own reasoning. Per-play detail (points, best play) is
      // naturally gated instead: `points` stays null until that play is
      // actually resolved during scoring.
      if (comp.bonus_card_enabled) {
        setBonusCardName(bonusCardDisplayName(comp.bonus_card_name, comp.bonus_card_player_id != null ? pMap[comp.bonus_card_player_id]?.name : null))
        setBonusCardUsage({ used: (bonusCardPlays ?? []).length, total: entries?.length ?? 0 })

        const resolvedBonusCardPlays = (bonusCardPlays ?? []).filter(b => b.points != null)
        setBonusCardAvgPoints(resolvedBonusCardPlays.length > 0
          ? Math.round((resolvedBonusCardPlays.reduce((sum, b) => sum + (b.points ?? 0), 0) / resolvedBonusCardPlays.length) * 10) / 10
          : null)

        const topBonusCardPlay = [...resolvedBonusCardPlays].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0]
        setBestBonusCardPlay(topBonusCardPlay
          ? { name: profileMap[topBonusCardPlay.user_id] ?? 'Unknown', gw: gwMap[topBonusCardPlay.gameweek_id] ?? 0, points: topBonusCardPlay.points ?? 0 }
          : null)
      }

      // --- Every player's performance (weekly points + cumulative rank) ---
      // Computed for every participant, not just the signed-in user, so the
      // pop-art Player Stats tab can show anyone's page from a menu. The
      // classic "my own performance" view just looks itself up by id out
      // of these same maps (see the derived myWeekly/myBest/etc. below).
      const allGwNumbers = Array.from(new Set(Object.keys(gwPointsByUser).map(Number))).sort((a, b) => a - b)
      const userIds = Array.from(new Set(picks?.map(p => p.user_id) ?? entries?.map(e => e.user_id) ?? []))
      const cumByUser: Record<string, number> = {}
      const weeklyMap: Record<string, { gw: number; points: number }[]> = {}
      const cumulativeMap: Record<string, { gw: number; cumulative: number; rank: number }[]> = {}
      const rankChartRows: Record<string, number | string>[] = []
      let lastRanked: { uid: string; total: number }[] = []
      userIds.forEach(uid => { weeklyMap[uid] = []; cumulativeMap[uid] = [] })
      allGwNumbers.forEach(gwNum => {
        userIds.forEach(uid => {
          cumByUser[uid] = (cumByUser[uid] ?? 0) + (gwPointsByUser[gwNum]?.[uid] ?? 0)
          if (gwPointsByUser[gwNum]?.[uid] !== undefined) {
            weeklyMap[uid].push({ gw: gwNum, points: gwPointsByUser[gwNum][uid] })
          }
        })
        const ranked = userIds
          .map(uid => ({ uid, total: cumByUser[uid] ?? 0 }))
          .sort((a, b) => b.total - a.total)
        lastRanked = ranked

        // Every user's rank this gameweek, for the League Trends chart —
        // ranks are a strict ordering (each index+1 is unique even when
        // two totals tie), so no two lines can ever land on the exact
        // same value at the same gameweek, which is what keeps the
        // end-of-line name labels from ever overlapping.
        const row: Record<string, number | string> = { name: `GW${gwNum}` }
        ranked.forEach((r, i) => {
          row[r.uid] = i + 1
          cumulativeMap[r.uid].push({ gw: gwNum, cumulative: Math.round(cumByUser[r.uid] ?? 0), rank: i + 1 })
        })
        rankChartRows.push(row)
      })
      setWeeklyByUser(weeklyMap)
      setCumulativeByUser(cumulativeMap)
      setAllRanksChartData(rankChartRows)
      setRankedUserMeta(
        lastRanked.map((r, i) => ({ uid: r.uid, name: profileMap[r.uid] ?? 'Unknown', finalRank: i + 1 }))
      )

      setLoading(false)
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong loading stats')
      setLoading(false)
    }
  }

  // Re-ranked by the raw (non-Banker) total when the toggle is off, so
  // "top 10" on the chart and the table's own sort still mean the same
  // thing as whichever number is actually being displayed.
  const sortedTeamStats = useMemo(() => {
    if (teamsIncludeBanker) return teamStats
    return [...teamStats].sort((a, b) => b.totalPointsRaw - a.totalPointsRaw)
  }, [teamStats, teamsIncludeBanker])

  const sortedPlayerStats = useMemo(() => {
    if (playersIncludeBanker) return playerStats
    return [...playerStats].sort((a, b) => b.totalPickPointsRaw - a.totalPickPointsRaw)
  }, [playerStats, playersIncludeBanker])

  const filteredTeamStats = useMemo(() => {
    if (!teamSearch.trim()) return sortedTeamStats
    const q = teamSearch.toLowerCase()
    return sortedTeamStats.filter(t => teamDisplayName(t.team).toLowerCase().includes(q))
  }, [sortedTeamStats, teamSearch])

  const filteredPlayerStats = useMemo(() => {
    let list = sortedPlayerStats
    if (playerSearch.trim()) {
      const q = playerSearch.toLowerCase()
      list = list.filter(p => p.displayName.toLowerCase().includes(q))
    }
    return list
  }, [sortedPlayerStats, playerSearch])

  // Column-header sort, applied on top of the search filter — independent
  // of the chart's own fixed "top 10 by points" ordering above.
  const displayTeamStats = useMemo(() => {
    const list = [...filteredTeamStats]
    const dir = teamSortDir === 'desc' ? -1 : 1
    list.sort((a, b) => {
      switch (teamSortKey) {
        case 'name': return dir * teamDisplayName(a.team).localeCompare(teamDisplayName(b.team))
        case 'picked': return dir * (a.timesPicked - b.timesPicked)
        case 'banked': return dir * (a.timesBanked - b.timesBanked)
        case 'avg': return dir * ((teamsIncludeBanker ? a.avgPoints : a.avgPointsRaw) - (teamsIncludeBanker ? b.avgPoints : b.avgPointsRaw))
        default: return dir * ((teamsIncludeBanker ? a.totalPoints : a.totalPointsRaw) - (teamsIncludeBanker ? b.totalPoints : b.totalPointsRaw))
      }
    })
    return list
  }, [filteredTeamStats, teamSortKey, teamSortDir, teamsIncludeBanker])

  const displayPlayerStats = useMemo(() => {
    const list = [...filteredPlayerStats]
    const dir = playerSortDir === 'desc' ? -1 : 1
    list.sort((a, b) => {
      switch (playerSortKey) {
        case 'name': return dir * a.displayName.localeCompare(b.displayName)
        case 'picked': return dir * (a.timesPicked - b.timesPicked)
        case 'avg': return dir * ((playersIncludeBanker ? a.avgPickPoints : a.avgPickPointsRaw) - (playersIncludeBanker ? b.avgPickPoints : b.avgPickPointsRaw))
        case 'goals': return dir * (a.goals - b.goals)
        case 'assists': return dir * (a.assists - b.assists)
        default: return dir * ((playersIncludeBanker ? a.totalPickPoints : a.totalPickPointsRaw) - (playersIncludeBanker ? b.totalPickPoints : b.totalPickPointsRaw))
      }
    })
    return list
  }, [filteredPlayerStats, playerSortKey, playerSortDir, playersIncludeBanker])

  function toggleTeamSort(key: TeamSortKey) {
    if (teamSortKey === key) setTeamSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setTeamSortKey(key); setTeamSortDir(key === 'name' ? 'asc' : 'desc') }
  }
  function togglePlayerSort(key: PlayerSortKey) {
    if (playerSortKey === key) setPlayerSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setPlayerSortKey(key); setPlayerSortDir(key === 'name' ? 'asc' : 'desc') }
  }

  function sortArrow(active: boolean, dir: 'asc' | 'desc') {
    if (!active) return ''
    return dir === 'desc' ? ' ▼' : ' ▲'
  }

  // Classic theme's "my own performance" view is frozen/dead code (see
  // usePopArtTheme — pop-art is the only reachable theme) but still has to
  // compile, so it keeps reading these exact names — just derived from the
  // signed-in user's own slice of weeklyByUser/cumulativeByUser now instead
  // of being computed separately.
  const myWeekly = weeklyByUser[user?.id ?? ''] ?? []
  const myCumulative = cumulativeByUser[user?.id ?? ''] ?? []
  const myBest = myWeekly.length > 0 ? [...myWeekly].sort((a, b) => b.points - a.points)[0] : null
  const myWorst = myWeekly.length > 0 ? [...myWeekly].sort((a, b) => b.points - a.points)[myWeekly.length - 1] : null

  // Pop-art Player Stats tab: pick anyone from a menu, defaulting to your
  // own page. rankedUserMeta already has every participant's display name.
  const playerMenuOptions = useMemo(
    () => [...rankedUserMeta].sort((a, b) => a.name.localeCompare(b.name)),
    [rankedUserMeta]
  )
  const effectiveSelectedPlayerId = selectedPlayerId || user?.id || ''
  const selectedWeekly = weeklyByUser[effectiveSelectedPlayerId] ?? []
  const selectedCumulative = cumulativeByUser[effectiveSelectedPlayerId] ?? []
  const selectedBest = selectedWeekly.length > 0 ? [...selectedWeekly].sort((a, b) => b.points - a.points)[0] : null
  const selectedWorst = selectedWeekly.length > 0 ? [...selectedWeekly].sort((a, b) => b.points - a.points)[selectedWeekly.length - 1] : null
  const selectedPlayerName = playerMenuOptions.find(m => m.uid === effectiveSelectedPlayerId)?.name ?? displayName

  // Head-to-head: overlay the selected player's weekly points against a
  // second, optional "compare against" player, plus a simple gameweek-by-
  // gameweek win tally between the two.
  const compareWeekly = weeklyByUser[compareUserId] ?? []
  const compareName = playerMenuOptions.find(m => m.uid === compareUserId)?.name ?? ''
  const headToHeadChartData = useMemo(() => {
    if (!compareUserId) return []
    const gwNums = Array.from(new Set([...selectedWeekly.map(w => w.gw), ...compareWeekly.map(w => w.gw)])).sort((a, b) => a - b)
    const selMap = Object.fromEntries(selectedWeekly.map(w => [w.gw, w.points]))
    const cmpMap = Object.fromEntries(compareWeekly.map(w => [w.gw, w.points]))
    return gwNums.map(gw => ({ name: `GW${gw}`, [effectiveSelectedPlayerId]: selMap[gw], [compareUserId]: cmpMap[gw] }))
  }, [selectedWeekly, compareWeekly, compareUserId, effectiveSelectedPlayerId])
  const headToHeadTally = useMemo(() => {
    if (!compareUserId) return null
    const selMap = Object.fromEntries(selectedWeekly.map(w => [w.gw, w.points]))
    const cmpMap = Object.fromEntries(compareWeekly.map(w => [w.gw, w.points]))
    let selWins = 0, cmpWins = 0, draws = 0
    Object.keys(selMap).forEach(gwStr => {
      const gw = Number(gwStr)
      if (cmpMap[gw] === undefined) return
      if (selMap[gw] > cmpMap[gw]) selWins++
      else if (selMap[gw] < cmpMap[gw]) cmpWins++
      else draws++
    })
    return { selWins, cmpWins, draws }
  }, [selectedWeekly, compareWeekly, compareUserId])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'teams', label: 'Teams' },
    { id: 'players', label: 'Players' },
    { id: 'me', label: 'Managers' },
    { id: 'trends', label: 'League Trends' },
  ]

  if (loading) {
    return (
      <Shell active="STATS HUB" theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? <PopArtLoading /> : <p className="text-gray-500">Loading...</p>}
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="STATS HUB" theme={popArt ? 'pop-art' : 'classic'}>
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
      <Shell active="STATS HUB" user={user} displayName={displayName} theme="pop-art">
        <div className="pop-art-theme">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-1 mt-2">
            <h1 className="pop-hero pop-hero--blue text-5xl sm:text-6xl">Stats Hub</h1>
            <a href="/wrapped" className="pop-button px-3 py-1.5 text-xs" style={{ background: 'var(--pop-pink)' }}>
              🎁 Your Season
            </a>
          </div>
          <p className="font-bold text-sm mb-6" style={{ color: 'rgba(255,255,255,0.65)' }}>{competition.name} — every number the game has generated so far.</p>

          {error && (
            <div className="pop-panel pop-panel--pink px-4 py-3 mb-5 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2 mb-5 overflow-x-auto">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-xs font-black tracking-widest whitespace-nowrap uppercase rounded-lg transition-colors ${tab === t.id ? 'pop-button' : 'hover:bg-white/[0.08]'}`}
                style={tab !== t.id ? { color: 'rgba(255,255,255,0.65)' } : undefined}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'teams' && (
            <div>
              <ShareableCard filename="top-teams-by-points" className="pop-panel pop-panel--blue p-4 mb-4" style={{ height: 260 }}>
                <p className="sec-label" style={{ color: 'rgba(255,255,255,0.6)' }}>Top Teams by Points {teamsIncludeBanker ? '(inc. Banker)' : '(excl. Banker)'}</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={sortedTeamStats.slice(0, 10).map(t => ({ name: teamDisplayName(t.team), points: teamsIncludeBanker ? t.totalPoints : t.totalPointsRaw }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                    <XAxis dataKey="name" {...popAxisProps()} interval={0} angle={-35} textAnchor="end" height={50} />
                    <YAxis {...popAxisProps()} />
                    <Tooltip {...popTooltipStyle()} />
                    <Bar dataKey="points" fill={POP_ACCENT} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ShareableCard>

              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] uppercase tracking-wider font-black" style={{ color: 'rgba(255,255,255,0.65)' }}>Banker</span>
                <button
                  onClick={() => setTeamsIncludeBanker(true)}
                  className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-full ${teamsIncludeBanker ? 'pop-button' : ''}`}
                  style={!teamsIncludeBanker ? { color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.1)' } : undefined}
                >
                  Included
                </button>
                <button
                  onClick={() => setTeamsIncludeBanker(false)}
                  className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-full ${!teamsIncludeBanker ? 'pop-button' : ''}`}
                  style={teamsIncludeBanker ? { color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.1)' } : undefined}
                >
                  Excluded
                </button>
              </div>

              <input
                type="text"
                placeholder="Search teams..."
                value={teamSearch}
                onChange={e => setTeamSearch(e.target.value)}
                className="pop-input w-full mb-3 px-3 py-2 text-sm font-bold"
              />
              <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {teamsIncludeBanker ? 'Points below include any Banker doubling.' : 'Banker doubling excluded — raw pick performance below.'} Tap a column to sort, tap a row to see who picked them.
              </p>

              <div className="pop-panel pop-panel--blue" style={{ overflow: 'hidden' }}>
                <table className="w-full" style={{ fontSize: '11px', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '34%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '17%' }} />
                  </colgroup>
                  <thead>
                    <tr className="text-left" style={{ fontSize: '9.5px', color: 'var(--pop-blue)', borderBottom: '1px solid rgba(0,242,250,0.3)' }}>
                      <th className="py-2 pl-2 pr-1 uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleTeamSort('name')}>Team{sortArrow(teamSortKey === 'name', teamSortDir)}</th>
                      <th className="py-2 px-1 text-right uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleTeamSort('picked')}>Pick{sortArrow(teamSortKey === 'picked', teamSortDir)}</th>
                      <th className="py-2 px-1 text-right uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleTeamSort('banked')}>Bank{sortArrow(teamSortKey === 'banked', teamSortDir)}</th>
                      <th className="py-2 px-1 text-right uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleTeamSort('total')}>Pts{sortArrow(teamSortKey === 'total', teamSortDir)}</th>
                      <th className="py-2 pl-1 pr-2 text-right uppercase tracking-wider font-black cursor-pointer select-none" onClick={() => toggleTeamSort('avg')}>Avg{sortArrow(teamSortKey === 'avg', teamSortDir)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayTeamStats.map(t => (
                      <React.Fragment key={t.team.id}>
                        <tr
                          onClick={() => setExpandedTeamId(expandedTeamId === t.team.id ? null : t.team.id)}
                          className="cursor-pointer hover:bg-white/[0.06] transition-colors"
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                        >
                          <td className="py-2 pl-2 pr-1 font-black uppercase" style={{ overflow: 'hidden' }}>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <TeamCrest teamId={t.team.id} teamName={t.team.name} size={16} />
                              <span className="truncate">{teamDisplayName(t.team)}</span>
                              <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.35)', fontSize: '8px' }}>{expandedTeamId === t.team.id ? '▲' : '▼'}</span>
                            </div>
                          </td>
                          <td className="py-2 px-1 text-right" style={{ color: 'rgba(255,255,255,0.75)' }}>{t.timesPicked}</td>
                          <td className="py-2 px-1 text-right" style={{ color: 'rgba(255,255,255,0.75)' }}>{t.timesBanked}</td>
                          <td className="py-2 px-1 text-right" style={{ color: 'rgba(255,255,255,0.75)' }}>{teamsIncludeBanker ? t.totalPoints : t.totalPointsRaw}</td>
                          <td className="py-2 pl-1 pr-2 text-right font-black" style={{ color: 'var(--pop-green)' }}>{teamsIncludeBanker ? t.avgPoints : t.avgPointsRaw}</td>
                        </tr>
                        {expandedTeamId === t.team.id && (
                          <tr>
                            <td colSpan={5} className="px-3 py-3" style={{ background: 'rgba(0,242,250,0.06)' }}>
                              <p className="text-[10px] uppercase tracking-wider font-black mb-2" style={{ color: 'var(--pop-blue)' }}>Who picked {teamDisplayName(t.team)}</p>
                              {(teamPickDetail[t.team.id] ?? []).length === 0 ? (
                                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>No scored picks yet.</p>
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  {(teamPickDetail[t.team.id] ?? []).map((d, i) => (
                                    <div key={i} className="flex items-center justify-between gap-2 text-xs">
                                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>GW{d.gw}</span>
                                      <span className="font-bold flex-1 truncate">{d.userName}</span>
                                      {d.isBanker && <span className="pop-badge px-1 py-0.5 text-[8px] font-black" style={{ background: 'var(--pop-orange)', color: 'var(--pop-white)' }}>★</span>}
                                      <span className="font-black" style={{ color: 'var(--pop-green)' }}>{d.points} pts</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {filteredTeamStats.length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center uppercase tracking-wider" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>No data yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'players' && (
            <div>
              <ShareableCard filename="top-players-by-points" className="pop-panel pop-panel--blue p-4 mb-4" style={{ height: 260 }}>
                <p className="sec-label" style={{ color: 'rgba(255,255,255,0.6)' }}>Top Players by Points {playersIncludeBanker ? '(inc. Banker)' : '(excl. Banker)'}</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={sortedPlayerStats.slice(0, 12).map(p => ({ name: p.displayName, points: playersIncludeBanker ? p.totalPickPoints : p.totalPickPointsRaw }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                    <XAxis dataKey="name" {...popAxisProps()} interval={0} angle={-35} textAnchor="end" height={60} />
                    <YAxis {...popAxisProps()} />
                    <Tooltip {...popTooltipStyle()} />
                    <Bar dataKey="points" fill={POP_ACCENT} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ShareableCard>

              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] uppercase tracking-wider font-black" style={{ color: 'rgba(255,255,255,0.65)' }}>Banker</span>
                <button
                  onClick={() => setPlayersIncludeBanker(true)}
                  className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-full ${playersIncludeBanker ? 'pop-button' : ''}`}
                  style={!playersIncludeBanker ? { color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.1)' } : undefined}
                >
                  Included
                </button>
                <button
                  onClick={() => setPlayersIncludeBanker(false)}
                  className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-full ${!playersIncludeBanker ? 'pop-button' : ''}`}
                  style={playersIncludeBanker ? { color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.1)' } : undefined}
                >
                  Excluded
                </button>
              </div>

              <input
                type="text"
                placeholder="Search players..."
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                className="pop-input w-full mb-3 px-3 py-2 text-sm font-bold"
              />
              <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {playersIncludeBanker ? 'Points below include any Banker doubling.' : 'Banker doubling excluded — raw pick performance below.'} Tap a column to sort, tap a row to see who picked them.
              </p>

              <div className="pop-panel pop-panel--blue" style={{ overflow: 'hidden' }}>
                <table className="w-full" style={{ fontSize: '11px', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '28%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '14%' }} />
                  </colgroup>
                  <thead>
                    <tr className="text-left" style={{ fontSize: '9.5px', color: 'var(--pop-blue)', borderBottom: '1px solid rgba(0,242,250,0.3)' }}>
                      <th className="py-2 pl-2 pr-1 uppercase tracking-wider cursor-pointer select-none" onClick={() => togglePlayerSort('name')}>Player{sortArrow(playerSortKey === 'name', playerSortDir)}</th>
                      <th className="py-2 px-1 text-right uppercase tracking-wider cursor-pointer select-none" onClick={() => togglePlayerSort('picked')}>Pick{sortArrow(playerSortKey === 'picked', playerSortDir)}</th>
                      <th className="py-2 px-1 text-right uppercase tracking-wider font-black cursor-pointer select-none" onClick={() => togglePlayerSort('total')}>Pts{sortArrow(playerSortKey === 'total', playerSortDir)}</th>
                      <th className="py-2 px-1 text-right uppercase tracking-wider cursor-pointer select-none" onClick={() => togglePlayerSort('avg')}>Avg{sortArrow(playerSortKey === 'avg', playerSortDir)}</th>
                      <th className="py-2 px-1 text-right uppercase tracking-wider cursor-pointer select-none" onClick={() => togglePlayerSort('goals')}>G{sortArrow(playerSortKey === 'goals', playerSortDir)}</th>
                      <th className="py-2 pl-1 pr-2 text-right uppercase tracking-wider cursor-pointer select-none" onClick={() => togglePlayerSort('assists')}>A{sortArrow(playerSortKey === 'assists', playerSortDir)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayPlayerStats.slice(0, 100).map(p => (
                      <React.Fragment key={p.player.id}>
                        <tr
                          onClick={() => setExpandedPlayerId(expandedPlayerId === p.player.id ? null : p.player.id)}
                          className="cursor-pointer hover:bg-white/[0.06] transition-colors"
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                        >
                          <td className="py-2 pl-2 pr-1 font-black uppercase" style={{ overflow: 'hidden' }}>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="truncate">{p.displayName}</span>
                              <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.35)', fontSize: '8px' }}>{expandedPlayerId === p.player.id ? '▲' : '▼'}</span>
                            </div>
                          </td>
                          <td className="py-2 px-1 text-right" style={{ color: 'rgba(255,255,255,0.75)' }}>{p.timesPicked}</td>
                          <td className="py-2 px-1 text-right font-black" style={{ color: 'var(--pop-green)' }}>{playersIncludeBanker ? p.totalPickPoints : p.totalPickPointsRaw}</td>
                          <td className="py-2 px-1 text-right" style={{ color: 'rgba(255,255,255,0.75)' }}>{playersIncludeBanker ? p.avgPickPoints : p.avgPickPointsRaw}</td>
                          <td className="py-2 px-1 text-right" style={{ color: 'rgba(255,255,255,0.75)' }}>{p.goals}</td>
                          <td className="py-2 pl-1 pr-2 text-right" style={{ color: 'rgba(255,255,255,0.75)' }}>{p.assists}</td>
                        </tr>
                        {expandedPlayerId === p.player.id && (
                          <tr>
                            <td colSpan={6} className="px-3 py-3" style={{ background: 'rgba(0,242,250,0.06)' }}>
                              <p className="text-[10px] uppercase tracking-wider font-black mb-2" style={{ color: 'var(--pop-blue)' }}>Who picked {p.displayName}</p>
                              {(playerPickDetail[p.player.id] ?? []).length === 0 ? (
                                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>No scored picks yet.</p>
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  {(playerPickDetail[p.player.id] ?? []).map((d, i) => (
                                    <div key={i} className="flex items-center justify-between gap-2 text-xs">
                                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>GW{d.gw}</span>
                                      <span className="font-bold flex-1 truncate">{d.userName}</span>
                                      {d.isBanker && <span className="pop-badge px-1 py-0.5 text-[8px] font-black" style={{ background: 'var(--pop-orange)', color: 'var(--pop-white)' }}>★</span>}
                                      <span className="font-black" style={{ color: 'var(--pop-green)' }}>{d.points} pts</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {filteredPlayerStats.length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center uppercase tracking-wider" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>No data yet.</td></tr>
                    )}
                  </tbody>
                </table>
                {filteredPlayerStats.length > 100 && (
                  <p className="px-2 py-2" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Showing top 100 of {filteredPlayerStats.length} — narrow your search to see more specific players.</p>
                )}
              </div>
            </div>
          )}

          {tab === 'me' && (
            <div>
              {playerMenuOptions.length === 0 ? (
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>No scored gameweeks yet — check back once results come in.</p>
              ) : (
                <>
                  <p className="sec-label" style={{ color: 'rgba(255,255,255,0.6)' }}>Select a Manager</p>
                  <select
                    value={effectiveSelectedPlayerId}
                    onChange={e => setSelectedPlayerId(e.target.value)}
                    className="pop-input w-full mb-4 px-3 py-2 text-sm font-bold"
                  >
                    {playerMenuOptions.map(m => (
                      <option key={m.uid} value={m.uid}>{m.name}{m.uid === user?.id ? ' (You)' : ''}</option>
                    ))}
                  </select>

                  {selectedWeekly.length === 0 ? (
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>No scored gameweeks yet for {selectedPlayerName}.</p>
                  ) : (
                    <>
                      <p className="sec-label" style={{ color: 'rgba(255,255,255,0.6)' }}>This Season</p>
                      <ShareableCard filename={`${selectedPlayerName}-best-and-worst-gameweek`} className="grid grid-cols-2 gap-3 mb-4">
                        <div className="pop-panel pop-panel--green p-3">
                          <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>Best Gameweek</p>
                          <p className="text-xl font-black" style={{ color: 'var(--pop-green)' }}>GW{selectedBest?.gw} · {selectedBest?.points} pts</p>
                        </div>
                        <div className="pop-panel p-3">
                          <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>Worst Gameweek</p>
                          <p className="text-xl font-black" style={{ color: 'rgba(255,255,255,0.8)' }}>GW{selectedWorst?.gw} · {selectedWorst?.points} pts</p>
                        </div>
                      </ShareableCard>

                      <p className="sec-label" style={{ color: 'rgba(255,255,255,0.6)' }}>By Gameweek</p>
                      <ShareableCard filename={`${selectedPlayerName}-points-by-gameweek`} className="pop-panel pop-panel--blue p-4 mb-4" style={{ height: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={selectedWeekly.map(w => ({ name: `GW${w.gw}`, points: w.points }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                            <XAxis dataKey="name" {...popAxisProps()} />
                            <YAxis {...popAxisProps()} />
                            <Tooltip {...popTooltipStyle()} />
                            <Bar dataKey="points" fill={POP_ACCENT} radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </ShareableCard>

                      <p className="sec-label" style={{ color: 'rgba(255,255,255,0.6)' }}>Rank Over Time <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>(lower = better)</span></p>
                      <ShareableCard filename={`${selectedPlayerName}-rank-over-time`} className="pop-panel pop-panel--pink p-4" style={{ height: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={selectedCumulative.map(c => ({ name: `GW${c.gw}`, rank: c.rank }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                            <XAxis dataKey="name" {...popAxisProps()} />
                            <YAxis {...popAxisProps()} reversed allowDecimals={false} />
                            <Tooltip {...popTooltipStyle()} />
                            <Line type="monotone" dataKey="rank" stroke="#A000FA" strokeWidth={2} dot={{ r: 3, fill: '#A000FA' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </ShareableCard>

                      <p className="sec-label" style={{ color: 'rgba(255,255,255,0.6)' }}>Head-to-Head</p>
                      <select
                        value={compareUserId}
                        onChange={e => setCompareUserId(e.target.value)}
                        className="pop-input w-full mb-4 px-3 py-2 text-sm font-bold"
                      >
                        <option value="">— Compare against —</option>
                        {playerMenuOptions.filter(m => m.uid !== effectiveSelectedPlayerId).map(m => (
                          <option key={m.uid} value={m.uid}>{m.name}</option>
                        ))}
                      </select>

                      {compareUserId && headToHeadTally && (
                        <>
                          <div className="pop-panel pop-panel--yellow p-3 mb-4 text-center">
                            <p className="text-lg font-black">
                              <span style={{ color: POP_ACCENT }}>{selectedPlayerName} {headToHeadTally.selWins}</span>
                              <span style={{ color: 'rgba(255,255,255,0.5)' }}> — </span>
                              <span style={{ color: '#A000FA' }}>{headToHeadTally.cmpWins} {compareName}</span>
                            </p>
                            <p className="text-[10px] uppercase tracking-wider font-black mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                              gameweeks won{headToHeadTally.draws > 0 ? ` · ${headToHeadTally.draws} drawn` : ''}
                            </p>
                          </div>

                          <ShareableCard filename={`${selectedPlayerName}-vs-${compareName}`} className="pop-panel pop-panel--yellow p-4" style={{ height: 260 }}>
                            <ResponsiveContainer width="100%" height="90%">
                              <LineChart data={headToHeadChartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                                <XAxis dataKey="name" {...popAxisProps()} />
                                <YAxis {...popAxisProps()} />
                                <Tooltip {...popTooltipStyle()} />
                                <Legend wrapperStyle={{ fontSize: 11, color: '#ffffff' }} />
                                <Line type="monotone" dataKey={effectiveSelectedPlayerId} name={selectedPlayerName} stroke={POP_ACCENT} strokeWidth={2} dot={{ r: 3, fill: POP_ACCENT }} connectNulls />
                                <Line type="monotone" dataKey={compareUserId} name={compareName} stroke="#A000FA" strokeWidth={2} dot={{ r: 3, fill: '#A000FA' }} connectNulls />
                              </LineChart>
                            </ResponsiveContainer>
                          </ShareableCard>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'trends' && (
            <div>
              <p className="sec-label" style={{ color: 'rgba(255,255,255,0.6)' }}>Banker</p>
              <ShareableCard filename="banker-stats" className="grid grid-cols-2 gap-3 mb-4">
                <div className="pop-panel pop-panel--yellow p-3">
                  <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>Most Banked Team</p>
                  <p className="text-base font-black" style={{ color: 'var(--pop-yellow)' }}>{mostBankedTeam ? `${mostBankedTeam.name} (${mostBankedTeam.count}x)` : '—'}</p>
                </div>
                <div className="pop-panel pop-panel--yellow p-3">
                  <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>Most Banked Player</p>
                  <p className="text-base font-black" style={{ color: 'var(--pop-yellow)' }}>{mostBankedPlayer ? `${mostBankedPlayer.name} (${mostBankedPlayer.count}x)` : '—'}</p>
                </div>
                <div className="pop-panel pop-panel--yellow p-3">
                  <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>Most Value Added</p>
                  <p className="text-base font-black" style={{ color: 'var(--pop-yellow)' }}>{bankerValueLeader ? `${bankerValueLeader.name} (+${bankerValueLeader.points})` : '—'}</p>
                </div>
                <div className="pop-panel pop-panel--yellow p-3">
                  <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>Best Bankered GW</p>
                  <p className="text-base font-black" style={{ color: 'var(--pop-yellow)' }}>{bestBankerGameweek ? `${bestBankerGameweek.name} — GW${bestBankerGameweek.gw} (${bestBankerGameweek.points})` : '—'}</p>
                </div>
              </ShareableCard>

              <p className="sec-label" style={{ color: 'rgba(255,255,255,0.6)' }}>All or Nothing</p>
              <ShareableCard filename="all-or-nothing-stats" className="grid grid-cols-2 gap-3 mb-4">
                <div className="pop-panel pop-panel--green p-3">
                  <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>Success Rate</p>
                  <p className="text-base font-black" style={{ color: 'var(--pop-green)' }}>{aonSuccessRate ? `${aonSuccessRate.rate}% (${aonSuccessRate.success}/${aonSuccessRate.total})` : '—'}</p>
                </div>
                <div className="pop-panel pop-panel--green p-3">
                  <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>Most Nominated</p>
                  <p className="text-base font-black" style={{ color: 'var(--pop-green)' }}>{mostNominatedAon ? `${mostNominatedAon.name} (${mostNominatedAon.count}x)` : '—'}</p>
                </div>
              </ShareableCard>

              {bonusCardName && (
                <>
                  <p className="sec-label" style={{ color: 'rgba(255,255,255,0.6)' }}>{bonusCardName}</p>
                  <ShareableCard filename={`${bonusCardName}-stats`} className="grid grid-cols-3 gap-3 mb-4">
                    <div className="pop-panel pop-panel--blue p-3">
                      <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>Played</p>
                      <p className="text-base font-black" style={{ color: 'var(--pop-blue)' }}>{bonusCardUsage ? `${bonusCardUsage.used} / ${bonusCardUsage.total}` : '—'}</p>
                    </div>
                    <div className="pop-panel pop-panel--blue p-3">
                      <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>Avg When Played</p>
                      <p className="text-base font-black" style={{ color: 'var(--pop-blue)' }}>{bonusCardAvgPoints != null ? `${bonusCardAvgPoints} pts` : '—'}</p>
                    </div>
                    <div className="pop-panel pop-panel--blue p-3">
                      <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>Best Play</p>
                      <p className="text-base font-black" style={{ color: 'var(--pop-blue)' }}>{bestBonusCardPlay ? `${bestBonusCardPlay.name} — GW${bestBonusCardPlay.gw} (${bestBonusCardPlay.points})` : '—'}</p>
                    </div>
                  </ShareableCard>
                </>
              )}

              {allRanksChartData.length > 1 && rankedUserMeta.length > 0 && (
                <>
                  <p className="sec-label" style={{ color: 'rgba(255,255,255,0.6)' }}>The Race</p>
                  <ShareableCard filename="the-race-position-by-gameweek" className="pop-panel pop-panel--pink p-4 mb-4" style={{ height: Math.max(260, rankedUserMeta.length * 26) }}>
                    <p className="text-xs uppercase tracking-wider font-black mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      Position by Gameweek <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>(lower = better)</span>
                    </p>
                    <ResponsiveContainer width="100%" height="88%">
                      <LineChart data={allRanksChartData} margin={{ top: 4, right: 78, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                        <XAxis dataKey="name" {...popAxisProps()} />
                        <YAxis {...popAxisProps()} reversed allowDecimals={false} domain={[1, rankedUserMeta.length]} width={20} />
                        <Tooltip {...popTooltipStyle()} />
                        {rankedUserMeta.map((u, i) => {
                          const color = rankLineColour(i)
                          return (
                            <Line
                              key={u.uid}
                              type="monotone"
                              dataKey={u.uid}
                              name={u.name}
                              stroke={color}
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 3 }}
                              isAnimationActive={false}
                              label={(props: any) => {
                                if (props.index !== allRanksChartData.length - 1) return null
                                return (
                                  <text x={props.x + 8} y={props.y} dy={3} fontSize={10} fontWeight={700} fill={color} textAnchor="start">
                                    {u.name}
                                  </text>
                                )
                              }}
                            />
                          )
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  </ShareableCard>
                </>
              )}

              <p className="sec-label" style={{ color: 'rgba(255,255,255,0.6)' }}>League-Wide</p>
              <ShareableCard filename="average-score-by-gameweek" className="pop-panel pop-panel--blue p-4 mb-4" style={{ height: 240 }}>
                <p className="text-xs uppercase tracking-wider font-black mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>Average Score by Gameweek</p>
                <ResponsiveContainer width="100%" height="85%">
                  <LineChart data={avgByGw.map(a => ({ name: `GW${a.gw}`, avg: a.avg }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                    <XAxis dataKey="name" {...popAxisProps()} />
                    <YAxis {...popAxisProps()} />
                    <Tooltip {...popTooltipStyle()} />
                    <Line type="monotone" dataKey="avg" stroke={POP_ACCENT} strokeWidth={2} dot={{ r: 3, fill: POP_ACCENT }} />
                  </LineChart>
                </ResponsiveContainer>
              </ShareableCard>

              <ShareableCard filename="most-popular-teams" className="pop-panel pop-panel--blue p-4 mb-4" style={{ height: 260 }}>
                <p className="text-xs uppercase tracking-wider font-black mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>Most Popular Teams</p>
                <ResponsiveContainer width="100%" height="85%">
                  <BarChart data={teamPopularity}>
                    <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                    <XAxis dataKey="name" {...popAxisProps()} interval={0} angle={-35} textAnchor="end" height={50} />
                    <YAxis {...popAxisProps()} allowDecimals={false} />
                    <Tooltip {...popTooltipStyle()} />
                    <Bar dataKey="count" fill={POP_ACCENT} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ShareableCard>

              <ShareableCard filename="manual-vs-autopick" className="pop-panel pop-panel--blue p-4" style={{ height: 240 }}>
                <p className="text-xs uppercase tracking-wider font-black mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>Manual vs Autopick</p>
                <ResponsiveContainer width="100%" height="85%">
                  <BarChart data={pickMethod.map(m => ({ name: `GW${m.gw}`, Manual: m.manual, Autopick: m.autopick }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                    <XAxis dataKey="name" {...popAxisProps()} />
                    <YAxis {...popAxisProps()} allowDecimals={false} />
                    <Tooltip {...popTooltipStyle()} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#ffffff' }} />
                    <Bar dataKey="Manual" stackId="a" fill={POP_ACCENT} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Autopick" stackId="a" fill="rgba(255,255,255,0.3)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ShareableCard>
            </div>
          )}
        </div>
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
                <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">Top Teams by Points (inc. Banker)</p>
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
              <p className="text-xs mb-2 text-[#F5ECD9]/40">Points below include any Banker doubling.</p>

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
                            <TeamCrest teamId={t.team.id} teamName={t.team.name} size={16} />
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
                <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">Top Players by Points (inc. Banker)</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={playerStats.slice(0, 12).map(p => ({ name: p.displayName, points: p.totalPickPoints }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="name" {...axisProps()} interval={0} angle={-35} textAnchor="end" height={60} />
                    <YAxis {...axisProps()} />
                    <Tooltip {...tooltipStyle()} />
                    <Bar dataKey="points" fill={GOLD} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <input
                type="text"
                placeholder="Search players..."
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                className="w-full mb-3 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-[#F5ECD9] placeholder:text-[#F5ECD9]/30 focus:outline-none focus:border-[#D9A441]/50"
              />
              <p className="text-xs mb-2 text-[#F5ECD9]/40">Points below include any Banker doubling.</p>

              <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden overflow-x-auto">
                <table className="w-full" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr className="text-left border-b border-white/10 text-[#F5ECD9]/50" style={{ fontSize: '10px' }}>
                      <th className="py-2 px-2 uppercase tracking-wider">Player</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Picked</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider font-bold">Total Pts</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Avg / Pick</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Goals</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Assists</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayerStats.slice(0, 100).map(p => (
                      <tr key={p.player.id} className="border-b border-white/5 last:border-0">
                        <td className="py-2 px-2 font-bold uppercase">{p.displayName}</td>
                        <td className="py-2 px-2 text-right text-[#F5ECD9]/60">{p.timesPicked}</td>
                        <td className="py-2 px-2 text-right font-bold" style={{ color: GOLD }}>{p.totalPickPoints}</td>
                        <td className="py-2 px-2 text-right text-[#F5ECD9]/60">{p.avgPickPoints}</td>
                        <td className="py-2 px-2 text-right text-[#F5ECD9]/60">{p.goals}</td>
                        <td className="py-2 px-2 text-right text-[#F5ECD9]/60">{p.assists}</td>
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
                  <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">This Season</p>
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

                  <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">By Gameweek</p>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4" style={{ height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={myWeekly.map(w => ({ name: `GW${w.gw}`, points: w.points }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                        <XAxis dataKey="name" {...axisProps()} />
                        <YAxis {...axisProps()} />
                        <Tooltip {...tooltipStyle()} />
                        <Bar dataKey="points" fill={GOLD} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">Rank Over Time <span className="normal-case font-normal">(lower = better)</span></p>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4" style={{ height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
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
              <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">Banker</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold mb-1">Most Banked Team</p>
                  <p className="text-base font-bold" style={{ color: GOLD }}>{mostBankedTeam ? `${mostBankedTeam.name} (${mostBankedTeam.count}x)` : '—'}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold mb-1">Most Banked Player</p>
                  <p className="text-base font-bold" style={{ color: GOLD }}>{mostBankedPlayer ? `${mostBankedPlayer.name} (${mostBankedPlayer.count}x)` : '—'}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold mb-1">Most Value Added</p>
                  <p className="text-base font-bold" style={{ color: GOLD }}>{bankerValueLeader ? `${bankerValueLeader.name} (+${bankerValueLeader.points})` : '—'}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold mb-1">Best Bankered GW</p>
                  <p className="text-base font-bold" style={{ color: GOLD }}>{bestBankerGameweek ? `${bestBankerGameweek.name} — GW${bestBankerGameweek.gw} (${bestBankerGameweek.points})` : '—'}</p>
                </div>
              </div>

              <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">All or Nothing</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold mb-1">Success Rate</p>
                  <p className="text-base font-bold" style={{ color: GOLD }}>{aonSuccessRate ? `${aonSuccessRate.rate}% (${aonSuccessRate.success}/${aonSuccessRate.total})` : '—'}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold mb-1">Most Nominated</p>
                  <p className="text-base font-bold" style={{ color: GOLD }}>{mostNominatedAon ? `${mostNominatedAon.name} (${mostNominatedAon.count}x)` : '—'}</p>
                </div>
              </div>

              {bonusCardName && (
                <>
                  <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">{bonusCardName}</p>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold mb-1">Played</p>
                      <p className="text-base font-bold" style={{ color: GOLD }}>{bonusCardUsage ? `${bonusCardUsage.used} / ${bonusCardUsage.total}` : '—'}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold mb-1">Avg When Played</p>
                      <p className="text-base font-bold" style={{ color: GOLD }}>{bonusCardAvgPoints != null ? `${bonusCardAvgPoints} pts` : '—'}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/50 font-bold mb-1">Best Play</p>
                      <p className="text-base font-bold" style={{ color: GOLD }}>{bestBonusCardPlay ? `${bestBonusCardPlay.name} — GW${bestBonusCardPlay.gw} (${bestBonusCardPlay.points})` : '—'}</p>
                    </div>
                  </div>
                </>
              )}

              <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">League-Wide</p>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4" style={{ height: 240 }}>
                <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">Average Score by Gameweek</p>
                <ResponsiveContainer width="100%" height="85%">
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
                <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">Most Popular Teams</p>
                <ResponsiveContainer width="100%" height="85%">
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
                <p className="text-xs uppercase tracking-wider text-[#F5ECD9]/50 mb-2 font-bold">Manual vs Autopick</p>
                <ResponsiveContainer width="100%" height="85%">
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
