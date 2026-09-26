import { createServerSupabaseClient } from '../../lib/supabase-server'
import RugbyFixtureCard from '../../../components/RugbyFixtureCard'
import RugbyResultCard from '../../../components/RugbyResultCard'

type Competition = { id: string; name: string }
type Team = { id: number; name: string; short_code: string | null }
type Round = { id: string; number: number }
type Fixture = {
  id: number; round_id: string; home_team_id: number; away_team_id: number
  kickoff_time: string | null; home_score: number | null; away_score: number | null; status: string
}
type MatchEvent = { fixture_id: number; player_id: number | null; event_type: string; minute: number | null }
type Player = { id: number; name: string; team_id: number; position: string | null }
type PlayerMatchStat = {
  fixture_id: number; player_id: number
  meters_run: number; clean_breaks: number; offloads: number; tackles: number; tackles_missed: number; try_assists: number
}
type PlayerMatchRating = { fixture_id: number; player_id: number; rating: number }
type Entry = { user_id: string }
type Profile = { id: string; display_name: string }
type MatchPrediction = {
  id: string; user_id: string; round_id: string; fixture_id: number
  predicted_winner: 'home' | 'away' | 'draw'; predicted_margin: number | null; is_confidence_pick: boolean
}
type MatchPredictionPoints = {
  match_prediction_id: string; is_correct: boolean; multiplier: number; total_points: number
}
type SeasonSquadPick = {
  id: string; user_id: string; player_id: number; active: boolean
  round_acquired: number; round_removed: number | null
}
type SeasonSquadPoints = {
  season_squad_pick_id: string; round_id: string
  rating: number; rating_points: number; captain_bonus: number; contrarian_bonus: number
  sub_penalty: number; captain_change_penalty: number; total_points: number
}
type CaptainSelection = { user_id: string; player_id: number; round_effective_from: number }

function fmt1(n: number) { return Math.round(n * 10) / 10 }

