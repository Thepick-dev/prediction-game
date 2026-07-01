import { createServerSupabaseClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function DraftTiersPage() {
  const supabase = await createServerSupabaseClient()

  const { data: competitions } = await supabase
    .from('competitions')
    .select('id, name, status')
    .order('created_at', { ascending: false })

  const activeComp = competitions?.find(c => c.status === 'active') ?? competitions?.[0]

  const [{ data: tiers }, { data: assignments }, { data: teams }] = await Promise.all([
    activeComp ? supabase
      .from('competition_draft_tiers')
      .select('*')
      .eq('competition_id', activeComp.id)
      .order('tier_number') : { data: [] },
    activeComp ? supabase
      .from('draft_tier_assignments')
      .select('tier_number, team_id')
      .eq('competition_id', activeComp.id) : { data: [] },
    supabase.from('teams').select('id, name').order('name')
  ])

  const assignmentMap: Record<number, number> = {}
  assignments?.forEach(a => { assignmentMap[a.team_id] = a.tier_number })

  async function createTier(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const competition_id = formData.get('competition_id') as string
    const tier_number = parseInt(formData.get('tier_number') as string)
    const tier_name = formData.get('tier_name') as string

    await supabase
      .from('competition_draft_tiers')
      .upsert({ competition_id, tier_number, tier_name }, { onConflict: 'competition_id,tier_number' })

    redirect('/admin/draft-tiers')
  }

  async function deleteTier(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const competition_id = formData.get('competition_id') as string
    const tier_number = parseInt(formData.get('tier_number') as string)

    await supabase
      .from('competition_draft_tiers')
      .delete()
      .eq('competition_id', competition_id)
      .eq('tier_number', tier_number)

    await supabase
      .from('draft_tier_assignments')
      .delete()
      .eq('competition_id', competition_id)
      .eq('tier_number', tier_number)

    redirect('/admin/draft-tiers')
  }

  async function assignTeam(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const competition_id = formData.get('competition_id') as string
    const team_id = parseInt(formData.get('team_id') as string)
    const tier_number = parseInt(formData.get('tier_number') as string)

    await supabase
      .from('draft_tier_assignments')
      .upsert({ competition_id, team_id, tier_number }, { onConflict: 'competition_id,team_id' })

    redirect('/admin/draft-tiers')
  }

  async function removeTeamFromTier(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const competition_id = formData.get('competition_id') as string
    const team_id = parseInt(formData.get('team_id') as string)

    await supabase
      .from('draft_tier_assignments')
      .delete()
      .eq('competition_id', competition_id)
      .eq('team_id', team_id)

    redirect('/admin/draft-tiers')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Draft Tiers</h1>
      <p className="text-gray-500 text-sm mb-8">Set up the tiers players pick their double-use teams from. This is completely separate from the scoring quartiles.</p>

      {!activeComp ? (
        <p className="text-gray-500">No competitions found. Create one first.</p>
      ) : (
        <>
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="font-bold mb-1">Managing: {activeComp.name}</h2>
            <p className="text-sm text-gray-500 mb-4">Create tiers below then assign teams to each one. Players will pick one team from each tier as their double-use selection when joining.</p>

            <form action={createTier} className="flex gap-3 items-end">
              <input type="hidden" name="competition_id" value={activeComp.id} />
              <div>
                <label className="block text-xs font-medium mb-1">Tier Number</label>
                <input
                  type="number"
                  name="tier_number"
                  min="1"
                  max="10"
                  placeholder="1"
                  className="border rounded px-3 py-2 text-sm w-24"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Tier Name</label>
                <input
                  type="text"
                  name="tier_name"
                  placeholder="e.g. Elite"
                  className="border rounded px-3 py-2 text-sm w-40"
                  required
                />
              </div>
              <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
                Add Tier
              </button>
            </form>
          </div>

          {tiers && tiers.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {tiers.map((tier: any) => (
                <div key={tier.tier_number} className="bg-white border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold">Tier {tier.tier_number} — {tier.tier_name}</h3>
                    <form action={deleteTier}>
                      <input type="hidden" name="competition_id" value={activeComp.id} />
                      <input type="hidden" name="tier_number" value={tier.tier_number} />
                      <button type="submit" className="text-xs text-red-500 hover:text-red-700">
                        Delete tier
                      </button>
                    </form>
                  </div>

                  <div className="space-y-1 mb-3">
                    {teams?.filter(t => assignmentMap[t.id] === tier.tier_number).map(team => (
                      <div key={team.id} className="flex items-center justify-between text-sm">
                        <span>{team.name}</span>
                        <form action={removeTeamFromTier}>
                          <input type="hidden" name="competition_id" value={activeComp.id} />
                          <input type="hidden" name="team_id" value={team.id} />
                          <button type="submit" className="text-xs text-red-400 hover:text-red-600">✕</button>
                        </form>
                      </div>
                    ))}
                    {teams?.filter(t => assignmentMap[t.id] === tier.tier_number).length === 0 && (
                      <p className="text-xs text-gray-400">No teams assigned yet</p>
                    )}
                  </div>

                  <form action={assignTeam} className="flex gap-1">
                    <input type="hidden" name="competition_id" value={activeComp.id} />
                    <input type="hidden" name="tier_number" value={tier.tier_number} />
                    <select name="team_id" className="text-xs border rounded px-1 py-1 flex-1">
                      <option value="">Add team...</option>
                      {teams?.filter(t => !assignmentMap[t.id]).map(team => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">
                      Add
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white border rounded-lg p-6">
            <h2 className="font-bold mb-4">Unassigned Teams</h2>
            <div className="grid grid-cols-2 gap-2">
              {teams?.filter(t => !assignmentMap[t.id]).map(team => (
                <div key={team.id} className="text-sm text-gray-400 py-1 border-b last:border-0">
                  {team.name}
                </div>
              ))}
              {teams?.filter(t => !assignmentMap[t.id]).length === 0 && (
                <p className="text-sm text-gray-400">All teams assigned.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}