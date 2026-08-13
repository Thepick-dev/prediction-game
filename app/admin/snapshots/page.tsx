'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

type Snapshot = { id: string; competition_id: string; created_at: string; created_by: string | null; label: string | null }
type Competition = { id: string; name: string; status: string }

export default function SnapshotsPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [competitionId, setCompetitionId] = useState('')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => { loadCompetitions() }, [])
  useEffect(() => { if (competitionId) loadSnapshots() }, [competitionId])

  async function loadCompetitions() {
    const { data } = await supabase.from('competitions').select('id, name, status').order('created_at', { ascending: false })
    setCompetitions(data ?? [])
    const active = data?.find(c => c.status === 'active')
    setCompetitionId(active?.id ?? data?.[0]?.id ?? '')
    setLoading(false)
  }

  async function loadSnapshots() {
    const res = await fetch('/api/admin/snapshot')
    const data = await res.json()
    setSnapshots((data.snapshots ?? []).filter((s: Snapshot) => s.competition_id === competitionId))
    setSelected(new Set())
  }

  async function saveSnapshot() {
    setSaving(true)
    setMessage('')
    const res = await fetch('/api/admin/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competition_id: competitionId, label: label.trim() }),
    })
    const data = await res.json()
    if (data.error) {
      setMessage('Error: ' + data.error)
    } else {
      setMessage('Snapshot saved.')
      setLabel('')
      loadSnapshots()
    }
    setSaving(false)
  }

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected(prev => prev.size === snapshots.length ? new Set() : new Set(snapshots.map(s => s.id)))
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} snapshot${selected.size === 1 ? '' : 's'}? This can't be undone.`)) return
    setDeleting(true)
    const res = await fetch('/api/admin/snapshot', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected) }),
    })
    const data = await res.json()
    if (data.error) setMessage('Error: ' + data.error)
    else loadSnapshots()
    setDeleting(false)
  }

  async function downloadSnapshot(id: string, label: string | null, createdAt: string) {
    const res = await fetch(`/api/admin/snapshot?id=${id}`)
    const data = await res.json()
    if (data.error) { setMessage('Error: ' + data.error); return }
    const blob = new Blob([JSON.stringify(data.snapshot.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const datePart = createdAt.slice(0, 10)
    a.href = url
    a.download = `snapshot-${datePart}${label ? '-' + label.replace(/[^a-z0-9]+/gi, '-') : ''}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <p className="text-gray-500">Loading...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Competition Snapshots</h1>
      <p className="text-gray-500 text-sm mb-6">
        Save a full, point-in-time copy of everything about a competition — picks, points, tier data, scoring rules,
        the lot — so you can reverse-engineer what happened if something looks wrong later. Nothing is saved
        automatically; each snapshot is only ever taken when you click the button below.
      </p>

      <div className="bg-white border rounded-lg p-4 mb-6 max-w-xl">
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Competition</label>
        <select
          value={competitionId}
          onChange={e => setCompetitionId(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm mb-3"
        >
          {competitions.map(c => (
            <option key={c.id} value={c.id}>{c.name} {c.status === 'active' ? '(active)' : `(${c.status})`}</option>
          ))}
        </select>

        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Label (optional)</label>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. before recalculating GW5"
          className="w-full border rounded px-3 py-2 text-sm mb-3"
        />

        <button
          onClick={saveSnapshot}
          disabled={saving || !competitionId}
          className="bg-black text-white rounded px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Snapshot Now'}
        </button>
        {message && <p className="text-sm mt-2 text-gray-700">{message}</p>}
      </div>

      <div className="bg-white border rounded-lg p-4 max-w-3xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">Saved Snapshots ({snapshots.length})</h2>
          {snapshots.length > 0 && (
            <button
              onClick={deleteSelected}
              disabled={selected.size === 0 || deleting}
              className="bg-red-600 text-white rounded px-3 py-1.5 text-xs font-bold disabled:opacity-40"
            >
              {deleting ? 'Deleting...' : `Delete Selected (${selected.size})`}
            </button>
          )}
        </div>

        {snapshots.length === 0 ? (
          <p className="text-sm text-gray-400">No snapshots saved for this competition yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b">
                <th className="py-2 pr-2">
                  <input type="checkbox" checked={selected.size === snapshots.length} onChange={toggleSelectAll} />
                </th>
                <th className="py-2 pr-2">Saved</th>
                <th className="py-2 pr-2">Label</th>
                <th className="py-2 pr-2"></th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map(s => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2 pr-2">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelected(s.id)} />
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap">{new Date(s.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}</td>
                  <td className="py-2 pr-2 text-gray-600">{s.label || '—'}</td>
                  <td className="py-2 pr-2 text-right">
                    <button onClick={() => downloadSnapshot(s.id, s.label, s.created_at)} className="text-blue-600 hover:underline text-xs font-bold">
                      Download JSON
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
