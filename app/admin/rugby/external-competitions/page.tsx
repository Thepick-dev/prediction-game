import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { redirect } from 'next/navigation'
import { pullNextBatch, checkQuota, backfillMissingPositions, type ExternalCompetition } from '../../../lib/rugbyExternalPerformanceSync'
import { recomputeAllRugbyRatings } from '../../../lib/rugbyRating'
import { recomputeAllRugbyPlayerValues } from '../../../lib/rugbyPlayerDatabase'

async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

// The daily-cron "safe budget" — leaves headroom on the shared 100/day
// SportsAPI Pro quota rather than planning to spend right up to the
// limit. This admin action uses the same constant so a manual click
// behaves exactly like tomorrow's automatic run would (Phase 5).
const SAFE_DAILY_BUDGET = 75

async function pullCompetition(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const id = Number(formData.get('competition_id'))
  const apiKey = process.env.SPORTS_API_PRO_KEY
  if (!apiKey) return

  // Everything below wrapped in one try/catch: a crashed quota check took
  // down this whole action with Next.js's generic error page this
  // session (real, not hypothetical) — any future unexpected failure
  // should land as a visible message on this page instead, same "no
  // silent failure" rule as everywhere else in this codebase.
  try {
    const { data: comp } = await supabase.schema('rugby').from('external_competitions').select('*').eq('id', id).single()
    if (!comp) return

    const quota = await checkQuota(apiKey)
    const budget = Math.max(0, Math.min(quota.remaining - 10, SAFE_DAILY_BUDGET))

    const summary = await pullNextBatch(supabase, comp as ExternalCompetition, apiKey, budget)

    // Kit, 2026-09-25: ratings and values must update automatically as
    // part of every pull, never a separate manual step.
    if (summary.playerRowsStored > 0) {
      await recomputeAllRugbyRatings(supabase)
      await recomputeAllRugbyPlayerValues(supabase)
    }

    await supabase.schema('rugby').from('external_competitions').update({
      last_pull_summary: summary,
      last_pull_at: new Date().toISOString(),
    }).eq('id', id)
  } catch (e: any) {
    await supabase.schema('rugby').from('external_competitions').update({
      last_pull_summary: { errors: [`Unexpected failure: ${e?.message ?? String(e)}`], stoppedReason: 'quota', matchesPulled: 0, playerRowsStored: 0, newPlayersCreated: 0, requestsUsed: 0, fullyPulled: false, roundsChecked: 0, competition: '' },
      last_pull_at: new Date().toISOString(),
    }).eq('id', id)
  }
}

async function backfillPositions(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const id = Number(formData.get('competition_id'))
  const apiKey = process.env.SPORTS_API_PRO_KEY
  if (!apiKey) return

  try {
    const { data: comp } = await supabase.schema('rugby').from('external_competitions').select('*').eq('id', id).single()
    if (!comp) return

    const quota = await checkQuota(apiKey)
    const budget = Math.max(0, Math.min(quota.remaining - 10, SAFE_DAILY_BUDGET))

    const summary = await backfillMissingPositions(supabase, comp as ExternalCompetition, apiKey, budget)

    // Kit, 2026-09-25: ratings and values update automatically whenever
    // new data (here: newly-filled positions) changes what can be rated.
    if (summary.playersUpdated > 0) {
      await recomputeAllRugbyRatings(supabase)
      await recomputeAllRugbyPlayerValues(supabase)
    }

    await supabase.schema('rugby').from('external_competitions').update({
      last_backfill_summary: summary,
    }).eq('id', id)
  } catch (e: any) {
    await supabase.schema('rugby').from('external_competitions').update({
      last_backfill_summary: { errors: [`Unexpected failure: ${e?.message ?? String(e)}`], matchesChecked: 0, playersUpdated: 0, requestsUsed: 0, stoppedReason: 'quota' },
    }).eq('id', id)
  }
}

export default async function ExternalCompetitionsPage() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')

  const { data: competitions } = await supabase.schema('rugby').from('external_competitions').select('*').order('id')

  const apiKey = process.env.SPORTS_API_PRO_KEY
  const quota = apiKey ? await checkQuota(apiKey).catch(() => null) : null

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Rugby — External Competitions</h1>
      <p className="text-sm text-gray-600 mb-4">
        Player performance data pulled from SportsAPI Pro, outside the live Six Nations game.
        {quota && <span> Today&apos;s quota: {quota.remaining} of {quota.dailyLimit} requests left.</span>}
      </p>

      <div className="space-y-3">
        {(competitions ?? []).map((c: any) => (
          <div key={c.id} className="border rounded-lg p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="font-bold">{c.name}</div>
                <div className="text-xs text-gray-500">
                  {c.fully_pulled ? 'Fully pulled' : `Up to round ${c.last_pulled_round}`}
                  {' · '}{c.is_actively_pulling ? 'Actively pulling' : 'Paused'}
                  {c.last_pull_at && <span> · last ran {new Date(c.last_pull_at).toLocaleString('en-GB')}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <form action={pullCompetition}>
                  <input type="hidden" name="competition_id" value={c.id} />
                  <button type="submit" className="px-3 py-1.5 bg-black text-white rounded text-sm" disabled={!c.current_season_id}>
                    Pull next batch
                  </button>
                </form>
                <form action={backfillPositions}>
                  <input type="hidden" name="competition_id" value={c.id} />
                  <button type="submit" className="px-3 py-1.5 border border-black rounded text-sm" disabled={!c.current_season_id}>
                    Backfill positions
                  </button>
                </form>
              </div>
            </div>
            {c.last_pull_summary && (
              <div className="mt-2 text-xs text-gray-700 bg-gray-50 rounded p-2">
                Last pull: {c.last_pull_summary.matchesPulled} matches, {c.last_pull_summary.playerRowsStored} player rows,{' '}
                {c.last_pull_summary.newPlayersCreated} new players, {c.last_pull_summary.requestsUsed} requests used
                {' '}(stopped: {c.last_pull_summary.stoppedReason}).
                {c.last_pull_summary.errors?.length > 0 && (
                  <div className="text-red-600 mt-1">{c.last_pull_summary.errors.length} error(s): {c.last_pull_summary.errors.slice(0, 3).join('; ')}</div>
                )}
              </div>
            )}
            {c.last_backfill_summary && (
              <div className="mt-2 text-xs text-gray-700 bg-gray-50 rounded p-2">
                Last position backfill: {c.last_backfill_summary.matchesChecked} matches checked, {c.last_backfill_summary.playersUpdated} players updated,{' '}
                {c.last_backfill_summary.requestsUsed} requests used (stopped: {c.last_backfill_summary.stoppedReason}).
                {c.last_backfill_summary.errors?.length > 0 && (
                  <div className="text-red-600 mt-1">{c.last_backfill_summary.errors.length} error(s): {c.last_backfill_summary.errors.slice(0, 3).join('; ')}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
