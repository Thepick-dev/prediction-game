'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Team = { id: number; name: string }
type Player = { id: number; name: string }

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

  const chosenPlayerIds = Object.values(selections).filter((v): v is number => v !== '')
  const allPicked = teams.every(t => selections[t.id])

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
          <div key={team.id}>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--pop-blue)' }}>{team.name}</label>
            <select
              className="pop-input px-3 py-2 text-sm w-full"
              value={selections[team.id] ?? ''}
              onChange={e => {
                const val = e.target.value ? Number(e.target.value) : ''
                setSelections(prev => ({ ...prev, [team.id]: val }))
                if (kickerPlayerId && !Object.values({ ...selections, [team.id]: val }).includes(kickerPlayerId)) {
                  setKickerPlayerId('')
                }
              }}
            >
              <option value="">Select a player...</option>
              {(playersByTeam[team.id] ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
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
