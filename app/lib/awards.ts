export type AwardCandidate = { name: string; value: number; extra?: string }

type Totals = {
  user_id: string
  display_name: string
  is_bot: boolean
  total_points: number
  banker_points: number
  home_wins: number
  away_wins: number
  goals: number
  assists: number
  weekly_points: number[]
}

export type CompetitionAward = ResolvedAward & { key: string; emoji: string; title: string; explainer: string }

export type CompetitionAwardsInput = {
  entries: { user_id: string }[] | null | undefined
  profiles: { id: string; display_name: string | null }[] | null | undefined
  pointsData: { user_id: string; pick_id: string; total_points: number | null; player1_points?: number | null; player2_points?: number | null; breakdown: any; gameweek_id: string }[] | null | undefined
  picks: { id: string; user_id: string; player1_id: number; player2_id: number }[] | null | undefined
  gameweeks: { id: string; number: number }[] | null | undefined
  fixtures: { id: number; gameweek_id: string }[] | null | undefined
  events: { player_id: number | null; event_type: string; fixture_id: number | null }[] | null | undefined
  isBotMap: Record<string, boolean>
  playerDisplayNames: Record<number, string>
}

// The full per-competition award set — shared by the Awards page and the
// Personal Season Summary ticket, so a category added/changed here shows
// up correctly in both places instead of the two silently drifting apart.
// Behavior-preserving extraction of what used to be inline in
// app/awards/page.tsx.
export function computeCompetitionAwards(input: CompetitionAwardsInput): {
  awards: CompetitionAward[]
  talisman: CompetitionAward
  hasEntrants: boolean
} {
  const { entries, profiles, pointsData, picks, gameweeks, fixtures, events, isBotMap, playerDisplayNames } = input

  const profileMap: Record<string, string> = {}
  profiles?.forEach(p => { profileMap[p.id] = p.display_name ?? 'Unknown' })

  const gwMap: Record<string, number> = {}
  gameweeks?.forEach(g => { gwMap[g.id] = g.number })

  const fixtureGwMap: Record<number, string> = {}
  fixtures?.forEach(f => { fixtureGwMap[f.id] = f.gameweek_id })

  const goalsByPlayerGw: Record<string, number> = {}
  const assistsByPlayerGw: Record<string, number> = {}
  events?.forEach(e => {
    if (!e.player_id || !e.fixture_id) return
    const gwId = fixtureGwMap[e.fixture_id]
    if (!gwId) return
    const key = `${e.player_id}_${gwId}`
    if (e.event_type === 'goal') goalsByPlayerGw[key] = (goalsByPlayerGw[key] || 0) + 1
    if (e.event_type === 'assist') assistsByPlayerGw[key] = (assistsByPlayerGw[key] || 0) + 1
  })

  const pickById: Record<string, { user_id: string; player1_id: number; player2_id: number }> = {}
  picks?.forEach(p => { pickById[p.id] = p })

  const totals: Record<string, Totals> = {}
  entries?.forEach(e => {
    totals[e.user_id] = {
      user_id: e.user_id,
      display_name: profileMap[e.user_id] ?? 'Unknown',
      is_bot: isBotMap[e.user_id] ?? false,
      total_points: 0,
      banker_points: 0,
      home_wins: 0,
      away_wins: 0,
      goals: 0,
      assists: 0,
      weekly_points: [],
    }
  })

  // Talisman looks at every pick made, bots included — it's a stat about
  // the footballer, not a trophy competed for by entrants, so leaving
  // Futzy's picks out would just make the total less accurate, not fairer.
  // Talisman ranks on the RAW (non-banker-doubled) contribution — a true
  // measure of the player, not of who happened to banker them that week.
  // breakdown.player1_raw/player2_raw hold that pre-doubling value already
  // (see scoring.ts); playerPointsWithBankerMap keeps the old doubled total
  // alongside purely for display, in brackets.
  const playerPointsMap: Record<number, number> = {}
  const playerPointsWithBankerMap: Record<number, number> = {}

  pointsData?.forEach(p => {
    const breakdown = p.breakdown as any
    const isBanker = breakdown?.is_banker === true
    const rawTotal = isBanker ? (p.total_points ?? 0) / 2 : (p.total_points ?? 0)
    const pick = pickById[p.pick_id]

    if (pick) {
      const p1Raw = breakdown?.player1_raw ?? p.player1_points ?? 0
      const p2Raw = breakdown?.player2_raw ?? p.player2_points ?? 0
      if (pick.player1_id != null) {
        playerPointsMap[pick.player1_id] = (playerPointsMap[pick.player1_id] ?? 0) + p1Raw
        playerPointsWithBankerMap[pick.player1_id] = (playerPointsWithBankerMap[pick.player1_id] ?? 0) + (p.player1_points ?? 0)
      }
      if (pick.player2_id != null) {
        playerPointsMap[pick.player2_id] = (playerPointsMap[pick.player2_id] ?? 0) + p2Raw
        playerPointsWithBankerMap[pick.player2_id] = (playerPointsWithBankerMap[pick.player2_id] ?? 0) + (p.player2_points ?? 0)
      }
    }

    const t = totals[p.user_id]
    if (!t) return

    t.total_points += p.total_points ?? 0
    if (isBanker) t.banker_points += rawTotal
    if (breakdown?.team?.includes('home_win')) t.home_wins += 1
    if (breakdown?.team?.includes('away_win')) t.away_wins += 1

    const gwNum = gwMap[p.gameweek_id]
    if (gwNum) t.weekly_points[gwNum] = p.total_points ?? 0

    if (pick) {
      t.goals += (goalsByPlayerGw[`${pick.player1_id}_${p.gameweek_id}`] || 0) + (goalsByPlayerGw[`${pick.player2_id}_${p.gameweek_id}`] || 0)
      t.assists += (assistsByPlayerGw[`${pick.player1_id}_${p.gameweek_id}`] || 0) + (assistsByPlayerGw[`${pick.player2_id}_${p.gameweek_id}`] || 0)
    }
  })

  const humans = Object.values(totals).filter(t => !t.is_bot)
  if (humans.length === 0) {
    return {
      awards: [],
      talisman: { key: 'talisman', emoji: '🌟', title: 'Talisman', explainer: "The footballer who's brought in the most combined points for everyone who picked him, across the whole competition.", winnerDisplay: 'Not decided yet', detail: '', tiedEntries: null },
      hasEntrants: false,
    }
  }

  function longestStreak(t: Totals, avgByGw: Record<number, number>): number {
    const weeks = Object.keys(avgByGw).map(Number).sort((a, b) => b - a)
    let streak = 0
    for (const gw of weeks) {
      const pts = t.weekly_points[gw]
      const avg = avgByGw[gw]
      if (pts === undefined || avg === undefined) break
      if (pts > avg) streak++
      else break
    }
    return streak
  }

  const gwPointsMap: Record<number, number[]> = {}
  pointsData?.forEach(p => {
    const gwNum = gwMap[p.gameweek_id]
    if (!gwNum) return
    ;(gwPointsMap[gwNum] ??= []).push(p.total_points ?? 0)
  })
  const avgByGw: Record<number, number> = {}
  Object.entries(gwPointsMap).forEach(([gw, vals]) => { avgByGw[Number(gw)] = vals.reduce((a, b) => a + b, 0) / vals.length })

  const hasScoredData = (pointsData?.length ?? 0) > 0

  const champion = resolveWinners(
    hasScoredData ? humans.map(t => ({ name: t.display_name, value: t.total_points })) : [],
    c => `${c.value} pts`
  )

  const goldenBoot = resolveWinners(
    humans.map(t => ({ name: t.display_name, value: t.goals })),
    c => `${c.value} goals`,
    { minQualifying: 1 }
  )

  const goldenAssist = resolveWinners(
    humans.map(t => ({ name: t.display_name, value: t.assists })),
    c => `${c.value} assists`,
    { minQualifying: 1 }
  )

  const ironNerve = resolveWinners(
    humans.map(t => ({ name: t.display_name, value: t.banker_points })),
    c => `${c.value} pts from bankers`,
    { minQualifying: 1 }
  )

  const streakMaster = resolveWinners(
    humans.map(t => ({ name: t.display_name, value: longestStreak(t, avgByGw) })),
    c => `${c.value} weeks above average`,
    { minQualifying: 3 }
  )

  const homeBird = resolveWinners(
    humans.map(t => ({ name: t.display_name, value: t.home_wins })),
    c => `${c.value} home wins picked`,
    { minQualifying: 1 }
  )

  const awayDay = resolveWinners(
    humans.map(t => ({ name: t.display_name, value: t.away_wins })),
    c => `${c.value} away wins picked`,
    { minQualifying: 1 }
  )

  const woodenSpoon = resolveWinners(
    (hasScoredData && humans.length > 1) ? humans.map(t => ({ name: t.display_name, value: t.total_points })) : [],
    c => `${c.value} pts`,
    { direction: 'min' }
  )

  const weeklyCandidates: { name: string; value: number; extra: string }[] = []
  humans.forEach(t => {
    t.weekly_points.forEach((pts, gw) => {
      if (pts !== undefined && gw > 0) weeklyCandidates.push({ name: t.display_name, value: pts, extra: String(gw) })
    })
  })
  const momentOfMagic = resolveWinners(
    weeklyCandidates,
    c => `${c.value} pts (GW${c.extra})`,
    { minQualifying: 1 }
  )

  // Needs enough scored gameweeks to split into two meaningful halves —
  // below that, showing a delta from a single week either side is just
  // noise, not a real trend.
  const scoredGwNumbers = Object.keys(avgByGw).map(Number).sort((a, b) => a - b)
  let secondHalfSurge: ResolvedAward = { winnerDisplay: 'Not decided yet', detail: '', tiedEntries: null }
  if (scoredGwNumbers.length >= 4) {
    const mid = Math.floor(scoredGwNumbers.length / 2)
    const firstHalf = scoredGwNumbers.slice(0, mid)
    const secondHalf = scoredGwNumbers.slice(mid)
    const avgOf = (t: Totals, gws: number[]) => gws.reduce((sum, gw) => sum + (t.weekly_points[gw] ?? 0), 0) / gws.length
    secondHalfSurge = resolveWinners(
      humans.map(t => ({ name: t.display_name, value: Math.round((avgOf(t, secondHalf) - avgOf(t, firstHalf)) * 10) / 10 })),
      c => `+${c.value.toFixed(1)} pts/week`,
      { minQualifying: 0.1 }
    )
  }

  const awards: CompetitionAward[] = [
    { key: 'champion', emoji: '🏆', title: 'Champion', explainer: 'Most total points across the whole competition.', ...champion },
    { key: 'goldenBoot', emoji: '⚽', title: 'Golden Boot', explainer: 'Most goals scored by your picked players all season.', ...goldenBoot },
    { key: 'goldenAssist', emoji: '🎯', title: 'Golden Assist', explainer: 'Most assists from your picked players all season.', ...goldenAssist },
    { key: 'ironNerve', emoji: '🛡️', title: 'Iron Nerve', explainer: 'Most points earned specifically from Banker doubles.', ...ironNerve },
    { key: 'streakMaster', emoji: '🔥', title: 'Streak Master', explainer: 'Longest run of scoring above the weekly average — needs 3+ weeks to qualify.', ...streakMaster },
    { key: 'homeBird', emoji: '🏠', title: 'Home Bird', explainer: 'Most home wins picked all season.', ...homeBird },
    { key: 'awayDay', emoji: '✈️', title: 'Away Day Special', explainer: 'Most away wins picked all season.', ...awayDay },
    { key: 'woodenSpoon', emoji: '🥄', title: 'Wooden Spoon', explainer: 'Lowest total points — nowhere to hide.', ...woodenSpoon },
    { key: 'momentOfMagic', emoji: '✨', title: 'Moment of Magic', explainer: 'The single best gameweek score anyone posted all season.', ...momentOfMagic },
    { key: 'secondHalfSurge', emoji: '📈', title: 'Second Half Surge', explainer: 'Biggest rise in average points, second half of the season vs the first — needs at least 4 scored gameweeks.', ...secondHalfSurge },
  ]

  const talismanCandidates = Object.entries(playerPointsMap).map(([playerId, value]) => ({
    name: playerDisplayNames[Number(playerId)] ?? 'Unknown',
    value,
    extra: String(playerPointsWithBankerMap[Number(playerId)] ?? value),
  }))
  const talisman: CompetitionAward = {
    key: 'talisman',
    emoji: '🌟',
    title: 'Talisman',
    explainer: "The footballer who's brought in the most combined points for everyone who picked him, across the whole competition — Banker doubles excluded, so it measures the player rather than the pick.",
    ...resolveWinners(
      talismanCandidates,
      c => c.extra !== String(c.value) ? `${c.value} pts combined (with Banker: ${c.extra})` : `${c.value} pts combined`,
      { minQualifying: 1 }
    ),
  }

  return { awards, talisman, hasEntrants: true }
}

