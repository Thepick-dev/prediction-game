import { createServerSupabaseClient } from '../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../lib/supabase-admin'
import { requireAdmin } from '../../lib/require-admin'
import { redirect } from 'next/navigation'
import ConfirmDeleteButton from '../components/confirm-delete-button'

// Every write below goes through this — Server Actions are reachable as
// their own endpoint, not just "the button on a page only admins can see",
// so the page layout's own admin check isn't a guarantee for these.
async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

export default async function PostponedPage({
  searchParams,
}: {
  searchParams: Promise<{ freed?: string }>
}) {
  const { freed } = await searchParams
  const supabase = await createServerSupabaseClient()

  const { data: gameweeks } = await supabase
    .from('gameweeks')
    .select('id, number, competition_id, competitions(name)')
    .order('number')

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, home_team_id, away_team_id, status, postponed_handling, postponed_points, gameweek_id, home_team:teams!fixtures_home_team_id_fkey(name), away_team:teams!fixtures_away_team_id_fkey(name)')
    .not('gameweek_id', 'is', null)
    .order('kickoff_time')

  async function handlePostponement(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const fixture_id = parseInt(formData.get('fixture_id') as string)
    const handling = formData.get('handling') as string
    const custom_points = formData.get('custom_points') as string

    await supabase
      .from('fixtures')
      .update({
        status: 'postponed',
        postponed_handling: handling,
        postponed_points: handling === 'custom_points' ? parseInt(custom_points) : null
      })
      .eq('id', fixture_id)

    redirect('/admin/postponed')
  }

  // Matches what the "Void gameweek" / "Allow re-picks" text on this page
  // already promises ("their team and player selections are not used up" /
  // "their original pick is cleared") — deleting the pick is what actually
  // frees up that team/player for both. Deliberately doesn't touch "custom
  // points" fixtures — those picks are meant to keep counting as used.
  async function freeUpAffectedPicks(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const fixture_id = parseInt(formData.get('fixture_id') as string)
    const gameweek_id = formData.get('gameweek_id') as string
    const home_team_id = parseInt(formData.get('home_team_id') as string)
    const away_team_id = parseInt(formData.get('away_team_id') as string)

    await supabase
      .from('picks')
      .delete()
      .eq('gameweek_id', gameweek_id)
      .in('team_id', [home_team_id, away_team_id])

    redirect(`/admin/postponed?freed=${fixture_id}`)
  }

  async function clearPostponement(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const fixture_id = parseInt(formData.get('fixture_id') as string)

    await supabase
      .from('fixtures')
      .update({
        status: 'scheduled',
        postponed_handling: null,
        postponed_points: null
      })
      .eq('id', fixture_id)

    redirect('/admin/postponed')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Postponed Fixtures</h1>
      <p className="text-gray-500 text-sm mb-8">Mark fixtures as postponed and choose how to handle scoring for players who picked that team. What&apos;s actually decided is up to the Sporting Panel — see the Rules page — this is just the toolkit for carrying it out.</p>

      {freed && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-sm text-green-700">
          Affected picks were deleted — those players&apos; team and player selections are free to use again, and they can submit a new pick for this gameweek if it&apos;s still open (or use Edit Pick to set one for them directly).
        </div>
      )}

      <div className="bg-white border rounded-lg p-6 mb-6">
        <h2 className="font-bold mb-2">How postponement handling works</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p><strong>Void gameweek</strong> — everyone who picked the postponed team scores zero for the whole gameweek. Use &quot;Free up affected picks&quot; below to also return their team and player selections, unused.</p>
          <p><strong>Allow re-picks</strong> — same scoring as void. Use &quot;Free up affected picks&quot; to clear their original pick so they can submit a new one (or set one for them via Edit Pick).</p>
          <p><strong>Custom points</strong> — players who picked the postponed team receive a fixed number of points set by admin. Their team and players stay counted as used — don&apos;t free up picks for this option.</p>
          <p className="pt-1">For anything these three don&apos;t cover, <a href="/admin/edit-pick" className="underline">Edit Pick</a> gives full manual control over any individual pick, and a gameweek can always be rescored from scratch via <a href="/admin/sync" className="underline">Recalculate Scoring</a> on the Sync page once things are sorted.</p>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Fixture</th>
              <th className="pb-2">Gameweek</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Handling</th>
              <th className="pb-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {fixtures?.map(fixture => {
              const gw = gameweeks?.find(g => g.id === fixture.gameweek_id)
              return (
                <tr key={fixture.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">
                    {(fixture.home_team as any)?.name} vs {(fixture.away_team as any)?.name}
                  </td>
                  <td className="py-2">
                    {gw ? `GW${gw.number}` : '—'}
                  </td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      fixture.status === 'postponed' ? 'bg-red-100 text-red-700' :
                      fixture.status === 'finished' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {fixture.status}
                    </span>
                  </td>
                  <td className="py-2">
                    {fixture.postponed_handling ? (
                      <span className="text-xs text-gray-500">
                        {fixture.postponed_handling === 'void' ? 'Voided' :
                         fixture.postponed_handling === 'repick' ? 'Re-picks allowed' :
                         `Custom: ${fixture.postponed_points}pts`}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-2">
                    {fixture.status !== 'finished' && (
                      fixture.status === 'postponed' ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <form action={clearPostponement}>
                            <input type="hidden" name="fixture_id" value={fixture.id} />
                            <button type="submit" className="text-xs bg-gray-600 text-white rounded px-2 py-1">
                              Clear
                            </button>
                          </form>
                          {(fixture.postponed_handling === 'void' || fixture.postponed_handling === 'repick') && (
                            <ConfirmDeleteButton
                              action={freeUpAffectedPicks}
                              hiddenFields={{
                                fixture_id: String(fixture.id),
                                gameweek_id: fixture.gameweek_id ?? '',
                                home_team_id: String(fixture.home_team_id),
                                away_team_id: String(fixture.away_team_id),
                              }}
                              label="Free up affected picks"
                              confirmText="Delete every pick for either team in this gameweek?"
                            />
                          )}
                        </div>
                      ) : (
                        <form action={handlePostponement} className="flex gap-1 flex-wrap">
                          <input type="hidden" name="fixture_id" value={fixture.id} />
                          <select name="handling" className="text-xs border rounded px-1 py-1">
                            <option value="void">Void gameweek</option>
                            <option value="repick">Allow re-picks</option>
                            <option value="custom_points">Custom points</option>
                          </select>
                          <input
                            type="number"
                            name="custom_points"
                            placeholder="pts"
                            className="text-xs border rounded px-1 py-1 w-12"
                          />
                          <button type="submit" className="text-xs bg-red-600 text-white rounded px-2 py-1">
                            Mark Postponed
                          </button>
                        </form>
                      )
                    )}
                  </td>
                </tr>
              )
            })}
            {(!fixtures || fixtures.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-400">No fixtures assigned to gameweeks yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}