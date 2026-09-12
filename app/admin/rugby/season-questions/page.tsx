import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { redirect } from 'next/navigation'
import { finalizeSeasonPredictionScoring } from '../../../lib/rugbyScoring'

async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

type QuestionType = {
  id: string; type_key: string; label: string; active: boolean
  points: number; tolerance: number | null; answer_type: string
}
type Team = { id: number; name: string }
type Player = { id: number; name: string; team_id: number }
type Fixture = { id: number; round_id: string; home_team_id: number; away_team_id: number }
type Round = { id: string; number: number }
type ResultRow = {
  type_key: string; result_team_id: number | null; result_player_id: number | null
  result_numeric: number | null; result_fixture_id: number | null
}

async function createQuestion(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const competitionId = formData.get('competition_id') as string
  const typeKey = (formData.get('type_key') as string).trim().toLowerCase().replace(/\s+/g, '_')
  await supabase.schema('rugby').from('season_prediction_types').insert({
    competition_id: competitionId,
    type_key: typeKey,
    label: formData.get('label') as string,
    answer_type: formData.get('answer_type') as string,
    points: Number(formData.get('points')),
    tolerance: formData.get('tolerance') ? Number(formData.get('tolerance')) : null,
    active: true,
  })
  redirect('/admin/rugby/season-questions')
}

async function toggleQuestion(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const id = formData.get('id') as string
  const nextActive = formData.get('next_active') === 'true'
  await supabase.schema('rugby').from('season_prediction_types').update({ active: nextActive }).eq('id', id)
  redirect('/admin/rugby/season-questions')
}

// type_key is deliberately not editable here — it's the join key every
// prediction/result row is keyed on, so changing it would orphan existing
// answers. Everything else about a question (wording, points, tolerance,
// even its answer type before anyone's answered it) can be corrected any
// time, not just at creation.
async function updateQuestion(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const id = formData.get('id') as string
  await supabase.schema('rugby').from('season_prediction_types').update({
    label: formData.get('label') as string,
    answer_type: formData.get('answer_type') as string,
    points: Number(formData.get('points')),
    tolerance: formData.get('tolerance') ? Number(formData.get('tolerance')) : null,
  }).eq('id', id)
  redirect('/admin/rugby/season-questions')
}

async function saveResult(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const competitionId = formData.get('competition_id') as string
  const typeKey = formData.get('type_key') as string
  const answerType = formData.get('answer_type') as string

  const row: Record<string, unknown> = { competition_id: competitionId, type_key: typeKey }
  if (answerType === 'team') row.result_team_id = formData.get('result_team_id') ? Number(formData.get('result_team_id')) : null
  if (answerType === 'player') row.result_player_id = formData.get('result_player_id') ? Number(formData.get('result_player_id')) : null
  if (answerType === 'numeric') row.result_numeric = formData.get('result_numeric') ? Number(formData.get('result_numeric')) : null
  if (answerType === 'fixture') row.result_fixture_id = formData.get('result_fixture_id') ? Number(formData.get('result_fixture_id')) : null

  await supabase.schema('rugby').from('season_prediction_results').upsert(row, { onConflict: 'competition_id,type_key' })
  redirect('/admin/rugby/season-questions#results')
}

async function finalizeScoring(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const competitionId = formData.get('competition_id') as string
  const result = await finalizeSeasonPredictionScoring(supabase, competitionId)
  const message = 'error' in result ? `error=${encodeURIComponent(result.error)}` : `calculated=${result.rows}`
  redirect(`/admin/rugby/season-questions?${message}#results`)
}

