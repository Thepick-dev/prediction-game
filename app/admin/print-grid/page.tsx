import { createServerSupabaseClient } from '../../lib/supabase-server'
import { buildPlayerDisplayNames, bonusCardDisplayName } from '../../lib/players'
import PrintGridView, { type GridCell, type PlayerRow, type GwColumn } from './PrintGridView'

export default async function PrintGridPage() {
  const supabase = await createServerSupabaseClient()

  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, bonus_card_name, bonus_card_player_id')
    .eq('status', 'active')
    .single()

  if (!competition) {
    return <p className="text-gray-500">No active competition.</p>
  }

  const [{ data: gameweeks }, { data: entries }, { data: profiles }, { data: picks }, { data: teams }, { data: players }, { data: points }, { data: aonRows }, { data: bonusCardRows }] = await Promise.all([
    supabase.from('gameweeks').select('id, number, deadline').eq('competition_id', competition.id).order('number'),
    supabase.from('competition_entries').select('user_id').eq('competition_id', competition.id).eq('removed', false),
    supabase.from('profiles').select('id, display_name'),
    supabase.from('picks').select('user_id, gameweek_id, team_id, player1_id, player2_id, is_banker').eq('competition_id', competition.id),
    supabase.from('teams').select('id, name, short_name, short_code'),
    supabase.from('players').select('id, name, web_name, team_id'),
    supabase.from('points').select('user_id, gameweek_id, team_points, player1_points, player2_points, total_points').eq('competition_id', competition.id),
    supabase.from('all_or_nothing_picks').select('user_id, gameweek_id, player_id, outcome').eq('competition_id', competition.id),
    supabase.from('bonus_card_plays').select('user_id, gameweek_id, player_id, points').eq('competition_id', competition.id),
  ])

  // The hard privacy rule ("no player's pick visible to anyone before that
  // gameweek's deadline") applies to admin too, per explicit instruction —
  // so any gameweek whose deadline hasn't passed yet is filtered out here,
  // server-side, before any of its pick/points/AoN/bonus-card data is ever
  // handed to the client component. Not a display-layer hide.
  const now = new Date()
  const revealedGwIds = new Set((gameweeks ?? []).filter(gw => new Date(gw.deadline) <= now).map(gw => gw.id))

  const profileMap: Record<string, string> = {}
  profiles?.forEach(p => { profileMap[p.id] = p.display_name ?? 'Unknown' })

  const teamMap: Record<number, { name: string; short_name: string | null; short_code: string | null }> = {}
  teams?.forEach(t => { teamMap[t.id] = t })

  const displayNames = buildPlayerDisplayNames(players ?? [], teamMap)

  const teamLabel = (id: number) => {
    const t = teamMap[id]
    return t ? (t.short_code ?? t.short_name ?? t.name) : '—'
  }

  const bonusCardName = bonusCardDisplayName(
    competition.bonus_card_name,
    players?.find(p => p.id === competition.bonus_card_player_id)?.name ?? null
  )

  const pointsByKey: Record<string, { team_points: number; player1_points: number; player2_points: number; total_points: number }> = {}
  points?.forEach(p => {
    if (!revealedGwIds.has(p.gameweek_id)) return
    pointsByKey[`${p.user_id}_${p.gameweek_id}`] = p
  })

  const aonByKey: Record<string, { player_id: number; outcome: string }> = {}
  aonRows?.forEach(a => {
    if (!revealedGwIds.has(a.gameweek_id)) return
    aonByKey[`${a.user_id}_${a.gameweek_id}`] = a
  })

  const bonusCardByKey: Record<string, { player_id: number; points: number | null }> = {}
  bonusCardRows?.forEach(b => {
    if (!revealedGwIds.has(b.gameweek_id)) return
    bonusCardByKey[`${b.user_id}_${b.gameweek_id}`] = b
  })

  const pickByKey: Record<string, { team_id: number; player1_id: number; player2_id: number; is_banker: boolean }> = {}
  picks?.forEach(p => {
    if (!revealedGwIds.has(p.gameweek_id)) return
    pickByKey[`${p.user_id}_${p.gameweek_id}`] = p
  })

  const gwColumns: GwColumn[] = (gameweeks ?? []).map(gw => ({ id: gw.id, number: gw.number, revealed: revealedGwIds.has(gw.id) }))

  const playerRows: PlayerRow[] = (entries ?? [])
    .map(e => ({ id: e.user_id, name: profileMap[e.user_id] ?? 'Unknown' }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(player => {
      const cells: Record<string, GridCell> = {}
      gwColumns.forEach(gw => {
        if (!gw.revealed) return
        const key = `${player.id}_${gw.id}`
        const pick = pickByKey[key]
        if (!pick) return
        const pts = pointsByKey[key]
        const aon = aonByKey[key]
        const bonusCard = bonusCardByKey[key]
        const bonusCardPoints = bonusCard?.points ?? null
        cells[gw.id] = {
          team: teamLabel(pick.team_id),
          isBanker: pick.is_banker,
          player1Name: displayNames[pick.player1_id] ?? '?',
          player2Name: displayNames[pick.player2_id] ?? '?',
          teamPoints: pts?.team_points ?? null,
          player1Points: pts?.player1_points ?? null,
          player2Points: pts?.player2_points ?? null,
          aon: aon
            ? { onPlayer1: aon.player_id === pick.player1_id, outcome: aon.outcome as 'pending' | 'success' | 'failed' }
            : null,
          bonusCard: bonusCard ? { playerName: displayNames[bonusCard.player_id] ?? '?', points: bonusCardPoints } : null,
          gwTotal: pts ? pts.total_points + (bonusCardPoints ?? 0) : null,
        }
      })
      return { id: player.id, name: player.name, cells }
    })

  return (
    <PrintGridView
      competitionName={competition.name}
      bonusCardName={bonusCardName}
      gwColumns={gwColumns}
      playerRows={playerRows}
    />
  )
}
