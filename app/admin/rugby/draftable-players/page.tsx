import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/require-admin'
import { redirect } from 'next/navigation'
import DraftablePlayersTable, { type DraftableRow } from './_components/DraftablePlayersTable'

// One evolving draftable list, not a per-gameweek snapshot — Kit,
// 2026-09-26: "admin shouldn't start from scratch every week, be able to
// add and remove players." Every player ever pulled in (club/other-
// international, not just the 6 Six Nations squads) shows up here —
// /admin/rugby/players only ever showed players with a team_id, which
// silently hid the ~160 without one.
export default async function AdminRugbyDraftablePlayersPage() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')

  const { data: players } = await supabase.schema('rugby').from('players')
    .select('id, name, team_id, nationality, position, is_draftable, value').order('name')
  const { data: teams } = await supabase.schema('rugby').from('teams').select('id, name')
  const teamNameById = new Map((teams ?? []).map(t => [t.id, t.name]))

  const rows: DraftableRow[] = (players ?? []).map(p => ({
    id: p.id,
    name: p.name,
    country: p.team_id != null ? (teamNameById.get(p.team_id) ?? '?') : (p.nationality ?? '?'),
    position: p.position,
    value: p.value,
    isDraftable: p.is_draftable === true,
  }))

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">🏉 Rugby — Draftable Players</h1>
      <p className="text-sm text-gray-600 mb-6">
        Who can actually be picked in the live Dream Team draft on <a href="/rugby/picks" className="underline">/rugby/picks</a>.
        This is one evolving list — toggling a player on or off here takes effect immediately and stays that way until
        changed again, no weekly reset. Removing someone never affects a squad they&apos;re already in, only whether
        they can be newly picked or subbed in going forward.
      </p>
      <DraftablePlayersTable initialRows={rows} />
    </div>
  )
}
