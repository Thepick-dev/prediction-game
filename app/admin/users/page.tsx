import { createServerSupabaseClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function UsersPage() {
  const supabase = await createServerSupabaseClient()

  const { data: competitions } = await supabase
    .from('competitions')
    .select('id, name, status')
    .order('created_at', { ascending: false })

  const activeComp = competitions?.find(c => c.status === 'active') ?? competitions?.[0]

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, is_admin')
    .order('display_name')

  const { data: entries } = activeComp ? await supabase
    .from('competition_entries')
    .select('user_id, removed, removed_at')
    .eq('competition_id', activeComp.id) : { data: [] }

  const entryMap: Record<string, any> = {}
  entries?.forEach(e => { entryMap[e.user_id] = e })

  async function updateDisplayName(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const id = formData.get('id') as string
    const display_name = formData.get('display_name') as string
    await supabase.from('profiles').update({ display_name }).eq('id', id)
    redirect('/admin/users')
  }

  async function removeFromCompetition(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const user_id = formData.get('user_id') as string
    const competition_id = formData.get('competition_id') as string
    await supabase
      .from('competition_entries')
      .update({ removed: true, removed_at: new Date().toISOString() })
      .eq('user_id', user_id)
      .eq('competition_id', competition_id)
    redirect('/admin/users')
  }

  async function reinstateToCompetition(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const user_id = formData.get('user_id') as string
    const competition_id = formData.get('competition_id') as string
    await supabase
      .from('competition_entries')
      .update({ removed: false, removed_at: null })
      .eq('user_id', user_id)
      .eq('competition_id', competition_id)
    redirect('/admin/users')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Users</h1>
      <p className="text-gray-500 text-sm mb-6">
        Manage player display names and competition entries.
        {activeComp && ` Showing competition status for: ${activeComp.name}`}
      </p>

      <div className="bg-white border rounded-lg p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Display Name</th>
              <th className="pb-2">Admin</th>
              <th className="pb-2">Competition Status</th>
              <th className="pb-2">Edit Name</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles?.map(profile => {
              const entry = entryMap[profile.id]
              return (
                <tr key={profile.id} className="border-b last:border-0">
                  <td className="py-2">{profile.display_name ?? <span className="text-gray-400">Not set</span>}</td>
                  <td className="py-2">
                    {profile.is_admin && (
                      <span className="text-xs bg-black text-white px-2 py-0.5 rounded">Admin</span>
                    )}
                  </td>
                  <td className="py-2">
                    {!entry ? (
                      <span className="text-xs text-gray-400">Not entered</span>
                    ) : entry.removed ? (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Removed</span>
                    ) : (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Active</span>
                    )}
                  </td>
                  <td className="py-2">
                    <form action={updateDisplayName} className="flex gap-1">
                      <input type="hidden" name="id" value={profile.id} />
                      <input
                        type="text"
                        name="display_name"
                        defaultValue={profile.display_name ?? ''}
                        placeholder="Set name"
                        className="text-xs border rounded px-2 py-1"
                      />
                      <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">
                        Save
                      </button>
                    </form>
                  </td>
                  <td className="py-2">
                    {activeComp && entry && !entry.removed && (
                      <form action={removeFromCompetition}>
                        <input type="hidden" name="user_id" value={profile.id} />
                        <input type="hidden" name="competition_id" value={activeComp.id} />
                        <button type="submit" className="text-xs bg-red-600 text-white rounded px-2 py-1">
                          Remove
                        </button>
                      </form>
                    )}
                    {activeComp && entry && entry.removed && (
                      <form action={reinstateToCompetition}>
                        <input type="hidden" name="user_id" value={profile.id} />
                        <input type="hidden" name="competition_id" value={activeComp.id} />
                        <button type="submit" className="text-xs bg-green-600 text-white rounded px-2 py-1">
                          Reinstate
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}