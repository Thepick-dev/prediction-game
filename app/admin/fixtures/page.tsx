import { createServerSupabaseClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function FixturesPage() {
  const supabase = await createServerSupabaseClient()

  const [{ data: fixtures }, { data: gameweeks }] = await Promise.all([
    supabase
      .from('fixtures')
      .select('id, home_team_id, away_team_id, kickoff_time, status, gameweek_id, home_team:teams!fixtures_home_team_id_fkey(name), away_team:teams!fixtures_away_team_id_fkey(name)')
      .order('kickoff_time', { ascending: true }),
    supabase
      .from('gameweeks')
      .select('id, number, competitions(name)')
      .order('number', { ascending: true })
  ])

  async function assignFixtures(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const gameweek_id = formData.get('gameweek_id') as string
    const fixture_ids = formData.getAll('fixture_ids') as string[]

    for (const fixture_id of fixture_ids) {
      await supabase
        .from('fixtures')
        .update({ gameweek_id })
        .eq('id', parseInt(fixture_id))
    }

    redirect('/admin/fixtures')
  }

  async function removeFromGameweek(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const fixture_id = formData.get('fixture_id') as string

    await supabase
      .from('fixtures')
      .update({ gameweek_id: null })
      .eq('id', parseInt(fixture_id))

    redirect('/admin/fixtures')
  }

  const unassigned = fixtures?.filter(f => !f.gameweek_id) ?? []
  const assigned = fixtures?.filter(f => f.gameweek_id) ?? []

  const gwMap: Record<string, string> = {}
  gameweeks?.forEach(g => {
    gwMap[g.id] = `GW${g.number} — ${(g.competitions as any)?.name ?? ''}`
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Fixtures</h1>

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-2">Assign Fixtures to Gameweek</h2>
        <p className="text-sm text-gray-500 mb-4">Select a gameweek, tick the fixtures you want to assign, then click Assign.</p>

        <form action={assignFixtures}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Gameweek</label>
            <select name="gameweek_id" required className="border rounded px-3 py-2 text-sm w-64">
              <option value="">Select gameweek...</option>
              {gameweeks?.map(gw => (
                <option key={gw.id} value={gw.id}>
                  GW{gw.number} — {(gw.competitions as any)?.name}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm mb-6">
            Assign Selected Fixtures
          </button>

          <div>
            <label className="block text-sm font-medium mb-2">Unassigned Fixtures</label>
            {unassigned.length === 0 ? (
              <p className="text-sm text-gray-400">All fixtures are assigned to a gameweek.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-96 overflow-y-auto border rounded p-3">
                {unassigned.map(fixture => (
                  <label key={fixture.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                    <input type="checkbox" name="fixture_ids" value={fixture.id} className="rounded" />
                    <span>
                      {(fixture.home_team as any)?.name} vs {(fixture.away_team as any)?.name}
                      {fixture.kickoff_time && (
                        <span className="text-gray-400 ml-2 text-xs">
                          {new Date(fixture.kickoff_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </form>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-4">Assigned Fixtures</h2>
        {assigned.length === 0 ? (
          <p className="text-sm text-gray-400">No fixtures assigned yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Fixture</th>
                <th className="pb-2">Date</th>
                <th className="pb-2">Gameweek</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {assigned.map(fixture => (
                <tr key={fixture.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">
                    {(fixture.home_team as any)?.name} vs {(fixture.away_team as any)?.name}
                  </td>
                  <td className="py-2 text-gray-500">
                    {fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short'
                    }) : '—'}
                  </td>
                  <td className="py-2">
                    {fixture.gameweek_id ? gwMap[fixture.gameweek_id] ?? '—' : '—'}
                  </td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      fixture.status === 'finished' ? 'bg-blue-100 text-blue-700' :
                      fixture.status === 'postponed' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {fixture.status}
                    </span>
                  </td>
                  <td className="py-2">
                    <form action={removeFromGameweek}>
                      <input type="hidden" name="fixture_id" value={fixture.id} />
                      <button type="submit" className="text-xs text-red-500 hover:text-red-700">
                        Remove
                      </button>
                    </form>
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