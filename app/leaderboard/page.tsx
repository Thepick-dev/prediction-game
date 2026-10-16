'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import { CrownIcon, FlameIcon, BoltIcon, CheckIcon, CrossIcon, ShadesIcon, PoundCoinIcon, ScalesIcon, BlockedIcon, TopDogIcon, YellowCardIcon, RedCardIcon, DoveIcon } from '../../components/icons'
import Modal from '../../components/Modal'
import HeroPage from '../../components/HeroPage'
import TeamCrest from '../../components/TeamCrest'
import KitBadge from '../../components/KitBadge'
import BotAvatar from '../../components/BotAvatar'
import FutzyExplainerLink from '../../components/FutzyExplainerLink'
import { buildPlayerDisplayNames, bonusCardDisplayName } from '../lib/players'
import { computeTopDog } from '../lib/topDog'
import { computeAvgByGw, computeStreaks } from '../lib/leaderboardBadges'
import { computeCompetitionAwards, resolveWinners, awardWinnerNames, type CompetitionAward } from '../lib/awards'
import PersonalSeasonShareCard from '../../components/PersonalSeasonShareCard'
import LeaderboardShareCard from '../../components/LeaderboardShareCard'
import { useSkin } from '../lib/useSkin'
import { RULES_TEXT } from '../lib/rulesText'
import PopArtLoading from '../../components/PopArtLoading'
import { RetroWindow, RetroButton, RetroModal, pad } from '../../components/retro'

