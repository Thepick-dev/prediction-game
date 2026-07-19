import { createServerSupabaseClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function QuartilesPage() {
  const supabase = await createServerSupabaseClient()

  const { data: competitions } = await supabase
    .from('competitions')
    .select('id, name')
    .in('status', ['active', 'upcoming'])
    .order('created_at', { ascending: false })

  const activeCompetition = competitions?.[0]

  const { data: assignments } = activeCompetition ? await supabase
    .from('tier_assignments')
    .select('team_id, tier, teams(id, name)')
    .eq('competition_id', activeCompetition.id)
    .order('tier', { ascending: true }) : { data: null }

  const { data: allTeams } = await supabase
    .from('teams')
    .select('id, name')
    .order('name', { ascending: true })

  const assignedTeamIds = new Set(assignments?.map(a => a.team_id) ?? [])
  const unassignedTeams = allTeams?.filter(t => !assignedTeamIds.has(t.id)) ?? []

  const tierGroups: Record<number, any[]> = { 1: [], 2: [], 3: [], 4: [] }
  assignments?.forEach(a => {
    if (tierGroups[a.tier]) {
      tierGroups[a.tier].push(a)
    }
  })

  async function assignTier(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    await supabase
      .from('tier_assignments')
      .upsert({
        competition_id: formData.get('competition_id') as string,
        team_id: parseInt(formData.get('team_id') as string),
        tier: parseInt(formData.get('tier') as string)
      }, { onConflict: 'competition_id,team_id' })
    redirect('/admin/quartiles')
  }

  async function removeAssignment(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    await supabase
      .from('tier_assignments')
      .delete()
      .eq('competition_id', formData.get('competition_id') as string)
      .eq('team_id', parseInt(formData.get('team_id') as string))
    redirect('/admin/quartiles')
  }

  async function resetToLeagueTable(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const competitionId = formData.get('competition_id') as string

    // Clear existing assignments first, so relegated teams from a previous
    // season don't linger alongside newly promoted teams.
    await supabase
      .from('tier_assignments')
      .delete()
      .eq('competition_id', competitionId)

    const { data: positions } = await supabase
      .from('team_league_positions')
      .select('team_id, position')
      .order('position', { ascending: true })
      .limit(20)

    if (!positions || positions.length === 0) {
      redirect('/admin/quartiles')
    }

    await supabase
      .from('tier_assignments')
      .upsert(
        positions.map((p, i) => ({
          competition_id: competitionId,
          team_id: p.team_id,
          tier: Math.floor(i / 5) + 1
        })),
        { onConflict: 'competition_id,team_id' }
      )

    redirect('/admin/quartiles')
  }

  if (!activeCompetition) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-8">Quartiles</h1>
        <p className="text-gray-500 text-sm">No active or upcoming competition found.</p>
      </div>
    )
  }

  const tierLabels: Record<number, string> = {
    1: 'Q1 — Elite',
    2: 'Q2 — Solid',
    3: 'Q3 — Mid-Table',
    4: 'Q4 — Underdogs'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">Quartiles</h1>
          <p className="text-gray-500 text-sm">Managing: <strong>{activeCompetition.name}</strong></p>
        </div>
        <form action={resetToLeagueTable}>
          <input type="hidden" name="competition_id" value={activeCompetition.id} />
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
            Reset to League Table
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map(tier => (
          <div key={tier} className="bg-white border rounded-lg p-4">
            <h2 className="font-bold mb-3 text-sm">{tierLabels[tier]}</h2>
            <div className="space-y-2">
              {tierGroups[tier].length === 0 ? (
                <p className="text-xs text-gray-400">No teams assigned</p>
              ) : (
                tierGroups[tier].map((a: any) => (
                  <div key={a.team_id} className="flex items-center justify-between text-sm border-b pb-2">
                    <span>{a.teams?.name}</span>
                    <form action={removeAssignment}>
                      <input type="hidden" name="competition_id" value={activeCompetition.id} />
                      <input type="hidden" name="team_id" value={a.team_id} />
                      <button type="submit" className="text-xs text-red-500">✕</button>
                    </form>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {unassignedTeams.length > 0 && (
        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-4">Unassigned Teams ({unassignedTeams.length})</h2>
          <div className="space-y-2">
            {unassignedTeams.map(team => (
              <form key={team.id} action={assignTier} className="flex items-center justify-between border rounded px-4 py-2">
                <input type="hidden" name="competition_id" value={activeCompetition.id} />
                <input type="hidden" name="team_id" value={team.id} />
                <span className="text-sm">{team.name}</span>
                <select name="tier" className="text-xs border rounded px-2 py-1" required>
                  <option value="">Assign to tier</option>
                  <option value="1">Q1 — Elite</option>
                  <option value="2">Q2 — Solid</option>
                  <option value="3">Q3 — Mid-Table</option>
                  <option value="4">Q4 — Underdogs</option>
                </select>
                <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1 ml-2">Assign</button>
              </form>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}