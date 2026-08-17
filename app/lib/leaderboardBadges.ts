// Shared by every page that shows the Streak badge — the compact and full
// leaderboards, and the Wall (poster badges). Behavior-preserving
// extraction of what used to be inline in app/leaderboard/page.tsx and
// duplicated again in app/leaderboard/full/page.tsx; a third copy for the
// Wall would have been one duplication too many.

// The average total_points across everyone who has a `points` row for
// that gameweek — a gameweek with no scored picks yet simply doesn't
// appear in the result.
export function computeAvgByGw(
  pointsData: { gameweek_id: string; total_points: number | null }[] | null | undefined,
  gwNumberById: Record<string, number>
): Record<number, number> {
  const gwPointsMap: Record<string, number[]> = {}
  pointsData?.forEach(p => {
    if (!gwPointsMap[p.gameweek_id]) gwPointsMap[p.gameweek_id] = []
    gwPointsMap[p.gameweek_id].push(p.total_points ?? 0)
  })
  const avgMap: Record<number, number> = {}
  Object.entries(gwPointsMap).forEach(([gwId, vals]) => {
    const gwNum = gwNumberById[gwId]
    if (gwNum && vals.length > 0) avgMap[gwNum] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  })
  return avgMap
}

// A run of consecutive, most-recent scored gameweeks where a player beat
// that week's average — needs 3+ to count as a streak at all. Walks
// backwards from the latest scored gameweek and stops at the first miss,
// same rule as the leaderboard has always used.
export function computeStreaks(
  weeklyPointsByUser: Record<string, number[]>,
  avgByGw: Record<number, number>
): Record<string, number> {
  const streaks: Record<string, number> = {}
  const weeks = Object.keys(avgByGw).map(Number).sort((a, b) => b - a)
  if (weeks.length < 2) return streaks

  Object.entries(weeklyPointsByUser).forEach(([userId, weekly]) => {
    let streak = 0
    for (const gw of weeks) {
      const playerPts = weekly[gw]
      const avg = avgByGw[gw]
      if (playerPts === undefined || avg === undefined) break
      if (playerPts > avg) streak++
      else break
    }
    if (streak >= 3) streaks[userId] = streak
  })

  return streaks
}
