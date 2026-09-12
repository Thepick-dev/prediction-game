'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Team = { id: number; name: string }
type Player = { id: number; name: string }

function PlayerSearchPicker({
  team,
  players,
  selectedId,
  onSelect,
  onClear,
}: {
  team: Team
  players: Player[]
  selectedId: number | ''
  onSelect: (playerId: number) => void
  onClear: () => void
}) {
  const [search, setSearch] = useState('')
  const selected = players.find(p => p.id === selectedId)
  const matches = search.trim().length >= 1
    ? players.filter(p => p.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : []

  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--pop-blue)' }}>{team.name}</label>
      {selected ? (
        <div className="pop-input flex items-center justify-between px-3 py-2 text-sm">
          <span>{selected.name}</span>
          <button type="button" onClick={onClear} className="text-xs" style={{ color: 'var(--pop-red)' }}>✕</button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Type a player's name..."
            className="pop-input px-3 py-2 text-sm w-full"
          />
          {matches.length > 0 && (
            <div className="mt-1 rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
              {matches.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onSelect(p.id); setSearch('') }}
                  className="block w-full text-left px-3 py-1.5 text-sm hover:opacity-80"
                  style={{ background: 'var(--pop-surface)', color: 'var(--pop-white)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function RugbySquadDraftForm({
  competitionId,
  teams,
  playersByTeam,
}: {
  competitionId: string
  teams: Team[]
  playersByTeam: Record<number, Player[]>
}) {
  const [selections, setSelections] = useState<Record<number, number | ''>>({})
  const [kickerPlayerId, setKickerPlayerId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const allPicked = teams.every(t => selections[t.id])

  function selectPlayer(teamId: number, playerId: number) {
    setSelections(prev => ({ ...prev, [teamId]: playerId }))
  }
  function clearPlayer(teamId: number) {
    setSelections(prev => {
      const next = { ...prev, [teamId]: '' as const }
      return next
    })
    const clearedPlayerId = selections[teamId]
    if (kickerPlayerId && kickerPlayerId === clearedPlayerId) setKickerPlayerId('')
  }

  async function submit() {
    if (!allPicked || !kickerPlayerId) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/rugby/squad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        competition_id: competitionId,
        picks: teams.map(t => ({ player_id: selections[t.id] })),
        kicker_player_id: kickerPlayerId,
      }),
    })
    const data = await res.json()
    if (!res.ok || data.error) {
      setError(data.error ?? 'Could not save your squad')
      setSaving(false)
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
        Pick one player from each team — six in total — then mark one as your kicker. Locked in once Round 1&apos;s
        deadline passes.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {teams.map(team => (
          <PlayerSearchPicker
            key={team.id}
            team={team}
            players={playersByTeam[team.id] ?? []}
            selectedId={selections[team.id] ?? ''}
            onSelect={pid => selectPlayer(team.id, pid)}
            onClear={() => clearPlayer(team.id)}
          />
        ))}
      </div>

      {allPicked && (
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--pop-orange)' }}>Kicker (scores for tries + kicks)</label>
          <select
            className="pop-input px-3 py-2 text-sm w-full max-w-xs"
            value={kickerPlayerId}
            onChange={e => setKickerPlayerId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Select your kicker...</option>
            {teams.map(t => {
              const pid = selections[t.id]
              if (!pid) return null
              const player = (playersByTeam[t.id] ?? []).find(p => p.id === pid)
              return player ? <option key={pid} value={pid}>{player.name} ({t.name})</option> : null
            })}
          </select>
        </div>
      )}

      {error && <p className="text-sm" style={{ color: 'var(--pop-red)' }}>{error}</p>}

      <button
        onClick={submit}
        disabled={!allPicked || !kickerPlayerId || saving}
        className="pop-button pop-button--green"
      >
        {saving ? 'Saving…' : 'Confirm Squad'}
      </button>
    </div>
  )
}
