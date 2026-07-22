import { createServerSupabaseClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'
import FixtureManager from './FixtureManager'

export default async function FixturesPage() {
  const supabase = await createServerSupabaseClient()

  const { data: gameweeks } = await supabase
    .from('gameweeks')
    .select('id, number, competitions(name)')
    .order('number', { ascending: true })

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name')
    .order('name', { ascending: true })

  const { data: unassignedFixtures } = await supabase
    .from('fixtures')
    .select('*')
    .is('gameweek_id', null)
    .order('kickoff_time', { ascending: true })

  async function createFixture(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    await supabase.from('fixtures').insert({
      gameweek_id: formData.get('gameweek_id') as string,
      home_team_id: parseInt(formData.get('home_team_id') as string),
      away_team_id: parseInt(formData.get('away_team_id') as string),
      kickoff_time: formData.get('kickoff_time') as string,
      status: 'scheduled'
    })
    redirect('/admin/fixtures')
  }

  async function assignFixture(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    await supabase
      .from('fixtures')
      .update({ gameweek_id: formData.get('gameweek_id') as string })
      .eq('id', formData.get('id') as string)
    redirect('/admin/fixtures')
  }

  const teamMap: Record<number, string> = {}
  teams?.forEach(t => { teamMap[t.id] = t.name })

  const gwList = (gameweeks ?? []).map(g => ({
    id: g.id,
    number: g.number,
    competitionName: (g.competitions as any)?.name ?? ''
  }))

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Fixtures</h1>

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-4">Add Fixture Manually</h2>
        <form action={createFixture} className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Gameweek</label>
            <select name="gameweek_id" className="w-full border rounded px-3 py-2 text-sm" required>
              <option value="">Select gameweek</option>
              {gameweeks?.map(gw => (
                <option key={gw.id} value={gw.id}>GW{gw.number} — {(gw.competitions as any)?.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Kickoff Time</label>
            <input name="kickoff_time" type="datetime-local" className="w-full border rounded px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Home Team</label>
            <select name="home_team_id" className="w-full border rounded px-3 py-2 text-sm" required>
              <option value="">Select team</option>
              {teams?.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Away Team</label>
            <select name="away_team_id" className="w-full border rounded px-3 py-2 text-sm" required>
              <option value="">Select team</option>
              {teams?.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
              Add Fixture
            </button>
          </div>
        </form>
      </div>

      <FixtureManager teamMap={teamMap} gameweeks={gwList} />

      {unassignedFixtures && unassignedFixtures.length > 0 && (
        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-4">Unassigned Fixtures ({unassignedFixtures.length})</h2>
          <p className="text-sm text-gray-500 mb-4">These fixtures have been synced but not yet assigned to a gameweek.</p>
          <div className="space-y-2">
            {unassignedFixtures.map(f => (
              <div key={f.id} className="flex items-center justify-between border rounded px-4 py-2">
                <div className="text-sm">
                  <span className="font-medium">{teamMap[f.home_team_id]}</span>
                  <span className="text-gray-400 mx-2">vs</span>
                  <span className="font-medium">{teamMap[f.away_team_id]}</span>
                  <span className="text-gray-400 ml-3 text-xs">
                    {new Date(f.kickoff_time).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}
                  </span>
                </div>
                <form action={assignFixture} className="flex gap-2">
                  <input type="hidden" name="id" value={f.id} />
                  <select name="gameweek_id" className="text-xs border rounded px-2 py-1" required>
                    <option value="">Assign to gameweek</option>
                    {gameweeks?.map(gw => (
                      <option key={gw.id} value={gw.id}>GW{gw.number} — {(gw.competitions as any)?.name}</option>
                    ))}
                  </select>
                  <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Assign</button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}