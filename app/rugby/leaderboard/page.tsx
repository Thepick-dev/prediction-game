import { createServerSupabaseClient } from '../../lib/supabase-server'
import RugbyKitPreview from '../../../components/RugbyKitPreview'

type Competition = { id: string; name: string; season: string }
type Entry = { user_id: string }
type Profile = { id: string; display_name: string }
type Kit = { user_id: string; pattern: string; colour1: string; colour2: string; colour3: string | null }
type Round = { id: string; number: number }
type SquadPointsRow = { user_id: string; round_id: string; total_points: number }
type MatchPointsRow = { user_id: string; round_id: string; total_points: number }
type SeasonPointsRow = { user_id: string; points: number }

export default async function RugbyLeaderboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name, season').eq('status', 'active').maybeSingle() as unknown as { data: Competition | null }

  if (!competition) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>No active competition yet.</p>
      </div>
    )
  }

  const [{ data: entries }, { data: rounds }] = await Promise.all([
    supabase.schema('rugby').from('competition_entries').select('user_id').eq('competition_id', competition.id) as unknown as Promise<{ data: Entry[] | null }>,
    supabase.schema('rugby').from('rounds').select('id, number').eq('competition_id', competition.id).order('number') as unknown as Promise<{ data: Round[] | null }>,
  ])
  const entriesList = entries ?? []
  const userIds = entriesList.map(e => e.user_id)
  const roundsList = rounds ?? []
  const roundIds = roundsList.map(r => r.id)

  const [{ data: profiles }, { data: kits }, { data: squadPoints }, { data: matchPoints }, { data: seasonPoints }] = await Promise.all([
    userIds.length ? supabase.from('profiles').select('id, display_name').in('id', userIds) as unknown as Promise<{ data: Profile[] | null }> : Promise.resolve({ data: [] as Profile[] }),
    userIds.length ? supabase.schema('rugby').from('player_kits').select('user_id, pattern, colour1, colour2, colour3').in('user_id', userIds) as unknown as Promise<{ data: Kit[] | null }> : Promise.resolve({ data: [] as Kit[] }),
    userIds.length && roundIds.length ? supabase.schema('rugby').from('season_squad_points').select('user_id, round_id, total_points').in('user_id', userIds).in('round_id', roundIds) as unknown as Promise<{ data: SquadPointsRow[] | null }> : Promise.resolve({ data: [] as SquadPointsRow[] }),
    userIds.length && roundIds.length ? supabase.schema('rugby').from('match_prediction_points').select('user_id, round_id, total_points').in('user_id', userIds).in('round_id', roundIds) as unknown as Promise<{ data: MatchPointsRow[] | null }> : Promise.resolve({ data: [] as MatchPointsRow[] }),
    userIds.length ? supabase.schema('rugby').from('season_prediction_points').select('user_id, points').eq('competition_id', competition.id).in('user_id', userIds) as unknown as Promise<{ data: SeasonPointsRow[] | null }> : Promise.resolve({ data: [] as SeasonPointsRow[] }),
  ])

  const nameById = new Map<string, string>()
  profiles?.forEach(p => nameById.set(p.id, p.display_name))
  const kitById = new Map<string, Kit>()
  kits?.forEach(k => kitById.set(k.user_id, k))

  // Per-round combined total (squad + match predictions — season predictions
  // are one-off tournament calls, not tied to any single round, so they get
  // their own column instead of being split across rounds).
  const byUserRound = new Map<string, Map<string, number>>()
  function addRoundPoints(userId: string, roundId: string, pts: number) {
    if (!byUserRound.has(userId)) byUserRound.set(userId, new Map())
    const m = byUserRound.get(userId)!
    m.set(roundId, (m.get(roundId) ?? 0) + pts)
  }
  ;(squadPoints ?? []).forEach(r => addRoundPoints(r.user_id, r.round_id, r.total_points))
  ;(matchPoints ?? []).forEach(r => addRoundPoints(r.user_id, r.round_id, r.total_points))

  const squadTotalByUser = new Map<string, number>()
  ;(squadPoints ?? []).forEach(r => squadTotalByUser.set(r.user_id, (squadTotalByUser.get(r.user_id) ?? 0) + r.total_points))
  const matchTotalByUser = new Map<string, number>()
  ;(matchPoints ?? []).forEach(r => matchTotalByUser.set(r.user_id, (matchTotalByUser.get(r.user_id) ?? 0) + r.total_points))
  const seasonTotalByUser = new Map<string, number>()
  ;(seasonPoints ?? []).forEach(r => seasonTotalByUser.set(r.user_id, (seasonTotalByUser.get(r.user_id) ?? 0) + r.points))

  const ranked = entriesList
    .map(e => {
      const squad = squadTotalByUser.get(e.user_id) ?? 0
      const match = matchTotalByUser.get(e.user_id) ?? 0
      const season = seasonTotalByUser.get(e.user_id) ?? 0
      const perRound = byUserRound.get(e.user_id) ?? new Map<string, number>()
      return {
        userId: e.user_id,
        name: nameById.get(e.user_id) ?? 'Unknown',
        squad, match, season,
        total: squad + match + season,
        perRound,
      }
    })
    .sort((a, b) => b.total - a.total)

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <h1 className="pop-hero pop-hero--green text-2xl md:text-3xl mb-4">🏆 Leaderboard</h1>
      <div className="pop-panel pop-panel--green p-3 md:p-5">
        {ranked.length === 0 ? (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>No one has joined {competition.name} yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs md:text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.15)' }}>
                  <th className="text-left py-2 px-1" style={{ color: 'rgba(255,255,255,0.5)' }}>#</th>
                  <th className="text-left py-2 px-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Player</th>
                  {roundsList.map(r => (
                    <th key={r.id} className="text-right py-2 px-1.5 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.4)' }}>R{r.number}</th>
                  ))}
                  <th className="text-right py-2 px-1.5 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.4)' }}>Squad</th>
                  <th className="text-right py-2 px-1.5 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.4)' }}>Matches</th>
                  <th className="text-right py-2 px-1.5 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.4)' }}>Tournament</th>
                  <th className="text-right py-2 px-1" style={{ color: 'var(--pop-green)' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((row, i) => {
                  const kit = kitById.get(row.userId)
                  return (
                    <tr key={row.userId} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <td className="py-2 px-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{i + 1}</td>
                      <td className="py-2 px-1">
                        <div className="flex items-center gap-2">
                          {kit ? (
                            <RugbyKitPreview pattern={kit.pattern} colour1={kit.colour1} colour2={kit.colour2} colour3={kit.colour3} size={24} />
                          ) : (
                            <div style={{ width: 24 }} />
                          )}
                          <span style={{ color: 'var(--pop-white)' }}>{row.name}</span>
                        </div>
                      </td>
                      {roundsList.map(r => {
                        const pts = row.perRound.get(r.id)
                        return (
                          <td key={r.id} className="text-right py-2 px-1.5" style={{ color: pts != null && pts < 0 ? 'var(--pop-red)' : 'rgba(255,255,255,0.7)' }}>
                            {pts != null ? pts : '—'}
                          </td>
                        )
                      })}
                      <td className="text-right py-2 px-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>{row.squad}</td>
                      <td className="text-right py-2 px-1.5" style={{ color: row.match < 0 ? 'var(--pop-red)' : 'rgba(255,255,255,0.7)' }}>{row.match}</td>
                      <td className="text-right py-2 px-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>{row.season}</td>
                      <td className="text-right py-2 px-1 pop-headline" style={{ color: row.total < 0 ? 'var(--pop-red)' : 'var(--pop-green)' }}>{row.total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
