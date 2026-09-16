export type BonusCardNominee = { playerId: number; displayName: string | null }

// The pool of players currently eligible for the Bonus Card. If the
// `bonus_card_nominees` table has any active rows for this competition,
// that pool wins outright. Otherwise this falls back to the original
// single-nominee design (competitions.bonus_card_player_id/bonus_card_name)
// so any competition using that — including every one created before this
// feature shipped — keeps working exactly as it always has, without ever
// touching the new table.
export async function getBonusCardNominees(supabase: any, competitionId: string): Promise<BonusCardNominee[]> {
  const { data: nominees } = await supabase
    .from('bonus_card_nominees')
    .select('player_id, display_name')
    .eq('competition_id', competitionId)
    .eq('active', true)

  if (nominees && nominees.length > 0) {
    return nominees.map((n: any) => ({ playerId: n.player_id, displayName: n.display_name }))
  }

  const { data: comp } = await supabase
    .from('competitions')
    .select('bonus_card_player_id, bonus_card_name')
    .eq('id', competitionId)
    .maybeSingle()

  if (comp?.bonus_card_player_id) {
    return [{ playerId: comp.bonus_card_player_id, displayName: comp.bonus_card_name ?? null }]
  }

  return []
}
