import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { calculateSeasonSquadRoundScoring, calculateMatchPredictionRoundScoring } from '../../../lib/rugbyScoring'

async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

type Team = { id: number; name: string }
type RugbyPlayer = { id: number; team_id: number; name: string }
type Round = { id: string; number: number; deadline: string }
type Fixture = {
  id: number; round_id: string; home_team_id: number; away_team_id: number
  kickoff_time: string | null; home_score: number | null; away_score: number | null; status: string
}
type MatchEvent = { id: number; player_id: number | null; event_type: string; minute: number | null }

const EVENT_TYPES = ['try', 'conversion', 'penalty_goal', 'drop_goal', 'yellow_card', 'red_card']

async function saveScore(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const fixtureId = Number(formData.get('fixture_id'))
  const homeScore = Number(formData.get('home_score'))
  const awayScore = Number(formData.get('away_score'))
  const round = formData.get('round') as string
  await supabase.schema('rugby').from('fixtures').update({ home_score: homeScore, away_score: awayScore, status: 'finished' }).eq('id', fixtureId)
  redirect(`/admin/rugby/results?round=${round}&fixture=${fixtureId}`)
}

async function addEvent(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const fixtureId = Number(formData.get('fixture_id'))
  const playerId = Number(formData.get('player_id'))
  const eventType = formData.get('event_type') as string
  const minuteRaw = formData.get('minute') as string
  const round = formData.get('round') as string
  await supabase.schema('rugby').from('match_events').insert({
    fixture_id: fixtureId, player_id: playerId, event_type: eventType,
    minute: minuteRaw ? Number(minuteRaw) : null,
  })
  redirect(`/admin/rugby/results?round=${round}&fixture=${fixtureId}`)
}

async function deleteEvent(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const eventId = Number(formData.get('event_id'))
  const round = formData.get('round') as string
  const fixtureId = formData.get('fixture_id') as string
  await supabase.schema('rugby').from('match_events').delete().eq('id', eventId)
  redirect(`/admin/rugby/results?round=${round}&fixture=${fixtureId}`)
}

async function calculatePoints(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const roundId = formData.get('round_id') as string
  const [squadResult, matchResult] = await Promise.all([
    calculateSeasonSquadRoundScoring(supabase, roundId),
    calculateMatchPredictionRoundScoring(supabase, roundId),
  ])
  if ('error' in squadResult) {
    redirect(`/admin/rugby/results?round=${roundId}&error=${encodeURIComponent(squadResult.error)}`)
  }
  if ('error' in matchResult) {
    redirect(`/admin/rugby/results?round=${roundId}&error=${encodeURIComponent(matchResult.error)}`)
  }
  redirect(`/admin/rugby/results?round=${roundId}&calculated=${squadResult.rows}&calculatedMatch=${matchResult.rows}`)
}

