// "Top Dog" — the current leaderboard leader and how many completed
// gameweeks running they've held it. Recomputed fresh from scratch on
// every load, never stored. Rules: the belt only changes hands on a sole,
// outright overtake; a tie at the very top leaves it with whoever already
// holds it (including the very first scored gameweek, where a tie means
// nobody is crowned yet). Bots are excluded entirely — see Results' Season
// Leader panel for the same "can lead, can't be crowned" precedent.
export function computeTopDog(
  scoredGwNumbers: number[],
  weeklyPointsByUser: Record<string, number[]>,
  isBotByUser: Record<string, boolean>,
  bonusCardPlays: { user_id: string; gameweek_id: string; points: number | null }[] | null | undefined,
  gwNumberById: Record<string, number>
): { leaderUserId: string | null; reignWeeks: number } {
  const cumulative: Record<string, number> = {}
  let currentLeader: string | null = null
  let leaderStreak = 0

  scoredGwNumbers.forEach(gwNum => {
    Object.entries(weeklyPointsByUser).forEach(([userId, weekly]) => {
      if (isBotByUser[userId]) return
      cumulative[userId] = (cumulative[userId] ?? 0) + (weekly[gwNum] ?? 0)
    })
    bonusCardPlays?.forEach(play => {
      if (play.points == null || isBotByUser[play.user_id]) return
      if (gwNumberById[play.gameweek_id] !== gwNum) return
      cumulative[play.user_id] = (cumulative[play.user_id] ?? 0) + play.points
    })

    const ids = Object.keys(cumulative)
    if (ids.length === 0) return
    const best = Math.max(...ids.map(id => cumulative[id]))
    const soleLeader = ids.filter(id => cumulative[id] === best)
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
