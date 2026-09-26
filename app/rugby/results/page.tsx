import Link from 'next/link'
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

type ResultsData = {
  competition: Competition
  teamsList: Team[]
  playersList: Player[]
  roundsList: Round[]
  entrants: { userId: string; name: string }[]
  fixturesList: Fixture[]
  eventsByFixture: Map<number, MatchEvent[]>
  statsByFixture: Map<number, PlayerMatchStat[]>
  ratingByFixtureAndPlayer: Map<string, number>
  predictionsByRound: MatchPrediction[]
  predictionPointsByPredictionId: Map<string, MatchPredictionPoints>
  squadPickById: Map<string, SeasonSquadPick>
  squadPointsList: SeasonSquadPoints[]
  captainSelectionsByUser: Map<string, CaptainSelection[]>
}

function fmt1(n: number) { return Math.round(n * 10) / 10 }

async function loadRealResultsData(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, currentUserId: string | undefined): Promise<ResultsData | null> {
  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name').eq('status', 'active').maybeSingle() as unknown as { data: Competition | null }
  if (!competition) return null

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

  const userIds = entriesList.map(e => e.user_id)
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', userIds) as unknown as { data: Profile[] | null }
    : { data: [] as Profile[] }
  const nameById = new Map((profiles ?? []).map(p => [p.id, p.display_name]))
  const entrants = entriesList
    .map(e => ({ userId: e.user_id, name: e.user_id === currentUserId ? `${nameById.get(e.user_id) ?? 'Unknown'} (you)` : (nameById.get(e.user_id) ?? 'Unknown') }))
    .sort((a, b) => (a.userId === currentUserId ? -1 : b.userId === currentUserId ? 1 : a.name.localeCompare(b.name)))

  const roundIds = new Set(roundsList.map(r => r.id))
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
  const predictionPointsByPredictionId = new Map((allPredictionPoints ?? []).map(p => [p.match_prediction_id, p]))
  const squadPickById = new Map((allSquadPicks ?? []).map(p => [p.id, p]))
  const captainSelectionsByUser = new Map<string, CaptainSelection[]>()
  ;(allCaptainSelections ?? []).forEach(s => {
    if (!captainSelectionsByUser.has(s.user_id)) captainSelectionsByUser.set(s.user_id, [])
    captainSelectionsByUser.get(s.user_id)!.push(s)
  })

  return {
    competition, teamsList, playersList, roundsList, entrants, fixturesList,
    eventsByFixture, statsByFixture, ratingByFixtureAndPlayer,
    predictionsByRound: allPredictions ?? [], predictionPointsByPredictionId,
    squadPickById, squadPointsList: allSquadPoints ?? [], captainSelectionsByUser,
  }
}

