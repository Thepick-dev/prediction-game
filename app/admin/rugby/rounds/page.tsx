import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { redirect } from 'next/navigation'
import { londonInputToUtcISOString, utcToLondonInputValue } from '../../../lib/londonTime'
import { calculateSeasonSquadRoundScoring, calculateMatchPredictionRoundScoring } from '../../../lib/rugbyScoring'

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
// time change), adding a round by hand, and moving a round through
// upcoming -> open -> locked -> completed (mirrors football's Gameweeks
// status dropdown). Marking a round "completed" here scores it
// automatically, same convenience as football; "Recalculate Points" on
// this page or on /admin/rugby/results does the same scoring on demand
// any time afterward, for correcting a result after the fact.
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

async function updateStatus(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const id = formData.get('id') as string
  const status = formData.get('status') as string
  await supabase.schema('rugby').from('rounds').update({ status }).eq('id', id)

  if (status === 'completed') {
    const [squadResult, matchResult] = await Promise.all([
      calculateSeasonSquadRoundScoring(supabase, id),
      calculateMatchPredictionRoundScoring(supabase, id),
    ])
    const err = ('error' in squadResult && squadResult.error) || ('error' in matchResult && matchResult.error)
    if (err) redirect(`/admin/rugby/rounds?error=${encodeURIComponent(err)}`)
  }
  redirect('/admin/rugby/rounds')
}

async function recalculatePoints(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const id = formData.get('id') as string
  const [squadResult, matchResult] = await Promise.all([
    calculateSeasonSquadRoundScoring(supabase, id),
    calculateMatchPredictionRoundScoring(supabase, id),
  ])
  const err = ('error' in squadResult && squadResult.error) || ('error' in matchResult && matchResult.error)
  if (err) redirect(`/admin/rugby/rounds?error=${encodeURIComponent(err)}`)
  const squadRows = 'rows' in squadResult ? squadResult.rows : 0
  const matchRows = 'rows' in matchResult ? matchResult.rows : 0
  redirect(`/admin/rugby/rounds?calculated=${squadRows}&calculatedMatch=${matchRows}`)
}

const STATUS_OPTIONS = ['upcoming', 'open', 'locked', 'completed']

export default async function AdminRugbyRoundsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; calculated?: string; calculatedMatch?: string }>
}) {
  const { error: statusError, calculated, calculatedMatch } = await searchParams
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
        {competition.name} — deadlines are set automatically by the spreadsheet sync&apos;s Kickoff column; use this
        page to correct one by hand, add a round, or move a round through its status. Marking a round
        &quot;completed&quot; scores it immediately (Dream Team picks and match predictions both) — safe to do
        again any time afterward via Recalculate, e.g. after correcting a result.
      </p>

      {(statusError || calculated) && (
        <div className={`rounded-lg p-3 mb-6 text-sm ${statusError ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {statusError ? `Error: ${statusError}` : `Calculated points for ${calculated} Dream Team pick(s) and ${calculatedMatch ?? 0} match prediction(s).`}
        </div>
      )}

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-4">Existing rounds</h2>
        {roundsList.length === 0 ? (
          <p className="text-gray-400 text-sm">None yet — sync the spreadsheet, or add one below.</p>
        ) : (
          <div className="space-y-3">
            {roundsList.map(r => (
              <div key={r.id} className="border rounded-lg p-3">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <span className="text-sm font-medium w-24">Round {r.number}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    r.status === 'open' ? 'bg-green-100 text-green-700' :
                    r.status === 'locked' ? 'bg-red-100 text-red-700' :
                    r.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {r.status}
                  </span>
                  <form action={updateStatus} className="flex gap-1">
                    <input type="hidden" name="id" value={r.id} />
                    <select name="status" defaultValue={r.status} className="text-xs border rounded px-1 py-1">
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Set</button>
                  </form>
                  {(r.status === 'locked' || r.status === 'completed') && (
                    <form action={recalculatePoints}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="text-xs bg-blue-600 text-white rounded px-2 py-1">🔁 Recalculate Points</button>
                    </form>
                  )}
                </div>
                <form action={updateDeadline} className="flex items-center gap-2 flex-wrap">
                  <input type="hidden" name="id" value={r.id} />
                  <label className="text-xs text-gray-500">Deadline:</label>
                  <input type="datetime-local" name="deadline" defaultValue={utcToLondonInputValue(r.deadline)} className="border rounded px-2 py-1 text-sm" />
                  <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Save deadline</button>
                </form>
              </div>
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
