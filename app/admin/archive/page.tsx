import { createServerSupabaseClient } from '../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../lib/supabase-admin'
import { requireAdmin } from '../../lib/require-admin'
import { redirect } from 'next/navigation'

// Every write below goes through this — Server Actions are reachable as
// their own endpoint, not just "the button on a page only admins can see",
// so the page layout's own admin check isn't a guarantee for these.
async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

export default async function AdminArchivePage() {
  const supabase = await createServerSupabaseClient()

  const { data: competitions } = await supabase
    .from('competitions')
    .select('id, name, season, status, hidden, manual_winner, manual_winner_note')
    .order('created_at', { ascending: false })

  const { data: honours } = await supabase
    .from('honours')
    .select('*')
    .order('sort_order', { ascending: false })

  async function toggleHidden(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const id = formData.get('id') as string
    const hidden = formData.get('hidden') === 'true'
    await supabase.from('competitions').update({ hidden: !hidden }).eq('id', id)
    redirect('/admin/archive')
  }

  async function setManualWinner(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const id = formData.get('id') as string
    const manual_winner = formData.get('manual_winner') as string
    const manual_winner_note = formData.get('manual_winner_note') as string
    await supabase.from('competitions').update({ manual_winner, manual_winner_note }).eq('id', id)
    redirect('/admin/archive')
  }

  async function addHonour(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    await supabase.from('honours').insert({
      season: formData.get('season') as string,
      competition_name: formData.get('competition_name') as string,
      winner: formData.get('winner') as string,
      notes: formData.get('notes') as string || null,
      sort_order: parseInt(formData.get('sort_order') as string) || 0
    })
    redirect('/admin/archive')
  }

  async function deleteHonour(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    await supabase.from('honours').delete().eq('id', formData.get('id') as string)
    redirect('/admin/archive')
  }

  async function editHonour(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    await supabase.from('honours').update({
      season: formData.get('season') as string,
      competition_name: formData.get('competition_name') as string,
      winner: formData.get('winner') as string,
      notes: formData.get('notes') as string || null,
      sort_order: parseInt(formData.get('sort_order') as string) || 0
    }).eq('id', formData.get('id') as string)
    redirect('/admin/archive')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Archive Admin</h1>

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-4">Competitions</h2>
        <p className="text-sm text-gray-500 mb-4">Hide test competitions or set a manual winner.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Competition</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Visible</th>
              <th className="pb-2">Manual Winner</th>
            </tr>
          </thead>
          <tbody>
            {competitions?.map(comp => (
              <tr key={comp.id} className="border-b last:border-0">
                <td className="py-3 font-medium">{comp.name}</td>
                <td className="py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${comp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {comp.status}
                  </span>
                </td>
                <td className="py-3">
                  <form action={toggleHidden}>
                    <input type="hidden" name="id" value={comp.id} />
                    <input type="hidden" name="hidden" value={String(comp.hidden ?? false)} />
                    <button type="submit" className={`text-xs px-2 py-1 rounded border ${comp.hidden ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                      {comp.hidden ? 'Hidden' : 'Visible'}
                    </button>
                  </form>
                </td>
                <td className="py-3">
                  <form action={setManualWinner} className="flex gap-2 flex-wrap">
                    <input type="hidden" name="id" value={comp.id} />
                    <input type="text" name="manual_winner" defaultValue={comp.manual_winner ?? ''} placeholder="Winner name" className="text-xs border rounded px-2 py-1 w-28" />
                    <input type="text" name="manual_winner_note" defaultValue={comp.manual_winner_note ?? ''} placeholder="Note (optional)" className="text-xs border rounded px-2 py-1 w-28" />
                    <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-4">Add Historical Winner</h2>
        <form action={addHonour} className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Season</label>
            <input name="season" placeholder="e.g. 2024/25" className="w-full border rounded px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Competition Name</label>
            <input name="competition_name" placeholder="e.g. First Half" className="w-full border rounded px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Winner</label>
            <input name="winner" placeholder="Display name" className="w-full border rounded px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Notes (optional)</label>
            <input name="notes" placeholder="e.g. Won on tiebreaker" className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Sort Order (higher = shown first)</label>
            <input name="sort_order" type="number" defaultValue="0" className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">Add</button>
          </div>
        </form>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-4">Historical Winners</h2>
        {(!honours || honours.length === 0) ? (
          <p className="text-sm text-gray-400">None yet.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2">Season</th>
                  <th className="pb-2">Competition</th>
                  <th className="pb-2">Winner</th>
                  <th className="pb-2">Notes</th>
                  <th className="pb-2">Sort</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {honours.map(h => (
                  <tr key={h.id} className="border-b last:border-0">
                    <td className="py-2">
                      <input form={`honour-${h.id}`} name="season" defaultValue={h.season} className="w-full border rounded px-2 py-1 text-xs" />
                    </td>
                    <td className="py-2">
                      <input form={`honour-${h.id}`} name="competition_name" defaultValue={h.competition_name} className="w-full border rounded px-2 py-1 text-xs" />
                    </td>
                    <td className="py-2">
                      <input form={`honour-${h.id}`} name="winner" defaultValue={h.winner} className="w-full border rounded px-2 py-1 text-xs font-bold" />
                    </td>
                    <td className="py-2">
                      <input form={`honour-${h.id}`} name="notes" defaultValue={h.notes ?? ''} className="w-full border rounded px-2 py-1 text-xs" />
                    </td>
                    <td className="py-2">
                      <input form={`honour-${h.id}`} name="sort_order" type="number" defaultValue={h.sort_order ?? 0} className="w-16 border rounded px-2 py-1 text-xs" />
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button type="submit" form={`honour-${h.id}`} className="text-xs bg-black text-white rounded px-2 py-1">Save</button>
                        <form action={deleteHonour}>
                          <input type="hidden" name="id" value={h.id} />
                          <button type="submit" className="text-xs text-red-500 hover:text-red-700">Delete</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* One empty form per row, kept outside the table (a <form> can't
                validly wrap <tr>/<td> elements) — the visible inputs/button
                above reference it via the HTML `form` attribute instead. */}
            {honours.map(h => (
              <form key={h.id} id={`honour-${h.id}`} action={editHonour}>
                <input type="hidden" name="id" value={h.id} />
              </form>
            ))}
          </>
        )}
      </div>
    </div>
  )
}