// Kit, 2026-09-26: "I also want the results page to display some dummy
// data so i can see how it looks." Real data doesn't exist yet (Round 1's
// deadline hasn't passed, nothing's been played) — and this rugby data
// lives in the SAME Supabase project the live site reads from, so writing
// a fake "finished" result into a real round would show real users a
// fabricated match result (exactly what feedback_no_live_data_damage
// forbids). This is a pure in-memory substitute instead: zero database
// reads or writes, entirely fabricated, only ever rendered behind an
// explicit ?preview=1 flag with its own banner so it can never be mistaken
// for real.
function buildPreviewResultsData(currentUserId: string | undefined): ResultsData {
  const competition: Competition = { id: 'preview-competition', name: "Men's Six Nations (PREVIEW)" }
  const teamsList: Team[] = [
    { id: 1, name: 'England', short_code: 'ENG' },
    { id: 2, name: 'France', short_code: 'FRA' },
  ]
  const playersList: Player[] = [
    { id: 101, name: 'Sam Underhill', team_id: 1, position: 'Back Row' },
    { id: 102, name: 'Marcus Smith', team_id: 1, position: 'Fly-half' },
    { id: 103, name: 'Tommy Freeman', team_id: 1, position: 'Wing' },
    { id: 201, name: 'Antoine Dupont', team_id: 2, position: 'Scrum-half' },
    { id: 202, name: 'Louis Bielle-Biarrey', team_id: 2, position: 'Wing' },
  ]
  const roundsList: Round[] = [{ id: 'preview-round-1', number: 1 }]
  const you = currentUserId ?? 'preview-user-you'
  const entrants = [
    { userId: you, name: 'You (you)' },
    { userId: 'preview-user-alex', name: 'Alex' },
    { userId: 'preview-user-jordan', name: 'Jordan' },
  ]
  const fixturesList: Fixture[] = [
    { id: 9001, round_id: 'preview-round-1', home_team_id: 1, away_team_id: 2, kickoff_time: '2027-02-05T20:10:00Z', home_score: 24, away_score: 17, status: 'finished' },
  ]
  const eventsByFixture = new Map<number, MatchEvent[]>([
    [9001, [
      { fixture_id: 9001, player_id: 103, event_type: 'try', minute: 12 },
      { fixture_id: 9001, player_id: 202, event_type: 'try', minute: 34 },
      { fixture_id: 9001, player_id: 101, event_type: 'yellow_card', minute: 51 },
    ]],
  ])
  const statsByFixture = new Map<number, PlayerMatchStat[]>([
    [9001, [
      { fixture_id: 9001, player_id: 101, meters_run: 22, clean_breaks: 0, offloads: 1, tackles: 14, tackles_missed: 1, try_assists: 0 },
      { fixture_id: 9001, player_id: 102, meters_run: 58, clean_breaks: 2, offloads: 3, tackles: 4, tackles_missed: 0, try_assists: 1 },
      { fixture_id: 9001, player_id: 103, meters_run: 91, clean_breaks: 3, offloads: 1, tackles: 3, tackles_missed: 0, try_assists: 0 },
      { fixture_id: 9001, player_id: 201, meters_run: 47, clean_breaks: 1, offloads: 4, tackles: 6, tackles_missed: 0, try_assists: 1 },
      { fixture_id: 9001, player_id: 202, meters_run: 88, clean_breaks: 2, offloads: 0, tackles: 2, tackles_missed: 1, try_assists: 0 },
    ]],
  ])
  const ratingByFixtureAndPlayer = new Map<string, number>([
    ['9001::101', 58.2], ['9001::102', 74.5], ['9001::103', 88.1], ['9001::201', 91.4], ['9001::202', 79.6],
  ])

  const predictionsByRound: MatchPrediction[] = [
    { id: 'pred-you', user_id: you, round_id: 'preview-round-1', fixture_id: 9001, predicted_winner: 'home', predicted_margin: 7, is_confidence_pick: true },
    { id: 'pred-alex', user_id: 'preview-user-alex', round_id: 'preview-round-1', fixture_id: 9001, predicted_winner: 'away', predicted_margin: 3, is_confidence_pick: false },
    { id: 'pred-jordan', user_id: 'preview-user-jordan', round_id: 'preview-round-1', fixture_id: 9001, predicted_winner: 'home', predicted_margin: 10, is_confidence_pick: false },
  ]
  const predictionPointsByPredictionId = new Map<string, MatchPredictionPoints>([
    ['pred-you', { match_prediction_id: 'pred-you', is_correct: true, multiplier: 1.5, total_points: 71 }], // winner+margin, confidence 1.5x
    ['pred-alex', { match_prediction_id: 'pred-alex', is_correct: false, multiplier: 1, total_points: 0 }], // wrong winner
    ['pred-jordan', { match_prediction_id: 'pred-jordan', is_correct: true, multiplier: 1.8, total_points: 90 }], // underdog bonus
  ])

  const squadPickRows: SeasonSquadPick[] = [
    { id: 'pick-you-1', user_id: you, player_id: 103, active: true, round_acquired: 1, round_removed: null },
    { id: 'pick-you-2', user_id: you, player_id: 201, active: true, round_acquired: 1, round_removed: null },
    { id: 'pick-alex-1', user_id: 'preview-user-alex', player_id: 102, active: true, round_acquired: 1, round_removed: null },
    { id: 'pick-alex-2', user_id: 'preview-user-alex', player_id: 202, active: true, round_acquired: 1, round_removed: null },
    { id: 'pick-jordan-1', user_id: 'preview-user-jordan', player_id: 101, active: true, round_acquired: 1, round_removed: null },
  ]
  const squadPickById = new Map(squadPickRows.map(p => [p.id, p]))
  const squadPointsList: SeasonSquadPoints[] = [
    // You: captain (Freeman) + a differential pick (Dupont)
    { season_squad_pick_id: 'pick-you-1', round_id: 'preview-round-1', rating: 88.1, rating_points: 44.05, captain_bonus: 22.03, contrarian_bonus: 0, sub_penalty: 0, captain_change_penalty: 0, total_points: 66.08 },
    { season_squad_pick_id: 'pick-you-2', round_id: 'preview-round-1', rating: 91.4, rating_points: 45.7, captain_bonus: 0, contrarian_bonus: 13.71, sub_penalty: 0, captain_change_penalty: 0, total_points: 59.41 },
    // Alex: a sub penalty this round
    { season_squad_pick_id: 'pick-alex-1', round_id: 'preview-round-1', rating: 74.5, rating_points: 37.25, captain_bonus: 0, contrarian_bonus: 0, sub_penalty: 10, captain_change_penalty: 0, total_points: 27.25 },
    { season_squad_pick_id: 'pick-alex-2', round_id: 'preview-round-1', rating: 79.6, rating_points: 39.8, captain_bonus: 0, contrarian_bonus: 0, sub_penalty: 0, captain_change_penalty: 0, total_points: 39.8 },
    // Jordan: a captain-change penalty this round
    { season_squad_pick_id: 'pick-jordan-1', round_id: 'preview-round-1', rating: 58.2, rating_points: 29.1, captain_bonus: 14.55, contrarian_bonus: 0, sub_penalty: 0, captain_change_penalty: 15, total_points: 28.65 },
  ]
  const captainSelectionsByUser = new Map<string, CaptainSelection[]>([
    [you, [{ user_id: you, player_id: 103, round_effective_from: 1 }]],
    ['preview-user-jordan', [{ user_id: 'preview-user-jordan', player_id: 999, round_effective_from: 1 }, { user_id: 'preview-user-jordan', player_id: 101, round_effective_from: 1 }]],
  ])

  return {
    competition, teamsList, playersList, roundsList, entrants, fixturesList,
    eventsByFixture, statsByFixture, ratingByFixtureAndPlayer,
    predictionsByRound, predictionPointsByPredictionId,
    squadPickById, squadPointsList, captainSelectionsByUser,
  }
}

