'use client'

import { useState } from 'react'
import { createClient } from '../../lib/supabase'

type Fixture = {
  id: number
  home_team_id: number
  away_team_id: number
  kickoff_time: string
  status: string
  home_score: number | null
  away_score: number | null
  gameweek_id: string | null
}

type Gameweek = { id: string; number: number; competitionName: string }

interface Props {
  teamMap: Record<number, string>
  gameweeks: Gameweek[]
}

export default function FixtureManager({ teamMap, gameweeks }: Props) {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [targetGameweek, setTargetGameweek] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const supabase = createClient()

  async function search() {
    if (!fromDate || !toDate) {
      setMessage('Please select both a from and to date')
      return
    }
    setLoading(true)
    setMessage('')
    setSelected(new Set())

    const { data, error } = await supabase
      .from('fixtures')
      .select('id, home_team_id, away_team_id, kickoff_time, status, home_score, away_score, gameweek_id')
      .gte('kickoff_time', `${fromDate}T00:00:00`)
      .lte('kickoff_time', `${toDate}T23:59:59`)
      .order('kickoff_time', { ascending: true })

    if (error) {
      setMessage('Error: ' + error.message)
    } else {
      setFixtures(data ?? [])
      if (!data || data.length === 0) {
        setMessage('No fixtures found in that date range')
      }
    }
    setLoading(false)
  }

  function toggleSelect(id: number) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function selectAll() {
    setSelected(new Set(fixtures.map(f => f.id)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function assignSelected() {
    if (!targetGameweek) {
      setMessage('Please choose a gameweek to assign to')
      return
    }
    if (selected.size === 0) {
      setMessage('Please select at least one fixture')
      return
    }

    setLoading(true)
    setMessage('')

    const { error } = await supabase
      .from('fixtures')
      .update({ gameweek_id: targetGameweek })
      .in('id', Array.from(selected))

    if (error) {
      setMessage('Error: ' + error.message)
    } else {
      setMessage(`Assigned ${selected.size} fixtures to the selected gameweek`)
      setFixtures(prev => prev.map(f => selected.has(f.id) ? { ...f, gameweek_id: targetGameweek } : f))
      setSelected(new Set())
    }
    setLoading(false)
  }

  return (
    <div className="bg-white border rounded-lg p-6 mb-8">
      <h2 className="font-bold mb-4">Find Fixtures by Date Range</h2>
      <p className="text-sm text-gray-500 mb-4">
        Search for all fixtures within a date range (e.g. a weekend), then assign them all to a gameweek in one go.
      </p>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">To</label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button
        onClick={search}
        disabled={loading}
        className="bg-black text-white rounded px-4 py-2 text-sm mb-4"
      >
        {loading ? 'Searching...' : 'Search'}
      </button>

      {message && (
        <p className={`text-sm mb-4 ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>{message}</p>
      )}

      {fixtures.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <button onClick={selectAll} className="text-xs border rounded px-3 py-1.5">Select All</button>
            <button onClick={clearSelection} className="text-xs border rounded px-3 py-1.5">Clear Selection</button>
            <span className="text-xs text-gray-500">{selected.size} selected</span>

            <select
              value={targetGameweek}
              onChange={e => setTargetGameweek(e.target.value)}
              className="text-xs border rounded px-2 py-1.5 ml-auto"
            >
              <option value="">Assign selected to...</option>
              {gameweeks.map(gw => (
                <option key={gw.id} value={gw.id}>GW{gw.number} — {gw.competitionName}</option>
              ))}
            </select>
            <button
              onClick={assignSelected}
              disabled={loading}
              className="text-xs bg-black text-white rounded px-3 py-1.5"
            >
              Assign
            </button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 w-8"></th>
                <th className="pb-2">Kickoff</th>
                <th className="pb-2">Match</th>
                <th className="pb-2">Current Gameweek</th>
              </tr>
            </thead>
            <tbody>
              {fixtures.map(f => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(f.id)}
                      onChange={() => toggleSelect(f.id)}
                    />
                  </td>
                  <td className="py-2 text-xs text-gray-500">
                    {new Date(f.kickoff_time).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}
                  </td>
                  <td className="py-2">{teamMap[f.home_team_id]} vs {teamMap[f.away_team_id]}</td>
                  <td className="py-2 text-xs">
                    {f.gameweek_id
                      ? gameweeks.find(g => g.id === f.gameweek_id)
                        ? `GW${gameweeks.find(g => g.id === f.gameweek_id)!.number}`
                        : 'Assigned'
                      : <span className="text-orange-500">Unassigned</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}