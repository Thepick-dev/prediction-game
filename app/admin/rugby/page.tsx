import { createServerSupabaseClient } from '../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../lib/supabase-admin'
import { requireAdmin } from '../../lib/require-admin'
import { redirect } from 'next/navigation'
import ConfirmActionButton from '../components/confirm-action-button'

// Every write below goes through this — Server Actions are reachable as
// their own endpoint, not just "the button on a page only admins can see",
// so the page layout's own admin check isn't a guarantee for these.
async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

type RugbyCompetition = {
  id: string; name: string; season: string; status: string
  start_date: string | null; end_date: string | null; created_at: string
}

async function createRugbyCompetition(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  await supabase.schema('rugby').from('competitions').insert({
    name: formData.get('name') as string,
    season: formData.get('season') as string,
    status: 'upcoming',
    start_date: (formData.get('start_date') as string) || null,
    end_date: (formData.get('end_date') as string) || null,
  })
  redirect('/admin/rugby')
}

// Mirrors football's activateCompetition exactly: archive whatever's
// currently active first, then activate the target — the sync route
// only ever writes into whichever competition has status='active', so
// this is the one action that actually starts a new season for real.
async function activateRugbyCompetition(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const id = formData.get('id') as string
  await supabase.schema('rugby').from('competitions').update({ status: 'archived' }).eq('status', 'active')
  await supabase.schema('rugby').from('competitions').update({ status: 'active' }).eq('id', id)
  redirect('/admin/rugby')
}

async function archiveRugbyCompetition(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const id = formData.get('id') as string
  await supabase.schema('rugby').from('competitions').update({ status: 'archived' }).eq('id', id)
  redirect('/admin/rugby')
}

async function finalizeRugbyCompetition(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const id = formData.get('id') as string
  await supabase.schema('rugby').from('competitions').update({ status: 'completed' }).eq('id', id)
  redirect('/admin/rugby')
}

async function saveTicker(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const id = formData.get('competition_id') as string
  const raw = (formData.get('ticker_text') as string) ?? ''
  const cleaned = raw.trim() || null
  await supabase.schema('rugby').from('competitions').update({ ticker_text: cleaned }).eq('id', id)
  redirect('/admin/rugby#ticker')
}

export default async function AdminRugbyPage() {
  const supabase = await createServerSupabaseClient()
  const { data: competitions } = await supabase.schema('rugby').from('competitions').select('*').order('created_at', { ascending: false }) as unknown as { data: RugbyCompetition[] | null }

  const list = competitions ?? []
  const activeComp = list.find(c => c.status === 'active')

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">🏉 Rugby Competitions</h1>
      <p className="text-gray-500 text-sm mb-8">
        Only ONE competition can be active at a time — that's the one the spreadsheet sync writes into, and the
        one players see and join. Starting a new season archives whichever one is currently active first.
      </p>

      {activeComp && (
        <div id="ticker" className="bg-white border rounded-lg p-6 mb-8 max-w-md">
          <h2 className="font-bold mb-1">📢 Ticker Banner</h2>
          <p className="text-xs text-gray-500 mb-3">Shown across the top of every rugby page. Leave empty to hide it.</p>
          <form action={saveTicker} className="space-y-2">
            <input type="hidden" name="competition_id" value={activeComp.id} />
            <textarea name="ticker_text" rows={2} defaultValue={(activeComp as unknown as { ticker_text?: string }).ticker_text ?? ''} className="border rounded px-3 py-2 text-sm w-full" placeholder="e.g. Round 2 deadline: Friday 6pm" />
            <button type="submit" className="bg-black text-white rounded px-3 py-1.5 text-sm font-bold">Save ticker</button>
          </form>
        </div>
      )}

      <div className="bg-white border rounded-lg p-6 mb-8 max-w-md">
        <h2 className="font-bold mb-4">Create a new competition</h2>
        <form action={createRugbyCompetition} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Name</label>
            <input type="text" name="name" required placeholder="Men's Six Nations" className="border rounded px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Season</label>
            <input type="text" name="season" required placeholder="2028" className="border rounded px-3 py-2 text-sm w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Start date</label>
              <input type="date" name="start_date" className="border rounded px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">End date</label>
              <input type="date" name="end_date" className="border rounded px-3 py-2 text-sm w-full" />
            </div>
          </div>
          <p className="text-xs text-gray-400">Starts as &quot;upcoming&quot; — activate it below when you're ready for it to go live.</p>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm font-bold">Create</button>
        </form>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-4">All competitions</h2>
        {list.length === 0 ? (
          <p className="text-gray-400 text-sm">None yet — create one above.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Name</th>
                <th className="pb-2">Season</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Dates</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{c.name}</td>
                  <td className="py-2">{c.season}</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      c.status === 'active' ? 'bg-green-100 text-green-700' :
                      c.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                      c.status === 'archived' ? 'bg-gray-100 text-gray-500' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="py-2 text-gray-500">{c.start_date ?? '—'} – {c.end_date ?? '—'}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {c.status !== 'active' && (
                        <ConfirmActionButton
                          action={activateRugbyCompetition}
                          hiddenFields={{ id: c.id }}
                          label="Activate"
                          confirmText={`Archive whatever's active and make "${c.name}" the live one?`}
                        />
                      )}
                      {c.status === 'active' && (
                        <ConfirmActionButton
                          action={finalizeRugbyCompetition}
                          hiddenFields={{ id: c.id }}
                          label="Mark completed"
                          confirmText="Tournament fully over — mark this competition completed?"
                        />
                      )}
                      {c.status !== 'archived' && (
                        <ConfirmActionButton
                          action={archiveRugbyCompetition}
                          hiddenFields={{ id: c.id }}
                          label="Archive"
                          confirmText={`Archive "${c.name}"? Its data is kept, just no longer live.`}
                          className="text-xs bg-gray-200 text-gray-700 rounded px-2 py-1"
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