export default async function RugbyResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>
}) {
  const { preview } = await searchParams
  const isPreview = preview === '1'

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const data = isPreview ? buildPreviewResultsData(user?.id) : await loadRealResultsData(supabase, user?.id)

  if (!data) {
    return <div className="max-w-2xl mx-auto p-6"><p className="text-sm" style={{ color: 'var(--rugby-text-dim)' }}>No active competition yet.</p></div>
  }

  const {
    competition, teamsList, playersList, roundsList, entrants, fixturesList,
    eventsByFixture, statsByFixture, ratingByFixtureAndPlayer,
    predictionsByRound, predictionPointsByPredictionId,
    squadPickById, squadPointsList, captainSelectionsByUser,
  } = data
  const team = (id: number) => teamsList.find(t => t.id === id)
  const playerById = new Map(playersList.map(p => [p.id, p]))
  const allPredictions = predictionsByRound
  const allSquadPoints = squadPointsList

  function captainForRound(userId: string, roundNumber: number): number | null {
    const applicable = (captainSelectionsByUser.get(userId) ?? []).filter(s => s.round_effective_from <= roundNumber)
    if (applicable.length === 0) return null
    return applicable.reduce((latest, s) => (s.round_effective_from > latest.round_effective_from ? s : latest)).player_id
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      {isPreview ? (
        <div className="rugby-panel p-3 mb-4 text-center" style={{ borderColor: '#e8574a', color: '#e8574a' }}>
          <strong>PREVIEW — not real data.</strong> Every score, pick and player below is made up, for layout review only.
          <div className="mt-1">
            <Link href="/rugby/results" className="underline">← Back to the real Results page</Link>
          </div>
        </div>
      ) : (
        <div className="rugby-panel p-3 mb-4 text-center">
          <Link href="/rugby/results?preview=1" className="underline" style={{ color: 'var(--rugby-floodlight-2)' }}>
            See what this page looks like once results start coming in (sample data) →
          </Link>
        </div>
      )}
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
                            <div className="mt-2 rugby-panel p-3 flex flex-col gap-2">
                              {fixtureStats
                                .slice()
                                .sort((a, b) => (ratingByFixtureAndPlayer.get(`${b.fixture_id}::${b.player_id}`) ?? 0) - (ratingByFixtureAndPlayer.get(`${a.fixture_id}::${a.player_id}`) ?? 0))
                                .map((s, i, arr) => {
                                  const p = playerById.get(s.player_id)
                                  const rating = ratingByFixtureAndPlayer.get(`${s.fixture_id}::${s.player_id}`)
                                  return (
                                    <div
                                      key={s.player_id}
                                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs pb-2"
                                      style={i < arr.length - 1 ? { borderBottom: '1px solid var(--rugby-line)' } : undefined}
                                    >
                                      <span style={{ color: 'var(--rugby-text)' }}>
                                        {p?.name ?? 'Unknown'}
                                        {p?.position ? <span style={{ color: 'var(--rugby-text-faint)' }}> · {p.position}</span> : null}
                                      </span>
                                      <span className="flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--rugby-text-faint)' }}>
                                        <span style={{ color: rating == null ? 'var(--rugby-text-faint)' : rating >= 60 ? '#3fa572' : rating < 40 ? '#e8574a' : 'var(--rugby-text)' }}>{rating != null ? `${fmt1(rating)} rtg` : '— rtg'}</span>
                                        <span>{s.meters_run}m</span>
                                        <span>{s.tackles} tkl</span>
                                        <span>{s.tackles_missed} missed</span>
                                        <span>{s.clean_breaks} breaks</span>
                                        <span>{s.offloads} offloads</span>
                                      </span>
                                    </div>
                                  )
                                })}
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
                                const actualMargin = fixture?.home_score != null && fixture?.away_score != null
                                  ? Math.abs(fixture.home_score - fixture.away_score) : null
                                const marginError = actualMargin != null && pred.predicted_margin != null
                                  ? Math.abs(pred.predicted_margin - actualMargin) : null
                                // Reverse-derived from the stored, authoritative total/multiplier
                                // (never recomputed from scratch) so this can never drift from
                                // what the scoring engine actually awarded.
                                const base = pts && pts.multiplier ? pts.total_points / pts.multiplier : null
                                return (
                                  <p key={pred.id} style={{ color: 'var(--rugby-text-dim)' }}>
                                    {home?.name} v {away?.name}: picked <strong style={{ color: 'var(--rugby-text)' }}>{pickLabel}</strong>
                                    {pred.predicted_margin != null && ` by ${pred.predicted_margin}`}
                                    {pred.is_confidence_pick && <span className="rugby-badge ml-1" style={{ fontSize: '9px' }}>Confidence</span>}
                                    {pts && pts.multiplier > 1 && <span className="rugby-badge rugby-badge--gold ml-1" style={{ fontSize: '9px' }}>{pts.multiplier.toFixed(2)}x</span>}
                                    <br />
                                    <span style={{ color: 'var(--rugby-text-faint)' }}>
                                      {pts?.is_correct
                                        ? (actualMargin != null
                                          ? `Correct — actual margin ${actualMargin}${marginError != null ? `, you were off by ${marginError}` : ''}. `
                                          : 'Correct. ')
                                        : 'Wrong winner — scores 0 regardless of margin. '}
                                      {base != null && pts && pts.multiplier > 1
                                        ? <>{fmt1(base)} base pts × {pts.multiplier.toFixed(2)} = </>
                                        : null}
                                    </span>
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
                                    <br />
                                    <span style={{ color: 'var(--rugby-text-faint)' }}>
                                      {fmt1(sp.rating)} rating → {fmt1(sp.rating_points)} base pts
                                      {sp.captain_bonus > 0 && ` + ${fmt1(sp.captain_bonus)} captain`}
                                      {sp.contrarian_bonus > 0 && ` + ${fmt1(sp.contrarian_bonus)} differential`}
                                      {sp.sub_penalty > 0 && ` − ${fmt1(sp.sub_penalty)} sub`}
                                      {sp.captain_change_penalty > 0 && ` − ${fmt1(sp.captain_change_penalty)} captain change`}
                                      {' = '}
                                    </span>
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
