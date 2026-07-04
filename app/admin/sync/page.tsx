'use client'

import { useState } from 'react'

type SyncResult = {
  success?: boolean
  error?: string
  [key: string]: any
}

export default function SyncPage() {
  const [results, setResults] = useState<Record<string, SyncResult>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [gameweekId, setGameweekId] = useState('')

  async function runSync(type: string) {
    setLoading(prev => ({ ...prev, [type]: true }))
    try {
      const res = await fetch(`/api/sync/${type}`, { method: 'POST' })
      const data = await res.json()
      setResults(prev => ({ ...prev, [type]: data }))
    } catch (e) {
      setResults(prev => ({ ...prev, [type]: { error: 'Request failed' } }))
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }))
    }
  }

  async function runSyncWithBody(type: string, body: object) {
    setLoading(prev => ({ ...prev, [type]: true }))
    try {
      const res = await fetch(`/api/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      setResults(prev => ({ ...prev, [type]: data }))
    } catch (e) {
      setResults(prev => ({ ...prev, [type]: { error: 'Request failed' } }))
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }))
    }
  }

  const syncs = [
    { key: 'teams', label: 'Import Teams', description: 'Import Premier League teams from football-data.org. Run once at the start of each season.' },
    { key: 'fpl', label: 'Import Players', description: 'Import all players from FPL API. Run once at the start of each season after squads are confirmed.' },
    { key: 'fixtures', label: 'Import Fixtures', description: 'Import all Premier League fixtures. Run once at the start of each season.' },
    { key: 'results', label: 'Sync Results', description: 'Update finished match scores and results. Run after each gameweek.' },
    { key: 'standings', label: 'Sync Standings', description: 'Update Premier League table positions. Run after each gameweek once results are in. Required before using Reset to League Table on the Quartiles page.' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Data Sync</h1>
      <p className="text-gray-500 text-sm mb-8">Manually trigger data imports and updates from the APIs.</p>

      <div className="grid gap-4 mb-8">
        {syncs.map(({ key, label, description }) => (
          <div key={key} className="bg-white border rounded-lg p-4 flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="font-medium text-sm">{label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{description}</div>
              {results[key] && (
                <div className={`text-xs mt-2 ${results[key].error ? 'text-red-600' : 'text-green-600'}`}>
                  {results[key].error
                    ? `Error: ${results[key].error}`
                    : `Success — ${JSON.stringify(results[key])}`
                  }
                </div>
              )}
            </div>
            <button
              onClick={() => runSync(key)}
              disabled={loading[key]}
              className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50 shrink-0"
            >
              {loading[key] ? 'Running...' : 'Run'}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-2">Recalculate Scoring</h2>
        <p className="text-sm text-gray-500 mb-4">
          Use this to manually recalculate points for a gameweek — for example if you corrected a result or added a missed goal. Paste the gameweek ID below then click Run.
        </p>
        <div className="flex gap-3 items-center">
          <input
            type="text"
            placeholder="Paste gameweek UUID here"
            value={gameweekId}
            onChange={e => setGameweekId(e.target.value)}
            className="flex-1 border rounded px-3 py-2 text-sm"
          />
          <button
            onClick={() => runSyncWithBody('scoring', { gameweek_id: gameweekId })}
            disabled={loading['scoring'] || !gameweekId}
            className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50 shrink-0"
          >
            {loading['scoring'] ? 'Running...' : 'Run'}
          </button>
        </div>
        {results['scoring'] && (
          <div className={`text-xs mt-2 ${results['scoring'].error ? 'text-red-600' : 'text-green-600'}`}>
            {results['scoring'].error
              ? `Error: ${results['scoring'].error}`
              : `Success — ${JSON.stringify(results['scoring'])}`
            }
          </div>
        )}
      </div>
    </div>
  )
}