'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type FixtureInfo = { id: number; homeTeam: string; awayTeam: string }
type Winner = 'home' | 'away' | 'draw'
type Existing = {
  fixture_id: number
  predicted_winner: Winner
  predicted_margin: number | null
  is_confidence_pick: boolean
  predicted_home_try_bonus: boolean | null
  predicted_away_try_bonus: boolean | null
}

type RowState = {
  winner: Winner | ''
  margin: string
  homeTryBonus: boolean | null
  awayTryBonus: boolean | null
}

export default function MatchPredictionsForm({
  roundId,
  roundNumber,
  fixtures,
  existing,
}: {
  roundId: string
  roundNumber: number
  fixtures: FixtureInfo[]
  existing: Existing[]
}) {
  const existingByFixture = new Map(existing.map(e => [e.fixture_id, e]))

  const [rows, setRows] = useState<Record<number, RowState>>(() => {
    const initial: Record<number, RowState> = {}
    fixtures.forEach(f => {
      const e = existingByFixture.get(f.id)
      initial[f.id] = {
        winner: e?.predicted_winner ?? '',
        margin: e?.predicted_margin != null ? String(e.predicted_margin) : '',
        homeTryBonus: e?.predicted_home_try_bonus ?? null,
        awayTryBonus: e?.predicted_away_try_bonus ?? null,
      }
    })
    return initial
  })
  const [confidenceFixtureId, setConfidenceFixtureId] = useState<number | null>(
    existing.find(e => e.is_confidence_pick)?.fixture_id ?? null
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  function updateRow(fixtureId: number, patch: Partial<RowState>) {
    setRows(prev => ({ ...prev, [fixtureId]: { ...prev[fixtureId], ...patch } }))
  }

  const allValid = fixtures.every(f => {
    const r = rows[f.id]
    if (!r || r.winner === '') return false
    if (r.winner !== 'draw' && (r.margin === '' || Number(r.margin) < 1)) return false
    if (r.homeTryBonus === null || r.awayTryBonus === null) return false
    return true
  }) && confidenceFixtureId != null

  async function submit() {
    if (!allValid) return
    setSaving(true)
    setMessage('')
    const predictions = fixtures.map(f => {
      const r = rows[f.id]
      return {
        fixture_id: f.id,
        predicted_winner: r.winner,
        predicted_margin: r.winner === 'draw' ? null : Number(r.margin),
        is_confidence_pick: f.id === confidenceFixtureId,
        predicted_home_try_bonus: r.homeTryBonus,
        predicted_away_try_bonus: r.awayTryBonus,
      }
    })
    const res = await fetch('/api/rugby/match-predictions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ round_id: roundId, predictions }),
    })
    const data = await res.json()
    if (!res.ok || data.error) {
      setMessage(data.error ?? 'Could not save your predictions')
      setSaving(false)
      return
    }
    setMessage('Saved — you can keep changing this until the deadline')
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
        Pick the winner (or a draw) and the margin for each match, say whether each team scores a try bonus
        (4+ tries), and choose ONE match as your confidence pick. You can keep changing all of this until the
        round&apos;s deadline.
      </p>
      {fixtures.map(f => {
        const r = rows[f.id]
        return (
          <div key={f.id} className="pop-panel pop-panel--blue p-4">
            <p className="text-base pop-name mb-3" style={{ color: 'var(--pop-white)' }}>{f.homeTeam} v {f.awayTeam}</p>

            <div className="flex items-center gap-2 flex-wrap mb-3">
              {(['home', 'draw', 'away'] as Winner[]).map(w => (
                <button
                  key={w}
                  type="button"
                  onClick={() => updateRow(f.id, { winner: w, margin: w === 'draw' ? '' : r.margin })}
                  className="text-xs pop-name px-3 py-1.5 rounded"
                  style={{
                    background: r.winner === w ? 'var(--pop-blue)' : 'rgba(255,255,255,0.08)',
                    color: r.winner === w ? 'var(--pop-black)' : 'rgba(255,255,255,0.7)',
                    fontWeight: r.winner === w ? 700 : 400,
                  }}
                >
                  {w === 'home' ? f.homeTeam : w === 'away' ? f.awayTeam : 'Draw'}
                </button>
              ))}
              {r.winner !== '' && r.winner !== 'draw' && (
                <span className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  by
                  <input
                    type="number" min="1" placeholder="pts"
                    value={r.margin}
                    onChange={e => updateRow(f.id, { margin: e.target.value })}
                    className="pop-input px-2 py-1 text-sm w-16 text-center"
                  />
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 flex-wrap mb-3 text-xs">
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>Try bonus:</span>
              {([{ label: f.homeTeam, key: 'homeTryBonus' as const }, { label: f.awayTeam, key: 'awayTryBonus' as const }]).map(({ label, key }) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
                  {[true, false].map(val => (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => updateRow(f.id, { [key]: val } as Partial<RowState>)}
                      className="px-2 py-0.5 rounded"
                      style={{
                        background: r[key] === val ? 'var(--pop-green)' : 'rgba(255,255,255,0.08)',
                        color: r[key] === val ? 'var(--pop-black)' : 'rgba(255,255,255,0.6)',
                        fontWeight: r[key] === val ? 700 : 400,
                      }}
                    >
                      {val ? 'Yes' : 'No'}
                    </button>
                  ))}
                </span>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: confidenceFixtureId === f.id ? 'var(--pop-orange)' : 'rgba(255,255,255,0.5)' }}>
              <input
                type="radio"
                name="confidence-pick"
                checked={confidenceFixtureId === f.id}
                onChange={() => setConfidenceFixtureId(f.id)}
              />
              Make this my confidence pick this round
            </label>
          </div>
        )
      })}

      {message && <p className="text-sm" style={{ color: message.startsWith('Saved') ? 'var(--pop-green)' : 'var(--pop-red)' }}>{message}</p>}

      <button onClick={submit} disabled={!allValid || saving} className="pop-button pop-button--green">
        {saving ? 'Saving…' : `Confirm Round ${roundNumber} Predictions`}
      </button>
    </div>
  )
}
