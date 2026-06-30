import { createServerSupabaseClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function GameweeksPage() {
  const supabase = await createServerSupabaseClient()

  const [{ data: competitions }, { data: gameweeks }] = await Promise.all([
    supabase.from('competitions').select('id, name').order('created_at', { ascending: false }),
    supabase
      .from('gameweeks')
      .select('*, competitions(name)')
      .order('number', { ascending: true })
  ])

  async function createGameweek(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    await supabase.from('gameweeks').insert({
      competition_id: formData.get('competition_id') as string,
      number: parseInt(formData.get('number') as string),
      deadline: formData.get('deadline') as string,
      status: 'upcoming'
    })
    redirect('/admin/gameweeks')
  }

async function updateStatus(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const id = formData.get('id') as string
    const status = formData.get('status') as string

    await supabase
      .from('gameweeks')
      .update({ status })
      .eq('id', id)

    if (status === 'completed') {
      const { data: gw } = await supabase
        .from('gameweeks')
        .select('competition_id')
        .eq('id', id)
        .single()

      if (gw) {
        const { data: assignments } = await supabase
          .from('tier_assignments')
          .select('team_id, tier')
          .eq('competition_id', gw.competition_id)

        if (assignments && assignments.length > 0) {
          await supabase
            .from('gameweek_quartiles')
            .upsert(
              assignments.map(a => ({
                gameweek_id: id,
                team_id: a.team_id,
                quartile: a.tier
              })),
              { onConflict: 'gameweek_id,team_id' }
            )
        }

        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/scoring`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameweek_id: id })
        })
      }
    }

    redirect('/admin/gameweeks')
  }

  async function deleteGameweek(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    await supabase
      .from('gameweeks')
      .delete()
      .eq('id', formData.get('id') as string)
    redirect('/admin/gameweeks')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Gameweeks</h1>

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-4">Create Gameweek</h2>
        <form action={createGameweek} className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Competition</label>
            <select name="competition_id" className="w-full border rounded px-3 py-2 text-sm" required>
              <option value="">Select competition</option>
              {competitions?.map((comp) => (
                <option key={comp.id} value={comp.id}>{comp.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Gameweek Number</label>
            <input
              name="number"
              type="number"
              min="1"
              placeholder="e.g. 1"
              className="w-full border rounded px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Deadline</label>
            <input
              name="deadline"
              type="datetime-local"
              className="w-full border rounded px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="col-span-2">
            <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
              Create Gameweek
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-4">All Gameweeks</h2>
        {gameweeks && gameweeks.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">GW</th>
                <th className="pb-2">Competition</th>
                <th className="pb-2">Deadline</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {gameweeks.map((gw) => (
                <tr key={gw.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">GW{gw.number}</td>
                  <td className="py-2">{(gw.competitions as any)?.name}</td>
                  <td className="py-2">{new Date(gw.deadline).toLocaleString()}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      gw.status === 'open' ? 'bg-green-100 text-green-700' :
                      gw.status === 'locked' ? 'bg-red-100 text-red-700' :
                      gw.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {gw.status}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <form action={updateStatus}>
                        <input type="hidden" name="id" value={gw.id} />
                        <select name="status" className="text-xs border rounded px-1 py-1">
                          <option value="upcoming">upcoming</option>
                          <option value="open">open</option>
                          <option value="locked">locked</option>
                          <option value="completed">completed</option>
                        </select>
                        <button type="submit" className="ml-1 text-xs bg-black text-white rounded px-2 py-1">
                          Set
                        </button>
                      </form>
                      <form action={deleteGameweek}>
                        <input type="hidden" name="id" value={gw.id} />
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
          <p className="text-gray-500 text-sm">No gameweeks yet.</p>
        )}
      </div>
    </div>
  )
}