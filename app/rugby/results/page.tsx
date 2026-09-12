import { createServerSupabaseClient } from '../../lib/supabase-server'

type Competition = { id: string; name: string }
type Team = { id: number; name: string }
type Round = { id: string; number: number }
type Fixture = { id: number; round_id: string; home_team_id: number; away_team_id: number; home_score: number | null; away_score: number | null; status: string }
type SquadPointsRow = { round_id: string; total_points: number }
type MatchPointsRow = { round_id: string; total_points: number }

export default async function RugbyResultsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name').eq('status', 'active').maybeSingle() as unknown as { data: Competition | null }

  if (!competition) {
    return <div className="max-w-2xl mx-auto p-6"><p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>No active competition yet.</p></div>
  }

  const [{ data: teams }, { data: rounds }] = await Promise.all([
    supabase.schema('rugby').from('teams').select('id, name') as unknown as Promise<{ data: Team[] | null }>,
    supabase.schema('rugby').from('rounds').select('id, number').eq('competition_id', competition.id).order('number') as unknown as Promise<{ data: Round[] | null }>,
  ])
  const teamsList = teams ?? []
  const roundsList = rounds ?? []
  const teamName = (id: number) => teamsList.find(t => t.id === id)?.name ?? '?'

  const { data: fixtures } = await supabase.schema('rugby').from('fixtures').select('id, round_id, home_team_id, away_team_id, home_score, away_score, status') as unknown as { data: Fixture[] | null }
  const fixturesList = (fixtures ?? []).filter(f => f.status === 'finished')

  const squadPointsByRound = new Map<string, number>()
  const matchPointsByRound = new Map<string, number>()
  if (user) {
    const [{ data: squadPoints }, { data: matchPoints }] = await Promise.all([
      supabase.schema('rugby').from('season_squad_points').select('round_id, total_points').eq('user_id', user.id) as unknown as Promise<{ data: SquadPointsRow[] | null }>,
      supabase.schema('rugby').from('match_prediction_points').select('round_id, total_points').eq('user_id', user.id) as unknown as Promise<{ data: MatchPointsRow[] | null }>,
    ])
    ;(squadPoints ?? []).forEach(r => squadPointsByRound.set(r.round_id, (squadPointsByRound.get(r.round_id) ?? 0) + r.total_points))
    ;(matchPoints ?? []).forEach(r => matchPointsByRound.set(r.round_id, (matchPointsByRound.get(r.round_id) ?? 0) + r.total_points))
  }

  const roundsWithResults = roundsList.filter(r => fixturesList.some(f => f.round_id === r.id))

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <h1 className="pop-hero pop-hero--green text-2xl md:text-3xl mb-4">📊 Results</h1>

      {roundsWithResults.length === 0 ? (
        <div className="pop-panel pop-panel--green p-5">
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>No results yet.</p>
        </div>
      ) : (
        roundsWithResults.map(round => {
          const roundFixtures = fixturesList.filter(f => f.round_id === round.id)
          const squadPts = squadPointsByRound.get(round.id)
          const matchPts = matchPointsByRound.get(round.id)
          return (
            <div key={round.id} className="pop-panel pop-panel--green p-5 mb-4">
              <h2 className="pop-headline text-sm mb-3" style={{ color: 'var(--pop-white)' }}>Round {round.number}</h2>
              <div className="space-y-1 mb-3">
                {roundFixtures.map(f => (
                  <div key={f.id} className="flex items-center justify-between text-sm py-1" style={{ color: 'var(--pop-white)' }}>
                    <span>{teamName(f.home_team_id)} v {teamName(f.away_team_id)}</span>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{f.home_score} - {f.away_score}</span>
                  </div>
                ))}
              </div>
              {user && (squadPts != null || matchPts != null) && (
                <div className="text-xs pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                  Your points this round — Squad: <strong style={{ color: (squadPts ?? 0) < 0 ? 'var(--pop-red)' : 'var(--pop-white)' }}>{squadPts ?? 0}</strong>
                  {matchPts != null && <> · Match Predictions: <strong style={{ color: matchPts < 0 ? 'var(--pop-red)' : 'var(--pop-white)' }}>{matchPts}</strong></>}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
