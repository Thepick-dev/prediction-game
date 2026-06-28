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

  const syncs = [
    { key: 'teams', label: 'Import Teams', description: 'Import Premier League teams from football-data.org' },
    { key: 'fpl', label: 'Import Players', description: 'Import all players from FPL API' },
    { key: 'fixtures', label: 'Import Fixtures', description: 'Import all Premier League fixtures' },
    { key: 'results', label: 'Sync Results', description: 'Update finished match scores and results' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Data Sync</h1>
      <p className="text-gray-500 text-sm mb-6">Manually trigger data imports and updates from the APIs.</p>

      <div className="grid gap-4">
        {syncs.map(({ key, label, description }) => (
          <div key={key} className="bg-white border rounded-lg p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{label}</div>
              <div className="text-sm text-gray-500">{description}</div>
              {results[key] && (
                <div className={`text-xs mt-1 ${results[key].error ? 'text-red-600' : 'text-green-600'}`}>
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
              className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50 ml-4 shrink-0"
            >
              {loading[key] ? 'Running...' : 'Run'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}