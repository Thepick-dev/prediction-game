'use client'

import { useMemo, useState } from 'react'

export type DraftableRow = {
  id: number
  name: string
  country: string
  position: string | null
  value: number | null
  isDraftable: boolean
}

type SortKey = 'name' | 'country' | 'position' | 'value'

async function setDraftable(playerIds: number[], draftable: boolean) {
  const res = await fetch('/api/admin/rugby/draftable', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_ids: playerIds, draftable }),
  })
  return res.json()
}

export default function DraftablePlayersTable({ initialRows }: { initialRows: DraftableRow[] }) {
  const [rows, setRows] = useState(initialRows)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<1 | -1>(1)
  const [busy, setBusy] = useState(false)

  const draftableCount = useMemo(() => rows.filter(r => r.isDraftable).length, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.name.toLowerCase().includes(q) || r.country.toLowerCase().includes(q) || (r.position ?? '').toLowerCase().includes(q))
  }, [rows, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? (typeof a.value === 'number' ? -Infinity : '')
      const bv = b[sortKey] ?? (typeof b.value === 'number' ? -Infinity : '')
      if (typeof av === 'string') return av.localeCompare(bv as string) * sortDir
      return ((av as number) - (bv as number)) * sortDir
    })
  }, [filtered, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortKey(key); setSortDir(1) }
  }

  async function toggleOne(id: number, next: boolean) {
    setBusy(true)
    setRows(prev => prev.map(r => (r.id === id ? { ...r, isDraftable: next } : r)))
    await setDraftable([id], next)
    setBusy(false)
  }

  async function setAllVisible(next: boolean) {
    if (filtered.length === 0) return
    setBusy(true)
    const ids = filtered.map(r => r.id)
    setRows(prev => prev.map(r => (ids.includes(r.id) ? { ...r, isDraftable: next } : r)))
    await setDraftable(ids, next)
    setBusy(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="text-sm font-bold">{draftableCount} of {rows.length} draftable</div>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search player, country or position..."
          className="border rounded px-3 py-2 text-sm w-full sm:w-72"
        />
      </div>

      {search.trim() && (
        <div className="flex gap-2 mb-3">
          <button type="button" disabled={busy} onClick={() => setAllVisible(true)} className="bg-black text-white rounded px-3 py-1.5 text-xs font-bold">
            Set all {filtered.length} visible draftable
          </button>
          <button type="button" disabled={busy} onClick={() => setAllVisible(false)} className="border border-black rounded px-3 py-1.5 text-xs font-bold">
            Set all {filtered.length} visible not draftable
          </button>
        </div>
      )}

      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="text-xs w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="border-b">
              {([['name', 'Player'], ['country', 'Country'], ['position', 'Position'], ['value', 'Value']] as [SortKey, string][]).map(([key, label]) => (
                <th key={key} onClick={() => toggleSort(key)} className="text-left font-bold py-2 px-3 cursor-pointer select-none whitespace-nowrap">
                  {label}{sortKey === key ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              <th className="text-right py-2 px-3">Draftable</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 100).map(r => (
              <tr key={r.id} className="border-b" style={{ background: r.isDraftable ? 'rgba(0,150,0,0.04)' : undefined }}>
                <td className="py-1.5 px-3 font-medium whitespace-nowrap">{r.name}</td>
                <td className="py-1.5 px-3 whitespace-nowrap">{r.country}</td>
                <td className="py-1.5 px-3 whitespace-nowrap">{r.position ?? '—'}</td>
                <td className="py-1.5 px-3 whitespace-nowrap">{r.value != null ? `£${r.value.toLocaleString()}` : '—'}</td>
                <td className="py-1.5 px-3 text-right">
                  <input type="checkbox" checked={r.isDraftable} disabled={busy} onChange={e => toggleOne(r.id, e.target.checked)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-xs text-gray-500 px-3 py-2 border-t">
          {sorted.length > 100 ? `showing 100 / ${sorted.length.toLocaleString()} — search to narrow` : `${sorted.length.toLocaleString()} player${sorted.length === 1 ? '' : 's'}`}
        </div>
      </div>
    </div>
  )
}
