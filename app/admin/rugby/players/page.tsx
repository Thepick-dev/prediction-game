import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { redirect } from 'next/navigation'

async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

type Team = { id: number; name: string }
type RugbyPlayer = { id: number; team_id: number; name: string }

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

export default async function AdminRugbyPlayersPage() {
  const supabase = await createServerSupabaseClient()
  const [{ data: teams }, { data: players }] = await Promise.all([
    supabase.schema('rugby').from('teams').select('id, name').order('name') as unknown as Promise<{ data: Team[] | null }>,
    supabase.schema('rugby').from('players').select('id, team_id, name').order('name') as unknown as Promise<{ data: RugbyPlayer[] | null }>,
  ])

  const teamsList = teams ?? []
  const playersList = players ?? []
  const playersByTeam = new Map<number, RugbyPlayer[]>()
  playersList.forEach(p => {
    if (!playersByTeam.has(p.team_id)) playersByTeam.set(p.team_id, [])
    playersByTeam.get(p.team_id)!.push(p)
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">🏉 Rugby Players</h1>
      <p className="text-gray-500 text-sm mb-6">
        Squads normally come in bulk from the spreadsheet sync — this is for adding a one-off call-up or fixing a
        typo without re-uploading the whole file. Removing a player here is a deliberate admin action; the
        spreadsheet sync itself never removes anyone.
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {teamsList.map(team => (
              <div key={team.id}>
                <h3 className="font-semibold text-sm mb-2">{team.name} ({(playersByTeam.get(team.id) ?? []).length})</h3>
                <ul className="text-xs text-gray-600 space-y-1">
                  {(playersByTeam.get(team.id) ?? []).map(p => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span>{p.name}</span>
                      <form action={removePlayer}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
