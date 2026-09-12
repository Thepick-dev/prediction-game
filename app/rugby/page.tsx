import { createServerSupabaseClient } from '../lib/supabase-server'
import RugbySyncButton from './_components/RugbySyncButton'

type Team = { id: number; name: string; short_code: string | null }
type Player = { id: number; team_id: number; name: string; position: string | null }
type Competition = { id: string; name: string; season: string }
type Round = { id: string; number: number; deadline: string }
type Fixture = {
  id: number; round_id: string; home_team_id: number; away_team_id: number
  kickoff_time: string | null; home_score: number | null; away_score: number | null; status: string
}
type MatchEvent = { fixture_id: number; player_id: number | null; event_type: string; minute: number | null }

export default async function RugbyPage() {
  const supabase = await createServerSupabaseClient()

  const [{ data: teams }, { data: players }, { data: competition }] = await Promise.all([
    supabase.schema('rugby').from('teams').select('id, name, short_code').order('name') as unknown as Promise<{ data: Team[] | null }>,
    supabase.schema('rugby').from('players').select('id, team_id, name, position').order('name') as unknown as Promise<{ data: Player[] | null }>,
    supabase.schema('rugby').from('competitions').select('id, name, season').order('created_at', { ascending: false }).limit(1).maybeSingle() as unknown as Promise<{ data: Competition | null }>,
  ])

  let rounds: Round[] = []
  let fixtures: Fixture[] = []
  let events: MatchEvent[] = []

  if (competition) {
    const [{ data: roundsData }, { data: fixturesData }] = await Promise.all([
      supabase.schema('rugby').from('rounds').select('id, number, deadline').eq('competition_id', competition.id).order('number') as unknown as Promise<{ data: Round[] | null }>,
      supabase.schema('rugby').from('fixtures').select('id, round_id, home_team_id, away_team_id, kickoff_time, home_score, away_score, status') as unknown as Promise<{ data: Fixture[] | null }>,
    ])
    rounds = roundsData ?? []
    const roundIds = new Set(rounds.map(r => r.id))
    fixtures = (fixturesData ?? []).filter(f => roundIds.has(f.round_id))
    const fixtureIds = fixtures.map(f => f.id)
    if (fixtureIds.length > 0) {
      const { data: eventsData } = await supabase.schema('rugby').from('match_events').select('fixture_id, player_id, event_type, minute').in('fixture_id', fixtureIds) as unknown as { data: MatchEvent[] | null }
      events = eventsData ?? []
    }
  }

  const teamsList = teams ?? []
  const playersList = players ?? []

  const teamName = (id: number) => teamsList.find(t => t.id === id)?.name ?? '?'
  const playerName = (id: number | null) => playersList.find(p => p.id === id)?.name ?? 'Unknown'

  const playersByTeam = new Map<number, Player[]>()
  playersList.forEach(p => {
    if (!playersByTeam.has(p.team_id)) playersByTeam.set(p.team_id, [])
    playersByTeam.get(p.team_id)!.push(p)
  })

  const eventsByFixture = new Map<number, MatchEvent[]>()
  events.forEach(e => {
    if (!eventsByFixture.has(e.fixture_id)) eventsByFixture.set(e.fixture_id, [])
    eventsByFixture.get(e.fixture_id)!.push(e)
  })

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">🏉 {competition?.name ?? 'Six Nations'}</h1>
      <p className="text-sm text-gray-500 mb-4">{competition?.season ?? 'Not synced yet'} — admin preview, not live to players</p>

      <RugbySyncButton />

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-4">Fixtures &amp; Results</h2>
        {rounds.length === 0 && (
          <p className="text-gray-400 text-sm">No fixtures synced yet — click &quot;Sync from spreadsheet&quot; above.</p>
        )}
        {rounds.map(round => {
          const roundFixtures = fixtures.filter(f => f.round_id === round.id)
          return (
            <div key={round.id} className="mb-5 last:mb-0">
              <h3 className="font-semibold text-sm mb-2">Round {round.number}</h3>
              <div className="space-y-1">
                {roundFixtures.map(f => (
                  <div key={f.id} className="flex items-center justify-between text-sm border-b py-1.5">
                    <span>{teamName(f.home_team_id)} v {teamName(f.away_team_id)}</span>
                    <span className="text-gray-500">
                      {f.status === 'finished'
                        ? `${f.home_score} - ${f.away_score}`
                        : f.kickoff_time
                          ? new Date(f.kickoff_time).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
                          : 'TBC'}
                    </span>
                  </div>
                ))}
              </div>
              {roundFixtures.some(f => (eventsByFixture.get(f.id)?.length ?? 0) > 0) && (
                <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                  {roundFixtures.flatMap(f => (eventsByFixture.get(f.id) ?? []).map((e, i) => (
                    <p key={`${f.id}-${i}`}>{teamName(f.home_team_id)} v {teamName(f.away_team_id)}: {playerName(e.player_id)} — {e.event_type}{e.minute ? ` (${e.minute}')` : ''}</p>
                  )))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-4">Squads</h2>
        {teamsList.length === 0 ? (
          <p className="text-gray-400 text-sm">No squads synced yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {teamsList.map(team => (
              <div key={team.id}>
                <h3 className="font-semibold text-sm mb-2">{team.name} ({(playersByTeam.get(team.id) ?? []).length})</h3>
                <ul className="text-xs text-gray-600 space-y-0.5">
                  {(playersByTeam.get(team.id) ?? []).map(p => (
                    <li key={p.id}>{p.name} <span className="text-gray-400">— {p.position}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