export default async function AdminRugbySeasonQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ calculated?: string; error?: string }>
}) {
  const { calculated, error: calcError } = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name').eq('status', 'active').maybeSingle() as unknown as { data: { id: string; name: string } | null }

  if (!competition) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">🏉 Season Questions</h1>
        <p className="text-gray-500 text-sm">No active competition — create and activate one at <a href="/admin/rugby" className="underline">Admin → Rugby</a> first.</p>
      </div>
    )
  }

  const [{ data: questions }, { data: teams }, { data: players }, { data: fixtures }, { data: rounds }, { data: results }] = await Promise.all([
    supabase.schema('rugby').from('season_prediction_types').select('*').eq('competition_id', competition.id).order('label') as unknown as Promise<{ data: QuestionType[] | null }>,
    supabase.schema('rugby').from('teams').select('id, name').order('name') as unknown as Promise<{ data: Team[] | null }>,
    supabase.schema('rugby').from('players').select('id, name, team_id').order('name') as unknown as Promise<{ data: Player[] | null }>,
    supabase.schema('rugby').from('fixtures').select('id, round_id, home_team_id, away_team_id') as unknown as Promise<{ data: Fixture[] | null }>,
    supabase.schema('rugby').from('rounds').select('id, number').eq('competition_id', competition.id).order('number') as unknown as Promise<{ data: Round[] | null }>,
    supabase.schema('rugby').from('season_prediction_results').select('*').eq('competition_id', competition.id) as unknown as Promise<{ data: ResultRow[] | null }>,
  ])

  const questionsList = questions ?? []
  const teamsList = teams ?? []
  const playersList = players ?? []
  const fixturesList = fixtures ?? []
  const roundsList = rounds ?? []
  const resultByKey = new Map((results ?? []).map(r => [r.type_key, r]))
  const teamName = (id: number) => teamsList.find(t => t.id === id)?.name ?? '?'
  const roundNumberById = new Map(roundsList.map(r => [r.id, r.number]))

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">🏉 Season Questions</h1>
      <p className="text-gray-500 text-sm mb-8">
        {competition.name} — these are the one-off tournament predictions players make before Round 1. Whatever
        you set here shows up automatically on the player-facing Rules page.
      </p>

      {(calculated || calcError) && (
        <div className={`rounded-lg p-3 mb-6 text-sm ${calcError ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {calcError ? `Error: ${calcError}` : `Calculated season prediction points for ${calculated} answer(s).`}
        </div>
      )}

      <div className="bg-white border rounded-lg p-6 mb-8 max-w-lg">
        <h2 className="font-bold mb-4">Add a question</h2>
        <form action={createQuestion} className="space-y-3">
          <input type="hidden" name="competition_id" value={competition.id} />
          <div>
            <label className="block text-xs font-medium mb-1">Question key (short, no spaces — e.g. tournament_winner)</label>
            <input type="text" name="type_key" required className="border rounded px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Label shown to players</label>
            <input type="text" name="label" required placeholder="Tournament Winner" className="border rounded px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Answer type</label>
            <select name="answer_type" required className="border rounded px-3 py-2 text-sm w-full">
              <option value="team">A team</option>
              <option value="player">A player</option>
              <option value="numeric">A number</option>
              <option value="fixture">A match</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Points if correct</label>
              <input type="number" name="points" defaultValue={10} className="border rounded px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tolerance (numeric only)</label>
              <input type="number" name="tolerance" placeholder="e.g. 5" className="border rounded px-3 py-2 text-sm w-full" />
            </div>
          </div>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm font-bold">Add Question</button>
        </form>
      </div>

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-1">Questions</h2>
        <p className="text-xs text-gray-500 mb-4">Everything here — wording, points, tolerance, answer type — can be corrected any time, not just when you first add it. The question key itself stays fixed once created.</p>
        {questionsList.length === 0 ? (
          <p className="text-gray-400 text-sm">None yet — add one above.</p>
        ) : (
          <div className="space-y-3">
            {questionsList.map(q => (
              <form key={q.id} action={updateQuestion} className="border rounded-lg p-3 flex items-center gap-2 flex-wrap">
                <input type="hidden" name="id" value={q.id} />
                <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${q.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{q.active ? 'active' : 'inactive'}</span>
                <span className="text-xs text-gray-400 shrink-0" title="Question key (fixed)">{q.type_key}</span>
                <input type="text" name="label" defaultValue={q.label} className="border rounded px-2 py-1 text-sm flex-1 min-w-[140px]" />
                <select name="answer_type" defaultValue={q.answer_type} className="border rounded px-2 py-1 text-sm">
                  <option value="team">A team</option>
                  <option value="player">A player</option>
                  <option value="numeric">A number</option>
                  <option value="fixture">A match</option>
                </select>
                <input type="number" name="points" defaultValue={q.points} title="Points if correct" className="border rounded px-2 py-1 text-sm w-20" />
                <input type="number" name="tolerance" defaultValue={q.tolerance ?? ''} placeholder="±tolerance" title="Tolerance (numeric only)" className="border rounded px-2 py-1 text-sm w-24" />
                <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Save</button>
                <button type="submit" formAction={toggleQuestion} name="next_active" value={(!q.active).toString()} className="text-xs underline text-gray-500">
                  {q.active ? 'Deactivate' : 'Activate'}
                </button>
              </form>
            ))}
          </div>
        )}
      </div>

      <div id="results" className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-1">Enter the answers</h2>
        <p className="text-xs text-gray-500 mb-4">Once the tournament is over and you know the real outcome, enter it here for each question, then Calculate below.</p>
        <div className="space-y-4">
          {questionsList.filter(q => q.active).map(q => {
            const existing = resultByKey.get(q.type_key)
            return (
              <form key={q.id} action={saveResult} className="flex items-center gap-2 flex-wrap border-b pb-3">
                <input type="hidden" name="competition_id" value={competition.id} />
                <input type="hidden" name="type_key" value={q.type_key} />
                <input type="hidden" name="answer_type" value={q.answer_type} />
                <span className="text-sm font-medium w-48">{q.label}</span>
                {q.answer_type === 'team' && (
                  <select name="result_team_id" defaultValue={existing?.result_team_id ?? ''} className="border rounded px-2 py-1 text-sm">
                    <option value="">— none —</option>
                    {teamsList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                {q.answer_type === 'player' && (
                  <select name="result_player_id" defaultValue={existing?.result_player_id ?? ''} className="border rounded px-2 py-1 text-sm">
                    <option value="">— select —</option>
                    {playersList.map(p => <option key={p.id} value={p.id}>{p.name} ({teamName(p.team_id)})</option>)}
                  </select>
                )}
                {q.answer_type === 'numeric' && (
                  <input type="number" name="result_numeric" defaultValue={existing?.result_numeric ?? ''} className="border rounded px-2 py-1 text-sm w-24" />
                )}
                {q.answer_type === 'fixture' && (
                  <select name="result_fixture_id" defaultValue={existing?.result_fixture_id ?? ''} className="border rounded px-2 py-1 text-sm">
                    <option value="">— select —</option>
                    {fixturesList.map(f => <option key={f.id} value={f.id}>Round {roundNumberById.get(f.round_id)}: {teamName(f.home_team_id)} v {teamName(f.away_team_id)}</option>)}
                  </select>
                )}
                <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Save</button>
              </form>
            )
          })}
        </div>
        <form action={finalizeScoring} className="mt-4">
          <input type="hidden" name="competition_id" value={competition.id} />
          <button type="submit" className="bg-green-600 text-white rounded px-4 py-2 text-sm font-bold">Calculate Season Prediction Points</button>
        </form>
      </div>
    </div>
  )
}
