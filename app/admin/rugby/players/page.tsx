import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { recomputeAllRugbyPlayerValues } from '../../../lib/rugbyPlayerDatabase'
import { redirect } from 'next/navigation'

async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

type Team = { id: number; name: string }
type RugbyPlayer = { id: number; team_id: number; name: string; position: string | null; value: number | null; value_is_estimated: boolean; value_is_admin_set: boolean }

// The exact 9 strings app/lib/rugbyRating.ts's WEIGHT_KEY_BY_GROUP matches
// against — a typo here doesn't error, it just silently makes a player
// unratable (skipped, not guessed), so this is a dropdown, not free text.
const POSITION_GROUPS = ['Prop', 'Hooker', 'Second Row', 'Back Row', 'Scrum-half', 'Fly-half', 'Centre', 'Wing', 'Fullback'] as const

async function addPlayer(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  await supabase.schema('rugby').from('players').insert({
    team_id: Number(formData.get('team_id')),
    name: (formData.get('name') as string).trim(),
  })
  redirect('/admin/rugby/players')
}

async function removePlayer(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const id = Number(formData.get('id'))
  await supabase.schema('rugby').from('players').delete().eq('id', id)
  redirect('/admin/rugby/players')
}

// Saving a value here is always a real, confirmed number from an admin —
// per Kit (2026-09-25), it's now "pinned": value_is_admin_set locks it
// out of the automatic rating-based recompute until an admin explicitly
// reverts it (see revertToAutoValue below). Both flag updates are their
// own separate, best-effort calls rather than bundled into the main one:
// they're newer, optional columns, and a problem with either must never
// stop name/team/position/value from saving.
async function updatePlayer(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const id = Number(formData.get('id'))
  const name = (formData.get('name') as string).trim()
  const teamId = Number(formData.get('team_id'))
  const positionRaw = formData.get('position') as string
  const position = positionRaw ? positionRaw : null
  const valueRaw = formData.get('value') as string
  const value = valueRaw.trim() ? Math.round(Number(valueRaw)) : null
  await supabase.schema('rugby').from('players').update({ name, team_id: teamId, position, value }).eq('id', id)
  await supabase.schema('rugby').from('players').update({ value_is_estimated: false }).eq('id', id)
  await supabase.schema('rugby').from('players').update({ value_is_admin_set: true }).eq('id', id)
  redirect('/admin/rugby/players')
}

// Un-pins a player's value — the very next "Calculate Points" run (or
// this call itself, right now) recomputes it fresh from their current
// average rating, same as anyone who was never pinned.
async function revertToAutoValue(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const id = Number(formData.get('id'))
  await supabase.schema('rugby').from('players').update({ value_is_admin_set: false }).eq('id', id)
  await recomputeAllRugbyPlayerValues(supabase)
  redirect('/admin/rugby/players')
}