type RankedPlayer = {
  user_id: string
  display_name: string
  is_bot: boolean
  is_reigning_champ: boolean
  is_vibes_champion: boolean
  in_cash_pool: boolean
  is_sporting_panel: boolean
  is_minigame_banned: boolean
  is_peace_prize: boolean
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
  weekly_points_without_banker: number[]
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

// Futzy has no kit — a blank KitBadge just reads as broken. A small
// circular avatar in the same slot instead, sized to match.
export default function LeaderboardPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [competition, setCompetition] = useState<any>(null)
  const [ranked, setRanked] = useState<RankedPlayer[]>([])
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [teamsExpandedUsers, setTeamsExpandedUsers] = useState<Set<string>>(new Set())
  const [pickDetails, setPickDetails] = useState<Record<string, PickDetail[]>>({})
  const [allGameweeks, setAllGameweeks] = useState<{ id: string; number: number; deadline: string; status: string }[]>([])
  const [matchEvents, setMatchEvents] = useState<any[]>([])
  const [fixtureGwMap, setFixtureGwMap] = useState<Record<number, string>>({})
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
  const [streakByUser, setStreakByUser] = useState<Record<string, number>>({})
  const [submittedKeys, setSubmittedKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showShare, setShowShare] = useState(false)
  // Rivalry — one optional standing rival per user per competition, fully
  // public so it can show on anyone's row, not just your own.
  const [rivalByUser, setRivalByUser] = useState<Record<string, string>>({})
  const [rivalPickerFor, setRivalPickerFor] = useState<string | null>(null)
  // Active (non-rescinded) card counts per user, plus who's currently
  // serving a suspension (any active suspension covering a gameweek that
  // hasn't been scored yet). Publicly readable by design — see the
  // discipline system plan.
  const [cardCountByUser, setCardCountByUser] = useState<Record<string, { yellow: number; red: number }>>({})
  const [currentlySuspendedIds, setCurrentlySuspendedIds] = useState<Set<string>>(new Set())
  const [disciplineModalUserId, setDisciplineModalUserId] = useState<string | null>(null)
  const [disciplineModalData, setDisciplineModalData] = useState<{
    cards: { card_type: string; reason: string; status: string; created_at: string }[]
    suspensions: { suspension_number: number; gameweeks_count: number; reason: string; status: string }[]
  } | null>(null)
  const [savingRival, setSavingRival] = useState(false)
  // Top Dog — the current leaderboard leader and how many completed
  // gameweeks running they've held it, recomputed fresh on every load.
  const [topDogUserId, setTopDogUserId] = useState<string | null>(null)
  const [topDogReignWeeks, setTopDogReignWeeks] = useState(0)
  // Same award set the Awards page shows, computed here too so a "Share
  // Season" ticket can say which awards a player actually won. Everyone's
  // final position/points/awards/best player are already public via the
  // Leaderboard and Awards pages, so any player can share anyone's —
  // holds a user_id, not a plain boolean, since it's no longer "own row"
  // only.
  const [awards, setAwards] = useState<CompetitionAward[]>([])
  const [showSeasonShareFor, setShowSeasonShareFor] = useState<string | null>(null)
  // Rank as of the previous scored gameweek, keyed by user_id — used to
  // show a small ▲/▼ movement indicator next to the current rank.
  const [previousRankByUser, setPreviousRankByUser] = useState<Record<string, number>>({})
  // Penalty shootout minigame personal best, keyed by user_id — shown as
  // a shirt number on the kit badge in the expanded row, same treatment
  // KitEditor already gives your own kit in Settings.
  const [topScoreByUser, setTopScoreByUser] = useState<Record<string, number>>({})

  const supabase = createClient()
  const { skin, popArt, retro } = useSkin(user?.id)

  useEffect(() => { loadData() }, [])

  // While any gameweek is genuinely live (deadline passed, not yet marked
  // completed), re-run loadData every minute so the "points update
  // automatically" banner below is actually true rather than only
  // reflecting a fresh recompute on the next manual page load. Re-arms
  // itself each time loadData() updates allGameweeks, and stops scheduling
  // once nothing is live anymore.
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

    let { data: comp } = await supabase
      .from('competitions')
      .select('id, name, status, bonus_card_enabled, bonus_card_player_id, bonus_card_name')
      .eq('status', 'active')
      .single()

    // No active competition right now doesn't necessarily mean "nothing to
    // show" — right after admin finalizes one and before the next is
    // activated, the leaderboard should keep showing the just-finished
    // competition's final standings rather than going blank.
    if (!comp) {
      const { data: justFinished } = await supabase
        .from('competitions')
        .select('id, name, status, bonus_card_enabled, bonus_card_player_id, bonus_card_name')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      comp = justFinished
    }

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

    // Its own request too — brand new column, and a problem reading it
    // must never be able to take the other badges above down with it.
    const { data: peacePrizeFlags } = await supabase.from('profiles').select('id, is_peace_prize')
    const peacePrizeMap: Record<string, boolean> = {}
    peacePrizeFlags?.forEach(b => { peacePrizeMap[b.id] = b.is_peace_prize ?? false })

    // Its own request too — a brand new feature, and a problem reading it
    // must never be able to take the rest of the leaderboard down with it.
    const { data: activeCards } = await supabase
      .from('discipline_cards')
      .select('user_id, card_type')
      .eq('competition_id', comp.id)
      .eq('status', 'active')
    const cardCountMap: Record<string, { yellow: number; red: number }> = {}
    activeCards?.forEach(c => {
      const entry = (cardCountMap[c.user_id] ??= { yellow: 0, red: 0 })
      if (c.card_type === 'yellow') entry.yellow++
      else entry.red++
    })
    setCardCountByUser(cardCountMap)

    // "Currently suspended" = an active suspension covering at least one
    // gameweek that hasn't been scored yet — deliberately not narrowed to
    // exactly "this week", so an upcoming ban shows as clearly as a live one.
    const { data: activeSuspensions } = await supabase
      .from('suspensions')
      .select('id, user_id')
      .eq('competition_id', comp.id)
      .eq('status', 'active')
    const suspensionIds = (activeSuspensions ?? []).map(s => s.id)
    const { data: suspGwRows } = suspensionIds.length > 0
      ? await supabase.from('suspension_gameweeks').select('suspension_id, gameweek_id').in('suspension_id', suspensionIds)
      : { data: [] as { suspension_id: string; gameweek_id: string }[] }
    const suspGwIds = [...new Set((suspGwRows ?? []).map(r => r.gameweek_id))]
    const { data: suspGwStatuses } = suspGwIds.length > 0
      ? await supabase.from('gameweeks').select('id, status').in('id', suspGwIds)
      : { data: [] as { id: string; status: string }[] }
    const gwStatusMap: Record<string, string> = {}
    suspGwStatuses?.forEach(g => { gwStatusMap[g.id] = g.status })
    const pendingSuspensionIds = new Set(
      (suspGwRows ?? []).filter(r => gwStatusMap[r.gameweek_id] !== 'completed').map(r => r.suspension_id)
    )
    setCurrentlySuspendedIds(new Set(
      (activeSuspensions ?? []).filter(s => pendingSuspensionIds.has(s.id)).map(s => s.user_id)
    ))

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

    // Same award set and tie-handling as the Awards page itself (shared via
    // computeCompetitionAwards), computed here too so each player's own
    // "Share My Season" ticket can say which of these they actually won.
    const { awards: seasonAwards } = computeCompetitionAwards({
      entries, profiles, pointsData, picks, gameweeks, fixtures, events, isBotMap, playerDisplayNames: playerMap,
    })
    setAwards(seasonAwards)

    // Fetch provisional autopicks for any gameweek past deadline but not yet scored.
    const previewGameweeks = (gameweeks ?? []).filter(g =>
      new Date(g.deadline) < now && g.status !== 'completed'
    )

    const realPickKeys = new Set((picks ?? []).map(p => `${p.user_id}-${p.gameweek_id}`))
    type ProvisionalPick = { user_id: string; gameweek_id: string; team_id: number; player1_id: number; player2_id: number }
    let provisionalPicks: ProvisionalPick[] = []

    // Bonus Card points only land in bonus_card_plays.points once a gameweek
    // is actually completed/recalculated — without this, a card played in a
    // still-live gameweek would show 0 here even though the preview below
    // already knows its live value, the same gap the G/A markers had before.
    // Keyed by user+gameweek (not just user) so a competition that allows
    // more than one play never has one still-live gameweek's preview
    // clobber, or get double-counted against, another.
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

        // The scoring preview is scoped to one gameweek, so its rows use a
        // plain `preview-${userId}` id — remap to match this page's own
        // `preview-${userId}-${gameweekId}` convention (it spans several
        // gameweeks at once, so needs the gameweek in the key to stay unique).
        ;(scoringData.rows ?? []).forEach((row: any) => {
          if (row.pick_id.startsWith('preview-')) {
            pointsByPickId[`preview-${row.user_id}-${gw.id}`] = row
          } else {
            pointsByPickId[row.pick_id] = row
          }
        })
        ;(scoringData.bonusCardRows ?? []).forEach((row: any) => {
          bonusCardPreviewPoints[`${row.user_id}-${gw.id}`] = row.points
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

    const avgMap = computeAvgByGw(pointsData, gwMap)
    setAvgByGw(avgMap)

    // Goals scored by a picked player only count towards that specific
    // gameweek's pick, not their season total, so we need to know which
    // gameweek each goal's fixture belongs to. Also stored in state (not
    // just this local var) so the per-gameweek G/A markers in the expanded
    // breakdown below can look events up the same way, rather than the
    // "did this player ever score all season" flat set that used to badge
    // every gameweek row for a player the moment they'd scored once, even
    // in weeks that hadn't been played yet.
    const fixtureGwMap: Record<number, string> = {}
    fixtures?.forEach(f => { fixtureGwMap[f.id] = f.gameweek_id })
    setFixtureGwMap(fixtureGwMap)

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
        is_peace_prize: peacePrizeMap[entry.user_id] ?? false,
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
        weekly_points_without_banker: [],
        best_gameweek_score: 0
      }
    })

    // Iterating pointsByPickId (not the raw pointsData fetch) so the
    // ranking totals actually pick up the live preview rows merged in
    // above for any gameweek that's past deadline but not yet marked
    // completed — previously this loop only ever saw frozen `points` rows,
    // so a gameweek that had genuinely started (events synced, live
    // preview computable) still showed zero on the leaderboard until an
    // admin ran Recalculate Points or marked it completed. Once a
    // gameweek IS completed its real row is what's in here anyway (the
    // preview merge only ever touches still-in-progress gameweeks), so
    // this is a strict superset, not a behaviour change for finished ones.
    Object.values(pointsByPickId).forEach((p: any) => {
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
      if (gwNum) {
        t.weekly_points[gwNum] = p.total_points ?? 0
        // Same tiebreaker source Top Dog now uses to break a raw points tie
        // — see app/lib/topDog.ts.
        t.weekly_points_without_banker[gwNum] = rawTotal
      }
    })

    // Bonus Card points are real points but deliberately NOT folded into
    // weekly_points above — the owner confirmed the card shouldn't count
    // toward the "best single gameweek score" tiebreaker, only toward the
    // actual ranking totals below.
    bonusCardPlays?.forEach(play => {
      const t = totals[play.user_id]
      if (!t) return
      const points = play.points ?? bonusCardPreviewPoints[`${play.user_id}-${play.gameweek_id}`] ?? null
      if (points == null) return
      t.bonus_card_points += points
      t.total_points += points
      t.points_without_banker += points
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

    // Top Dog — see app/lib/topDog.ts for the reign-tracking rules.
    const scoredGwNumbers = Object.keys(avgMap).map(Number).sort((a, b) => a - b)
    const weeklyPointsByUser: Record<string, number[]> = {}
    const weeklyPointsWithoutBankerByUser: Record<string, number[]> = {}
    Object.values(totals).forEach(t => {
      weeklyPointsByUser[t.user_id] = t.weekly_points
      weeklyPointsWithoutBankerByUser[t.user_id] = t.weekly_points_without_banker
    })
    const topDog = computeTopDog(scoredGwNumbers, weeklyPointsByUser, isBotMap, bonusCardPlays, gwMap, weeklyPointsWithoutBankerByUser)
    setTopDogUserId(topDog.leaderUserId)
    setTopDogReignWeeks(topDog.reignWeeks)
    setStreakByUser(computeStreaks(weeklyPointsByUser, avgMap))

    // Rank movement — position as of the previous scored gameweek vs now,
    // for the small ▲/▼ next to each rank. A lightweight indicator, not an
    // official ranking, so it deliberately uses weekly_points only (skips
    // the rarer Bonus Card timing nuance Top Dog accounts for).
    const previousRanks: Record<string, number> = {}
    if (scoredGwNumbers.length >= 2) {
      const previousGws = scoredGwNumbers.slice(0, -1)
      const previousTotals = Object.values(totals)
        .map(t => ({ user_id: t.user_id, value: previousGws.reduce((sum, gw) => sum + (t.weekly_points[gw] ?? 0), 0) }))
        .sort((a, b) => b.value - a.value)
      previousTotals.forEach((t, i) => { previousRanks[t.user_id] = i + 1 })
    }
    setPreviousRankByUser(previousRanks)

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

  // Keyed by `${player_id}_${gameweek_id}`, not just player_id — a goal
  // scored in GW1 must only badge that player's GW1 row, never every other
  // gameweek row for anyone who's ever picked them (including gameweeks
  // that haven't been played yet, which is what this used to do). Counts,
  // not just presence — a brace shows as "G x2", not a single G.
  const goalCountByKey: Record<string, number> = {}
  const assistCountByKey: Record<string, number> = {}
  matchEvents.forEach(e => {
    if (e.fixture_id == null) return
    const key = `${e.player_id}_${fixtureGwMap[e.fixture_id]}`
    if (e.event_type === 'goal') goalCountByKey[key] = (goalCountByKey[key] ?? 0) + 1
    if (e.event_type === 'assist') assistCountByKey[key] = (assistCountByKey[key] ?? 0) + 1
  })
  // Presence-only views of the same data, kept for the classic theme's own
  // badge rendering (dead/unreachable code — usePopArtTheme always returns
  // true — deliberately left untouched rather than building anything new
  // for it, this just keeps it compiling against the same keys as before).
  const goalEventKeys = new Set(Object.keys(goalCountByKey))
  const assistEventKeys = new Set(Object.keys(assistCountByKey))
  // "G x2" for a brace, not two separate G badges — table cells here are
  // tight on space, unlike the Picks page's live table.
  function eventLabel(letter: 'G' | 'A', count: number) {
    return count > 1 ? `${letter} x${count}` : letter
  }

  function getStreak(player: RankedPlayer) {
    return streakByUser[player.user_id] ?? null
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

  // For the "Share My Season" ticket — a player's own best-value player
  // and team across the whole competition, aggregated from their existing
  // week-by-week pick detail. Reuses resolveWinners so a genuine tie shows
  // "A & B" or "Multiple players (N)", exactly like the Awards page.
  function getBestPlayerAndTeam(userId: string) {
    const details = pickDetails[userId] ?? []
    const playerPoints: Record<string, number> = {}
    const teamPoints: Record<string, number> = {}
    details.forEach(d => {
      if (d.player1 && d.player1 !== 'Unknown') playerPoints[d.player1] = (playerPoints[d.player1] ?? 0) + (d.player1_points ?? 0)
      if (d.player2 && d.player2 !== 'Unknown') playerPoints[d.player2] = (playerPoints[d.player2] ?? 0) + (d.player2_points ?? 0)
      const teamName = teamDisplayName(teamMap[d.team_id])
      teamPoints[teamName] = (teamPoints[teamName] ?? 0) + (d.team_points ?? 0)
    })
    const bestPlayer = resolveWinners(
      Object.entries(playerPoints).map(([name, value]) => ({ name, value })),
      c => `${c.value} pts`,
      { minQualifying: 1 }
    )
    const bestTeam = resolveWinners(
      Object.entries(teamPoints).map(([name, value]) => ({ name, value })),
      c => `${c.value} pts`
    )
    return { bestPlayer, bestTeam }
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

  // Lazy, fetch-on-first-click, same pattern as SportingPanelLink — full
  // discipline history is only ever needed once someone actually clicks a
  // card badge, not eagerly for every row on the leaderboard.
  async function openDisciplineModal(userId: string) {
    setDisciplineModalUserId(userId)
    if (!competition) return
    setDisciplineModalData(null)
    const [{ data: cards }, { data: suspensions }] = await Promise.all([
      supabase.from('discipline_cards').select('card_type, reason, status, created_at').eq('user_id', userId).eq('competition_id', competition.id).order('created_at', { ascending: false }),
      supabase.from('suspensions').select('suspension_number, gameweeks_count, reason, status').eq('user_id', userId).eq('competition_id', competition.id).order('suspension_number', { ascending: false }),
    ])
    setDisciplineModalData({ cards: cards ?? [], suspensions: suspensions ?? [] })
  }

  if (loading) {
    return (
      <Shell active="LEADERBOARD" skin={skin}>
        <PopArtLoading />
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="LEADERBOARD" skin={skin}>
        {retro ? (
          <RetroWindow title="No Active Competition">
            <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 16 }}>There is no active competition right now.</p>
          </RetroWindow>
        ) : (
          <div className="pop-art-theme text-center py-12">
            <p className="pop-headline text-2xl mb-2">No Active Competition</p>
            <p style={{ color: 'rgba(255,255,255,0.5)' }}>There is no active competition right now.</p>
          </div>
        )}
      </Shell>
    )
  }

  // Only take up a column/chip for this when the competition has actually
  // configured a player at some point — most competitions won't use this
  // feature, and an always-present empty column would be pure clutter.
  // Shared by both theme branches below.
  const showBonusCard = competition?.bonus_card_player_id != null

  // Deadline's passed but not yet marked "completed" — the totals above
  // already include a live preview for these (see the aggregation loop
  // near the top of this file), and now that results/events sync
  // automatically every few minutes during a live gameweek, that preview
  // can genuinely move up or down as goals/assists get confirmed or
  // corrected mid-match, not just once after full time. Surfaced here so
  // that's expected, not alarming.
  const liveGameweekNumbers = allGameweeks.filter(g => g.status === 'locked').map(g => g.number)

  const rankColour = (index: number) => index === 0 ? 'var(--retro-gold)' : index === 1 ? 'var(--retro-grey-light)' : index === 2 ? 'var(--retro-red-light)' : 'var(--retro-ink)'

  if (retro) {
    return (
      <>
        <Shell active="LEADERBOARD" user={user} displayName={displayName} skin="retro">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
            <h1 style={{ fontFamily: 'var(--font-retro-display)', fontSize: 24, color: 'var(--retro-gold)', textShadow: 'var(--retro-px) var(--retro-px) 0 #000' }}>
              LEADERBOARD
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              {ranked.length > 0 && (
                <RetroButton variant="select" onClick={() => setShowShare(true)}>Share Standings</RetroButton>
              )}
              <a href="/awards" className="retro-button retro-button--b" style={{ textDecoration: 'none' }}>🏆 Awards</a>
              <a href="/leaderboard/full" className="retro-button retro-button--a" style={{ textDecoration: 'none' }}>Full Table →</a>
            </div>
          </div>
          <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 16, color: 'var(--retro-grey-light)', marginBottom: 'calc(var(--retro-px) * 6)' }}>{competition.name}</p>

          {liveGameweekNumbers.length > 0 && (
            <RetroWindow variant="blue" flat>
              <p style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 16 }}>
                <strong style={{ color: 'var(--retro-blue-light)' }}>GW{liveGameweekNumbers.join(', ')} LIVE</strong> — points below update automatically as goals and assists are confirmed. Final once the gameweek's marked complete.
              </p>
            </RetroWindow>
          )}

          <RetroWindow>
            <table className="w-full" style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 18, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontFamily: 'var(--font-retro-display)', fontSize: 9, color: 'var(--retro-grey-light)', textAlign: 'left', borderBottom: 'var(--retro-px) solid var(--retro-border)' }}>
                  <th className="py-2 pr-1">#</th>
                  <th className="py-2 px-1">Player</th>
                  <th className="py-2 pl-1 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((player, index) => {
                  const streak = getStreak(player)
                  const teamsWithAvailability = getTeamsWithAvailability(player.user_id)
                  const isOwnRow = player.user_id === user?.id
                  const prevRank = previousRankByUser[player.user_id]
                  const rankDelta = prevRank != null ? prevRank - (index + 1) : null
                  return (
                    <React.Fragment key={player.user_id}>
                      <tr
                        onClick={() => setExpandedUser(expandedUser === player.user_id ? null : player.user_id)}
                        style={{ cursor: 'pointer', borderBottom: 'var(--retro-px) solid rgba(255,255,255,0.15)', background: isOwnRow ? 'rgba(248,184,0,0.08)' : undefined }}
                      >
                        <td className="py-2 pr-1" style={{ color: rankColour(index) }}>
                          {pad(index + 1, 2)}
                          {rankDelta != null && rankDelta !== 0 && (
                            <div style={{ fontSize: 11, color: rankDelta > 0 ? 'var(--retro-green-light)' : 'var(--retro-red-light)' }}>
                              {rankDelta > 0 ? '▲' : '▼'}{Math.abs(rankDelta)}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-1">
                          <div className="flex items-center gap-1.5">
                            {player.is_bot ? <BotAvatar size={28} /> : (
                              <KitBadge
                                pattern={kitByUser[player.user_id]?.pattern ?? 'solid'}
                                colour1={kitByUser[player.user_id]?.colour1 ?? '#1E4D6B'}
                                colour2={kitByUser[player.user_id]?.colour2 ?? '#F5ECD9'}
                                colour3={kitByUser[player.user_id]?.colour3}
                                size={28}
                              />
                            )}
                            <span className="truncate" style={{ textTransform: 'uppercase' }}>
                              {player.display_name}
                              {player.is_bot && <FutzyExplainerLink popArt />}
                            </span>
                            <span className="flex items-center gap-1 shrink-0" style={{ fontSize: 12 }}>
                              {isOwnRow && <span style={{ color: 'var(--retro-gold)' }}>YOU</span>}
                              {player.is_reigning_champ && <CrownIcon size={14} color="var(--retro-green)" />}
                              {player.is_vibes_champion && <ShadesIcon size={14} />}
                              {player.in_cash_pool && <PoundCoinIcon size={14} />}
                              {player.is_sporting_panel && <ScalesIcon size={14} />}
                              {player.is_minigame_banned && <BlockedIcon size={14} />}
                              {player.is_peace_prize && <DoveIcon size={14} />}
                              {currentlySuspendedIds.has(player.user_id) && (
                                <button onClick={e => { e.stopPropagation(); openDisciplineModal(player.user_id) }} style={{ color: 'var(--retro-red-light)' }} title="Suspended — click for details">
                                  SUSP
                                </button>
                              )}
                              {((cardCountByUser[player.user_id]?.yellow ?? 0) > 0 || (cardCountByUser[player.user_id]?.red ?? 0) > 0) && (
                                <button onClick={e => { e.stopPropagation(); openDisciplineModal(player.user_id) }} className="inline-flex items-center gap-0.5" title="Discipline history">
                                  {(cardCountByUser[player.user_id]?.yellow ?? 0) > 0 && <YellowCardIcon size={13} />}
                                  {(cardCountByUser[player.user_id]?.red ?? 0) > 0 && <RedCardIcon size={13} />}
                                </button>
                              )}
                              {streak && <FlameIcon size={14} />}
                              {topDogUserId === player.user_id && topDogReignWeeks > 0 && (
                                <span className="inline-flex items-center gap-0.5"><TopDogIcon size={14} />{topDogReignWeeks}</span>
                              )}
                            </span>
                            <span className="shrink-0" style={{ color: 'var(--retro-grey-light)' }}>{expandedUser === player.user_id ? '▲' : '▼'}</span>
                          </div>
                        </td>
                        <td className="py-2 pl-1 text-right" style={{ color: 'var(--retro-green-light)', fontSize: 24 }}>{player.total_points}</td>
                      </tr>
                      {expandedUser === player.user_id && (
                        <tr>
                          <td colSpan={3} className="py-3" style={{ background: 'rgba(0,0,0,0.3)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--retro-px) * 4)' }}>
                              <div className="flex items-center gap-3">
                                {player.is_bot ? <BotAvatar size={56} /> : (
                                  <KitBadge
                                    pattern={kitByUser[player.user_id]?.pattern ?? 'solid'}
                                    colour1={kitByUser[player.user_id]?.colour1 ?? '#1E4D6B'}
                                    colour2={kitByUser[player.user_id]?.colour2 ?? '#F5ECD9'}
                                    colour3={kitByUser[player.user_id]?.colour3}
                                    stars={kitByUser[player.user_id]?.stars ?? 0}
                                    earths={kitByUser[player.user_id]?.earths ?? 0}
                                    size={56}
                                    starColor="var(--retro-gold)"
                                    topScore={topScoreByUser[player.user_id] ?? 0}
                                  />
                                )}
                              </div>

                              <div className="grid grid-cols-3 gap-2">
                                <RetroWindow flat variant="gold">
                                  <p style={{ fontFamily: 'var(--font-retro-display)', fontSize: 8, color: 'var(--retro-gold)' }}>★ BANKER</p>
                                  <p style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 16 }}>{Math.max(0, 2 - (bankersUsedByPlayer[player.user_id] ?? 0))}/2 left</p>
                                </RetroWindow>
                                <RetroWindow flat variant="green">
                                  <p style={{ fontFamily: 'var(--font-retro-display)', fontSize: 8, color: 'var(--retro-green-light)' }}>AoN</p>
                                  <p style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 16 }}>{aonUsedByPlayer.has(player.user_id) ? 'Used' : 'Available'}</p>
                                </RetroWindow>
                                {showBonusCard && (
                                  <RetroWindow flat variant="blue">
                                    <p style={{ fontFamily: 'var(--font-retro-display)', fontSize: 8, color: 'var(--retro-blue-light)' }}>{bonusCardName}</p>
                                    <p style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 16 }}>
                                      {bonusCardPlayedByUser.has(player.user_id)
                                        ? `Used${bonusCardPlayByUser[player.user_id] ? ` GW${allGameweeks.find(g => g.id === bonusCardPlayByUser[player.user_id].gameweek_id)?.number ?? '?'}` : ''}${bonusCardPlayByUser[player.user_id]?.points != null ? ` +${bonusCardPlayByUser[player.user_id].points}` : ''}`
                                        : 'Available'}
                                    </p>
                                  </RetroWindow>
                                )}
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                <RetroButton variant="b" onClick={() => setShowSeasonShareFor(player.user_id)}>
                                  Share {isOwnRow ? 'My' : `${player.display_name}'s`} Season
                                </RetroButton>
                                {isOwnRow && !rivalByUser[player.user_id] && (
                                  <RetroButton variant="a" onClick={() => setRivalPickerFor(rivalPickerFor === player.user_id ? null : player.user_id)}>
                                    Pick a Rival
                                  </RetroButton>
                                )}
                              </div>

                              {(rivalByUser[player.user_id] || rivalPickerFor === player.user_id) && (
                                <div style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 15 }}>
                                  {rivalByUser[player.user_id] && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span>
                                        Rivalry vs <strong>{ranked.find(p => p.user_id === rivalByUser[player.user_id])?.display_name ?? 'Unknown'}</strong>:{' '}
                                        {(() => {
                                          const rivalPoints = ranked.find(p => p.user_id === rivalByUser[player.user_id])?.total_points ?? 0
                                          const diff = player.total_points - rivalPoints
                                          return <strong style={{ color: diff >= 0 ? 'var(--retro-green-light)' : 'var(--retro-red-light)' }}>{diff >= 0 ? `+${diff}` : diff}</strong>
                                        })()}
                                      </span>
                                      {isOwnRow && (
                                        <>
                                          <button onClick={removeRival} disabled={savingRival} style={{ textDecoration: 'underline', color: 'var(--retro-grey-light)' }}>Remove</button>
                                          <button onClick={() => setRivalPickerFor(rivalPickerFor === player.user_id ? null : player.user_id)} style={{ textDecoration: 'underline', color: 'var(--retro-grey-light)' }}>Change</button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                  {rivalPickerFor === player.user_id && (
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                      {ranked.filter(p => p.user_id !== player.user_id).map(p => (
                                        <button key={p.user_id} onClick={() => setRival(p.user_id)} disabled={savingRival} className="retro-button retro-button--select" style={{ fontSize: 8 }}>
                                          {p.display_name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              <p style={{ fontFamily: 'var(--font-retro-display)', fontSize: 9, color: 'var(--retro-blue-light)' }}>PICK HISTORY</p>
                              {allGameweeks.length === 0 ? (
                                <p style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 15 }}>No picks yet.</p>
                              ) : (
                                <div style={{ overflowX: 'auto' }}>
                                <table className="w-full" style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 14 }}>
                                  <thead>
                                    <tr style={{ textAlign: 'left', color: 'var(--retro-grey-light)', borderBottom: 'var(--retro-px) solid rgba(255,255,255,0.15)' }}>
                                      <th className="py-1 pr-1">GW</th>
                                      <th className="py-1 pr-1">Team</th>
                                      <th className="py-1 pr-1 text-right">Pts</th>
                                      <th className="py-1 pr-1">P1</th>
                                      <th className="py-1 pr-1 text-right">Pts</th>
                                      <th className="py-1 pr-1">P2</th>
                                      <th className="py-1 pr-1 text-right">Pts</th>
                                      <th className="py-1 text-right">Tot</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {buildGwRows(player.user_id).map(row => {
                                      if (row.kind === 'run') {
                                        return (
                                          <tr key={`run-${row.from}-${row.to}`} style={{ borderBottom: 'var(--retro-px) solid rgba(255,255,255,0.08)', color: 'var(--retro-grey-light)' }}>
                                            <td className="py-1 pr-1">{row.from === row.to ? row.from : `${row.from}-${row.to}`}</td>
                                            <td className="py-1 pr-1" colSpan={6}>{row.label}</td>
                                            <td className="py-1 text-right">—</td>
                                          </tr>
                                        )
                                      }
                                      if (row.kind === 'hidden') {
                                        return (
                                          <tr key={row.gw.id} style={{ borderBottom: 'var(--retro-px) solid rgba(255,255,255,0.08)', color: 'var(--retro-grey-light)' }}>
                                            <td className="py-1 pr-1">{row.gw.number}</td>
                                            <td className="py-1 pr-1" colSpan={6}>Picked — hidden until deadline</td>
                                            <td className="py-1 text-right">—</td>
                                          </tr>
                                        )
                                      }
                                      const gw = row.gw
                                      const d = pickDetails[player.user_id]?.find(pd => pd.gw === gw.number)!
                                      return (
                                        <tr key={gw.id} style={{ borderBottom: 'var(--retro-px) solid rgba(255,255,255,0.08)' }}>
                                          <td className="py-1 pr-1">{d.gw}</td>
                                          <td className="py-1 pr-1">
                                            <div className="flex items-center gap-1">
                                              <TeamCrest teamId={d.team_id} teamName={teamMap[d.team_id]?.name ?? ''} size={14} />
                                              {teamDisplayName(teamMap[d.team_id])}
                                              {d.is_banker && <span style={{ color: 'var(--retro-gold)' }}>★</span>}
                                              {(d.provisional || d.is_autopick) && <span style={{ color: 'var(--retro-grey-light)' }} title="Autopick">AP</span>}
                                            </div>
                                            {d.team_detail?.opponent_team_id != null && (
                                              <div style={{ fontSize: 11, color: 'var(--retro-grey-light)' }}>
                                                {d.team_detail.is_home ? 'H' : 'A'} vs {teamMap[d.team_detail.opponent_team_id]?.short_code ?? teamMap[d.team_detail.opponent_team_id]?.short_name ?? '?'} (Q{d.team_detail.team_quartile}→Q{d.team_detail.opponent_quartile})
                                                {d.team_detail.team_score != null ? ` · ${d.team_detail.team_score}-${d.team_detail.opponent_score}` : ' · not played yet'}
                                              </div>
                                            )}
                                          </td>
                                          <td className="py-1 pr-1 text-right">{d.team_points ?? '—'}</td>
                                          <td className="py-1 pr-1">
                                            {d.player1}
                                            {goalCountByKey[`${d.player1_id}_${gw.id}`] > 0 && <span style={{ color: 'var(--retro-green-light)', marginLeft: 3 }}>{eventLabel('G', goalCountByKey[`${d.player1_id}_${gw.id}`])}</span>}
                                            {assistCountByKey[`${d.player1_id}_${gw.id}`] > 0 && <span style={{ color: 'var(--retro-blue-light)', marginLeft: 3 }}>{eventLabel('A', assistCountByKey[`${d.player1_id}_${gw.id}`])}</span>}
                                            {d.aon?.player_id === d.player1_id && (
                                              <span style={{ marginLeft: 3, color: d.aon.outcome === 'success' ? 'var(--retro-green-light)' : d.aon.outcome === 'failed' ? 'var(--retro-red-light)' : 'var(--retro-blue-light)' }}>AoN</span>
                                            )}
                                          </td>
                                          <td className="py-1 pr-1 text-right">{d.player1_points ?? '—'}</td>
                                          <td className="py-1 pr-1">
                                            {d.player2}
                                            {goalCountByKey[`${d.player2_id}_${gw.id}`] > 0 && <span style={{ color: 'var(--retro-green-light)', marginLeft: 3 }}>{eventLabel('G', goalCountByKey[`${d.player2_id}_${gw.id}`])}</span>}
                                            {assistCountByKey[`${d.player2_id}_${gw.id}`] > 0 && <span style={{ color: 'var(--retro-blue-light)', marginLeft: 3 }}>{eventLabel('A', assistCountByKey[`${d.player2_id}_${gw.id}`])}</span>}
                                            {d.aon?.player_id === d.player2_id && (
                                              <span style={{ marginLeft: 3, color: d.aon.outcome === 'success' ? 'var(--retro-green-light)' : d.aon.outcome === 'failed' ? 'var(--retro-red-light)' : 'var(--retro-blue-light)' }}>AoN</span>
                                            )}
                                          </td>
                                          <td className="py-1 pr-1 text-right">{d.player2_points ?? '—'}</td>
                                          <td className="py-1 text-right">{d.points ?? '—'}</td>
                                        </tr>
                                      )
                                    })}
                                    {showBonusCard && (
                                      <tr style={{ color: 'var(--retro-grey-light)' }}>
                                        <td className="py-1 pr-1" colSpan={7}>
                                          {bonusCardName}
                                          {bonusCardPlayByUser[player.user_id] ? (
                                            <>{' — '}{bonusCardPlayByUser[player.user_id].playerName}{' — GW'}{allGameweeks.find(g => g.id === bonusCardPlayByUser[player.user_id].gameweek_id)?.number ?? '?'}</>
                                          ) : ' — Not yet played'}
                                        </td>
                                        <td className="py-1 text-right" style={{ color: 'var(--retro-blue-light)' }}>
                                          {bonusCardPlayByUser[player.user_id]?.points != null ? `+${bonusCardPlayByUser[player.user_id].points}` : '—'}
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                                </div>
                              )}

                              <p style={{ fontFamily: 'var(--font-retro-display)', fontSize: 9, color: 'var(--retro-blue-light)' }}>TEAMS USED</p>
                              <button
                                type="button"
                                onClick={() => setTeamsExpandedUsers(prev => {
                                  const next = new Set(prev)
                                  if (next.has(player.user_id)) next.delete(player.user_id)
                                  else next.add(player.user_id)
                                  return next
                                })}
                                className="retro-button retro-button--select w-full"
                                style={{ justifyContent: 'space-between' }}
                              >
                                <span>{teamsExpandedUsers.has(player.user_id) ? '▾' : '▸'} {teamsWithAvailability.length} teams · {teamsWithAvailability.filter(t => t.remaining <= 0).length} used</span>
                                <span>{teamsExpandedUsers.has(player.user_id) ? 'Hide' : 'View'}</span>
                              </button>
                              {teamsExpandedUsers.has(player.user_id) && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5" style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 14 }}>
                                  {teamsWithAvailability.map(team => {
                                    const used = team.remaining <= 0
                                    return (
                                      <div key={team.id} className="flex items-center gap-1" style={{ border: 'var(--retro-px) solid var(--retro-border)', padding: 'calc(var(--retro-px) * 1.5)', opacity: used ? 0.4 : 1 }}>
                                        <TeamCrest teamId={team.id} teamName={team.name} size={14} />
                                        <span className="truncate flex-1 min-w-0">{teamDisplayName(team)}</span>
                                        {team.isDouble && !used && team.remaining === 2 && <span style={{ color: 'var(--retro-gold)' }}>×2</span>}
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
                  <tr><td colSpan={3} className="py-8 text-center" style={{ color: 'var(--retro-grey-light)' }}>No players yet.</td></tr>
                )}
              </tbody>
            </table>
          </RetroWindow>

          <RetroWindow title="Key">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--retro-px) * 3)', fontFamily: 'var(--font-retro-body)', fontSize: 15 }}>
              <div className="flex items-center gap-2.5"><CrownIcon size={18} color="var(--retro-green)" /> Reigning champ</div>
              <div className="flex items-center gap-2.5"><ShadesIcon size={18} /> Vibes champion</div>
              <div className="flex items-center gap-2.5"><PoundCoinIcon size={18} /> In the cash pool</div>
              <div className="flex items-center gap-2.5"><ScalesIcon size={18} /> Sporting Panel member</div>
              <div className="flex items-center gap-2.5"><BlockedIcon size={18} /> Banned from minigame</div>
              <div className="flex items-center gap-2.5"><DoveIcon size={16} /> LMS Peace Prize</div>
              <div className="flex items-center gap-2.5"><YellowCardIcon size={16} />/<RedCardIcon size={16} /> Cards this competition — click for details</div>
              <div className="flex items-center gap-2.5"><FlameIcon size={18} /> On a streak — 3+ weeks above average</div>
              <div className="flex items-center gap-2.5"><TopDogIcon size={18} /> Top Dog — current leader</div>
              <div className="flex items-center gap-2.5"><span style={{ color: 'var(--retro-grey-light)' }}>AP</span> Autopick — deadline missed</div>
              <div className="flex items-center gap-2.5"><span style={{ color: 'var(--retro-gold)' }}>★</span> Banker declared</div>
              <div className="flex items-center gap-2.5" style={{ color: 'var(--retro-grey-light)' }}>▼ Tap a row to see their week-by-week picks</div>
            </div>
          </RetroWindow>

          <RetroWindow title="How Ties Are Split">
            <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 14, color: 'var(--retro-grey-light)', marginBottom: 'calc(var(--retro-px) * 3)' }}>
              When two or more players are level, these criteria are applied in order until the tie breaks.
            </p>
            <ol style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--retro-px) * 2)', fontFamily: 'var(--font-retro-body)', fontSize: 15 }}>
              {RULES_TEXT.tiebreakers.map((criterion, i) => (
                <li key={i} className="flex gap-2.5">
                  <span style={{ color: 'var(--retro-green-light)' }}>{i + 1}.</span>
                  <span>{criterion}</span>
                </li>
              ))}
            </ol>
          </RetroWindow>
        </Shell>

        {showShare && (
          <LeaderboardShareCard
            competitionName={competition.name}
            standings={ranked.map((p, i) => ({
              name: p.display_name,
              points: p.total_points,
              is_bot: p.is_bot,
              kit: kitByUser[p.user_id] ? {
                pattern: kitByUser[p.user_id].pattern,
                colour1: kitByUser[p.user_id].colour1,
                colour2: kitByUser[p.user_id].colour2,
                colour3: kitByUser[p.user_id].colour3,
              } : null,
              is_reigning_champ: p.is_reigning_champ,
              is_vibes_champion: p.is_vibes_champion,
              is_top_dog: topDogUserId === p.user_id && topDogReignWeeks > 0,
              streak: streakByUser[p.user_id] ?? null,
              bankers_used: bankersUsedByPlayer[p.user_id] ?? 0,
              rank_delta: previousRankByUser[p.user_id] != null ? previousRankByUser[p.user_id] - (i + 1) : null,
            }))}
            onClose={() => setShowShare(false)}
            popArt
          />
        )}

        {showSeasonShareFor && (() => {
          const targetIndex = ranked.findIndex(p => p.user_id === showSeasonShareFor)
          if (targetIndex === -1) return null
          const target = ranked[targetIndex]
          const { bestPlayer, bestTeam } = getBestPlayerAndTeam(target.user_id)
          const wonAwards = awards
            .filter(a => awardWinnerNames(a).includes(target.display_name))
            .map(a => ({ emoji: a.emoji, title: a.title }))
          return (
            <PersonalSeasonShareCard
              competitionName={competition.name}
              displayName={target.display_name}
              position={targetIndex + 1}
              totalEntrants={ranked.length}
              points={target.total_points}
              isProvisional={competition.status === 'active'}
              wonAwards={wonAwards}
              bestPlayer={bestPlayer}
              bestTeam={bestTeam}
              onClose={() => setShowSeasonShareFor(null)}
            />
          )
        })()}

        {disciplineModalUserId && (
          <RetroModal onClose={() => setDisciplineModalUserId(null)} title={`Discipline — ${ranked.find(p => p.user_id === disciplineModalUserId)?.display_name ?? 'Unknown'}`}>
            {!disciplineModalData ? (
              <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 16 }}>Loading...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--retro-px) * 5)' }}>
                {disciplineModalData.suspensions.length > 0 && (
                  <div>
                    <p style={{ fontFamily: 'var(--font-retro-display)', fontSize: 9, color: 'var(--retro-red-light)', marginBottom: 'calc(var(--retro-px) * 2)' }}>SUSPENSIONS</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--retro-px) * 2)' }}>
                      {disciplineModalData.suspensions.map((s, i) => (
                        <RetroWindow key={i} variant="red" flat>
                          <p style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 16 }}>
                            Suspension #{s.suspension_number} — {s.gameweeks_count} gameweek{s.gameweeks_count === 1 ? '' : 's'}
                            {s.status !== 'active' && <span style={{ color: 'var(--retro-grey-light)' }}> ({s.status.replace('_', ' ')})</span>}
                          </p>
                          <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 15 }}>{s.reason}</p>
                        </RetroWindow>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p style={{ fontFamily: 'var(--font-retro-display)', fontSize: 9, color: 'var(--retro-grey-light)', marginBottom: 'calc(var(--retro-px) * 2)' }}>CARDS</p>
                  {disciplineModalData.cards.length === 0 ? (
                    <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 15 }}>No cards this competition.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--retro-px) * 2)' }}>
                      {disciplineModalData.cards.map((c, i) => (
                        <div key={i} className="flex items-start gap-2">
                          {c.card_type === 'yellow' ? <YellowCardIcon size={18} /> : <RedCardIcon size={18} />}
                          <div>
                            <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 15 }}>
                              {c.reason}
                              {c.status === 'rescinded' && <span style={{ color: 'var(--retro-green-light)', marginLeft: 6 }}>RESCINDED</span>}
                            </p>
                            <p style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 13, color: 'var(--retro-grey-light)' }}>{new Date(c.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </RetroModal>
        )}
      </>
    )
  }

  if (popArt) {
    return (
      <>
        <Shell active="LEADERBOARD" user={user} displayName={displayName} skin="pop-art">
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

            {liveGameweekNumbers.length > 0 && (
              <div className="pop-panel pop-panel--blue p-3 mb-4 flex items-center gap-2.5">
                <span className="inline-block rounded-full shrink-0" style={{ width: 8, height: 8, background: 'var(--pop-blue)' }} />
                <p className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.8)' }}>
                  <strong style={{ color: 'var(--pop-blue)' }}>GW{liveGameweekNumbers.join(', ')} live</strong> — points below update automatically as goals and assists are confirmed, and can go up or down if something gets corrected. Final once the gameweek's marked complete.
                </p>
              </div>
            )}

            <div className="pop-panel" style={{ overflow: 'hidden' }}>
              {/* Deliberately just rank, player and total — everything else
                  (team/player/banker split, best gameweek, etc.) lives on
                  the Full Table page now. This view is about one thing:
                  who's winning. */}
              <table className="w-full" style={{ fontSize: '14px', tableLayout: 'fixed' }}>
                <thead>
                  <tr className="text-left" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                    <th className="py-1.5 pl-2 pr-1 uppercase tracking-wider" style={{ width: '12%' }}>#</th>
                    <th className="py-1.5 px-1 uppercase tracking-wider" style={{ width: '58%' }}>Player</th>
                    <th className="py-1.5 pl-1 pr-2 text-right uppercase tracking-wider font-black" style={{ width: '30%' }}>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((player, index) => {
                    const streak = getStreak(player)
                    const teamsWithAvailability = getTeamsWithAvailability(player.user_id)
                    const isOwnRow = player.user_id === user?.id
                    const prevRank = previousRankByUser[player.user_id]
                    const rankDelta = prevRank != null ? prevRank - (index + 1) : null
                    return (
                      <React.Fragment key={player.user_id}>
                        <tr
                          onClick={() => setExpandedUser(expandedUser === player.user_id ? null : player.user_id)}
                          className="cursor-pointer hover:bg-white/[0.04] transition-colors"
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: isOwnRow ? 'rgba(160,0,250,0.06)' : undefined }}
                        >
                          <td className="py-1.5 pl-2 pr-1 font-black" style={{ color: 'rgba(255,255,255,0.4)' }}>
                            <div className="flex flex-col leading-none">
                              <span>{index + 1}</span>
                              {rankDelta != null && rankDelta !== 0 && (
                                <span className="font-mono" style={{ fontSize: '8px', color: rankDelta > 0 ? 'var(--pop-green)' : 'var(--pop-red)' }} title={`${rankDelta > 0 ? 'Up' : 'Down'} ${Math.abs(rankDelta)} since last gameweek`}>
                                  {rankDelta > 0 ? '▲' : '▼'}{Math.abs(rankDelta)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-1.5 px-1 font-black uppercase" style={{ maxWidth: 0 }}>
                            <div className="flex items-center gap-1.5">
                              {player.is_bot ? <BotAvatar size={30} /> : (
                                <span className="shrink-0">
                                  <KitBadge
                                    pattern={kitByUser[player.user_id]?.pattern ?? 'solid'}
                                    colour1={kitByUser[player.user_id]?.colour1 ?? '#1E4D6B'}
                                    colour2={kitByUser[player.user_id]?.colour2 ?? '#F5ECD9'}
                                    colour3={kitByUser[player.user_id]?.colour3}
                                    size={30}
                                  />
                                </span>
                              )}
                              <span className="inline-flex flex-col leading-tight min-w-0" style={{ flex: '0 1 auto' }}>
                                <span className="truncate inline-flex items-center gap-1">
                                  {player.display_name}
                                  {player.is_bot && <FutzyExplainerLink popArt />}
                                </span>
                                {((kitByUser[player.user_id]?.stars ?? 0) > 0 || (kitByUser[player.user_id]?.earths ?? 0) > 0) && (
                                  <span className="normal-case font-normal" style={{ fontSize: '9px', letterSpacing: '1px' }}>
                                    <span style={{ color: 'var(--pop-green)' }}>{'★'.repeat(kitByUser[player.user_id]?.stars ?? 0)}</span>
                                    {'🌍'.repeat(kitByUser[player.user_id]?.earths ?? 0)}
                                  </span>
                                )}
                              </span>
                              <span className="flex items-center gap-1 shrink-0">
                                {isOwnRow && <span className="pop-badge pop-badge--pink px-1.5 py-0.5 text-[8px]">You</span>}
                                {(bankersUsedByPlayer[player.user_id] ?? 0) > 0 && (
                                  <span className="pop-badge pop-badge--orange px-1.5 py-0.5 text-[8px]" title={`Bankers used: ${bankersUsedByPlayer[player.user_id]} of 2, ${Math.max(0, 2 - bankersUsedByPlayer[player.user_id])} left`}>
                                    B {bankersUsedByPlayer[player.user_id]}/2
                                  </span>
                                )}
                                {player.is_reigning_champ && <CrownIcon size={15} color="var(--pop-green)" />}
                                {player.is_vibes_champion && <span title="Vibes Champion"><ShadesIcon size={15} /></span>}
                                {player.in_cash_pool && <span title="In the cash pool"><PoundCoinIcon size={15} /></span>}
                                {player.is_sporting_panel && <span title="Sporting Panel member"><ScalesIcon size={15} /></span>}
                                {player.is_minigame_banned && <span title="Banned from minigame"><BlockedIcon size={15} /></span>}
                                {player.is_peace_prize && <span title="LMS Peace Prize"><DoveIcon size={15} /></span>}
                                {currentlySuspendedIds.has(player.user_id) && (
                                  <button
                                    onClick={e => { e.stopPropagation(); openDisciplineModal(player.user_id) }}
                                    className="pop-badge px-1.5 py-0.5 text-[8px] font-black uppercase"
                                    style={{ background: 'var(--pop-red)', color: '#fff' }}
                                    title="Suspended — click for details"
                                  >
                                    Suspended
                                  </button>
                                )}
                                {((cardCountByUser[player.user_id]?.yellow ?? 0) > 0 || (cardCountByUser[player.user_id]?.red ?? 0) > 0) && (
                                  <button
                                    onClick={e => { e.stopPropagation(); openDisciplineModal(player.user_id) }}
                                    className="inline-flex items-center gap-0.5"
                                    title="Discipline history — click for details"
                                  >
                                    {(cardCountByUser[player.user_id]?.yellow ?? 0) > 0 && (
                                      <span className="inline-flex items-center gap-0.5">
                                        <YellowCardIcon size={13} />
                                        <span className="font-mono" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)' }}>{cardCountByUser[player.user_id].yellow}</span>
                                      </span>
                                    )}
                                    {(cardCountByUser[player.user_id]?.red ?? 0) > 0 && (
                                      <span className="inline-flex items-center gap-0.5">
                                        <RedCardIcon size={13} />
                                        <span className="font-mono" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)' }}>{cardCountByUser[player.user_id].red}</span>
                                      </span>
                                    )}
                                  </button>
                                )}
                                {streak && <span title={`${streak} weeks above average`} className="inline-flex"><FlameIcon size={15} /></span>}
                                {topDogUserId === player.user_id && topDogReignWeeks > 0 && (
                                  <span title={`Top Dog — leading for ${topDogReignWeeks} week${topDogReignWeeks === 1 ? '' : 's'}`} className="inline-flex items-center gap-0.5">
                                    <TopDogIcon size={15} />
                                    <span className="font-mono" style={{ fontSize: '9px', color: 'var(--pop-orange)' }}>{topDogReignWeeks}</span>
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px' }}>{expandedUser === player.user_id ? '▲' : '▼'}</span>
                            </div>
                          </td>
                          <td className="py-1.5 pl-1 pr-2 text-right font-black font-mono" style={{ color: 'var(--pop-green)', fontVariantNumeric: 'tabular-nums', fontSize: '23px' }}>{player.total_points}</td>
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
                                    topScore={topScoreByUser[player.user_id] ?? 0}
                                  />
                                )}
                              </div>

                              {/* Bold status cards, not small stat text — Banker/AoN/Bonus
                                  Card are big parts of the game and should read that way.
                                  Best Gameweek moved to the Full Table page only. */}
                              <p className="sec-label">This Season</p>
                              <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-3">
                                <div className="rounded-lg p-1.5 sm:p-2.5 text-center" style={{ background: (bankersUsedByPlayer[player.user_id] ?? 0) > 0 ? 'rgba(250,97,0,0.18)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(250,97,0,0.4)' }}>
                                  <p className="text-[8px] sm:text-[9px] uppercase tracking-widest font-black mb-0.5" style={{ color: 'var(--pop-orange)' }}>★ Banker</p>
                                  <p className="text-[11px] sm:text-sm font-black" style={{ color: 'var(--pop-white)' }}>{Math.max(0, 2 - (bankersUsedByPlayer[player.user_id] ?? 0))} / 2 left</p>
                                </div>
                                <div className="rounded-lg p-1.5 sm:p-2.5 text-center" style={{ background: 'rgba(204,250,0,0.12)', border: '1px solid rgba(204,250,0,0.4)' }}>
                                  <p className="text-[8px] sm:text-[9px] uppercase tracking-widest font-black mb-0.5 inline-flex items-center justify-center gap-1" style={{ color: 'var(--pop-green)' }}><BoltIcon size={10} color="var(--pop-green)" /> All or Nothing</p>
                                  <p className="text-[11px] sm:text-sm font-black" style={{ color: 'var(--pop-white)' }}>{aonUsedByPlayer.has(player.user_id) ? 'Used' : 'Available'}</p>
                                </div>
                                {showBonusCard && (
                                  <div className="rounded-lg p-1.5 sm:p-2.5 text-center" style={{ background: 'rgba(0,242,250,0.1)', border: '1px solid rgba(0,242,250,0.4)' }}>
                                    <p className="text-[8px] sm:text-[9px] uppercase tracking-widest font-black mb-0.5" style={{ color: 'var(--pop-blue)' }}>{bonusCardName}</p>
                                    <p className="text-[11px] sm:text-sm font-black" style={{ color: 'var(--pop-white)' }}>
                                      {bonusCardPlayedByUser.has(player.user_id)
                                        ? `Used${bonusCardPlayByUser[player.user_id] ? ` — GW${allGameweeks.find(g => g.id === bonusCardPlayByUser[player.user_id].gameweek_id)?.number ?? '?'}` : ''}${bonusCardPlayByUser[player.user_id]?.points != null ? ` — ${bonusCardPlayByUser[player.user_id].points}pts` : ''}`
                                        : 'Available'}
                                    </p>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2 mb-3 flex-wrap">
                                <button onClick={() => setShowSeasonShareFor(player.user_id)} className="pop-button pop-button--blue px-3 py-1.5 text-xs">
                                  📱 Share {isOwnRow ? 'My' : `${player.display_name}'s`} Season
                                </button>
                                {isOwnRow && !rivalByUser[player.user_id] && (
                                  <button
                                    onClick={() => setRivalPickerFor(rivalPickerFor === player.user_id ? null : player.user_id)}
                                    className="pop-button px-3 py-1.5 text-xs"
                                    style={{ background: 'var(--pop-red)' }}
                                  >
                                    Pick a Rival
                                  </button>
                                )}
                              </div>

                              {/* Rivalry — a quiet, fully public line. You can set/change/
                                  remove yours from your own row; anyone's shows on theirs. */}
                              {(rivalByUser[player.user_id] || rivalPickerFor === player.user_id) && (
                                <div className="mb-4" style={{ fontSize: '11px' }}>
                                  {rivalByUser[player.user_id] && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                                        Rivalry — vs <strong style={{ color: 'var(--pop-white)' }}>{ranked.find(p => p.user_id === rivalByUser[player.user_id])?.display_name ?? 'Unknown'}</strong>:{' '}
                                        {(() => {
                                          const rivalPoints = ranked.find(p => p.user_id === rivalByUser[player.user_id])?.total_points ?? 0
                                          const diff = player.total_points - rivalPoints
                                          return <strong style={{ color: diff >= 0 ? 'var(--pop-green)' : 'var(--pop-red)' }}>{diff >= 0 ? `+${diff}` : diff}</strong>
                                        })()}
                                      </span>
                                      {isOwnRow && (
                                        <>
                                          <button onClick={removeRival} disabled={savingRival} className="font-mono text-[10px] underline" style={{ color: 'rgba(255,255,255,0.4)' }}>Remove</button>
                                          <button onClick={() => setRivalPickerFor(rivalPickerFor === player.user_id ? null : player.user_id)} className="font-mono text-[10px] underline" style={{ color: 'rgba(255,255,255,0.4)' }}>Change</button>
                                        </>
                                      )}
                                    </div>
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
                              )}

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
                                            {goalCountByKey[`${d.player1_id}_${gw.id}`] > 0 && <span className="ml-0.5 px-0.5 rounded font-black" style={{ background: 'var(--pop-green)', color: 'var(--pop-black)' }}>{eventLabel('G', goalCountByKey[`${d.player1_id}_${gw.id}`])}</span>}
                                            {assistCountByKey[`${d.player1_id}_${gw.id}`] > 0 && <span className="ml-0.5 px-0.5 rounded font-black" style={{ background: 'rgba(204,250,0,0.25)', color: 'var(--pop-green)' }}>{eventLabel('A', assistCountByKey[`${d.player1_id}_${gw.id}`])}</span>}
                                            {d.aon?.player_id === d.player1_id && (
                                              <span className="ml-0.5 px-1 rounded font-black inline-flex items-center gap-0.5" style={{ fontSize: '8px', ...(d.aon.outcome === 'success' ? { background: 'var(--pop-green)', color: 'var(--pop-black)' } : d.aon.outcome === 'failed' ? { background: 'var(--pop-red)', color: 'var(--pop-white)' } : { background: 'var(--pop-blue)', color: 'var(--pop-black)' }) }}>
                                                {d.aon.outcome === 'success' ? <CheckIcon size={8} color="var(--pop-black)" /> : d.aon.outcome === 'failed' ? <CrossIcon size={8} color="var(--pop-white)" /> : <BoltIcon size={8} color="var(--pop-black)" />} AoN
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-1 pr-1 text-right" style={{ color: 'rgba(255,255,255,0.68)' }}>{d.player1_points ?? '—'}</td>
                                          <td className="py-1 pr-1 uppercase">
                                            {d.player2}
                                            {goalCountByKey[`${d.player2_id}_${gw.id}`] > 0 && <span className="ml-0.5 px-0.5 rounded font-black" style={{ background: 'var(--pop-green)', color: 'var(--pop-black)' }}>{eventLabel('G', goalCountByKey[`${d.player2_id}_${gw.id}`])}</span>}
                                            {assistCountByKey[`${d.player2_id}_${gw.id}`] > 0 && <span className="ml-0.5 px-0.5 rounded font-black" style={{ background: 'rgba(204,250,0,0.25)', color: 'var(--pop-green)' }}>{eventLabel('A', assistCountByKey[`${d.player2_id}_${gw.id}`])}</span>}
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
                                    {/* Always visible, not just once played — Bonus Card points
                                        land in the same Tot column as every GW row above, so
                                        anyone adding that column by eye should see this row is
                                        part of the total, whether it's scored yet or still to
                                        come. */}
                                    {showBonusCard && (
                                      <tr style={{ color: 'rgba(255,255,255,0.5)' }}>
                                        <td className="py-1 pr-1 uppercase" colSpan={7}>
                                          {bonusCardName}
                                          {bonusCardPlayByUser[player.user_id] ? (
                                            <>
                                              {' — '}{bonusCardPlayByUser[player.user_id].playerName}
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
                <div className="flex items-center gap-2.5"><ScalesIcon size={20} /> Sporting Panel member</div>
                <div className="flex items-center gap-2.5"><BlockedIcon size={20} /> Banned from minigame</div>
                <div className="flex items-center gap-2.5"><DoveIcon size={18} /> LMS Peace Prize</div>
                <div className="flex items-center gap-2.5"><YellowCardIcon size={18} />/<RedCardIcon size={18} /> Yellow/red cards this competition — click one on a row for the reason</div>
                <div className="flex items-center gap-2.5"><span className="pop-badge px-1.5 py-0.5 text-[10px] font-black uppercase" style={{ background: 'var(--pop-red)', color: '#fff' }}>Suspended</span> Missing a gameweek for a card — click for details</div>
                <div className="flex items-center gap-2.5"><FlameIcon size={20} /> On a streak — 3+ weeks above average</div>
                <div className="flex items-center gap-2.5"><TopDogIcon size={20} /> Top Dog — current leader, number = weeks leading</div>
                <div className="flex items-center gap-2.5"><span className="font-mono font-black" style={{ color: 'var(--pop-green)' }}>▲2</span> Moved up 2 places since last gameweek (▼ = down)</div>
                <div className="flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded font-black text-xs" style={{ background: 'rgba(255,255,255,0.15)' }}>AP</span> Autopick — deadline missed, computer picked</div>
                <div className="flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded font-black text-xs" style={{ background: 'var(--pop-orange)', color: 'var(--pop-white)' }}>★</span> Banker declared that gameweek</div>
                <div className="flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded font-black text-xs inline-flex items-center gap-0.5" style={{ background: 'var(--pop-blue)', color: 'var(--pop-black)' }}><BoltIcon size={11} color="var(--pop-black)" /> AoN</span> All or Nothing played, result pending</div>
                <div className="flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded font-black text-xs inline-flex items-center gap-0.5" style={{ background: 'var(--pop-green)', color: 'var(--pop-black)' }}><CheckIcon size={11} color="var(--pop-black)" /> AoN</span> All or Nothing succeeded</div>
                <div className="flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded font-black text-xs inline-flex items-center gap-0.5" style={{ background: 'var(--pop-red)', color: 'var(--pop-white)' }}><CrossIcon size={11} color="var(--pop-white)" /> AoN</span> All or Nothing failed</div>
                <div className="flex items-center gap-2.5" style={{ color: 'rgba(255,255,255,0.5)' }}>▼ Tap a row to see their week-by-week picks</div>
              </div>
            </div>

            <div className="pop-panel p-4 mt-3">
              <p className="font-black uppercase tracking-wider text-xs mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>How Ties Are Split</p>
              <p className="mb-2" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
                When two or more players are level, these criteria are applied in order until the tie breaks.
              </p>
              <ol className="space-y-1" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)' }}>
                {RULES_TEXT.tiebreakers.map((criterion, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="font-black shrink-0" style={{ color: 'var(--pop-green)' }}>{i + 1}.</span>
                    <span>{criterion}</span>
                  </li>
                ))}
              </ol>
            </div>

          </div>
        </Shell>

        {showShare && (
          <LeaderboardShareCard
            competitionName={competition.name}
            standings={ranked.map((p, i) => ({
              name: p.display_name,
              points: p.total_points,
              is_bot: p.is_bot,
              kit: kitByUser[p.user_id] ? {
                pattern: kitByUser[p.user_id].pattern,
                colour1: kitByUser[p.user_id].colour1,
                colour2: kitByUser[p.user_id].colour2,
                colour3: kitByUser[p.user_id].colour3,
              } : null,
              is_reigning_champ: p.is_reigning_champ,
              is_vibes_champion: p.is_vibes_champion,
              is_top_dog: topDogUserId === p.user_id && topDogReignWeeks > 0,
              streak: streakByUser[p.user_id] ?? null,
              bankers_used: bankersUsedByPlayer[p.user_id] ?? 0,
              rank_delta: previousRankByUser[p.user_id] != null ? previousRankByUser[p.user_id] - (i + 1) : null,
            }))}
            onClose={() => setShowShare(false)}
            popArt
          />
        )}

        {showSeasonShareFor && (() => {
          const targetIndex = ranked.findIndex(p => p.user_id === showSeasonShareFor)
          if (targetIndex === -1) return null
          const target = ranked[targetIndex]
          const { bestPlayer, bestTeam } = getBestPlayerAndTeam(target.user_id)
          const wonAwards = awards
            .filter(a => awardWinnerNames(a).includes(target.display_name))
            .map(a => ({ emoji: a.emoji, title: a.title }))
          return (
            <PersonalSeasonShareCard
              competitionName={competition.name}
              displayName={target.display_name}
              position={targetIndex + 1}
              totalEntrants={ranked.length}
              points={target.total_points}
              isProvisional={competition.status === 'active'}
              wonAwards={wonAwards}
              bestPlayer={bestPlayer}
              bestTeam={bestTeam}
              onClose={() => setShowSeasonShareFor(null)}
            />
          )
        })()}

        {disciplineModalUserId && (
          <Modal onClose={() => setDisciplineModalUserId(null)} title={`Discipline — ${ranked.find(p => p.user_id === disciplineModalUserId)?.display_name ?? 'Unknown'}`} popArt>
            {!disciplineModalData ? (
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Loading...</p>
            ) : (
              <div className="space-y-4">
                {disciplineModalData.suspensions.length > 0 && (
                  <div>
                    <p className="font-black uppercase tracking-wider text-xs mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Suspensions</p>
                    <div className="space-y-2">
                      {disciplineModalData.suspensions.map((s, i) => (
                        <div key={i} className="pop-panel pop-panel--red p-3">
                          <p className="font-black text-sm">
                            Suspension #{s.suspension_number} — {s.gameweeks_count} gameweek{s.gameweeks_count === 1 ? '' : 's'}
                            {s.status !== 'active' && <span className="ml-2 font-normal" style={{ color: 'rgba(255,255,255,0.5)' }}>({s.status.replace('_', ' ')})</span>}
                          </p>
                          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>{s.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="font-black uppercase tracking-wider text-xs mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Cards</p>
                  {disciplineModalData.cards.length === 0 ? (
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No cards this competition.</p>
                  ) : (
                    <div className="space-y-2">
                      {disciplineModalData.cards.map((c, i) => (
                        <div key={i} className="flex items-start gap-2">
                          {c.card_type === 'yellow' ? <YellowCardIcon size={20} /> : <RedCardIcon size={20} />}
                          <div>
                            <p className="text-sm" style={{ color: '#fff' }}>
                              {c.reason}
                              {c.status === 'rescinded' && <span className="ml-2 font-black uppercase" style={{ fontSize: '10px', color: 'var(--pop-green)' }}>Rescinded</span>}
                            </p>
                            <p className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{new Date(c.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Modal>
        )}
      </>
    )
  }

  return null
}