import { createServerSupabaseClient } from '../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../lib/supabase-admin'
import { requireAdmin } from '../../lib/require-admin'
import { calculateScoring } from '../../lib/scoring'
import { londonInputToUtcISOString, utcToLondonInputValue } from '../../lib/londonTime'
import { redirect } from 'next/navigation'
import ConfirmDeleteButton from '../components/confirm-delete-button'
import ConfirmActionButton from '../components/confirm-action-button'
import CompetitionFilter from '../components/competition-filter'
import GameweekQuestionForm from '../components/gameweek-question-form'

// Every write below goes through this — Server Actions are reachable as
// their own endpoint, not just "the button on a page only admins can see",
// so the page layout's own admin check isn't a guarantee for these.
async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

export default async function GameweeksPage({ searchParams }: { searchParams: Promise<{ competition_id?: string; questionError?: string; recalcResult?: string }> }) {
  const { competition_id: selectedCompetitionId, questionError, recalcResult } = await searchParams
  const supabase = await createServerSupabaseClient()

  let gameweeksQuery = supabase.from('gameweeks').select('*, competitions(name)').order('number', { ascending: true })
  if (selectedCompetitionId) gameweeksQuery = gameweeksQuery.eq('competition_id', selectedCompetitionId)

  const [{ data: competitions }, { data: gameweeks }, { data: questions }, { data: snapshots }] = await Promise.all([
    supabase.from('competitions').select('id, name').order('created_at', { ascending: false }),
    gameweeksQuery,
    supabase.from('gameweek_questions').select('*'),
    // Its own request, same isolation reasoning as everywhere else in
    // this codebase — a problem reading snapshot history must never be
    // able to take the rest of this page (still fully usable via the
    // manual status dropdown) down with it.
    supabase.from('gameweek_snapshots').select('*').order('taken_at', { ascending: false }),
  ])

  const questionsByGw: Record<string, any> = {}
  questions?.forEach(q => { questionsByGw[q.gameweek_id] = q })

  // Most recent snapshot per gameweek — snapshots is already sorted
  // newest-first, so the first one seen per gameweek_id wins.
  const latestSnapshotByGw: Record<string, any> = {}
  snapshots?.forEach(s => { if (!latestSnapshotByGw[s.gameweek_id]) latestSnapshotByGw[s.gameweek_id] = s })
  const snapshotCountByGw: Record<string, number> = {}
  snapshots?.forEach(s => { snapshotCountByGw[s.gameweek_id] = (snapshotCountByGw[s.gameweek_id] || 0) + 1 })

  async function createGameweek(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    await supabase.from('gameweeks').insert({
      competition_id: formData.get('competition_id') as string,
      number: parseInt(formData.get('number') as string),
      deadline: londonInputToUtcISOString(formData.get('deadline') as string),
      status: 'upcoming'
    })
    redirect('/admin/gameweeks')
  }

  async function updateStatus(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
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
        // Only fall back to a fresh, LIVE copy of tier_assignments if this
        // gameweek never went through Prepare & Open (an older gameweek,
        // or the raw status dropdown was used to skip it) — a gameweek
        // that already has quartiles frozen from its own snapshot must
        // never have those silently overwritten by whatever the table
        // happens to say weeks later, at completion time.
        const { data: existingQuartiles } = await supabase
          .from('gameweek_quartiles')
          .select('team_id')
          .eq('gameweek_id', id)
          .limit(1)

        if (!existingQuartiles || existingQuartiles.length === 0) {
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
        }

        await calculateScoring(supabase, id)
      }
    }

    redirect('/admin/gameweeks')
  }

  // Captures the league table, quartiles, and fixtures as they stand
  // right now into a permanent snapshot row, AND freezes gameweek_quartiles
  // from it immediately — rather than waiting until completion, when the
  // table may have moved on from whatever players actually saw while
  // picking. Can be re-run any number of times before the gameweek is
  // actually opened (each call is its own row, so nothing is lost —
  // it's a genuine audit trail, not a single overwritten value).
  async function prepareSnapshot(formData: FormData) {
    'use server'
    // Needs both the caller's own session (to check admin AND record who
    // took the snapshot) and the service-role client for the actual writes
    // — requireAdminAction() only hands back the latter, so this one stays
    // inline rather than using the shared helper.
    const session = await createServerSupabaseClient()
    const user = await requireAdmin(session)
    if (!user) redirect('/')
    const supabase = createAdminSupabaseClient()
    const id = formData.get('id') as string

    const { data: gw } = await supabase.from('gameweeks').select('competition_id').eq('id', id).single()
    if (!gw) redirect('/admin/gameweeks')

    const [{ data: standings }, { data: quartiles }, { data: fixtures }] = await Promise.all([
      supabase.from('team_league_positions').select('*').order('recorded_at', { ascending: false }).limit(20),
      supabase.from('tier_assignments').select('team_id, tier').eq('competition_id', gw!.competition_id),
      supabase.from('fixtures').select('id, home_team_id, away_team_id, kickoff_time').eq('gameweek_id', id),
    ])

    await supabase.from('gameweek_snapshots').insert({
      gameweek_id: id,
      taken_by: user.id,
      standings: standings ?? [],
      quartiles: quartiles ?? [],
      fixtures: fixtures ?? [],
    })

    if (quartiles && quartiles.length > 0) {
      await supabase
        .from('gameweek_quartiles')
        .upsert(
          quartiles.map(q => ({ gameweek_id: id, team_id: q.team_id, quartile: q.tier })),
          { onConflict: 'gameweek_id,team_id' }
        )
    }

    redirect('/admin/gameweeks')
  }

  async function confirmOpen(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    await supabase.from('gameweeks').update({ status: 'open' }).eq('id', formData.get('id') as string)
    redirect('/admin/gameweeks')
  }

  async function reopenGameweek(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    await supabase.from('gameweeks').update({ status: 'open' }).eq('id', formData.get('id') as string)
    redirect('/admin/gameweeks')
  }

  // A standalone way to re-run scoring — separate from the status
  // dropdown's "completed" side effect, so it can be used to correct a
  // gameweek's points (after fixing a result, a quartile, a pick, etc.)
  // without needing to fake a status change to trigger it.
  async function recalculatePoints(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const id = formData.get('id') as string
    const result = await calculateScoring(supabase, id)
    const message = 'error' in result ? `error: ${result.error}` : 'success' in result ? `recalculated ${result.points_calculated} picks` : 'no picks found'
    redirect(`/admin/gameweeks?recalcResult=${encodeURIComponent(message)}`)
  }

  async function updateDeadline(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    await supabase
      .from('gameweeks')
      .update({ deadline: londonInputToUtcISOString(formData.get('deadline') as string) })
      .eq('id', formData.get('id') as string)
    redirect('/admin/gameweeks')
  }

  async function deleteGameweek(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
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
    const supabase = await requireAdminAction()
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

    const { error } = existing_id
      ? await supabase.from('gameweek_questions').update({
          question, question_type, option_a, option_b, option_c, option_d
        }).eq('id', existing_id)
      : await supabase.from('gameweek_questions').insert({
          gameweek_id, question, question_type, option_a, option_b, option_c, option_d
        })

    if (error) {
      redirect(`/admin/gameweeks?questionError=${encodeURIComponent(error.message)}`)
    }
    redirect('/admin/gameweeks')
  }

  async function deleteQuestion(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    await supabase.from('gameweek_questions').delete().eq('id', formData.get('id') as string)
    redirect('/admin/gameweeks')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Gameweeks</h1>
        <CompetitionFilter competitions={competitions ?? []} />
      </div>

      {questionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6 text-sm">
          Couldn&apos;t save that question: {questionError}
        </div>
      )}

      {recalcResult && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-lg p-4 mb-6 text-sm">
          Recalculate: {recalcResult}
        </div>
      )}

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
                        defaultValue={utcToLondonInputValue(gw.deadline)}
                        className="text-xs border rounded px-2 py-1"
                      />
                      <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Update</button>
                    </form>
                  </div>

                  <div className="border-t pt-4 mb-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Snapshot &amp; Scoring</p>
                    {(() => {
                      const snapshot = latestSnapshotByGw[gw.id]
                      const snapshotCount = snapshotCountByGw[gw.id] ?? 0
                      return (
                        <>
                          {snapshot ? (
                            <div className="bg-gray-50 border rounded-lg p-3 mb-3 text-xs text-gray-600">
                              <p className="mb-1">
                                Last snapshot: {new Date(snapshot.taken_at).toLocaleString('en-GB', {
                                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
                                })}
                                {snapshotCount > 1 ? ` (${snapshotCount} taken total)` : ''}
                              </p>
                              <p>
                                {Array.isArray(snapshot.standings) ? snapshot.standings.length : 0} teams in table
                                {' · '}{Array.isArray(snapshot.quartiles) ? snapshot.quartiles.length : 0} quartile assignments
                                {' · '}{Array.isArray(snapshot.fixtures) ? snapshot.fixtures.length : 0} fixtures
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 mb-3">No snapshot taken yet — the league table, quartiles, and fixtures haven&apos;t been frozen for this gameweek.</p>
                          )}

                          <div className="flex gap-2 flex-wrap items-center">
                            {!snapshot && (
                              <form action={prepareSnapshot}>
                                <input type="hidden" name="id" value={gw.id} />
                                <button type="submit" className="text-xs bg-blue-600 text-white rounded px-3 py-1.5">
                                  📸 Prepare to Open
                                </button>
                              </form>
                            )}
                            {snapshot && gw.status === 'upcoming' && (
                              <form action={confirmOpen}>
                                <input type="hidden" name="id" value={gw.id} />
                                <button type="submit" className="text-xs bg-green-600 text-white rounded px-3 py-1.5">
                                  ✓ Confirm &amp; Open
                                </button>
                              </form>
                            )}
                            {snapshot && (
                              <form action={prepareSnapshot}>
                                <input type="hidden" name="id" value={gw.id} />
                                <button type="submit" className="text-xs border rounded px-3 py-1.5 hover:bg-gray-50">
                                  🔄 Correct quartiles (re-take snapshot)
                                </button>
                              </form>
                            )}
                            {(gw.status === 'locked' || gw.status === 'completed') && (
                              <>
                                <ConfirmActionButton
                                  action={recalculatePoints}
                                  hiddenFields={{ id: gw.id }}
                                  label="🔁 Recalculate Points"
                                  confirmText="Re-score this gameweek using current results and picks?"
                                  confirmLabel="Yes, recalculate"
                                  className="text-xs bg-blue-600 text-white rounded px-3 py-1.5"
                                />
                                <ConfirmActionButton
                                  action={reopenGameweek}
                                  hiddenFields={{ id: gw.id }}
                                  label="↩ Reopen"
                                  confirmText="Reopen this gameweek? Picks become editable again."
                                  confirmLabel="Yes, reopen"
                                  className="text-xs bg-yellow-600 text-white rounded px-3 py-1.5"
                                />
                              </>
                            )}
                          </div>
                          {snapshot && gw.status === 'completed' && (
                            <p className="text-xs text-gray-400 mt-2">
                              Correcting quartiles here only updates what future recalculations will use —
                              it doesn&apos;t retroactively change existing points. Click Recalculate Points
                              afterward to actually apply the correction.
                            </p>
                          )}
                        </>
                      )
                    })()}
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