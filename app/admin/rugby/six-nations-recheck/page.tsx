import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { redirect } from 'next/navigation'
import { backfillMissingSixNationsPlayers, checkQuota } from '../../../lib/rugbyExternalPerformanceSync'
import { recomputeAllRugbyRatings } from '../../../lib/rugbyRating'
import { recomputeAllRugbyPlayerValues } from '../../../lib/rugbyPlayerDatabase'

async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

// Same shared daily-quota safety margin as /admin/rugby/external-competitions.
const SAFE_DAILY_BUDGET = 75

async function runRecheck() {
  'use server'
  const supabase = await requireAdminAction()
  const apiKey = process.env.SPORTS_API_PRO_KEY
  if (!apiKey) return

  // redirect() works by throwing internally — it must never sit inside a
  // try/catch, or Next.js's own redirect throw gets swallowed and
  // misreported as "Unexpected failure" instead of actually redirecting.
  let resultPayload: object
  try {
    const quota = await checkQuota(apiKey)
    const budget = Math.max(0, Math.min(quota.remaining - 10, SAFE_DAILY_BUDGET))

    const summary = await backfillMissingSixNationsPlayers(supabase, apiKey, budget)

    if (summary.playersAdded > 0) {
      await recomputeAllRugbyRatings(supabase)
      await recomputeAllRugbyPlayerValues(supabase)
    }
    resultPayload = summary
  } catch (e: any) {
    resultPayload = { errors: [`Unexpected failure: ${e?.message ?? String(e)}`] }
  }
  // No dedicated table for this one-off admin tool's last-run summary —
  // shown via a redirect query param instead (small, transient).
  redirect(`/admin/rugby/six-nations-recheck?result=${encodeURIComponent(JSON.stringify(resultPayload))}`)
}

export default async function SixNationsRecheckPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')

  const params = await searchParams
  const result = params.result ? JSON.parse(params.result) : null

  const apiKey = process.env.SPORTS_API_PRO_KEY
  const quota = apiKey ? await checkQuota(apiKey).catch(() => null) : null

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Rugby — Six Nations Data Recheck</h1>
      <p className="text-sm text-gray-600 mb-4">
        The original Six Nations historical archive under-captured some full squads (confirmed live: a real match was
        missing 8 real Wales players, starters included, not just the substitute). This re-checks every already-finished
        Six Nations fixture against SportsAPI Pro and adds whichever real players are missing — never touches anyone
        already correctly stored. Costs real API quota, same daily-safety-margin as the external competitions pull, so
        this may take several days&apos; clicks to get through the full archive.
        {quota && <span> Today&apos;s quota: {quota.remaining} of {quota.dailyLimit} requests left.</span>}
      </p>

      <form action={runRecheck}>
        <button type="submit" className="px-4 py-2 bg-black text-white rounded text-sm font-bold">
          Run recheck now
        </button>
      </form>

      {result && (
        <div className="mt-4 text-sm text-gray-700 bg-gray-50 rounded p-3">
          {result.errors?.length > 0 && !result.fixturesChecked && (
            <div className="text-red-600">{result.errors.join('; ')}</div>
          )}
          {result.fixturesChecked != null && (
            <>
              <div>Fixtures checked: {result.fixturesChecked}, matched on SportsAPI Pro: {result.fixturesMatched}</div>
              <div>Player performances added: {result.playersAdded}, new players created: {result.newPlayersCreated}</div>
              <div>Requests used: {result.requestsUsed} (stopped: {result.stoppedReason})</div>
              {result.errors?.length > 0 && (
                <div className="text-red-600 mt-1">{result.errors.length} error(s): {result.errors.slice(0, 5).join('; ')}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
