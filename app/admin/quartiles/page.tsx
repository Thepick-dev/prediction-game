import { createServerSupabaseClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function QuartilesPage() {
  const supabase = await createServerSupabaseClient()

  const [{ data: competitions }, { data: teams }] = await Promise.all([
    supabase.from('competitions').select('id, name').order('created_at', { ascending: false }),
    supabase.from('teams').select('id, name').order('name')
  ])

  const activeComp = competitions?.[0]

  const { data: assignments } = activeComp ? await supabase
    .from('tier_assignments')
    .select('team_id, tier')
    .eq('competition_id', activeComp.id) : { data: [] }

  const assignmentMap: Record<number, number> = {}
  assignments?.forEach(a => { assignmentMap[a.team_id] = a.tier })

  async function assignTier(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const competition_id = formData.get('competition_id') as string
    const team_id = parseInt(formData.get('team_id') as string)
    const tier = parseInt(formData.get('tier') as string)

    await supabase
      .from('tier_assignments')
      .upsert({ competition_id, team_id, tier }, { onConflict: 'competition_id,team_id' })

    redirect('/admin/quartiles')
  }

  async function resetToLeagueTable(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const competition_id = formData.get('competition_id') as string

    const { data: positions } = await supabase
      .from('team_league_positions')
      .select('team_id, position')
      .order('recorded_at', { ascending: false })
      .order('position', { ascending: true })
      .limit(20)

    if (!positions || positions.length === 0) {
      redirect('/admin/quartiles')
      return
    }

    const seen = new Set()
    const unique = positions.filter(p => {
      if (seen.has(p.team_id)) return false
      seen.add(p.team_id)
      return true
    })

    const upserts = unique.slice(0, 20).map((p, index) => ({
      competition_id,
      team_id: p.team_id,
      tier: index < 5 ? 1 : index < 10 ? 2 : index < 15 ? 3 : 4
    }))

    await supabase
      .from('tier_assignments')
      .upsert(upserts, { onConflict: 'competition_id,team_id' })

    redirect('/admin/quartiles')
  }

  const quarters = [1, 2, 3, 4]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Quartile Management</h1>

      {!activeComp ? (
        <p className="text-gray-500">No competitions found. Create one first.</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <p className="text-gray-500">Managing: <strong>{activeComp.name}</strong></p>
            <form action={resetToLeagueTable}>
              <input type="hidden" name="competition_id" value={activeComp.id} />
              <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
                Reset to League Table
              </button>
            </form>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {quarters.map(q => (
              <div key={q} className="bg-white border rounded-lg p-4">
                <h2 className="font-bold mb-3">
                  Q{q} — {q === 1 ? 'Elite' : q === 2 ? 'Solid' : q === 3 ? 'Mid-table' : 'Underdogs'}
                </h2>
                <div className="space-y-1">
                  {teams?.filter(t => assignmentMap[t.id] === q).map(team => (
                    <div key={team.id} className="text-sm py-1 border-b last:border-0">
                      {team.name}
                    </div>
                  ))}
                  {teams?.filter(t => assignmentMap[t.id] === q).length === 0 && (
                    <p className="text-xs text-gray-400">No teams assigned</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white border rounded-lg p-6">
            <h2 className="font-bold mb-4">Assign Teams</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2">Team</th>
                  <th className="pb-2">Current Quartile</th>
                  <th className="pb-2">Change To</th>
                </tr>
              </thead>
              <tbody>
                {teams?.map(team => (
                  <tr key={team.id} className="border-b last:border-0">
                    <td className="py-2">{team.name}</td>
                    <td className="py-2">
                      {assignmentMap[team.id] ? `Q${assignmentMap[team.id]}` : <span className="text-gray-400">Unassigned</span>}
                    </td>
                    <td className="py-2">
                      <form action={assignTier} className="flex gap-1">
                        <input type="hidden" name="competition_id" value={activeComp.id} />
                        <input type="hidden" name="team_id" value={team.id} />
                        <select name="tier" className="text-xs border rounded px-1 py-1">
                          <option value="1">Q1 — Elite</option>
                          <option value="2">Q2 — Solid</option>
                          <option value="3">Q3 — Mid-table</option>
                          <option value="4">Q4 — Underdogs</option>
                        </select>
                        <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">
                          Set
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
