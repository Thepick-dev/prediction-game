import { createServerSupabaseClient } from '../../lib/supabase-server'

export default async function TiersPage() {
  const supabase = await createServerSupabaseClient()

  const { data: competitions } = await supabase
    .from('competitions')
    .select('id, name')
    .order('created_at', { ascending: false })

  const activeComp = competitions?.[0]

  const { data: draftPicks } = activeComp ? await supabase
    .from('tier_draft_picks')
    .select(`
      *,
      profiles(display_name),
      tier1_team:teams!tier_draft_picks_tier1_team_id_fkey(name),
      tier2_team:teams!tier_draft_picks_tier2_team_id_fkey(name),
      tier3_team:teams!tier_draft_picks_tier3_team_id_fkey(name)
    `)
    .eq('competition_id', activeComp.id) : { data: [] }

  const { data: entries } = activeComp ? await supabase
    .from('competition_entries')
    .select('user_id, profiles(display_name)')
    .eq('competition_id', activeComp.id) : { data: [] }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Tier Draft</h1>

      {!activeComp ? (
        <p className="text-gray-500">No competitions found.</p>
      ) : (
        <>
          <p className="text-gray-500 mb-6">
            {draftPicks?.length ?? 0} of {entries?.length ?? 0} players have completed their tier draft.
          </p>

          <div className="bg-white border rounded-lg p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2">Player</th>
                  <th className="pb-2">Q1 Pick</th>
                  <th className="pb-2">Q2 Pick</th>
                  <th className="pb-2">Q3 Pick</th>
                  <th className="pb-2">Locked</th>
                </tr>
              </thead>
              <tbody>
                {draftPicks?.map(pick => (
                  <tr key={pick.id} className="border-b last:border-0">
                    <td className="py-2">{(pick.profiles as any)?.display_name ?? 'Unknown'}</td>
                    <td className="py-2">{(pick.tier1_team as any)?.name}</td>
                    <td className="py-2">{(pick.tier2_team as any)?.name}</td>
                    <td className="py-2">{(pick.tier3_team as any)?.name}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${pick.locked ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {pick.locked ? 'Locked' : 'Editable'}
                      </span>
                    </td>
                  </tr>
                ))}
                {(!draftPicks || draftPicks.length === 0) && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-gray-400">No tier draft picks yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
