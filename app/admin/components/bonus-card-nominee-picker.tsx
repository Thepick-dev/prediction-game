'use client'

import { useState, useMemo } from 'react'

type PlayerOption = { id: number; name: string; team_name: string }

// A search-and-add widget for the optional Bonus Card nominee POOL — sits
// alongside BonusCardPlayerPicker (the original single-player version) but
// deliberately simpler: adding a player to the pool is low-stakes and
// reversible (see the Remove/Re-add toggle above this), so there's no
// confirm step here.
export default function BonusCardNomineePicker({
  action,
  competitionId,
  players,
}: {
  action: (formData: FormData) => void
  competitionId: string
  players: PlayerOption[]
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<PlayerOption | null>(null)

  const matches = useMemo(() => {
    if (query.length < 2) return []
    const q = query.toLowerCase()
    return players.filter(p => p.name.toLowerCase().includes(q) || p.team_name.toLowerCase().includes(q)).slice(0, 12)
  }, [query, players])

  return (
    <form action={action} className="flex items-center gap-2 flex-wrap">
      <input type="hidden" name="competition_id" value={competitionId} />
      {selected && <input type="hidden" name="player_id" value={selected.id} />}
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
        <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">
          Add to pool
        </button>
      )}
    </form>
  )
}
