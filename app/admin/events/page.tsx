'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

type Fixture = {
  id: number
  kickoff_time: string
  status: string
  home_score: number | null
  away_score: number | null
  home_team: { name: string }
  away_team: { name: string }
}

type Player = { id: number; name: string; position: string }
type GameweekOption = { id: string; number: number }

export default function EventsPage() {
  const [gameweeks, setGameweeks] = useState<GameweekOption[]>([])
  const [selectedGameweek, setSelectedGameweek] = useState<string>('')
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [selectedFixture, setSelectedFixture] = useState<number | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [playerSearch, setPlayerSearch] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null)
  const [eventType, setEventType] = useState<'goal' | 'assist' | 'own_goal'>('goal')
  const [minute, setMinute] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [fplEvent, setFplEvent] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)

  const supabase = createClient()

  useEffect(() => {
    loadGameweeks()
    loadPlayers()
  }, [])

  useEffect(() => {
    if (selectedGameweek) {
      loadFixtures()
      const gw = gameweeks.find(g => g.id === selectedGameweek)
      setFplEvent(gw ? String(gw.number) : '')
      setSyncResult(null)
    }
  }, [selectedGameweek])

  useEffect(() => {
    if (selectedFixture) loadEvents()
  }, [selectedFixture])

  async function loadGameweeks() {
    const { data } = await supabase
      .from('gameweeks')
      .select('id, number')
      .order('number')
    setGameweeks(data ?? [])
  }

  async function loadPlayers() {
    const { data } = await supabase
      .from('players')
      .select('id, name, position')
      .order('name')
    setPlayers(data ?? [])
  }

  async function loadFixtures() {
    const { data } = await supabase
      .from('fixtures')
      .select('id, kickoff_time, status, home_score, away_score, home_team:teams!fixtures_home_team_id_fkey(name), away_team:teams!fixtures_away_team_id_fkey(name)')
      .eq('gameweek_id', selectedGameweek)
      .order('kickoff_time')
    setFixtures((data as any) ?? [])
    setSelectedFixture(null)
    setEvents([])
  }

  async function loadEvents() {
    const { data } = await supabase
      .from('match_events')
      .select('id, event_type, minute, player_id, players(name)')
      .eq('fixture_id', selectedFixture!)
      .order('minute')
    setEvents(data ?? [])
  }

  async function addEvent() {
    if (!selectedPlayer || !selectedFixture) return
    setSaving(true)
    setMessage('')

    const fixture = fixtures.find(f => f.id === selectedFixture)

    const { error } = await supabase
      .from('match_events')
      .insert({
        fixture_id: selectedFixture,
        player_id: selectedPlayer,
        event_type: eventType,
        minute: minute ? parseInt(minute) : null
      })

    if (error) {
      setMessage('Error: ' + error.message)
    } else {
      setMessage('Event added successfully')
      setSelectedPlayer(null)
      setPlayerSearch('')
      setMinute('')
      await loadEvents()
    }
    setSaving(false)
  }

  async function deleteEvent(id: string) {
    await supabase.from('match_events').delete().eq('id', id)
    await loadEvents()
  }

  async function updateFixtureScore(fixtureId: number, homeScore: number, awayScore: number) {
    await supabase
      .from('fixtures')
      .update({ home_score: homeScore, away_score: awayScore, status: 'finished' })
      .eq('id', fixtureId)
    await loadFixtures()
    setMessage('Score updated')
  }

  async function syncFromFpl() {
    if (!selectedGameweek || !fplEvent) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/admin/sync-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameweek_id: selectedGameweek, fpl_event: fplEvent })
      })
      const data = await res.json()
      setSyncResult({ ok: res.ok, ...data })
      if (res.ok) {
        await loadFixtures()
        if (selectedFixture) await loadEvents()
      }
    } catch (e: any) {
      setSyncResult({ ok: false, error: e?.message ?? 'Sync failed' })
    }
    setSyncing(false)
  }

  const filteredPlayers = players.filter(p =>
    p.name.toLowerCase().includes(playerSearch.toLowerCase())
  )

  const selectedFixtureData = fixtures.find(f => f.id === selectedFixture)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Match Events</h1>
      <p className="text-gray-500 text-sm mb-6">Enter goalscorers and assists for each fixture after the gameweek is complete.</p>

      <div className="bg-white border rounded-lg p-6 mb-6">
        <h2 className="font-bold mb-4">Select Gameweek</h2>
        <select
          value={selectedGameweek}
          onChange={e => setSelectedGameweek(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-full max-w-xs"
        >
          <option value="">Select a gameweek</option>
          {gameweeks.map(gw => (
            <option key={gw.id} value={gw.id}>Gameweek {gw.number}</option>
          ))}
        </select>
        {selectedGameweek && (
          <p className="text-gray-400 text-xs font-mono mt-2" title="Gameweek ID">{selectedGameweek}</p>
        )}
      </div>

      {selectedGameweek && (
        <div className="bg-white border rounded-lg p-6 mb-6">
          <h2 className="font-bold mb-2">Sync from FPL</h2>
          <p className="text-gray-500 text-sm mb-4">
            Pulls goalscorers, assists, own goals and final scores for finished fixtures straight from the FPL API,
            using player and team data matched to ours. This replaces any existing events for this gameweek&apos;s
            fixtures with a fresh pull — safe to click again if FPL updates anything (e.g. a late bonus/VAR correction).
          </p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600">FPL Gameweek Number</label>
              <input
                type="number"
                min="1"
                max="38"
                value={fplEvent}
                onChange={e => setFplEvent(e.target.value)}
                className="w-32 border rounded px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1 max-w-xs">
                The real Premier League gameweek number — only change this if it differs from this competition&apos;s own gameweek count above.
              </p>
            </div>
            <button
              onClick={syncFromFpl}
              disabled={syncing || !fplEvent}
              className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync from FPL'}
            </button>
          </div>

          {syncResult && (
            <div className={`mt-4 text-sm rounded p-3 ${syncResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {syncResult.ok ? (
                <>
                  <p className="font-medium">
                    Done — matched {syncResult.fixtures_matched} fixture(s), inserted {syncResult.events_inserted} event(s), updated {syncResult.scores_updated} score(s).
                  </p>
                  {syncResult.unmatched?.length > 0 && (
                    <ul className="list-disc list-inside mt-2 text-amber-700">
                      {syncResult.unmatched.map((u: string, i: number) => <li key={i}>{u}</li>)}
                    </ul>
                  )}
                </>
              ) : (
                <p>{syncResult.error}</p>
              )}
              {syncResult.teams_missing_short_code?.length > 0 && (
                <p className="mt-2 text-amber-700">
                  These teams have no FPL code stored yet, so any of their fixtures were skipped — run an FPL player sync first: {syncResult.teams_missing_short_code.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {fixtures.length > 0 && (
        <div className="bg-white border rounded-lg p-6 mb-6">
          <h2 className="font-bold mb-4">Fixtures</h2>
          <div className="space-y-3">
            {fixtures.map(fixture => (
              <div
                key={fixture.id}
                className={`border rounded-lg p-4 cursor-pointer transition-colors ${selectedFixture === fixture.id ? 'border-black bg-gray-50' : 'hover:border-gray-400'}`}
                onClick={() => setSelectedFixture(fixture.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">
                    {(fixture.home_team as any)?.name} vs {(fixture.away_team as any)?.name}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        placeholder="H"
                        defaultValue={fixture.home_score ?? ''}
                        className="w-10 border rounded px-1 py-1 text-xs text-center"
                        id={`home-${fixture.id}`}
                        onClick={e => e.stopPropagation()}
                      />
                      <span className="text-xs">-</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="A"
                        defaultValue={fixture.away_score ?? ''}
                        className="w-10 border rounded px-1 py-1 text-xs text-center"
                        id={`away-${fixture.id}`}
                        onClick={e => e.stopPropagation()}
                      />
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          const home = parseInt((document.getElementById(`home-${fixture.id}`) as HTMLInputElement).value)
                          const away = parseInt((document.getElementById(`away-${fixture.id}`) as HTMLInputElement).value)
                          updateFixtureScore(fixture.id, home, away)
                        }}
                        className="text-xs bg-black text-white rounded px-2 py-1 ml-1"
                      >
                        Save
                      </button>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${fixture.status === 'finished' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      {fixture.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedFixture && selectedFixtureData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border rounded-lg p-6">
            <h2 className="font-bold mb-4">Add Event</h2>
            <p className="text-sm text-gray-500 mb-4">
              {(selectedFixtureData.home_team as any)?.name} vs {(selectedFixtureData.away_team as any)?.name}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Event Type</label>
                <select
                  value={eventType}
                  onChange={e => setEventType(e.target.value as any)}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="goal">Goal</option>
                  <option value="assist">Assist</option>
                  <option value="own_goal">Own Goal</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Player</label>
                <input
                  type="text"
                  placeholder="Search players..."
                  value={playerSearch}
                  onChange={e => setPlayerSearch(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm mb-2"
                />
                {selectedPlayer && (
                  <div className="text-sm text-green-700 font-medium mb-2">
                    Selected: {players.find(p => p.id === selectedPlayer)?.name}
                    <button onClick={() => { setSelectedPlayer(null); setPlayerSearch('') }} className="ml-2 text-gray-400">✕</button>
                  </div>
                )}
                {playerSearch && (
                  <div className="border rounded max-h-40 overflow-y-auto">
                    {filteredPlayers.slice(0, 15).map(player => (
                      <button
                        key={player.id}
                        onClick={() => { setSelectedPlayer(player.id); setPlayerSearch('') }}
                        className={`w-full text-left px-3 py-2 text-sm border-b last:border-0 hover:bg-gray-50 flex justify-between ${selectedPlayer === player.id ? 'bg-black text-white' : ''}`}
                      >
                        <span>{player.name}</span>
                        <span className="text-xs text-gray-400">{player.position}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Minute (optional)</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  placeholder="e.g. 67"
                  value={minute}
                  onChange={e => setMinute(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>

              {message && (
                <p className={`text-sm ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                  {message}
                </p>
              )}

              <button
                onClick={addEvent}
                disabled={!selectedPlayer || saving}
                className="w-full bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add Event'}
              </button>
            </div>
          </div>

          <div className="bg-white border rounded-lg p-6">
            <h2 className="font-bold mb-4">Events for this fixture</h2>
            {events.length === 0 ? (
              <p className="text-sm text-gray-400">No events yet.</p>
            ) : (
              <div className="space-y-2">
                {events.map(event => (
                  <div key={event.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div className="text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs mr-2 ${
                        event.event_type === 'goal' ? 'bg-green-100 text-green-700' :
                        event.event_type === 'assist' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {event.event_type}
                      </span>
                      {(event.players as any)?.name}
                      {event.minute && <span className="text-gray-400 ml-2">{event.minute}'</span>}
                    </div>
                    <button
                      onClick={() => deleteEvent(event.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
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