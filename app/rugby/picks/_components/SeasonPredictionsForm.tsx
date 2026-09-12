'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type QuestionType = { type_key: string; label: string; answer_type: string }
type Team = { id: number; name: string }
type Player = { id: number; name: string }
type Fixture = { id: number; label: string }
type ExistingAnswer = { type_key: string; answer_team_id: number | null; answer_player_id: number | null; answer_numeric: number | null; answer_fixture_id: number | null }

export default function SeasonPredictionsForm({
  competitionId,
  questions,
  teams,
  players,
  fixtures,
  existingAnswers,
}: {
  competitionId: string
  questions: QuestionType[]
  teams: Team[]
  players: Player[]
  fixtures: Fixture[]
  existingAnswers: ExistingAnswer[]
}) {
  const existingByKey = new Map(existingAnswers.map(a => [a.type_key, a]))
  const [answers, setAnswers] = useState<Record<string, number | null>>(() => {
    const initial: Record<string, number | null> = {}
    questions.forEach(q => {
      const existing = existingByKey.get(q.type_key)
      if (!existing) { initial[q.type_key] = null; return }
      initial[q.type_key] = existing.answer_team_id ?? existing.answer_player_id ?? existing.answer_numeric ?? existing.answer_fixture_id ?? null
    })
    return initial
  })
  const [playerSearches, setPlayerSearches] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  const allAnswered = questions.every(q => answers[q.type_key] != null)

  async function submit() {
    setSaving(true)
    setMessage('')
    const payload = questions.map(q => {
      const value = answers[q.type_key]
      const base = { type_key: q.type_key }
      if (q.answer_type === 'team') return { ...base, answer_team_id: value }
      if (q.answer_type === 'player') return { ...base, answer_player_id: value }
      if (q.answer_type === 'fixture') return { ...base, answer_fixture_id: value }
      return { ...base, answer_numeric: value }
    })
    const res = await fetch('/api/rugby/season-predictions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competition_id: competitionId, answers: payload }),
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
      {questions.map(q => (
        <div key={q.type_key}>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--pop-blue)' }}>{q.label}</label>
          {q.answer_type === 'team' && (
            <select className="pop-input px-3 py-2 text-sm w-full" value={answers[q.type_key] ?? ''} onChange={e => setAnswers(prev => ({ ...prev, [q.type_key]: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">Select...</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {q.answer_type === 'fixture' && (
            <select className="pop-input px-3 py-2 text-sm w-full" value={answers[q.type_key] ?? ''} onChange={e => setAnswers(prev => ({ ...prev, [q.type_key]: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">Select...</option>
              {fixtures.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          )}
          {q.answer_type === 'numeric' && (
            <input type="number" className="pop-input px-3 py-2 text-sm w-full max-w-[140px]" value={answers[q.type_key] ?? ''} onChange={e => setAnswers(prev => ({ ...prev, [q.type_key]: e.target.value ? Number(e.target.value) : null }))} />
          )}
          {q.answer_type === 'player' && (
            (() => {
              const selected = players.find(p => p.id === answers[q.type_key])
              const search = playerSearches[q.type_key] ?? ''
              const matches = search.trim().length >= 1 ? players.filter(p => p.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8) : []
              return selected ? (
                <div className="pop-input flex items-center justify-between px-3 py-2 text-sm">
                  <span>{selected.name}</span>
                  <button type="button" onClick={() => setAnswers(prev => ({ ...prev, [q.type_key]: null }))} className="text-xs" style={{ color: 'var(--pop-red)' }}>✕</button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={search}
                    onChange={e => setPlayerSearches(prev => ({ ...prev, [q.type_key]: e.target.value }))}
                    placeholder="Type a player's name..."
                    className="pop-input px-3 py-2 text-sm w-full"
                  />
                  {matches.length > 0 && (
                    <div className="mt-1 rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
                      {matches.map(p => (
                        <button key={p.id} type="button" onClick={() => { setAnswers(prev => ({ ...prev, [q.type_key]: p.id })); setPlayerSearches(prev => ({ ...prev, [q.type_key]: '' })) }}
                          className="block w-full text-left px-3 py-1.5 text-sm hover:opacity-80" style={{ background: 'var(--pop-surface)', color: 'var(--pop-white)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )
            })()
          )}
        </div>
      ))}

      {message && <p className="text-sm" style={{ color: 'var(--pop-red)' }}>{message}</p>}

      <button onClick={submit} disabled={!allAnswered || saving} className="pop-button pop-button--green">
        {saving ? 'Saving…' : 'Confirm Tournament Predictions'}
      </button>
    </div>
  )
}
