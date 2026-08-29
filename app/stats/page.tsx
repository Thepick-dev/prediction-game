'use client'

import { useState, useEffect, useMemo } from 'react'
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
}

type PlayerStat = {
  player: PlayerRow
  displayName: string
  goals: number
  assists: number
  timesPicked: number
  totalPickPoints: number
  avgPickPoints: number
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
const POP_ACCENT = 'var(--pop-blue)'
const POP_GRID = 'rgba(255,255,255,0.1)'
function popAxisProps() {
  return { tick: { fill: '#ffffff', fontSize: 10, opacity: 0.6 }, stroke: 'rgba(255,255,255,0.2)' }
}
function popTooltipStyle() {
  return {
    contentStyle: { background: '#1B1B1B', border: '1px solid rgba(0,242,250,0.4)', borderRadius: 10, fontSize: 12 },
    labelStyle: { color: POP_ACCENT },
    itemStyle: { color: '#ffffff' }
  }
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

  const [myWeekly, setMyWeekly] = useState<{ gw: number; points: number }[]>([])
  const [myCumulative, setMyCumulative] = useState<{ gw: number; cumulative: number; rank: number }[]>([])
  const [myBest, setMyBest] = useState<{ gw: number; points: number } | null>(null)
  const [myWorst, setMyWorst] = useState<{ gw: number; points: number } | null>(null)

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
          const [previewRes, scoringPreviewRes] = await Promise.all([
            fetch(`/api/autopick/preview?gameweek_id=${gw.id}`),
            fetch(`/api/scoring/preview?gameweek_id=${gw.id}`),
          ])
          const previewData = await previewRes.json()
          Object.entries(previewData.previews ?? {}).forEach(([userId, p]: [string, any]) => {
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

          const scoringData = await scoringPreviewRes.json()
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
      const teamAgg: Record<number, { picked: number; banked: number; total: number }> = {}
      points?.forEach(pt => {
        const pick = pickById[pt.pick_id]
        if (!pick) return
        const isBanker = (pt.breakdown as any)?.is_banker === true
        if (!teamAgg[pick.team_id]) teamAgg[pick.team_id] = { picked: 0, banked: 0, total: 0 }
        teamAgg[pick.team_id].picked += 1
        teamAgg[pick.team_id].total += pt.team_points ?? 0
        if (isBanker) teamAgg[pick.team_id].banked += 1
      })
      const teamStatList: TeamStat[] = Object.entries(teamAgg)
        .filter(([teamId]) => tMap[Number(teamId)])
        .map(([teamId, agg]) => ({
          team: tMap[Number(teamId)],
          timesPicked: agg.picked,
          timesBanked: agg.banked,
          totalPoints: Math.round(agg.total),
          avgPoints: agg.picked > 0 ? Math.round((agg.total / agg.picked) * 10) / 10 : 0
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
      // stripped-back raw score.
      const playerPickAgg: Record<number, { picked: number; total: number }> = {}
      points?.forEach(pt => {
        const pick = pickById[pt.pick_id]
        if (!pick) return
        ;[[pick.player1_id, pt.player1_points ?? 0], [pick.player2_id, pt.player2_points ?? 0]].forEach(([pid, val]) => {
          const playerId = pid as number
          if (!playerPickAgg[playerId]) playerPickAgg[playerId] = { picked: 0, total: 0 }
          playerPickAgg[playerId].picked += 1
          playerPickAgg[playerId].total += val as number
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
            avgPickPoints: pickAgg.picked > 0 ? Math.round((pickAgg.total / pickAgg.picked) * 10) / 10 : 0
          }
        })
        .sort((a, b) => b.totalPickPoints - a.totalPickPoints)
      setPlayerStats(playerStatList)

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

      // --- My performance ---
      if (authUser) {
        const weekly: { gw: number; points: number }[] = []
        Object.entries(gwPointsByUser).forEach(([gw, byUser]) => {
          if (byUser[authUser.id] !== undefined) weekly.push({ gw: Number(gw), points: byUser[authUser.id] })
        })
        weekly.sort((a, b) => a.gw - b.gw)
        setMyWeekly(weekly)

        if (weekly.length > 0) {
          const sortedByPts = [...weekly].sort((a, b) => b.points - a.points)
          setMyBest(sortedByPts[0])
          setMyWorst(sortedByPts[sortedByPts.length - 1])
        }

        const allGwNumbers = Array.from(new Set(Object.keys(gwPointsByUser).map(Number))).sort((a, b) => a - b)
        const userIds = Array.from(new Set(picks?.map(p => p.user_id) ?? entries?.map(e => e.user_id) ?? []))
        const cumByUser: Record<string, number> = {}
        const cumulative: { gw: number; cumulative: number; rank: number }[] = []
        allGwNumbers.forEach(gwNum => {
          userIds.forEach(uid => {
            cumByUser[uid] = (cumByUser[uid] ?? 0) + (gwPointsByUser[gwNum]?.[uid] ?? 0)
          })
          const ranked = userIds
            .map(uid => ({ uid, total: cumByUser[uid] ?? 0 }))
            .sort((a, b) => b.total - a.total)
          const myRank = ranked.findIndex(r => r.uid === authUser.id) + 1
          cumulative.push({ gw: gwNum, cumulative: Math.round(cumByUser[authUser.id] ?? 0), rank: myRank || ranked.length })
        })
        setMyCumulative(cumulative)
      }

      setLoading(false)
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong loading stats')
      setLoading(false)
    }
  }

  const filteredTeamStats = useMemo(() => {
    if (!teamSearch.trim()) return teamStats
    const q = teamSearch.toLowerCase()
    return teamStats.filter(t => teamDisplayName(t.team).toLowerCase().includes(q))
  }, [teamStats, teamSearch])

  const filteredPlayerStats = useMemo(() => {
    let list = playerStats
    if (playerSearch.trim()) {
      const q = playerSearch.toLowerCase()
      list = list.filter(p => p.displayName.toLowerCase().includes(q))
    }
    return list
  }, [playerStats, playerSearch])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'teams', label: 'Teams' },
    { id: 'players', label: 'Players' },
    { id: 'me', label: 'My Performance' },
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
          <h1 className="pop-hero pop-hero--blue text-5xl sm:text-6xl mb-1 mt-2">Stats Hub</h1>
          <p className="font-bold text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>{competition.name} — every number the game has generated so far.</p>

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
                className={`px-3 py-2 text-xs font-black tracking-widest whitespace-nowrap uppercase rounded-lg transition-colors ${tab === t.id ? 'pop-button' : 'hover:bg-white/[0.04]'}`}
                style={tab !== t.id ? { color: 'rgba(255,255,255,0.5)' } : undefined}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'teams' && (
            <div>
              <div className="pop-panel p-4 mb-4" style={{ height: 260 }}>
                <p className="sec-label">Top Teams by Points (inc. Banker)</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={teamStats.slice(0, 10).map(t => ({ name: teamDisplayName(t.team), points: t.totalPoints }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                    <XAxis dataKey="name" {...popAxisProps()} interval={0} angle={-35} textAnchor="end" height={50} />
                    <YAxis {...popAxisProps()} />
                    <Tooltip {...popTooltipStyle()} />
                    <Bar dataKey="points" fill={POP_ACCENT} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <input
                type="text"
                placeholder="Search teams..."
                value={teamSearch}
                onChange={e => setTeamSearch(e.target.value)}
                className="pop-input w-full mb-3 px-3 py-2 text-sm font-bold"
              />
              <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Points below include any Banker doubling.</p>

              <div className="pop-panel" style={{ overflow: 'hidden', overflowX: 'auto' }}>
                <table className="w-full" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr className="text-left" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                      <th className="py-2 px-2 uppercase tracking-wider">Team</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Picked</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Banked</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Total Pts</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider font-black">Avg / Pick</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeamStats.map(t => (
                      <tr key={t.team.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <td className="py-2 px-2 font-black uppercase">
                          <div className="flex items-center gap-1.5">
                            <TeamCrest teamId={t.team.id} teamName={t.team.name} size={16} />
                            {teamDisplayName(t.team)}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right" style={{ color: 'rgba(255,255,255,0.6)' }}>{t.timesPicked}</td>
                        <td className="py-2 px-2 text-right" style={{ color: 'rgba(255,255,255,0.6)' }}>{t.timesBanked}</td>
                        <td className="py-2 px-2 text-right" style={{ color: 'rgba(255,255,255,0.6)' }}>{t.totalPoints}</td>
                        <td className="py-2 px-2 text-right font-black" style={{ color: 'var(--pop-green)' }}>{t.avgPoints}</td>
                      </tr>
                    ))}
                    {filteredTeamStats.length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center uppercase tracking-wider" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>No data yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'players' && (
            <div>
              <div className="pop-panel p-4 mb-4" style={{ height: 260 }}>
                <p className="sec-label">Top Players by Points (inc. Banker)</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={playerStats.slice(0, 12).map(p => ({ name: p.displayName, points: p.totalPickPoints }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                    <XAxis dataKey="name" {...popAxisProps()} interval={0} angle={-35} textAnchor="end" height={60} />
                    <YAxis {...popAxisProps()} />
                    <Tooltip {...popTooltipStyle()} />
                    <Bar dataKey="points" fill={POP_ACCENT} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <input
                type="text"
                placeholder="Search players..."
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                className="pop-input w-full mb-3 px-3 py-2 text-sm font-bold"
              />
              <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Points below include any Banker doubling.</p>

              <div className="pop-panel" style={{ overflow: 'hidden', overflowX: 'auto' }}>
                <table className="w-full" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr className="text-left" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                      <th className="py-2 px-2 uppercase tracking-wider">Player</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Picked</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider font-black">Total Pts</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Avg / Pick</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Goals</th>
                      <th className="py-2 px-2 text-right uppercase tracking-wider">Assists</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayerStats.slice(0, 100).map(p => (
                      <tr key={p.player.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <td className="py-2 px-2 font-black uppercase">{p.displayName}</td>
                        <td className="py-2 px-2 text-right" style={{ color: 'rgba(255,255,255,0.6)' }}>{p.timesPicked}</td>
                        <td className="py-2 px-2 text-right font-black" style={{ color: 'var(--pop-green)' }}>{p.totalPickPoints}</td>
                        <td className="py-2 px-2 text-right" style={{ color: 'rgba(255,255,255,0.6)' }}>{p.avgPickPoints}</td>
                        <td className="py-2 px-2 text-right" style={{ color: 'rgba(255,255,255,0.6)' }}>{p.goals}</td>
                        <td className="py-2 px-2 text-right" style={{ color: 'rgba(255,255,255,0.6)' }}>{p.assists}</td>
                      </tr>
                    ))}
                    {filteredPlayerStats.length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center uppercase tracking-wider" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>No data yet.</td></tr>
                    )}
                  </tbody>
                </table>
                {filteredPlayerStats.length > 100 && (
                  <p className="px-2 py-2" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>Showing top 100 of {filteredPlayerStats.length} — narrow your search to see more specific players.</p>
                )}
              </div>
            </div>
          )}

          {tab === 'me' && (
            <div>
              {!user ? (
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Log in to see your personal performance.</p>
              ) : myWeekly.length === 0 ? (
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>No scored gameweeks yet — check back once results come in.</p>
              ) : (
                <>
                  <p className="sec-label">This Season</p>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="pop-panel p-3">
                      <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Best Gameweek</p>
                      <p className="text-xl font-black" style={{ color: 'var(--pop-green)' }}>GW{myBest?.gw} · {myBest?.points} pts</p>
                    </div>
                    <div className="pop-panel p-3">
                      <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Worst Gameweek</p>
                      <p className="text-xl font-black" style={{ color: 'rgba(255,255,255,0.7)' }}>GW{myWorst?.gw} · {myWorst?.points} pts</p>
                    </div>
                  </div>

                  <p className="sec-label">By Gameweek</p>
                  <div className="pop-panel p-4 mb-4" style={{ height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={myWeekly.map(w => ({ name: `GW${w.gw}`, points: w.points }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                        <XAxis dataKey="name" {...popAxisProps()} />
                        <YAxis {...popAxisProps()} />
                        <Tooltip {...popTooltipStyle()} />
                        <Bar dataKey="points" fill={POP_ACCENT} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <p className="sec-label">Rank Over Time <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>(lower = better)</span></p>
                  <div className="pop-panel p-4" style={{ height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={myCumulative.map(c => ({ name: `GW${c.gw}`, rank: c.rank }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                        <XAxis dataKey="name" {...popAxisProps()} />
                        <YAxis {...popAxisProps()} reversed allowDecimals={false} />
                        <Tooltip {...popTooltipStyle()} />
                        <Line type="monotone" dataKey="rank" stroke="var(--pop-pink)" strokeWidth={2} dot={{ r: 3, fill: 'var(--pop-pink)' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'trends' && (
            <div>
              <p className="sec-label">Banker</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="pop-panel p-3">
                  <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Most Banked Team</p>
                  <p className="text-base font-black" style={{ color: 'var(--pop-yellow)' }}>{mostBankedTeam ? `${mostBankedTeam.name} (${mostBankedTeam.count}x)` : '—'}</p>
                </div>
                <div className="pop-panel p-3">
                  <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Most Banked Player</p>
                  <p className="text-base font-black" style={{ color: 'var(--pop-yellow)' }}>{mostBankedPlayer ? `${mostBankedPlayer.name} (${mostBankedPlayer.count}x)` : '—'}</p>
                </div>
                <div className="pop-panel p-3">
                  <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Most Value Added</p>
                  <p className="text-base font-black" style={{ color: 'var(--pop-yellow)' }}>{bankerValueLeader ? `${bankerValueLeader.name} (+${bankerValueLeader.points})` : '—'}</p>
                </div>
                <div className="pop-panel p-3">
                  <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Best Bankered GW</p>
                  <p className="text-base font-black" style={{ color: 'var(--pop-yellow)' }}>{bestBankerGameweek ? `${bestBankerGameweek.name} — GW${bestBankerGameweek.gw} (${bestBankerGameweek.points})` : '—'}</p>
                </div>
              </div>

              <p className="sec-label">All or Nothing</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="pop-panel p-3">
                  <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Success Rate</p>
                  <p className="text-base font-black" style={{ color: 'var(--pop-green)' }}>{aonSuccessRate ? `${aonSuccessRate.rate}% (${aonSuccessRate.success}/${aonSuccessRate.total})` : '—'}</p>
                </div>
                <div className="pop-panel p-3">
                  <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Most Nominated</p>
                  <p className="text-base font-black" style={{ color: 'var(--pop-green)' }}>{mostNominatedAon ? `${mostNominatedAon.name} (${mostNominatedAon.count}x)` : '—'}</p>
                </div>
              </div>

              {bonusCardName && (
                <>
                  <p className="sec-label">{bonusCardName}</p>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="pop-panel p-3">
                      <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Played</p>
                      <p className="text-base font-black" style={{ color: 'var(--pop-blue)' }}>{bonusCardUsage ? `${bonusCardUsage.used} / ${bonusCardUsage.total}` : '—'}</p>
                    </div>
                    <div className="pop-panel p-3">
                      <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Avg When Played</p>
                      <p className="text-base font-black" style={{ color: 'var(--pop-blue)' }}>{bonusCardAvgPoints != null ? `${bonusCardAvgPoints} pts` : '—'}</p>
                    </div>
                    <div className="pop-panel p-3">
                      <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Best Play</p>
                      <p className="text-base font-black" style={{ color: 'var(--pop-blue)' }}>{bestBonusCardPlay ? `${bestBonusCardPlay.name} — GW${bestBonusCardPlay.gw} (${bestBonusCardPlay.points})` : '—'}</p>
                    </div>
                  </div>
                </>
              )}

              <p className="sec-label">League-Wide</p>
              <div className="pop-panel p-4 mb-4" style={{ height: 240 }}>
                <p className="text-xs uppercase tracking-wider font-black mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Average Score by Gameweek</p>
                <ResponsiveContainer width="100%" height="85%">
                  <LineChart data={avgByGw.map(a => ({ name: `GW${a.gw}`, avg: a.avg }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                    <XAxis dataKey="name" {...popAxisProps()} />
                    <YAxis {...popAxisProps()} />
                    <Tooltip {...popTooltipStyle()} />
                    <Line type="monotone" dataKey="avg" stroke={POP_ACCENT} strokeWidth={2} dot={{ r: 3, fill: POP_ACCENT }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="pop-panel p-4 mb-4" style={{ height: 260 }}>
                <p className="text-xs uppercase tracking-wider font-black mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Most Popular Teams</p>
                <ResponsiveContainer width="100%" height="85%">
                  <BarChart data={teamPopularity}>
                    <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                    <XAxis dataKey="name" {...popAxisProps()} interval={0} angle={-35} textAnchor="end" height={50} />
                    <YAxis {...popAxisProps()} allowDecimals={false} />
                    <Tooltip {...popTooltipStyle()} />
                    <Bar dataKey="count" fill={POP_ACCENT} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="pop-panel p-4" style={{ height: 240 }}>
                <p className="text-xs uppercase tracking-wider font-black mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Manual vs Autopick</p>
                <ResponsiveContainer width="100%" height="85%">
                  <BarChart data={pickMethod.map(m => ({ name: `GW${m.gw}`, Manual: m.manual, Autopick: m.autopick }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={POP_GRID} />
                    <XAxis dataKey="name" {...popAxisProps()} />
                    <YAxis {...popAxisProps()} allowDecimals={false} />
                    <Tooltip {...popTooltipStyle()} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#ffffff' }} />
                    <Bar dataKey="Manual" stackId="a" fill={POP_ACCENT} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Autopick" stackId="a" fill="rgba(255,255,255,0.25)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
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
