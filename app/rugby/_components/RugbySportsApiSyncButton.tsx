'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RugbySportsApiSyncButton() {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const router = useRouter()

  async function sync() {
    setStatus('syncing')
    setMessage('')
    setWarnings([])
    try {
      const res = await fetch('/api/admin/rugby-sportsapi-sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || data.error) {
        setStatus('error')
        setMessage(data.error ?? 'Sync failed')
        return
      }
      const s = data.summary
      setMessage(
        `Checked ${s.fixtures_checked} due fixture(s). ` +
        `${s.results_applied} result(s), ${s.scorer_rows_applied} scorer row(s), ${s.player_match_stats_applied} player-stat row(s) applied.`
      )
      setWarnings(data.warnings ?? [])
      setStatus('done')
      router.refresh()
    } catch {
      setStatus('error')
      setMessage('Sync failed — check the server logs.')
    }
  }

  return (
    <div className="mb-6">
      <button
        onClick={sync}
        disabled={status === 'syncing'}
        className="pop-button pop-button--blue"
      >
        {status === 'syncing' ? 'Syncing…' : '📡 Sync results from SportsAPI Pro'}
      </button>
      {message && (
        <p className="text-xs mt-2" style={{ color: status === 'error' ? 'var(--pop-red)' : 'rgba(255,255,255,0.6)' }}>{message}</p>
      )}
      {warnings.length > 0 && (
        <ul
          className="text-xs rounded mt-2 p-2 space-y-0.5 max-h-40 overflow-y-auto"
          style={{ color: 'var(--pop-orange)', background: 'rgba(250,97,0,0.08)', border: '1px solid rgba(250,97,0,0.3)' }}
        >
          {warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
        </ul>
      )}
    </div>
  )
}
