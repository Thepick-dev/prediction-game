// A ghost player (mid-season joiner, backfilled with an average starting
// total — see /admin/users) starts with a genuinely clean slate of real
// `picks` rows, since they never actually picked for the gameweeks they
// missed. Left alone, that means they can freely pick teams/players
// everyone else has long since used up, which isn't fair on players who
// were here from week one. These two tables (handed off as SQL, see
// CLAUDE.md's own note on schema changes) record a RANDOM set of
// teams/players — generated once, when an admin marks someone as a
// ghost (see markAsGhost in app/admin/users/page.tsx) — that count as
// already used for them, roughly proportional to how many gameweeks
// they missed. Read here and merged into the real usage counts so the
// exact same cap-checking logic in app/api/picks/route.ts (GET for the
// "used" UI, POST for validation) just works without needing to special-
// case ghosts at every call site.
export async function getGhostPreusedCounts(supabase: any, competitionId: string, userId: string): Promise<{
  teamCounts: Record<number, number>
  playerCounts: Record<number, number>
}> {
  try {
    const [{ data: teams }, { data: players }] = await Promise.all([
      supabase.from('ghost_preused_teams').select('team_id').eq('competition_id', competitionId).eq('user_id', userId),
      supabase.from('ghost_preused_players').select('player_id, uses').eq('competition_id', competitionId).eq('user_id', userId),
    ])
    const teamCounts: Record<number, number> = {}
    ;(teams ?? []).forEach((t: { team_id: number }) => { teamCounts[t.team_id] = (teamCounts[t.team_id] ?? 0) + 1 })
    const playerCounts: Record<number, number> = {}
    ;(players ?? []).forEach((p: { player_id: number; uses: number }) => { playerCounts[p.player_id] = (playerCounts[p.player_id] ?? 0) + (p.uses ?? 1) })
    return { teamCounts, playerCounts }
  } catch {
    // Migration not run yet, or a network hiccup — no pre-used
    // restriction is a safe default (today's exact behaviour).
    return { teamCounts: {}, playerCounts: {} }
  }
}
