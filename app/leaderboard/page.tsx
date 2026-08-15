'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import { CrownIcon, FlameIcon, BoltIcon, CheckIcon, CrossIcon, ShadesIcon, PoundCoinIcon } from '../../components/icons'
import HeroPage from '../../components/HeroPage'
import TeamCrest from '../../components/TeamCrest'
import KitBadge from '../../components/KitBadge'
import BotAvatar from '../../components/BotAvatar'
import { buildPlayerDisplayNames, bonusCardDisplayName } from '../lib/players'
import LeaderboardShareCard from '../../components/LeaderboardShareCard'
import { usePopArtTheme } from '../lib/usePopArtTheme'
import PopArtLoading from '../../components/PopArtLoading'

type RankedPlayer = {
  user_id: string
  display_name: string
  is_bot: boolean
  is_reigning_champ: boolean
  is_vibes_champion: boolean
  in_cash_pool: boolean
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

// Futzy has no kit — a blank KitBadge just reads as broken. A small
// circular avatar in the same slot instead, sized to match.
export default function LeaderboardPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [competition, setCompetition] = useState<any>(null)
  const [ranked, setRanked] = useState<RankedPlayer[]>([])
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [pickDetails, setPickDetails] = useState<Record<string, PickDetail[]>>({})
  const [allGameweeks, setAllGameweeks] = useState<{ id: string; number: number; deadline: string }[]>([])
  const [matchEvents, setMatchEvents] = useState<any[]>([])
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [teamMap, setTeamMap] = useState<Record<number, Team>>({})
  const [kitByUser, setKitByUser] = useState<Record<string, { pattern: string; colour1: string; colour2: string; colour3: string | null; stars: number; earths: number }>>({})
  const [usedTeamsByPlayer, setUsedTeamsByPlayer] = useState<Record<string, Record<number, number>>>({})
  const [doubleUseByPlayer, setDoubleUseByPlayer] = useState<Record<string, number[]>>({})
  const [bankersUsedByPlayer, setBankersUsedByPlayer] = useState<Record<string, number>>({})
  // Presence only — who has played their All or Nothing card at all this
  // competition, never which player or how it went. Sourced from a view
  // deliberately built to expose only that (see all_or_nothing_status),
  // so this is safe to show for everyone regardless of any deadline.
  const [aonUsedByPlayer, setAonUsedByPlayer] = useState<Set<string>>(new Set())
  const [bonusCardPlayedByUser, setBonusCardPlayedByUser] = useState<Set<string>>(new Set())
  const [bonusCardPlayByUser, setBonusCardPlayByUser] = useState<Record<string, { gameweek_id: string; player_id: number; playerName: string; fixture_id: number | null; points: number | null }>>({})
  const [bonusCardName, setBonusCardName] = useState<string | null>(null)
  const [avgByGw, setAvgByGw] = useState<Record<number, number>>({})
  const [submittedKeys, setSubmittedKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showShare, setShowShare] = useState(false)
  // Rivalry — one optional standing rival per user per competition, fully
  // public so it can show on anyone's row, not just your own.
  const [rivalByUser, setRivalByUser] = useState<Record<string, string>>({})
  const [rivalPickerFor, setRivalPickerFor] = useState<string | null>(null)
  const [savingRival, setSavingRival] = useState(false)

  const supabase = createClient()
  const { popArt } = usePopArtTheme(user?.id)

  useEffect(() => { loadData() }, [])

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
      supabase.from('pick_submission_status').select('user_id, gameweek_id').eq('competition_id', comp.id),
      // Same table Results reads (there per-gameweek, here for the whole
      // competition at once) so the per-gameweek dropdown can show who
      // played All-or-Nothing, not just whether they ever have this season.
      supabase.from('all_or_nothing_picks').select('user_id, gameweek_id, player_id, outcome').eq('competition_id', comp.id),
      // Same table Results reads — every play across the whole competition,
      // so both the "have they used it" status chip and the total-points
      // summation below can be computed without a second round trip.
      supabase.from('bonus_card_plays').select('user_id, gameweek_id, player_id, fixture_id, points').eq('competition_id', comp.id)
    ])

    // Its own isolated request, same reasoning as everywhere else this
    // pattern shows up on this page — a brand new, entirely optional
    // feature, so a problem here should never take the rest of the
    // leaderboard down with it.
    const { data: rivalries } = await supabase.from('rivalries').select('user_id, rival_user_id').eq('competition_id', comp.id)
    const rivalMap: Record<string, string> = {}
    rivalries?.forEach(r => { rivalMap[r.user_id] = r.rival_user_id })
    setRivalByUser(rivalMap)

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

    // Its own request, same reason — these are newer, optional,
    // admin-assigned leaderboard badges, and a problem reading them should
    // never take display names or points down with it.
    const { data: badgeFlags } = await supabase.from('profiles').select('id, is_reigning_champ, is_vibes_champion, in_cash_pool')
    const badgeMap: Record<string, { is_reigning_champ: boolean; is_vibes_champion: boolean; in_cash_pool: boolean }> = {}
    badgeFlags?.forEach(b => {
      badgeMap[b.id] = {
        is_reigning_champ: b.is_reigning_champ ?? false,
        is_vibes_champion: b.is_vibes_champion ?? false,
        in_cash_pool: b.in_cash_pool ?? false,
      }
    })

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

    const bankerMap: Record<string, number> = {}
    combinedPicks.forEach(pick => {
      if (pick.is_banker) bankerMap[pick.user_id] = (bankerMap[pick.user_id] || 0) + 1
    })
    setBankersUsedByPlayer(bankerMap)

    // Its own isolated query, same reasoning as everywhere else on this
    // page — a problem here should never take the rest of the leaderboard
    // down with it.
    const { data: aonStatus } = await supabase.from('all_or_nothing_status').select('user_id').eq('competition_id', comp.id)
    setAonUsedByPlayer(new Set((aonStatus ?? []).map(a => a.user_id)))

    setBonusCardPlayedByUser(new Set((bonusCardPlays ?? []).map(p => p.user_id)))
    const bonusCardPlayMap: Record<string, { gameweek_id: string; player_id: number; playerName: string; fixture_id: number | null; points: number | null }> = {}
    bonusCardPlays?.forEach(p => { bonusCardPlayMap[p.user_id] = { ...p, playerName: playerMap[p.player_id] ?? 'Unknown' } })
    setBonusCardPlayByUser(bonusCardPlayMap)
    setBonusCardName(bonusCardDisplayName(comp.bonus_card_name, comp.bonus_card_player_id != null ? playerMap[comp.bonus_card_player_id] : null))

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
        is_bot: isBotMap[entry.user_id] ?? false,
        is_reigning_champ: badgeMap[entry.user_id]?.is_reigning_champ ?? false,
        is_vibes_champion: badgeMap[entry.user_id]?.is_vibes_champion ?? false,
        in_cash_pool: badgeMap[entry.user_id]?.in_cash_pool ?? false,
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

    // Bonus Card points are real points but deliberately NOT folded into
    // weekly_points above — the owner confirmed the card shouldn't count
    // toward the "best single gameweek score" tiebreaker, only toward the
    // actual ranking totals below.
    bonusCardPlays?.forEach(play => {
      const t = totals[play.user_id]
      if (!t || play.points == null) return
      t.bonus_card_points += play.points
      t.total_points += play.points
      t.points_without_banker += play.points
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

    const aonMap: Record<string, { player_id: number; outcome: string }> = {}
    aonPicks?.forEach(a => { aonMap[`${a.user_id}_${a.gameweek_id}`] = { player_id: a.player_id, outcome: a.outcome } })

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

  async function setRival(rivalUserId: string) {
    if (!competition || !user) return
    setSavingRival(true)
    await fetch('/api/rivalry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competition_id: competition.id, rival_user_id: rivalUserId }),
    })
    setRivalByUser(prev => ({ ...prev, [user.id]: rivalUserId }))
    setRivalPickerFor(null)
    setSavingRival(false)
  }

  async function removeRival() {
    if (!competition || !user) return
    setSavingRival(true)
    await fetch('/api/rivalry', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competition_id: competition.id }),
    })
    setRivalByUser(prev => {
      const next = { ...prev }
      delete next[user.id]
      return next
    })
    setSavingRival(false)
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

  // Only take up a column/chip for this when the competition has actually
  // configured a player at some point — most competitions won't use this
  // feature, and an always-present empty column would be pure clutter.
  // Shared by both theme branches below.
  const showBonusCard = competition?.bonus_card_player_id != null

  if (popArt) {
    return (
      <>
        <Shell active="LEADERBOARD" user={user} displayName={displayName} theme="pop-art">
          <div className="pop-art-theme">

            <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
              <h1 className="pop-hero pop-hero--blue text-5xl sm:text-6xl">Leaderboard</h1>
              <div className="flex items-center gap-2">
                {ranked.length > 0 && (
                  <button
                    onClick={() => setShowShare(true)}
                    className="pop-button px-3 py-1.5 text-xs"
                  >
                    Share Standings
                  </button>
                )}
                <a href="/awards" className="pop-button px-3 py-1.5 text-xs" style={{ background: 'var(--pop-orange)' }}>
                  🏆 Awards
                </a>
                <a href="/leaderboard/full" className="pop-button pop-button--blue px-3 py-1.5 text-xs">
                  Full Table →
                </a>
              </div>
            </div>
            <p className="font-bold text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>{competition.name}</p>

            <div className="pop-panel" style={{ overflow: 'hidden' }}>
              {/* Deliberately just rank, player and total — everything else
                  (team/player/banker split, best gameweek, etc.) lives on
                  the Full Table page now. This view is about one thing:
                  who's winning. */}
              <table className="w-full" style={{ fontSize: '16px', tableLayout: 'fixed' }}>
                <thead>
                  <tr className="text-left" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                    <th className="py-3 pl-2 pr-1 uppercase tracking-wider" style={{ width: '12%' }}>#</th>
                    <th className="py-3 px-1 uppercase tracking-wider" style={{ width: '58%' }}>Player</th>
                    <th className="py-3 pl-1 pr-2 text-right uppercase tracking-wider font-black" style={{ width: '30%' }}>Points</th>
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
                          <td className="py-3.5 pl-2 pr-1 font-black" style={{ color: 'rgba(255,255,255,0.4)' }}>{index + 1}</td>
                          <td className="py-3.5 px-1 font-black uppercase" style={{ wordBreak: 'break-word' }}>
                            <div className="flex items-center gap-2 flex-wrap">
                              {player.is_bot ? <BotAvatar size={34} /> : (
                                <KitBadge
                                  pattern={kitByUser[player.user_id]?.pattern ?? 'solid'}
                                  colour1={kitByUser[player.user_id]?.colour1 ?? '#1E4D6B'}
                                  colour2={kitByUser[player.user_id]?.colour2 ?? '#F5ECD9'}
                                  colour3={kitByUser[player.user_id]?.colour3}
                                  size={34}
                                />
                              )}
                              <span className="inline-flex flex-col leading-tight">
                                <span>{player.display_name}</span>
                                {((kitByUser[player.user_id]?.stars ?? 0) > 0 || (kitByUser[player.user_id]?.earths ?? 0) > 0) && (
                                  <span className="normal-case font-normal" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', letterSpacing: '1px' }}>
                                    {'★'.repeat(kitByUser[player.user_id]?.stars ?? 0)}{'🌍'.repeat(kitByUser[player.user_id]?.earths ?? 0)}
                                  </span>
                                )}
                              </span>
                              {isOwnRow && <span className="pop-badge pop-badge--pink px-1.5 py-0.5 text-[8px]">You</span>}
                              {player.is_reigning_champ && <CrownIcon size={18} color="var(--pop-green)" />}
                              {player.is_vibes_champion && <span title="Vibes Champion"><ShadesIcon size={18} /></span>}
                              {player.in_cash_pool && <span title="In the cash pool"><PoundCoinIcon size={18} /></span>}
                              {streak && <span title={`${streak} weeks above average`} className="inline-flex"><FlameIcon size={18} /></span>}
                              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px' }}>{expandedUser === player.user_id ? '▲' : '▼'}</span>
                            </div>
                          </td>
                          <td className="py-3.5 pl-1 pr-2 text-right font-black font-mono" style={{ color: 'var(--pop-green)', fontVariantNumeric: 'tabular-nums', fontSize: '23px' }}>{player.total_points}</td>
                        </tr>
                        {expandedUser === player.user_id && (
                          <tr>
                            <td colSpan={3} className="px-1.5 sm:px-3 py-3" style={{ background: 'rgba(0,0,0,0.35)' }}>
                              <div className="flex items-center justify-between gap-3 mb-4 pb-3 flex-wrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                                {player.is_bot ? <BotAvatar size={66} /> : (
                                  <KitBadge
                                    pattern={kitByUser[player.user_id]?.pattern ?? 'solid'}
                                    colour1={kitByUser[player.user_id]?.colour1 ?? '#1E4D6B'}
                                    colour2={kitByUser[player.user_id]?.colour2 ?? '#F5ECD9'}
                                    colour3={kitByUser[player.user_id]?.colour3}
                                    stars={kitByUser[player.user_id]?.stars ?? 0}
                                    earths={kitByUser[player.user_id]?.earths ?? 0}
                                    size={66}
                                    iconTextClass="text-xl sm:text-3xl"
                                    starColor="var(--pop-green)"
                                  />
                                )}
                              </div>

                              {/* Bold status cards, not small stat text — Banker/AoN/Bonus
                                  Card are big parts of the game and should read that way.
                                  Best Gameweek moved to the Full Table page only. */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                                <div className="rounded-lg p-2.5 text-center" style={{ background: (bankersUsedByPlayer[player.user_id] ?? 0) > 0 ? 'rgba(250,97,0,0.18)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(250,97,0,0.4)' }}>
                                  <p className="text-[9px] uppercase tracking-widest font-black mb-0.5" style={{ color: 'var(--pop-orange)' }}>★ Banker</p>
                                  <p className="text-sm font-black" style={{ color: 'var(--pop-white)' }}>{Math.max(0, 2 - (bankersUsedByPlayer[player.user_id] ?? 0))} / 2 left</p>
                                </div>
                                <div className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(204,250,0,0.12)', border: '1px solid rgba(204,250,0,0.4)' }}>
                                  <p className="text-[9px] uppercase tracking-widest font-black mb-0.5 inline-flex items-center justify-center gap-1" style={{ color: 'var(--pop-green)' }}><BoltIcon size={10} color="var(--pop-green)" /> All or Nothing</p>
                                  <p className="text-sm font-black" style={{ color: 'var(--pop-white)' }}>{aonUsedByPlayer.has(player.user_id) ? 'Used' : 'Available'}</p>
                                </div>
                                {showBonusCard && (
                                  <div className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(0,242,250,0.1)', border: '1px solid rgba(0,242,250,0.4)' }}>
                                    <p className="text-[9px] uppercase tracking-widest font-black mb-0.5" style={{ color: 'var(--pop-blue)' }}>{bonusCardName}</p>
                                    <p className="text-sm font-black" style={{ color: 'var(--pop-white)' }}>
                                      {bonusCardPlayedByUser.has(player.user_id)
                                        ? `Used${bonusCardPlayByUser[player.user_id] ? ` — GW${allGameweeks.find(g => g.id === bonusCardPlayByUser[player.user_id].gameweek_id)?.number ?? '?'}` : ''}`
                                        : 'Available'}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Rivalry — a quiet, fully public line. You can set/change/
                                  remove yours from your own row; anyone's shows on theirs. */}
                              <div className="mb-4" style={{ fontSize: '11px' }}>
                                {isOwnRow ? (
                                  rivalByUser[player.user_id] ? (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                                        Rivalry — vs <strong style={{ color: 'var(--pop-white)' }}>{ranked.find(p => p.user_id === rivalByUser[player.user_id])?.display_name ?? 'Unknown'}</strong>:{' '}
                                        {(() => {
                                          const rivalPoints = ranked.find(p => p.user_id === rivalByUser[player.user_id])?.total_points ?? 0
                                          const diff = player.total_points - rivalPoints
                                          return <strong style={{ color: diff >= 0 ? 'var(--pop-green)' : 'var(--pop-red)' }}>{diff >= 0 ? `+${diff}` : diff}</strong>
                                        })()}
                                      </span>
                                      <button onClick={removeRival} disabled={savingRival} className="font-mono text-[10px] underline" style={{ color: 'rgba(255,255,255,0.4)' }}>Remove</button>
                                      <button onClick={() => setRivalPickerFor(rivalPickerFor === player.user_id ? null : player.user_id)} className="font-mono text-[10px] underline" style={{ color: 'rgba(255,255,255,0.4)' }}>Change</button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setRivalPickerFor(rivalPickerFor === player.user_id ? null : player.user_id)}
                                      className="pop-button px-3 py-1.5 text-xs"
                                      style={{ background: 'var(--pop-red)' }}
                                    >
                                      Pick a Rival
                                    </button>
                                  )
                                ) : (
                                  rivalByUser[player.user_id] && (
                                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                                      Rivalry — vs {ranked.find(p => p.user_id === rivalByUser[player.user_id])?.display_name ?? 'Unknown'}:{' '}
                                      {(() => {
                                        const rivalPoints = ranked.find(p => p.user_id === rivalByUser[player.user_id])?.total_points ?? 0
                                        const diff = player.total_points - rivalPoints
                                        return <strong style={{ color: diff >= 0 ? 'var(--pop-green)' : 'var(--pop-red)' }}>{diff >= 0 ? `+${diff}` : diff}</strong>
                                      })()}
                                    </span>
                                  )
                                )}
                                {rivalPickerFor === player.user_id && (
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    {ranked.filter(p => p.user_id !== player.user_id).map(p => (
                                      <button key={p.user_id} onClick={() => setRival(p.user_id)} disabled={savingRival} className="pop-badge px-2 py-1 text-[10px]" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                        {p.display_name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

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
                                              <TeamCrest crestUrl={teamMap[d.team_id]?.crest_url ?? null} teamName={teamMap[d.team_id]?.name ?? ''} size={14} />
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
                                  </tbody>
                                </table>
                              )}

                              {/* Its own list entry right after the GW table, not folded into
                                  a row there — it isn't a per-gameweek thing, it's a once-ever-
                                  across-the-whole-competition thing. Points here are read-only
                                  display: already counted exactly once in the Points column
                                  above, via totals in the data-loading effect — never re-summed
                                  here. */}
                              {showBonusCard && (
                                <div className="flex items-center gap-2 mb-4 p-2 rounded-lg" style={{ background: 'rgba(0,242,250,0.08)', border: '1px solid rgba(0,242,250,0.3)' }}>
                                  <img
                                    src="/bonus-card-player.png"
                                    alt=""
                                    style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                                    onError={e => { e.currentTarget.style.display = 'none' }}
                                  />
                                  <div style={{ fontSize: '10px' }}>
                                    <p className="font-black uppercase" style={{ color: 'var(--pop-blue)' }}>{bonusCardName}</p>
                                    {bonusCardPlayByUser[player.user_id] ? (
                                      <p style={{ color: 'rgba(255,255,255,0.7)' }}>
                                        Played {bonusCardPlayByUser[player.user_id].playerName}
                                        {' — GW'}{allGameweeks.find(g => g.id === bonusCardPlayByUser[player.user_id].gameweek_id)?.number ?? '?'}
                                        {bonusCardPlayByUser[player.user_id].points != null && ` — ${bonusCardPlayByUser[player.user_id].points} pts`}
                                      </p>
                                    ) : (
                                      <p style={{ color: 'rgba(255,255,255,0.5)' }}>Remaining — not yet played</p>
                                    )}
                                  </div>
                                </div>
                              )}

                              <div style={{ fontSize: '9px' }}>
                                <p className="uppercase tracking-wider font-black mb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                  Teams ({teamsWithAvailability.filter(t => t.remaining > 0).length} available)
                                </p>
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
                                          <TeamCrest crestUrl={team.crest_url} teamName={team.name} size={14} />
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
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                  {ranked.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center uppercase tracking-wider" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>No players yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pop-panel p-4 mt-3">
              <p className="font-black uppercase tracking-wider text-xs mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>Key</p>
              <div className="flex flex-col gap-2.5" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)' }}>
                <div className="flex items-center gap-2.5"><CrownIcon size={20} color="var(--pop-green)" /> Reigning champ</div>
                <div className="flex items-center gap-2.5"><ShadesIcon size={20} /> Vibes champion</div>
                <div className="flex items-center gap-2.5"><PoundCoinIcon size={20} /> In the cash pool</div>
                <div className="flex items-center gap-2.5"><FlameIcon size={20} /> On a streak — 3+ weeks above average</div>
                <div className="flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded font-black text-xs" style={{ background: 'rgba(255,255,255,0.15)' }}>AP</span> Autopick — deadline missed, computer picked</div>
                <div className="flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded font-black text-xs" style={{ background: 'var(--pop-orange)', color: 'var(--pop-white)' }}>★</span> Banker declared that gameweek</div>
                <div className="flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded font-black text-xs inline-flex items-center gap-0.5" style={{ background: 'var(--pop-blue)', color: 'var(--pop-black)' }}><BoltIcon size={11} color="var(--pop-black)" /> AoN</span> All or Nothing played, result pending</div>
                <div className="flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded font-black text-xs inline-flex items-center gap-0.5" style={{ background: 'var(--pop-green)', color: 'var(--pop-black)' }}><CheckIcon size={11} color="var(--pop-black)" /> AoN</span> All or Nothing succeeded</div>
                <div className="flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded font-black text-xs inline-flex items-center gap-0.5" style={{ background: 'var(--pop-red)', color: 'var(--pop-white)' }}><CrossIcon size={11} color="var(--pop-white)" /> AoN</span> All or Nothing failed</div>
                <div className="flex items-center gap-2.5" style={{ color: 'rgba(255,255,255,0.5)' }}>▼ Tap a row to see their week-by-week picks</div>
              </div>
            </div>

          </div>
        </Shell>

        {showShare && (
          <LeaderboardShareCard
            competitionName={competition.name}
            standings={ranked.map(p => ({ name: p.display_name, points: p.total_points }))}
            onClose={() => setShowShare(false)}
            popArt
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
                            {player.is_bot ? <BotAvatar size={16} /> : (
                              <KitBadge
                                pattern={kitByUser[player.user_id]?.pattern ?? 'solid'}
                                colour1={kitByUser[player.user_id]?.colour1 ?? '#1E4D6B'}
                                colour2={kitByUser[player.user_id]?.colour2 ?? '#F5ECD9'}
                                colour3={kitByUser[player.user_id]?.colour3}
                                size={16}
                              />
                            )}
                            <span className="inline-flex flex-col leading-tight">
                              <span>{player.display_name}</span>
                              {((kitByUser[player.user_id]?.stars ?? 0) > 0 || (kitByUser[player.user_id]?.earths ?? 0) > 0) && (
                                <span className="normal-case font-normal" style={{ fontSize: '8px', color: 'rgba(245,236,217,0.4)', letterSpacing: '1px' }}>
                                  {'★'.repeat(kitByUser[player.user_id]?.stars ?? 0)}{'🌍'.repeat(kitByUser[player.user_id]?.earths ?? 0)}
                                </span>
                              )}
                            </span>
                            {player.is_reigning_champ && <span className="text-[#D9A441]">👑</span>}
                            {player.is_vibes_champion && <span title="Vibes Champion">😎</span>}
                            {player.in_cash_pool && <span title="In the cash pool">💷</span>}
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
                              <div className="flex items-start gap-4 flex-wrap justify-end">
                                <div className="text-right">
                                  <p className="text-[9px] uppercase tracking-widest text-[#F5ECD9]/40 font-bold">Best Gameweek (tiebreaker #3)</p>
                                  <p className="text-sm font-bold" style={{ color: '#D9A441' }}>{player.best_gameweek_score} pts</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[9px] uppercase tracking-widest text-[#F5ECD9]/40 font-bold">Bankers Left</p>
                                  <p className="text-sm font-bold" style={{ color: '#D9A441' }}>{Math.max(0, 2 - (bankersUsedByPlayer[player.user_id] ?? 0))} / 2</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[9px] uppercase tracking-widest text-[#F5ECD9]/40 font-bold">All or Nothing</p>
                                  <p className="text-sm font-bold" style={{ color: '#D9A441' }}>{aonUsedByPlayer.has(player.user_id) ? 'Used' : 'Available'}</p>
                                </div>
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

                            {showBonusCard && (
                              <div className="flex items-center gap-2 mb-4 p-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
                                <img
                                  src="/bonus-card-player.png"
                                  alt=""
                                  style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                                  onError={e => { e.currentTarget.style.display = 'none' }}
                                />
                                <div style={{ fontSize: '10px' }}>
                                  <p className="font-bold uppercase text-blue-300">{bonusCardName}</p>
                                  {bonusCardPlayByUser[player.user_id] ? (
                                    <p className="text-[#F5ECD9]/70">
                                      Played {bonusCardPlayByUser[player.user_id].playerName}
                                      {' — GW'}{allGameweeks.find(g => g.id === bonusCardPlayByUser[player.user_id].gameweek_id)?.number ?? '?'}
                                      {bonusCardPlayByUser[player.user_id].points != null && ` — ${bonusCardPlayByUser[player.user_id].points} pts`}
                                    </p>
                                  ) : (
                                    <p className="text-[#F5ECD9]/50">Remaining — not yet played</p>
                                  )}
                                </div>
                              </div>
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
            👑 Reigning champ
            <span className="mx-2">·</span>
            😎 Vibes champion
            <span className="mx-2">·</span>
            💷 In the cash pool
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