'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type FixtureInfo = { id: number; homeTeam: string; awayTeam: string }
type Existing = { fixture_id: number; predicted_home_score: number; predicted_away_score: number; confidence: number }

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
  const [scores, setScores] = useState<Record<number, { home: string; away: string }>>(() => {
    const initial: Record<number, { home: string; away: string }> = {}
    fixtures.forEach(f => {
      const e = existingByFixture.get(f.id)
      initial[f.id] = { home: e ? String(e.predicted_home_score) : '', away: e ? String(e.predicted_away_score) : '' }
    })
    return initial
  })
  const [confidences, setConfidences] = useState<Record<number, number | ''>>(() => {
    const initial: Record<number, number | ''> = {}
    fixtures.forEach(f => { initial[f.id] = existingByFixture.get(f.id)?.confidence ?? '' })
    return initial
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  const allScoresFilled = fixtures.every(f => scores[f.id]?.home !== '' && scores[f.id]?.away !== '')
  const usedConfidences = fixtures.map(f => confidences[f.id]).filter(c => c !== '')
  const confidenceValid = usedConfidences.length === 3 && new Set(usedConfidences).size === 3

  function setConfidence(fixtureId: number, value: number) {
    setConfidences(prev => {
      const next = { ...prev }
      // Swap: if another fixture already has this confidence value, give
      // it whatever this fixture is giving up.
      const currentForThis = prev[fixtureId]
      for (const f of fixtures) {
        if (f.id !== fixtureId && next[f.id] === value) next[f.id] = currentForThis
      }
      next[fixtureId] = value
      return next
    })
  }

  async function submit() {
    if (!allScoresFilled || !confidenceValid) return
    setSaving(true)
    setMessage('')
    const predictions = fixtures.map(f => ({
      fixture_id: f.id,
      predicted_home_score: Number(scores[f.id].home),
      predicted_away_score: Number(scores[f.id].away),
      confidence: confidences[f.id],
    }))
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
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
        Predict each score, then rank your three picks by confidence (1st = most confident). A wrong pick at high
        confidence costs you more, so rank honestly.
      </p>
      {fixtures.map(f => (
        <div key={f.id} className="flex items-center gap-3 flex-wrap py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <span className="text-sm flex-1 min-w-[140px]" style={{ color: 'var(--pop-white)' }}>{f.homeTeam} v {f.awayTeam}</span>
          <input
            type="number" min="0" placeholder="H"
            value={scores[f.id]?.home ?? ''}
            onChange={e => setScores(prev => ({ ...prev, [f.id]: { ...prev[f.id], home: e.target.value } }))}
            className="pop-input px-2 py-1 text-sm w-14 text-center"
          />
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>-</span>
          <input
            type="number" min="0" placeholder="A"
            value={scores[f.id]?.away ?? ''}
            onChange={e => setScores(prev => ({ ...prev, [f.id]: { ...prev[f.id], away: e.target.value } }))}
            className="pop-input px-2 py-1 text-sm w-14 text-center"
          />
          <select
            className="pop-input px-2 py-1 text-xs"
            value={confidences[f.id]}
            onChange={e => setConfidence(f.id, Number(e.target.value))}
          >
            <option value="">Confidence...</option>
            <option value={1}>1st (most confident)</option>
            <option value={2}>2nd</option>
            <option value={3}>3rd</option>
          </select>
        </div>
      ))}

      {message && <p className="text-sm" style={{ color: 'var(--pop-red)' }}>{message}</p>}

      <button onClick={submit} disabled={!allScoresFilled || !confidenceValid || saving} className="pop-button pop-button--green">
        {saving ? 'Saving…' : `Confirm Round ${roundNumber} Predictions`}
      </button>
    </div>
  )
}