export type ResolvedAward = {
  winnerDisplay: string
  detail: string
  tiedEntries: { name: string; detail: string }[] | null
}

// Shared by every award on the Awards page — one player shows their name
// directly, two show "A & B", three or more collapse to "Multiple players
// (N)" with the full list handed back separately for a click-to-expand
// popup (tiedEntries), so the grid never grows a wall of names inline.
// `minQualifying` is how a "max" award stays hidden until someone's
// actually earned it (e.g. Golden Boot needs at least 1 goal, not everyone
// tied at 0) — it only applies in the "max" direction since a "min" award
// (Wooden Spoon) has no equivalent floor to clear.
export function resolveWinners(
  candidates: AwardCandidate[],
  formatDetail: (c: AwardCandidate) => string,
  opts: { direction?: 'max' | 'min'; minQualifying?: number } = {}
): ResolvedAward {
  const { direction = 'max', minQualifying = -Infinity } = opts

  if (candidates.length === 0) {
    return { winnerDisplay: 'Not decided yet', detail: '', tiedEntries: null }
  }

  const best = direction === 'max'
    ? Math.max(...candidates.map(c => c.value))
    : Math.min(...candidates.map(c => c.value))

  if (direction === 'max' && best < minQualifying) {
    return { winnerDisplay: 'Not decided yet', detail: '', tiedEntries: null }
  }

  const tied = candidates.filter(c => c.value === best)

  if (tied.length === 1) {
    return { winnerDisplay: tied[0].name, detail: formatDetail(tied[0]), tiedEntries: null }
  }
  if (tied.length === 2) {
    return { winnerDisplay: `${tied[0].name} & ${tied[1].name}`, detail: formatDetail(tied[0]), tiedEntries: null }
  }
  return {
    winnerDisplay: `Multiple players (${tied.length})`,
    detail: formatDetail(tied[0]),
    tiedEntries: tied.map(c => ({ name: c.name, detail: formatDetail(c) })),
  }
}

// Recovers the actual set of winner names from a ResolvedAward, whichever
// of the three shapes resolveWinners produced (a single name, an "A & B"
// string, or a collapsed "Multiple players (N)" with tiedEntries) — so a
// caller can just ask "did this person win this award" without caring
// which shape it came back as.
export function awardWinnerNames(award: ResolvedAward): string[] {
  if (award.tiedEntries) return award.tiedEntries.map(e => e.name)
  if (award.winnerDisplay === 'Not decided yet') return []
  if (award.winnerDisplay.includes(' & ')) return award.winnerDisplay.split(' & ')
  return [award.winnerDisplay]
}
