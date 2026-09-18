// "Top Dog" — the current leaderboard leader and how many completed
// gameweeks running they've held it. Recomputed fresh from scratch on
// every load, never stored. Rules: the belt only changes hands on a sole,
// outright overtake; a tie at the very top leaves it with whoever already
// holds it (including the very first scored gameweek, where a tie means
// nobody is crowned yet). Bots are excluded entirely — see Results' Season
// Leader panel for the same "can lead, can't be crowned" precedent.
//
// A real bug found from a live report ("KH has the badge but is ranked
// second?!"): a raw total_points tie was being treated as a genuine tie,
// even though the real Leaderboard table (and Results' Season Leader) both
// break that exact tie using points-without-Banker-doubling — so the belt
// could sit frozen on someone the visible table had already ranked below
// whoever they were "tied" with. weeklyPointsWithoutBankerByUser applies
// that same first tiebreaker here too, so the badge and the table can never
// disagree on who's actually first. Defaults to {} so a caller that hasn't
// been updated yet degrades to the old (occasionally-wrong-on-a-tie)
// behaviour rather than crashing.
export function computeTopDog(
  scoredGwNumbers: number[],
  weeklyPointsByUser: Record<string, number[]>,
  isBotByUser: Record<string, boolean>,
  bonusCardPlays: { user_id: string; gameweek_id: string; points: number | null }[] | null | undefined,
  gwNumberById: Record<string, number>,
  weeklyPointsWithoutBankerByUser: Record<string, number[]> = {}
): { leaderUserId: string | null; reignWeeks: number } {
  const cumulative: Record<string, number> = {}
  const cumulativeWithoutBanker: Record<string, number> = {}
  let currentLeader: string | null = null
  let leaderStreak = 0

  scoredGwNumbers.forEach(gwNum => {
    Object.entries(weeklyPointsByUser).forEach(([userId, weekly]) => {
      if (isBotByUser[userId]) return
      cumulative[userId] = (cumulative[userId] ?? 0) + (weekly[gwNum] ?? 0)
    })
    Object.entries(weeklyPointsWithoutBankerByUser).forEach(([userId, weekly]) => {
      if (isBotByUser[userId]) return
      cumulativeWithoutBanker[userId] = (cumulativeWithoutBanker[userId] ?? 0) + (weekly[gwNum] ?? 0)
    })
    bonusCardPlays?.forEach(play => {
      if (play.points == null || isBotByUser[play.user_id]) return
      if (gwNumberById[play.gameweek_id] !== gwNum) return
      cumulative[play.user_id] = (cumulative[play.user_id] ?? 0) + play.points
      cumulativeWithoutBanker[play.user_id] = (cumulativeWithoutBanker[play.user_id] ?? 0) + play.points
    })

    const ids = Object.keys(cumulative)
    if (ids.length === 0) return
    const best = Math.max(...ids.map(id => cumulative[id]))
    const tiedAtTop = ids.filter(id => cumulative[id] === best)
    let soleLeader = tiedAtTop
    if (tiedAtTop.length > 1) {
      const bestWithoutBanker = Math.max(...tiedAtTop.map(id => cumulativeWithoutBanker[id] ?? 0))
      soleLeader = tiedAtTop.filter(id => (cumulativeWithoutBanker[id] ?? 0) === bestWithoutBanker)
    }
    const weekLeader = soleLeader.length === 1 ? soleLeader[0] : currentLeader

    if (weekLeader === currentLeader && weekLeader !== null) {
      leaderStreak += 1
    } else {
      currentLeader = weekLeader
      leaderStreak = weekLeader ? 1 : 0
    }
  })

  return { leaderUserId: currentLeader, reignWeeks: leaderStreak }
}
