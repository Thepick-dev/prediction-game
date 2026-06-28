import { createServerSupabaseClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function FixturesPage() {
  const supabase = await createServerSupabaseClient()

  const [{ data: gameweeks }, { data: fixtures }] = await Promise.all([
    supabase
      .from('gameweeks')
      .select('id, number, competition_id, competitions(name)')
      .order('number', { ascending: true }),
    supabase
      .from('fixtures')
      .select('*, home_team:teams!fixtures_home_team_id_fkey(name), away_team:teams!fixtures_away_team_id_fkey(name)')
      .order('kickoff_time', { ascending: true })
      .limit(100)
  ])

  async function assignToGameweek(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    await supabase
      .from('fixtures')
      .update({ gameweek_id: formData.get('gameweek_id') as string })
      .eq('id', formData.get('fixture_id') as string)
    redirect('/admin/fixtures')
  }

  async function removeFromGameweek(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    await supabase
      .from('fixtures')
      .update({ gameweek_id: null })
      .eq('id', formData.get('fixture_id') as string)
    redirect('/admin/fixtures')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Fixtures</h1>
      <p className="text-gray-500 text-sm mb-6">Assign fixtures to gameweeks. Only fixtures assigned to a gameweek will be available for picks.</p>

      <div className="bg-white border rounded-lg p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Fixture</th>
              <th className="pb-2">Date</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Gameweek</th>
              <th className="pb-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {fixtures?.map((fixture) => (
              <tr key={fixture.id} className="border-b last:border-0">
                <td className="py-2 font-medium">
                  {(fixture.home_team as any)?.name} vs {(fixture.away_team as any)?.name}
                </td>
                <td className="py-2 text-gray-500">
                  {fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleDateString() : '—'}
                </td>
                <td className="py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    fixture.status === 'finished' ? 'bg-blue-100 text-blue-700' :
                    fixture.status === 'live' ? 'bg-green-100 text-green-700' :
                    fixture.status === 'postponed' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {fixture.status}
                  </span>
                </td>
                <td className="py-2">
                  {fixture.gameweek_id
                    ? `GW${gameweeks?.find(gw => gw.id === fixture.gameweek_id)?.number ?? '?'}`
                    : <span className="text-gray-400">Unassigned</span>
                  }
                </td>
                <td className="py-2">
                  {fixture.gameweek_id ? (
                    <form action={removeFromGameweek}>
                      <input type="hidden" name="fixture_id" value={fixture.id} />
                      <button type="submit" className="text-xs bg-red-600 text-white rounded px-2 py-1">
                        Remove
                      </button>
                    </form>
                  ) : (
                    <form action={assignToGameweek} className="flex gap-1">
                      <input type="hidden" name="fixture_id" value={fixture.id} />
                      <select name="gameweek_id" className="text-xs border rounded px-1 py-1">
                        <option value="">Select GW</option>
                        {gameweeks?.map((gw) => (
                          <option key={gw.id} value={gw.id}>
                            GW{gw.number} — {(gw.competitions as any)?.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">
                        Assign
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}