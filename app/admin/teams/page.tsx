import { createServerSupabaseClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function AdminTeamsPage() {
  const supabase = await createServerSupabaseClient()

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, short_name, active')
    .order('active', { ascending: false })
    .order('name', { ascending: true })

  async function updateShortName(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const id = parseInt(formData.get('id') as string)
    const short_name = formData.get('short_name') as string
    await supabase.from('teams').update({ short_name: short_name || null }).eq('id', id)
    redirect('/admin/teams')
  }

  async function toggleActive(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const id = parseInt(formData.get('id') as string)
    const current = formData.get('current') === 'true'
    await supabase.from('teams').update({ active: !current }).eq('id', id)
    redirect('/admin/teams')
  }

  const activeCount = teams?.filter(t => t.active).length ?? 0

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Teams</h1>
      <p className="text-gray-500 text-sm mb-2">
        Set short names and control which teams are active. Only active teams appear as pickable options.
        At the end of each season, mark relegated teams inactive and promoted teams active — never delete them, so historical scoring stays intact.
      </p>
      <p className="text-sm mb-8">
        <span className={activeCount === 20 ? 'text-green-600 font-bold' : 'text-orange-600 font-bold'}>
          {activeCount} active
        </span>
        <span className="text-gray-400"> — should be 20 during a normal season.</span>
      </p>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b bg-gray-50 text-xs uppercase tracking-wider">
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Full Name</th>
              <th className="py-3 px-4">Short Name</th>
              <th className="py-3 px-4">Set Short Name</th>
            </tr>
          </thead>
          <tbody>
            {teams?.map(team => (
              <tr key={team.id} className={`border-b last:border-0 ${!team.active ? 'bg-gray-50 opacity-60' : ''}`}>
                <td className="py-2 px-4">
                  <form action={toggleActive}>
                    <input type="hidden" name="id" value={team.id} />
                    <input type="hidden" name="current" value={String(team.active)} />
                    <button
                      type="submit"
                      className={`text-xs rounded px-2 py-1 font-bold ${
                        team.active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                      }`}
                    >
                      {team.active ? 'ACTIVE' : 'INACTIVE'}
                    </button>
                  </form>
                </td>
                <td className="py-2 px-4">{team.name}</td>
                <td className="py-2 px-4">
                  <span className={team.short_name ? 'font-medium' : 'text-gray-400'}>
                    {team.short_name ?? 'Not set'}
                  </span>
                </td>
                <td className="py-2 px-4">
                  <form action={updateShortName} className="flex gap-2 items-center">
                    <input type="hidden" name="id" value={team.id} />
                    <input
                      type="text"
                      name="short_name"
                      defaultValue={team.short_name ?? ''}
                      placeholder="e.g. Spurs"
                      className="border rounded px-2 py-1 text-xs w-28"
                    />
                    <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}