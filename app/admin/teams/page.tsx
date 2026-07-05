import { createServerSupabaseClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function AdminTeamsPage() {
  const supabase = await createServerSupabaseClient()

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, short_name')
    .order('name', { ascending: true })

  async function updateShortName(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const id = parseInt(formData.get('id') as string)
    const short_name = formData.get('short_name') as string
    await supabase.from('teams').update({ short_name: short_name || null }).eq('id', id)
    redirect('/admin/teams')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Teams</h1>
      <p className="text-gray-500 text-sm mb-8">
        Set short names for each team. These are used throughout the site instead of the full name.
        Update this when promoted teams are added at the start of each season.
      </p>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b bg-gray-50 text-xs uppercase tracking-wider">
              <th className="py-3 px-4">Full Name</th>
              <th className="py-3 px-4">Short Name</th>
              <th className="py-3 px-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {teams?.map(team => (
              <tr key={team.id} className="border-b last:border-0">
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