export default async function AdminRugbyResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string; fixture?: string; calculated?: string; calculatedMatch?: string; error?: string }>
}) {
  const { round: roundParam, fixture: fixtureParam, calculated, calculatedMatch, error: calcError } = await searchParams
  const supabase = await createServerSupabaseClient()

  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name').eq('status', 'active').maybeSingle() as unknown as { data: { id: string; name: string } | null }

  if (!competition) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">🏉 Rugby Results</h1>
        <p className="text-gray-500 text-sm">No active rugby competition — create and activate one at <a href="/admin/rugby" className="underline">Admin → Rugby</a> first.</p>
      </div>
    )
  }

  const [{ data: teams }, { data: players }, { data: rounds }] = await Promise.all([
    supabase.schema('rugby').from('teams').select('id, name').order('name') as unknown as Promise<{ data: Team[] | null }>,
    supabase.schema('rugby').from('players').select('id, team_id, name').order('name') as unknown as Promise<{ data: RugbyPlayer[] | null }>,
    supabase.schema('rugby').from('rounds').select('id, number, deadline').eq('competition_id', competition.id).order('number') as unknown as Promise<{ data: Round[] | null }>,
  ])

  const teamsList = teams ?? []
  const playersList = players ?? []
  const roundsList = rounds ?? []
  const teamName = (id: number) => teamsList.find(t => t.id === id)?.name ?? '?'

  const selectedRoundId = roundParam ?? roundsList[0]?.id ?? null

  let fixtures: Fixture[] = []
  if (selectedRoundId) {
    const { data } = await supabase.schema('rugby').from('fixtures').select('id, round_id, home_team_id, away_team_id, kickoff_time, home_score, away_score, status').eq('round_id', selectedRoundId).order('id') as unknown as { data: Fixture[] | null }
    fixtures = data ?? []
  }

  const selectedFixtureId = fixtureParam ? Number(fixtureParam) : null
  const selectedFixture = fixtures.find(f => f.id === selectedFixtureId) ?? null

  let events: MatchEvent[] = []
  let eligiblePlayers: RugbyPlayer[] = []
  if (selectedFixture) {
    const { data } = await supabase.schema('rugby').from('match_events').select('id, player_id, event_type, minute').eq('fixture_id', selectedFixture.id).order('minute') as unknown as { data: MatchEvent[] | null }
    events = data ?? []
    eligiblePlayers = playersList.filter(p => p.team_id === selectedFixture.home_team_id || p.team_id === selectedFixture.away_team_id)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">🏉 Rugby Results</h1>
      <p className="text-gray-500 text-sm mb-6">{competition.name} — enter scores and scorers here for the ongoing season, without touching the spreadsheet.</p>

      {(calculated || calcError) && (
        <div className={`rounded-lg p-3 mb-6 text-sm ${calcError ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {calcError ? `Error: ${calcError}` : `Calculated points for ${calculated} Dream Team pick(s) and ${calculatedMatch ?? 0} match prediction(s) this round.`}
        </div>
      )}

      <div className="bg-white border rounded-lg p-6 mb-6">
        <h2 className="font-bold mb-3">Round</h2>
        {roundsList.length === 0 ? (
          <p className="text-gray-400 text-sm">No rounds yet — sync the spreadsheet at least once to create the fixture schedule.</p>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            {roundsList.map(r => (
              <Link
                key={r.id}
                href={`/admin/rugby/results?round=${r.id}`}
                className={`text-sm px-3 py-1.5 rounded ${r.id === selectedRoundId ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Round {r.number}
              </Link>
            ))}
            {selectedRoundId && (
              <form action={calculatePoints} className="ml-2">
                <input type="hidden" name="round_id" value={selectedRoundId} />
                <button type="submit" className="text-sm bg-green-600 text-white rounded px-3 py-1.5 font-bold">
                  Calculate Points for this Round
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {selectedRoundId && (
        <div className="bg-white border rounded-lg p-6 mb-6">
          <h2 className="font-bold mb-4">Fixtures</h2>
          <div className="space-y-3">
            {fixtures.map(f => (
              <div key={f.id} className={`border rounded-lg p-4 ${selectedFixtureId === f.id ? 'border-black bg-gray-50' : ''}`}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <span className="font-medium text-sm">{teamName(f.home_team_id)} v {teamName(f.away_team_id)}</span>
                  <form action={saveScore} className="flex items-center gap-1.5">
                    <input type="hidden" name="fixture_id" value={f.id} />
                    <input type="hidden" name="round" value={selectedRoundId} />
                    <input type="number" name="home_score" min="0" defaultValue={f.home_score ?? ''} placeholder="H" className="w-12 border rounded px-1 py-1 text-xs text-center" />
                    <span className="text-xs">-</span>
                    <input type="number" name="away_score" min="0" defaultValue={f.away_score ?? ''} placeholder="A" className="w-12 border rounded px-1 py-1 text-xs text-center" />
                    <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Save Score</button>
                  </form>
                  <span className={`text-xs px-2 py-0.5 rounded ${f.status === 'finished' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{f.status}</span>
                  <Link
                    href={`/admin/rugby/results?round=${selectedRoundId}&fixture=${f.id}#events`}
                    className={`text-xs rounded px-3 py-1.5 font-bold ${selectedFixtureId === f.id ? 'bg-black text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                  >
                    📝 {selectedFixtureId === f.id ? 'Editing events' : 'Add/edit events'}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedFixture && (
        <div id="events" className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border rounded-lg p-6">
            <h2 className="font-bold mb-2">Add Scorer Event</h2>
            <p className="text-sm text-gray-500 mb-4">{teamName(selectedFixture.home_team_id)} v {teamName(selectedFixture.away_team_id)}</p>
            <form action={addEvent} className="space-y-3">
              <input type="hidden" name="fixture_id" value={selectedFixture.id} />
              <input type="hidden" name="round" value={selectedRoundId ?? ''} />
              <div>
                <label className="block text-xs font-medium mb-1">Player</label>
                <select name="player_id" required className="border rounded px-3 py-2 text-sm w-full">
                  <option value="">Select a player...</option>
                  {eligiblePlayers.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({teamName(p.team_id)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Event</label>
                <select name="event_type" required className="border rounded px-3 py-2 text-sm w-full">
                  {EVENT_TYPES.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Minute (optional)</label>
                <input type="number" name="minute" min="1" max="120" className="border rounded px-3 py-2 text-sm w-full" />
              </div>
              <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm font-bold">Add Event</button>
            </form>
          </div>

          <div className="bg-white border rounded-lg p-6">
            <h2 className="font-bold mb-4">Events for this fixture</h2>
            {events.length === 0 ? (
              <p className="text-sm text-gray-400">No events yet.</p>
            ) : (
              <div className="space-y-2">
                {events.map(e => (
                  <div key={e.id} className="flex items-center justify-between border-b pb-2 last:border-0 text-sm">
                    <span>
                      <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs mr-2">{e.event_type}</span>
                      {playersList.find(p => p.id === e.player_id)?.name ?? 'Unknown'}
                      {e.minute && <span className="text-gray-400 ml-2">{e.minute}&apos;</span>}
                    </span>
                    <form action={deleteEvent}>
                      <input type="hidden" name="event_id" value={e.id} />
                      <input type="hidden" name="round" value={selectedRoundId ?? ''} />
                      <input type="hidden" name="fixture_id" value={selectedFixture.id} />
                      <button type="submit" className="text-xs text-red-500 hover:text-red-700">Delete</button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