export default async function RugbyResultsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name').eq('status', 'active').maybeSingle() as unknown as { data: Competition | null }

  if (!competition) {
    return <div className="max-w-2xl mx-auto p-6"><p className="text-sm" style={{ color: 'var(--rugby-text-dim)' }}>No active competition yet.</p></div>
  }

  const [{ data: teams }, { data: players }, { data: rounds }, { data: entries }] = await Promise.all([
    supabase.schema('rugby').from('teams').select('id, name, short_code') as unknown as Promise<{ data: Team[] | null }>,
    supabase.schema('rugby').from('players').select('id, name, team_id, position') as unknown as Promise<{ data: Player[] | null }>,
    supabase.schema('rugby').from('rounds').select('id, number').eq('competition_id', competition.id).order('number') as unknown as Promise<{ data: Round[] | null }>,
    supabase.schema('rugby').from('competition_entries').select('user_id').eq('competition_id', competition.id) as unknown as Promise<{ data: Entry[] | null }>,
  ])
  const teamsList = teams ?? []
  const playersList = players ?? []
  const roundsList = rounds ?? []
  const entriesList = entries ?? []
  const team = (id: number) => teamsList.find(t => t.id === id)
  const playerById = new Map(playersList.map(p => [p.id, p]))

  const userIds = entriesList.map(e => e.user_id)
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', userIds) as unknown as { data: Profile[] | null }
    : { data: [] as Profile[] }
  const nameById = new Map((profiles ?? []).map(p => [p.id, p.display_name]))
  const entrants = entriesList
    .map(e => ({ userId: e.user_id, name: e.user_id === user?.id ? `${nameById.get(e.user_id) ?? 'Unknown'} (you)` : (nameById.get(e.user_id) ?? 'Unknown') }))
    .sort((a, b) => (a.userId === user?.id ? -1 : b.userId === user?.id ? 1 : a.name.localeCompare(b.name)))

  const roundIds = new Set(roundsList.map(r => r.id))
  const roundNumberById = new Map(roundsList.map(r => [r.id, r.number]))
  const { data: fixtures } = await supabase.schema('rugby').from('fixtures').select('id, round_id, home_team_id, away_team_id, kickoff_time, home_score, away_score, status') as unknown as { data: Fixture[] | null }
  const fixturesList = (fixtures ?? []).filter(f => roundIds.has(f.round_id))
  const fixtureIds = fixturesList.map(f => f.id)
  const finishedFixtureIds = fixturesList.filter(f => f.status === 'finished').map(f => f.id)

  const [{ data: events }, { data: stats }, { data: ratings }] = await Promise.all([
    fixtureIds.length ? supabase.schema('rugby').from('match_events').select('fixture_id, player_id, event_type, minute').in('fixture_id', fixtureIds) as unknown as Promise<{ data: MatchEvent[] | null }> : Promise.resolve({ data: [] as MatchEvent[] }),
    finishedFixtureIds.length ? supabase.schema('rugby').from('player_match_stats').select('fixture_id, player_id, meters_run, clean_breaks, offloads, tackles, tackles_missed, try_assists').in('fixture_id', finishedFixtureIds) as unknown as Promise<{ data: PlayerMatchStat[] | null }> : Promise.resolve({ data: [] as PlayerMatchStat[] }),
    finishedFixtureIds.length ? supabase.schema('rugby').from('player_match_ratings').select('fixture_id, player_id, rating').in('fixture_id', finishedFixtureIds) as unknown as Promise<{ data: PlayerMatchRating[] | null }> : Promise.resolve({ data: [] as PlayerMatchRating[] }),
  ])
  const eventsByFixture = new Map<number, MatchEvent[]>()
  ;(events ?? []).forEach(e => {
    if (!eventsByFixture.has(e.fixture_id)) eventsByFixture.set(e.fixture_id, [])
    eventsByFixture.get(e.fixture_id)!.push(e)
  })
  const statsByFixture = new Map<number, PlayerMatchStat[]>()
  ;(stats ?? []).forEach(s => {
    if (!statsByFixture.has(s.fixture_id)) statsByFixture.set(s.fixture_id, [])
    statsByFixture.get(s.fixture_id)!.push(s)
  })
  const ratingByFixtureAndPlayer = new Map<string, number>()
  ;(ratings ?? []).forEach(r => ratingByFixtureAndPlayer.set(`${r.fixture_id}::${r.player_id}`, r.rating))

  // Everything below is only ever shown for rounds with a real, finished
  // result — the site's hard privacy rule protects PRE-deadline picks,
  // and this page never shows anything before a round's result exists.
  const [
    { data: allPredictions }, { data: allPredictionPoints },
    { data: allSquadPicks }, { data: allSquadPoints }, { data: allCaptainSelections },
  ] = await Promise.all([
    supabase.schema('rugby').from('match_predictions').select('id, user_id, round_id, fixture_id, predicted_winner, predicted_margin, is_confidence_pick') as unknown as Promise<{ data: MatchPrediction[] | null }>,
    supabase.schema('rugby').from('match_prediction_points').select('match_prediction_id, is_correct, multiplier, total_points') as unknown as Promise<{ data: MatchPredictionPoints[] | null }>,
    supabase.schema('rugby').from('season_squad_picks').select('id, user_id, player_id, active, round_acquired, round_removed').eq('competition_id', competition.id) as unknown as Promise<{ data: SeasonSquadPick[] | null }>,
    supabase.schema('rugby').from('season_squad_points').select('season_squad_pick_id, round_id, rating, rating_points, captain_bonus, contrarian_bonus, sub_penalty, captain_change_penalty, total_points') as unknown as Promise<{ data: SeasonSquadPoints[] | null }>,
    (async () => {
      try {
        return await supabase.schema('rugby').from('captain_selections').select('user_id, player_id, round_effective_from').eq('competition_id', competition.id) as unknown as { data: CaptainSelection[] | null }
      } catch { return { data: [] as CaptainSelection[] } }
    })(),
  ])
  const predictionById = new Map((allPredictions ?? []).map(p => [p.id, p]))
  const predictionPointsByPredictionId = new Map((allPredictionPoints ?? []).map(p => [p.match_prediction_id, p]))
  const squadPickById = new Map((allSquadPicks ?? []).map(p => [p.id, p]))
  const captainSelectionsByUser = new Map<string, CaptainSelection[]>()
  ;(allCaptainSelections ?? []).forEach(s => {
    if (!captainSelectionsByUser.has(s.user_id)) captainSelectionsByUser.set(s.user_id, [])
    captainSelectionsByUser.get(s.user_id)!.push(s)
  })
  function captainForRound(userId: string, roundNumber: number): number | null {
    const applicable = (captainSelectionsByUser.get(userId) ?? []).filter(s => s.round_effective_from <= roundNumber)
    if (applicable.length === 0) return null
    return applicable.reduce((latest, s) => (s.round_effective_from > latest.round_effective_from ? s : latest)).player_id
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <div className="rugby-hero-wrap">
        <p className="rugby-hero-eyebrow">{competition.name}</p>
        <h1 className="rugby-hero-title">Results</h1>
      </div>

      {roundsList.length === 0 ? (
        <div className="rugby-panel p-5">
          <p className="text-sm" style={{ color: 'var(--rugby-text-faint)' }}>No fixtures yet.</p>
        </div>
      ) : (
        roundsList.map(round => {
          const roundFixtures = fixturesList.filter(f => f.round_id === round.id)
          if (roundFixtures.length === 0) return null
          const roundHasResult = roundFixtures.some(f => f.status === 'finished')

          return (
            <div key={round.id} className="mb-10">
              <p className="rugby-section-title">Round {round.number}</p>
              <div className="flex flex-col gap-4 mt-3">
                {roundFixtures.map(f => {
                  const home = team(f.home_team_id)
                  const away = team(f.away_team_id)
                  const fixtureEvents = eventsByFixture.get(f.id) ?? []
                  const fixtureStats = statsByFixture.get(f.id) ?? []
                  if (f.status === 'finished' && f.home_score != null && f.away_score != null) {
                    return (
                      <div key={f.id}>
                        <RugbyResultCard
                          homeName={home?.name.toUpperCase() ?? '?'} homeCode={home?.short_code ?? null} homeScore={f.home_score}
                          awayName={away?.name.toUpperCase() ?? '?'} awayCode={away?.short_code ?? null} awayScore={f.away_score}
                          tag="Full Time"
                        />
                        {fixtureEvents.length > 0 && (
                          <div className="text-xs space-y-0.5 mt-2 px-1" style={{ color: 'var(--rugby-text-faint)' }}>
                            {fixtureEvents.map((e, i) => (
                              <p key={i}>{playerById.get(e.player_id ?? -1)?.name ?? 'Unknown'} — {e.event_type}{e.minute ? ` (${e.minute}')` : ''}</p>
                            ))}
                          </div>
                        )}
                        {fixtureStats.length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs cursor-pointer select-none" style={{ color: 'var(--rugby-text-dim)' }}>
                              Player stats &amp; ratings ({fixtureStats.length})
                            </summary>
                            <div className="mt-2 rugby-panel p-3 overflow-x-auto">
                              <table className="text-xs w-full" style={{ borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ color: 'var(--rugby-text-faint)' }}>
                                    <th className="text-left font-normal pb-1">Player</th>
                                    <th className="text-right font-normal pb-1">Rating</th>
                                    <th className="text-right font-normal pb-1">Meters</th>
                                    <th className="text-right font-normal pb-1">Tackles</th>
                                    <th className="text-right font-normal pb-1">Missed</th>
                                    <th className="text-right font-normal pb-1">Breaks</th>
                                    <th className="text-right font-normal pb-1">Offloads</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {fixtureStats
                                    .slice()
                                    .sort((a, b) => (ratingByFixtureAndPlayer.get(`${b.fixture_id}::${b.player_id}`) ?? 0) - (ratingByFixtureAndPlayer.get(`${a.fixture_id}::${a.player_id}`) ?? 0))
                                    .map(s => {
                                      const p = playerById.get(s.player_id)
                                      const rating = ratingByFixtureAndPlayer.get(`${s.fixture_id}::${s.player_id}`)
                                      return (
                                        <tr key={s.player_id} style={{ borderTop: '1px solid var(--rugby-line)' }}>
                                          <td className="py-1" style={{ color: 'var(--rugby-text)' }}>{p?.name ?? 'Unknown'}{p?.position ? <span style={{ color: 'var(--rugby-text-faint)' }}> · {p.position}</span> : null}</td>
                                          <td className="text-right py-1" style={{ color: rating == null ? 'var(--rugby-text-faint)' : rating >= 60 ? '#3fa572' : rating < 40 ? '#e8574a' : 'var(--rugby-text)' }}>{rating != null ? fmt1(rating) : '—'}</td>
                                          <td className="text-right py-1">{s.meters_run}</td>
                                          <td className="text-right py-1">{s.tackles}</td>
                                          <td className="text-right py-1">{s.tackles_missed}</td>
                                          <td className="text-right py-1">{s.clean_breaks}</td>
                                          <td className="text-right py-1">{s.offloads}</td>
                                        </tr>
                                      )
                                    })}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        )}
                      </div>
                    )
                  }
                  return (
                    <RugbyFixtureCard
                      key={f.id}
                      homeName={home?.name.toUpperCase() ?? '?'} homeCode={home?.short_code ?? null}
                      awayName={away?.name.toUpperCase() ?? '?'} awayCode={away?.short_code ?? null}
                      meta={{ left: f.kickoff_time ? new Date(f.kickoff_time).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : 'TBC' }}
                    />
                  )
                })}
              </div>

              {roundHasResult && entrants.length > 0 && (
                <div className="mt-5">
                  <p className="rugby-cond text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--rugby-text-dim)' }}>Everyone&apos;s Points</p>
                  <div className="space-y-2">
                    {entrants.map(entrant => {
                      const roundPreds = (allPredictions ?? []).filter(p => p.round_id === round.id && p.user_id === entrant.userId)
                      const matchTotal = roundPreds.reduce((sum, p) => sum + (predictionPointsByPredictionId.get(p.id)?.total_points ?? 0), 0)

                      const roundSquadPoints = (allSquadPoints ?? []).filter(sp => {
                        if (sp.round_id !== round.id) return false
                        const pick = squadPickById.get(sp.season_squad_pick_id)
                        return pick?.user_id === entrant.userId
                      })
                      const squadTotal = roundSquadPoints.reduce((sum, sp) => sum + sp.total_points, 0)
                      const grandTotal = matchTotal + squadTotal
                      const captainId = captainForRound(entrant.userId, round.number)

                      return (
                        <details key={entrant.userId} className="rugby-panel p-3">
                          <summary className="text-sm cursor-pointer select-none flex items-center justify-between gap-2 flex-wrap" style={{ color: 'var(--rugby-text)' }}>
                            <span className="rugby-cond uppercase tracking-wide">{entrant.name}</span>
                            <span style={{ color: 'var(--rugby-text-dim)' }}>
                              Match: <strong style={{ color: matchTotal < 0 ? '#e8574a' : 'var(--rugby-text)' }}>{matchTotal}</strong>
                              {' · '}Dream Team: <strong style={{ color: squadTotal < 0 ? '#e8574a' : 'var(--rugby-text)' }}>{squadTotal}</strong>
                              {' · '}Total: <strong>{grandTotal}</strong>
                            </span>
                          </summary>

                          {roundPreds.length > 0 && (
                            <div className="mt-3 text-xs space-y-1">
                              <p className="uppercase tracking-wide" style={{ color: 'var(--rugby-text-faint)' }}>Match Predictions</p>
                              {roundPreds.map(pred => {
                                const fixture = roundFixtures.find(f => f.id === pred.fixture_id)
                                const home = fixture ? team(fixture.home_team_id) : undefined
                                const away = fixture ? team(fixture.away_team_id) : undefined
                                const pts = predictionPointsByPredictionId.get(pred.id)
                                const pickLabel = pred.predicted_winner === 'draw' ? 'Draw' : pred.predicted_winner === 'home' ? home?.name : away?.name
                                return (
                                  <p key={pred.id} style={{ color: 'var(--rugby-text-dim)' }}>
                                    {home?.name} v {away?.name}: picked <strong style={{ color: 'var(--rugby-text)' }}>{pickLabel}</strong>
                                    {pred.predicted_margin != null && ` by ${pred.predicted_margin}`}
                                    {pred.is_confidence_pick && <span className="rugby-badge ml-1" style={{ fontSize: '9px' }}>Confidence</span>}
                                    {pts && pts.multiplier > 1 && <span className="rugby-badge rugby-badge--gold ml-1" style={{ fontSize: '9px' }}>{pts.multiplier.toFixed(2)}x</span>}
                                    {' — '}
                                    <strong style={{ color: (pts?.total_points ?? 0) < 0 ? '#e8574a' : 'var(--rugby-text)' }}>{pts?.total_points ?? 0} pts</strong>
                                  </p>
                                )
                              })}
                            </div>
                          )}

                          {roundSquadPoints.length > 0 && (
                            <div className="mt-3 text-xs space-y-1">
                              <p className="uppercase tracking-wide" style={{ color: 'var(--rugby-text-faint)' }}>Dream Team</p>
                              {roundSquadPoints.map(sp => {
                                const pick = squadPickById.get(sp.season_squad_pick_id)
                                const p = pick ? playerById.get(pick.player_id) : undefined
                                const isCaptain = pick?.player_id === captainId
                                return (
                                  <p key={sp.season_squad_pick_id} style={{ color: 'var(--rugby-text-dim)' }}>
                                    {isCaptain && <span title="Captain">★ </span>}
                                    <strong style={{ color: 'var(--rugby-text)' }}>{p?.name ?? 'Unknown'}</strong>
                                    {' — rating '}{fmt1(sp.rating)}
                                    {sp.captain_bonus > 0 && <span className="rugby-badge rugby-badge--gold ml-1" style={{ fontSize: '9px' }}>Captain +{fmt1(sp.captain_bonus)}</span>}
                                    {sp.contrarian_bonus > 0 && <span className="rugby-badge ml-1" style={{ fontSize: '9px' }}>Differential +{fmt1(sp.contrarian_bonus)}</span>}
                                    {sp.sub_penalty > 0 && <span className="rugby-badge rugby-badge--error ml-1" style={{ fontSize: '9px' }}>Sub -{fmt1(sp.sub_penalty)}</span>}
                                    {sp.captain_change_penalty > 0 && <span className="rugby-badge rugby-badge--error ml-1" style={{ fontSize: '9px' }}>Captain change -{fmt1(sp.captain_change_penalty)}</span>}
                                    {' — '}
                                    <strong style={{ color: sp.total_points < 0 ? '#e8574a' : 'var(--rugby-text)' }}>{fmt1(sp.total_points)} pts</strong>
                                  </p>
                                )
                              })}
                            </div>
                          )}
                        </details>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
