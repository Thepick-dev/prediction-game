export type InviteCodeRow = {
  active: boolean
  max_uses: number | null
  uses_count: number
}

// Pulled out as a plain function so the actual decision has real unit
// coverage, same reasoning as resolveSkin in useSkin.ts — the three
// callers (signup validation, the admin list, any future re-check) all
// need to agree on exactly this, not a slightly different inline check
// each time.
export function isInviteCodeUsable(row: InviteCodeRow): boolean {
  if (!row.active) return false
  if (row.max_uses == null) return true
  return row.uses_count < row.max_uses
}
