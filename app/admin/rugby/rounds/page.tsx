import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { redirect } from 'next/navigation'
import { londonInputToUtcISOString, utcToLondonInputValue } from '../../../lib/londonTime'

async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

type Round = { id: string; number: number; deadline: string; status: string }

// The spreadsheet sync creates rounds/deadlines from the Fixtures tab's
// Kickoff column automatically — this page exists for the cases that
// aren't a full re-sync: correcting a deadline (a postponement, a kickoff
// time change) or setting up a round that has no fixtures loaded yet.
async function createRound(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const competitionId = formData.get('competition_id') as string
  await supabase.schema('rugby').from('rounds').insert({
    competition_id: competitionId,
    number: Number(formData.get('number')),
    deadline: londonInputToUtcISOString(formData.get('deadline') as string),
    status: 'upcoming',
  })
  redirect('/admin/rugby/rounds')
}

async function updateDeadline(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const id = formData.get('id') as string
  await supabase.schema('rugby').from('rounds').update({ deadline: londonInputToUtcISOString(formData.get('deadline') as string) }).eq('id', id)
  redirect('/admin/rugby/rounds')
}

export default async function AdminRugbyRoundsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name').eq('status', 'active').maybeSingle() as unknown as { data: { id: string; name: string } | null }

  if (!competition) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">🏉 Rounds &amp; Deadlines</h1>
        <p className="text-gray-500 text-sm">No active competition — create and activate one at <a href="/admin/rugby" className="underline">Admin → Rugby</a> first.</p>
      </div>
    )
  }

  const { data: rounds } = await supabase.schema('rugby').from('rounds').select('id, number, deadline, status').eq('competition_id', competition.id).order('number') as unknown as { data: Round[] | null }
  const roundsList = rounds ?? []
  const nextNumber = roundsList.length > 0 ? Math.max(...roundsList.map(r => r.number)) + 1 : 1

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">🏉 Rounds &amp; Deadlines</h1>
      <p className="text-gray-500 text-sm mb-8">
        {competition.name} — the spreadsheet sync sets these automatically from the Fixtures tab&apos;s Kickoff
        column. Use this page to correct a deadline (a postponement, a time change) or add a round by hand.
      </p>

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-4">Existing rounds</h2>
        {roundsList.length === 0 ? (
          <p className="text-gray-400 text-sm">None yet — sync the spreadsheet, or add one below.</p>
        ) : (
          <div className="space-y-3">
            {roundsList.map(r => (
              <form key={r.id} action={updateDeadline} className="flex items-center gap-3 flex-wrap border rounded-lg p-3">
                <input type="hidden" name="id" value={r.id} />
                <span className="text-sm font-medium w-24">Round {r.number}</span>
                <span className="text-xs text-gray-400">{r.status}</span>
                <input type="datetime-local" name="deadline" defaultValue={utcToLondonInputValue(r.deadline)} className="border rounded px-2 py-1 text-sm" />
                <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Save deadline</button>
              </form>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border rounded-lg p-6 max-w-md">
        <h2 className="font-bold mb-4">Add a round</h2>
        <form action={createRound} className="space-y-3">
          <input type="hidden" name="competition_id" value={competition.id} />
          <div>
            <label className="block text-xs font-medium mb-1">Round number</label>
            <input type="number" name="number" min="1" defaultValue={nextNumber} required className="border rounded px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Deadline</label>
            <input type="datetime-local" name="deadline" required className="border rounded px-3 py-2 text-sm w-full" />
          </div>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm font-bold">Add Round</button>
        </form>
      </div>
    </div>
  )
}
