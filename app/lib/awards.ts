export type AwardCandidate = { name: string; value: number; extra?: string }

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
