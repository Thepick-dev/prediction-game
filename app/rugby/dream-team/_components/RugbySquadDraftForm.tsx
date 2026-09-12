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
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <p className="pop-name text-sm mb-2" style={{ color: 'var(--pop-blue)' }}>{team.name}</p>
      {selected ? (
        <div className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: 'rgba(0,242,250,0.1)', border: '1.5px solid var(--pop-blue)' }}>
          <span className="pop-name text-base" style={{ color: 'var(--pop-white)' }}>{selected.name}</span>
          <button type="button" onClick={onClear} className="text-sm shrink-0 ml-2" style={{ color: 'var(--pop-red)' }}>✕</button>
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
                  className="pop-name block w-full text-left px-3 py-2 text-sm hover:opacity-80"
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
  existingSelections,
  existingKickerPlayerId,
}: {
  competitionId: string
  teams: Team[]
  playersByTeam: Record<number, Player[]>
  existingSelections?: Record<number, number>
  existingKickerPlayerId?: number
}) {
  const [selections, setSelections] = useState<Record<number, number | ''>>(existingSelections ?? {})
  const [kickerPlayerId, setKickerPlayerId] = useState<number | ''>(existingKickerPlayerId ?? '')
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
      setError(data.error ?? 'Could not save your Dream Team')
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
          <p className="text-xs uppercase tracking-wide font-bold mb-2" style={{ color: 'var(--pop-orange)' }}>Pick your kicker</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {teams.map(t => {
              const pid = selections[t.id]
              if (!pid) return null
              const player = (playersByTeam[t.id] ?? []).find(p => p.id === pid)
              if (!player) return null
              const active = kickerPlayerId === pid
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => setKickerPlayerId(pid)}
                  className="pop-name py-2.5 px-2 rounded-lg text-sm text-center"
                  style={{
                    background: active ? 'var(--pop-orange)' : 'rgba(255,255,255,0.06)',
                    color: active ? 'var(--pop-black)' : 'rgba(255,255,255,0.65)',
                    border: active ? '2px solid var(--pop-orange)' : '2px solid rgba(255,255,255,0.12)',
                    boxShadow: active ? '0 0 16px rgba(250,97,0,0.5)' : 'none',
                    fontWeight: active ? 900 : 700,
                  }}
                >
                  {player.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {error && <p className="text-sm" style={{ color: 'var(--pop-red)' }}>{error}</p>}

      <button
        onClick={submit}
        disabled={!allPicked || !kickerPlayerId || saving}
        className="pop-button pop-button--green w-full py-3 text-base"
      >
        {saving ? 'Saving…' : 'Confirm Dream Team'}
      </button>
    </div>
  )
}
