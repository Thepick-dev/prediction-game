'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RugbySyncButton() {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const router = useRouter()

  async function sync() {
    setStatus('syncing')
    setMessage('')
    setWarnings([])
    try {
      const res = await fetch('/api/admin/rugby-sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || data.error) {
        setStatus('error')
        setMessage(data.error ?? 'Sync failed')
        return
      }
      const s = data.summary
      setMessage(
        `Added ${s.players_added} new player(s). ` +
        `${s.fixtures_seen} fixtures, ${s.results_applied} results, ${s.scorer_rows_applied} scorer row(s) processed.`
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
        className="bg-black text-white rounded px-3 py-2 text-sm font-bold disabled:opacity-50"
      >
        {status === 'syncing' ? 'Syncing…' : '🔄 Sync from spreadsheet'}
      </button>
      {message && (
        <p className={`text-xs mt-2 ${status === 'error' ? 'text-red-600' : 'text-gray-600'}`}>{message}</p>
      )}
      {warnings.length > 0 && (
        <ul className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded mt-2 p-2 space-y-0.5 max-h-40 overflow-y-auto">
          {warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
        </ul>
      )}
    </div>
  )
}
