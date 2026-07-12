import { createServerSupabaseClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function CompetitionsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: competitions } = await supabase
    .from('competitions')
    .select('*')
    .order('created_at', { ascending: false })

  async function createCompetition(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()

    const { data: comp, error } = await supabase
      .from('competitions')
      .insert({
        name: formData.get('name') as string,
        season: formData.get('season') as string,
        status: 'upcoming',
        start_date: formData.get('start_date') as string,
        end_date: formData.get('end_date') as string,
      })
      .select()
      .single()

    if (!error && comp) {
      await supabase.rpc('insert_default_scoring_rules', { comp_id: comp.id })
      await supabase.rpc('insert_default_player_scoring_rules', { comp_id: comp.id })
    }

    redirect('/admin/competitions')
  }

  async function archiveCompetition(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const id = formData.get('id') as string
    await supabase
      .from('competitions')
      .update({ status: 'archived' })
      .eq('id', id)
    redirect('/admin/competitions')
  }

  async function activateCompetition(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const id = formData.get('id') as string

    // Archive whatever is currently active first — the database has a hard
    // constraint allowing only one active competition, so this must happen
    // before the new one is activated or the update will fail.
    await supabase
      .from('competitions')
      .update({ status: 'archived' })
      .eq('status', 'active')

    await supabase
      .from('competitions')
      .update({ status: 'active' })
      .eq('id', id)

    redirect('/admin/competitions')
  }

  async function deleteCompetition(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const id = formData.get('id') as string
    await supabase
      .from('competitions')
      .delete()
      .eq('id', id)
    redirect('/admin/competitions')
  }

  const hasActiveCompetition = competitions?.some(c => c.status === 'active') ?? false

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Competitions</h1>

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-4">Create New Competition</h2>
        <form action={createCompetition} className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              name="name"
              placeholder="e.g. 2026/27 First Half"
              className="w-full border rounded px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Season</label>
            <input
              name="season"
              placeholder="e.g. 2026-27"
              className="w-full border rounded px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              name="start_date"
              type="date"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input
              name="end_date"
              type="date"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <button
              type="submit"
              className="bg-black text-white rounded px-4 py-2 text-sm"
            >
              Create Competition
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-4">All Competitions</h2>
        {hasActiveCompetition && (
          <p className="text-xs text-gray-500 mb-4">
            Only one competition can be active at a time. Activating a different one will automatically archive the current active competition.
          </p>
        )}
        {competitions && competitions.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Name</th>
                <th className="pb-2">Season</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Start</th>
                <th className="pb-2">End</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {competitions.map((comp) => (
                <tr key={comp.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{comp.name}</td>
                  <td className="py-2">{comp.season}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      comp.status === 'active' ? 'bg-green-100 text-green-700' :
                      comp.status === 'archived' ? 'bg-gray-100 text-gray-700' :
                      comp.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {comp.status}
                    </span>
                  </td>
                  <td className="py-2">{comp.start_date ?? '—'}</td>
                  <td className="py-2">{comp.end_date ?? '—'}</td>
                  <td className="py-2">
                    <div className="flex gap-2 flex-wrap">
                      {comp.status !== 'active' && (
                        <form action={activateCompetition}>
                          <input type="hidden" name="id" value={comp.id} />
                          <button type="submit" className="text-xs bg-green-600 text-white rounded px-2 py-1">
                            {comp.status === 'archived' ? 'Reactivate' : 'Activate'}
                          </button>
                        </form>
                      )}
                      {comp.status !== 'archived' && (
                        <form action={archiveCompetition}>
                          <input type="hidden" name="id" value={comp.id} />
                          <button type="submit" className="text-xs bg-gray-600 text-white rounded px-2 py-1">
                            Archive
                          </button>
                        </form>
                      )}
                      <form
                        action={deleteCompetition}
                        onSubmit={(e) => {
                          if (!confirm(`Delete "${comp.name}" permanently? This cannot be undone.`)) {
                            e.preventDefault()
                          }
                        }}
                      >
                        <input type="hidden" name="id" value={comp.id} />
                        <button type="submit" className="text-xs bg-red-600 text-white rounded px-2 py-1">
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-500 text-sm">No competitions yet.</p>
        )}
      </div>
    </div>
  )
}