export default async function AdminRugbyPlayersPage() {
  const supabase = await createServerSupabaseClient()
  const [{ data: teams }, { data: players }] = await Promise.all([
    supabase.schema('rugby').from('teams').select('id, name').order('name') as unknown as Promise<{ data: Team[] | null }>,
    supabase.schema('rugby').from('players').select('id, team_id, name, position, value').order('name') as unknown as Promise<{ data: Omit<RugbyPlayer, 'value_is_estimated' | 'value_is_admin_set'>[] | null }>,
  ])

  // Their own separate queries, deliberately not bundled with the one
  // above: both are newer, optional columns — a problem reading either
  // must only mean that one tag/button doesn't show, never that the
  // whole player list breaks.
  const { data: estimatedRows } = await supabase.schema('rugby').from('players').select('id, value_is_estimated') as unknown as { data: { id: number; value_is_estimated: boolean }[] | null }
  const estimatedById = new Map((estimatedRows ?? []).map(r => [r.id, r.value_is_estimated]))
  const { data: adminSetRows } = await supabase.schema('rugby').from('players').select('id, value_is_admin_set') as unknown as { data: { id: number; value_is_admin_set: boolean }[] | null }
  const adminSetById = new Map((adminSetRows ?? []).map(r => [r.id, r.value_is_admin_set]))

  const teamsList = teams ?? []
  const playersList: RugbyPlayer[] = (players ?? []).map(p => ({
    ...p,
    value_is_estimated: estimatedById.get(p.id) ?? false,
    value_is_admin_set: adminSetById.get(p.id) ?? false,
  }))
  const playersByTeam = new Map<number, RugbyPlayer[]>()
  playersList.forEach(p => {
    if (!playersByTeam.has(p.team_id)) playersByTeam.set(p.team_id, [])
    playersByTeam.get(p.team_id)!.push(p)
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">🏉 Rugby Players</h1>
      <p className="text-gray-500 text-sm mb-6">
        Squads normally come in bulk from the spreadsheet sync — this is for adding a one-off call-up, fixing a
        typo, or correcting a position/value without re-uploading the whole file. Removing a player here is a
        deliberate admin action; the spreadsheet sync itself never removes anyone. Values are normally dynamic —
        recalculated from average match rating every time you run &quot;Calculate Points&quot; on{' '}
        <a href="/admin/rugby/results" className="underline">Rugby Results</a>. A value with an{' '}
        <span className="bg-amber-100 text-amber-800 px-1 rounded text-xs font-semibold">estimated</span> tag is a
        neutral placeholder (that position&apos;s average) for a player with no rating data yet, not a real one.
        Saving a value here <span className="bg-blue-100 text-blue-800 px-1 rounded text-xs font-semibold">pins</span> it
        — it stops being recalculated automatically until you revert it.
      </p>

      <div className="bg-white border rounded-lg p-6 mb-8 max-w-md">
        <h2 className="font-bold mb-4">Add a player</h2>
        <form action={addPlayer} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Team</label>
            <select name="team_id" required className="border rounded px-3 py-2 text-sm w-full">
              <option value="">Select a team...</option>
              {teamsList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Name</label>
            <input type="text" name="name" required className="border rounded px-3 py-2 text-sm w-full" />
          </div>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm font-bold">Add</button>
        </form>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-4">Squads</h2>
        {teamsList.length === 0 ? (
          <p className="text-gray-400 text-sm">No teams yet.</p>
        ) : (
          <div className="space-y-8">
            {teamsList.map(team => (
              <div key={team.id}>
                <h3 className="font-semibold text-sm mb-3">{team.name} ({(playersByTeam.get(team.id) ?? []).length})</h3>
                <div className="space-y-2">
                  {(playersByTeam.get(team.id) ?? []).map(p => (
                    <form key={p.id} action={updatePlayer} className="flex items-center gap-2 flex-wrap text-xs bg-gray-50 border rounded px-3 py-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="text" name="name" defaultValue={p.name} className="border rounded px-2 py-1 w-40" />
                      <select name="team_id" defaultValue={p.team_id} className="border rounded px-2 py-1">
                        {teamsList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <select name="position" defaultValue={p.position ?? ''} className="border rounded px-2 py-1">
                        <option value="">No position</option>
                        {POSITION_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                      <span className="flex items-center gap-1">
                        £<input type="number" name="value" step="1" defaultValue={p.value ?? ''} placeholder="unset" className="border rounded px-2 py-1 w-24" />
                        {p.value_is_estimated && <span className="bg-amber-100 text-amber-800 px-1 rounded font-semibold">estimated</span>}
                        {p.value_is_admin_set && <span className="bg-blue-100 text-blue-800 px-1 rounded font-semibold">admin-set</span>}
                      </span>
                      <button type="submit" className="bg-black text-white rounded px-3 py-1 font-bold">Save</button>
                      {p.value_is_admin_set && (
                        <button type="submit" formAction={revertToAutoValue} className="text-blue-500 hover:text-blue-700 underline">
                          Revert to auto
                        </button>
                      )}
                      <button type="submit" formAction={removePlayer} className="text-red-400 hover:text-red-600 ml-auto">✕ Remove</button>
                    </form>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
