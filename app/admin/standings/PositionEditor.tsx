'use client'

import { useState } from 'react'
import { createClient } from '../../lib/supabase'

type Row = {
  id: string
  team_id: number
  position: number
  teamName: string
}

export default function PositionEditor({ initialRows, recordedAt }: { initialRows: Row[]; recordedAt: string }) {
  const [rows, setRows] = useState<Row[]>([...initialRows].sort((a, b) => a.position - b.position))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const supabase = createClient()

  function move(index: number, direction: -1 | 1) {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= rows.length) return
    const reordered = [...rows]
    ;[reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]]
    setRows(reordered)
  }

  async function savePositions() {
    setSaving(true)
    setMessage('')

    // Positions are derived from current array order: index 0 = position 1.
    const updates = rows.map((row, i) =>
      supabase
        .from('team_league_positions')
        .update({ position: i + 1 })
        .eq('id', row.id)
    )

    const results = await Promise.all(updates)
    const anyError = results.find(r => r.error)

    if (anyError?.error) {
      setMessage('Error saving: ' + anyError.error.message)
    } else {
      setMessage('Positions saved')
    }
    setSaving(false)
  }

  return (
    <div className="bg-white border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold">Manual Override</h2>
          <p className="text-xs text-gray-500">
            Reorder teams for {new Date(recordedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })}. Position 1 = top of the table.
          </p>
        </div>
        <button
          onClick={savePositions}
          disabled={saving}
          className="bg-black text-white rounded px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Positions'}
        </button>
      </div>

      {message && (
        <p className={`text-sm mb-3 ${message.startsWith('Positions saved') ? 'text-green-600' : 'text-red-600'}`}>{message}</p>
      )}

      <div className="divide-y">
        {rows.map((row, i) => (
          <div key={row.id} className="flex items-center gap-3 py-2">
            <span className="w-6 text-right font-bold text-gray-500">{i + 1}</span>
            <span className="flex-1 text-sm">{row.teamName}</span>
            <div className="flex gap-1">
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="w-7 h-7 rounded border text-xs disabled:opacity-30 hover:border-black"
              >
                ▲
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === rows.length - 1}
                className="w-7 h-7 rounded border text-xs disabled:opacity-30 hover:border-black"
              >
                ▼
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}