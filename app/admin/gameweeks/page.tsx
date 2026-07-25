import { createServerSupabaseClient } from '../../lib/supabase-server'
import { calculateScoring } from '../../lib/scoring'
import { redirect } from 'next/navigation'
import ConfirmDeleteButton from '../components/confirm-delete-button'
import CompetitionFilter from '../components/competition-filter'
import GameweekQuestionForm from '../components/gameweek-question-form'

export default async function GameweeksPage({ searchParams }: { searchParams: Promise<{ competition_id?: string }> }) {
  const { competition_id: selectedCompetitionId } = await searchParams
  const supabase = await createServerSupabaseClient()

  let gameweeksQuery = supabase.from('gameweeks').select('*, competitions(name)').order('number', { ascending: true })
  if (selectedCompetitionId) gameweeksQuery = gameweeksQuery.eq('competition_id', selectedCompetitionId)

  const [{ data: competitions }, { data: gameweeks }, { data: questions }] = await Promise.all([
    supabase.from('competitions').select('id, name').order('created_at', { ascending: false }),
    gameweeksQuery,
    supabase.from('gameweek_questions').select('*')
  ])

  const questionsByGw: Record<string, any> = {}
  questions?.forEach(q => { questionsByGw[q.gameweek_id] = q })

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

    await supabase.from('gameweeks').update({ status }).eq('id', id)

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

        await calculateScoring(supabase, id)
      }
    }

    redirect('/admin/gameweeks')
  }

  async function updateDeadline(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    await supabase
      .from('gameweeks')
      .update({ deadline: formData.get('deadline') as string })
      .eq('id', formData.get('id') as string)
    redirect('/admin/gameweeks')
  }

  async function deleteGameweek(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const id = formData.get('id') as string

    // Delete everything that references this gameweek first, since the
    // database blocks deleting a gameweek that still has picks/points/
    // fixtures pointing at it.
    await supabase.from('points').delete().eq('gameweek_id', id)
    await supabase.from('picks').delete().eq('gameweek_id', id)
    await supabase.from('gameweek_quartiles').delete().eq('gameweek_id', id)
    await supabase.from('gameweek_questions').delete().eq('gameweek_id', id)
    await supabase.from('fixtures').delete().eq('gameweek_id', id)

    const { error } = await supabase.from('gameweeks').delete().eq('id', id)

    if (error) {
      console.error('Failed to delete gameweek:', error.message)
    }

    redirect('/admin/gameweeks')
  }

  async function saveQuestion(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const gameweek_id = formData.get('gameweek_id') as string
    const question = formData.get('question') as string
    const question_type = (formData.get('question_type') as string) === 'freetext' ? 'freetext' : 'multiple_choice'
    const existing_id = formData.get('existing_id') as string

    // Options are meaningless for a freetext question — nulled out rather
    // than saved as whatever was left in the (hidden) fields, so a type
    // switch can't leave stale multiple-choice options behind it.
    const option_a = question_type === 'freetext' ? null : (formData.get('option_a') as string)
    const option_b = question_type === 'freetext' ? null : (formData.get('option_b') as string)
    const option_c = question_type === 'freetext' ? null : (formData.get('option_c') as string || null)
    const option_d = question_type === 'freetext' ? null : (formData.get('option_d') as string || null)

    if (existing_id) {
      await supabase.from('gameweek_questions').update({
        question, question_type, option_a, option_b, option_c, option_d
      }).eq('id', existing_id)
    } else {
      await supabase.from('gameweek_questions').insert({
        gameweek_id, question, question_type, option_a, option_b, option_c, option_d
      })
    }
    redirect('/admin/gameweeks')
  }

  async function deleteQuestion(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    await supabase.from('gameweek_questions').delete().eq('id', formData.get('id') as string)
    redirect('/admin/gameweeks')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Gameweeks</h1>
        <CompetitionFilter competitions={competitions ?? []} />
      </div>

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
          <div className="space-y-6">
            {gameweeks.map((gw) => {
              const existingQuestion = questionsByGw[gw.id]
              return (
                <div key={gw.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-bold">GW{gw.number}</span>
                      <span className="text-gray-500 text-sm">{(gw.competitions as any)?.name}</span>
                      <span className="text-gray-400 text-xs font-mono" title="Gameweek ID">{gw.id}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        gw.status === 'open' ? 'bg-green-100 text-green-700' :
                        gw.status === 'locked' ? 'bg-red-100 text-red-700' :
                        gw.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {gw.status}
                      </span>
                    </div>
                    <div className="flex gap-2 flex-wrap items-center">
                      <form action={updateStatus} className="flex gap-1">
                        <input type="hidden" name="id" value={gw.id} />
                        <select name="status" className="text-xs border rounded px-1 py-1">
                          <option value="upcoming">upcoming</option>
                          <option value="open">open</option>
                          <option value="locked">locked</option>
                          <option value="completed">completed</option>
                        </select>
                        <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Set</button>
                      </form>
                      <ConfirmDeleteButton
                        action={deleteGameweek}
                        hiddenFields={{ id: gw.id }}
                        confirmText={`Delete GW${gw.number}? This removes all picks and points for this gameweek too.`}
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <form action={updateDeadline} className="flex gap-2 items-center">
                      <input type="hidden" name="id" value={gw.id} />
                      <label className="text-xs text-gray-500">Deadline:</label>
                      <input
                        type="datetime-local"
                        name="deadline"
                        defaultValue={new Date(gw.deadline).toISOString().slice(0, 16)}
                        className="text-xs border rounded px-2 py-1"
                      />
                      <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Update</button>
                    </form>
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                      Gameweek Question {existingQuestion ? '(set)' : '(not set)'}
                    </p>
                    <GameweekQuestionForm
                      gameweekId={gw.id}
                      existingQuestion={existingQuestion ?? null}
                      saveQuestion={saveQuestion}
                    />
                    {existingQuestion && (
                      <div className="mt-2">
                        <ConfirmDeleteButton
                          action={deleteQuestion}
                          hiddenFields={{ id: existingQuestion.id }}
                          label="Delete question"
                          confirmText="Delete this question?"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No gameweeks yet.</p>
        )}
      </div>
    </div>
  )
}