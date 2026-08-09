'use client'

import { useState, useMemo } from 'react'

type PlayerOption = { id: number; name: string; team_name: string }

// A lightweight search-and-select rather than a plain <select> — the full
// player list is too large to scroll through usefully, and this is
// deliberately a rare, high-consequence admin action (see the confirm
// step below), so a bit of extra affordance here is worth it.
export default function BonusCardPlayerPicker({
  action,
  competitionId,
  players,
  currentPlayerName,
}: {
  action: (formData: FormData) => void
  competitionId: string
  players: PlayerOption[]
  currentPlayerName: string | null
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<PlayerOption | null>(null)
  const [confirming, setConfirming] = useState(false)

  const matches = useMemo(() => {
    if (query.length < 2) return []
    const q = query.toLowerCase()
    return players.filter(p => p.name.toLowerCase().includes(q) || p.team_name.toLowerCase().includes(q)).slice(0, 12)
  }, [query, players])

  if (confirming && selected) {
    return (
      <form action={action} className="flex items-center gap-2 flex-wrap">
        <input type="hidden" name="competition_id" value={competitionId} />
        <input type="hidden" name="player_id" value={selected.id} />
        <span className="text-xs text-gray-600">
          Set the Bonus Card to <strong>{selected.name}</strong> ({selected.team_name})? Future plays will use this player — anything already played is unaffected.
        </span>
        <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Confirm</button>
        <button type="button" onClick={() => setConfirming(false)} className="text-xs bg-gray-200 text-gray-700 rounded px-2 py-1">Cancel</button>
      </form>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500">Current: <strong>{currentPlayerName ?? 'None set'}</strong></span>
      <div className="relative">
        <input
          value={selected ? `${selected.name} (${selected.team_name})` : query}
          onChange={e => { setSelected(null); setQuery(e.target.value) }}
          placeholder="Search player name..."
          className="border rounded px-2 py-1 text-xs w-56"
        />
        {matches.length > 0 && !selected && (
          <div className="absolute z-10 bg-white border rounded shadow-lg mt-1 w-64 max-h-56 overflow-y-auto">
            {matches.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setSelected(p); setQuery('') }}
                className="block w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100"
              >
                {p.name} <span className="text-gray-400">({p.team_name})</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <button type="button" onClick={() => setConfirming(true)} className="text-xs bg-black text-white rounded px-2 py-1">
          Set Player
        </button>
      )}
    </div>
  )
}
