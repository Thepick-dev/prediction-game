'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type QuestionType = { type_key: string; label: string; answer_type: string }
type Team = { id: number; name: string }
type Player = { id: number; name: string }
type FixtureLabel = { id: number; label: string }
type ExistingAnswer = { type_key: string; answer_team_id: number | null; answer_player_id: number | null; answer_numeric: number | null; answer_fixture_id: number | null }

type FixtureInfo = { id: number; homeTeam: string; awayTeam: string }
type Winner = 'home' | 'away' | 'draw'
type ExistingMatchPred = {
  fixture_id: number
  predicted_winner: Winner
  predicted_margin: number | null
  is_confidence_pick: boolean
  predicted_home_try_bonus: boolean | null
  predicted_away_try_bonus: boolean | null
}
type MatchRowState = {
  winner: Winner | ''
  margin: string
  homeTryBonus: boolean | null
  awayTryBonus: boolean | null
}

// Each nation's own real shirt colours — a selected team button lights up
// as itself, not as one generic "selected" colour, so picking Ireland
// looks and feels different from picking Wales.
const TEAM_COLOURS: Record<string, { fill: string; text: string }> = {
  England: { fill: '#FFFFFF', text: '#C8102E' },
  Ireland: { fill: '#169B62', text: '#FFFFFF' },
  Wales: { fill: '#C8102E', text: '#FFFFFF' },
  Scotland: { fill: '#0C1E3C', text: '#FFFFFF' },
  France: { fill: '#0055A4', text: '#FFFFFF' },
  Italy: { fill: '#0088CE', text: '#FFFFFF' },
}
const DEFAULT_COLOURS = { fill: 'var(--pop-blue)', text: 'var(--pop-black)' }
const DRAW_COLOURS = { fill: 'var(--pop-pink)', text: 'var(--pop-white)' }

function teamColours(name: string) {
  return TEAM_COLOURS[name] ?? DEFAULT_COLOURS
}

// Toggle button used everywhere in this form for a binary/ternary choice —
// bold, filled when active, plenty of touch target, no small print. The
// one shared visual language behind winner picks, try-bonus calls, and
// the confidence pick, so the whole page reads as one game, not three
// different forms bolted together.
function ChoiceButton({ label, active, fill, text, onClick }: { label: string; active: boolean; fill: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pop-name w-full py-3 px-2 rounded-lg text-sm text-center"
      style={{
        background: active ? fill : 'rgba(255,255,255,0.06)',
        color: active ? text : 'rgba(255,255,255,0.8)',
        border: active ? `2px solid ${fill}` : '2px solid rgba(255,255,255,0.15)',
        boxShadow: active ? `0 0 16px ${fill}80` : 'none',
        fontWeight: active ? 900 : 700,
      }}
    >
      {label}
    </button>
  )
}

export default function RugbyPicksForm({
  competitionId,
  showSeasonPredictions,
  questions,
  teams,
  players,
  fixtureLabels,
  existingAnswers,
  showMatchPredictions,
  roundId,
  roundNumber,
  fixtures,
  existingMatchPreds,
}: {
  competitionId: string
  showSeasonPredictions: boolean
  questions: QuestionType[]
  teams: Team[]
  players: Player[]
  fixtureLabels: FixtureLabel[]
  existingAnswers: ExistingAnswer[]
  showMatchPredictions: boolean
  roundId: string | null
  roundNumber: number | null
  fixtures: FixtureInfo[]
  existingMatchPreds: ExistingMatchPred[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // --- Season predictions state ---
  const existingByKey = new Map(existingAnswers.map(a => [a.type_key, a]))
  const [answers, setAnswers] = useState<Record<string, number | null>>(() => {
    const initial: Record<string, number | null> = {}
    questions.forEach(q => {
      const existing = existingByKey.get(q.type_key)
      initial[q.type_key] = existing ? (existing.answer_team_id ?? existing.answer_player_id ?? existing.answer_numeric ?? existing.answer_fixture_id ?? null) : null
    })
    return initial
  })
  const [playerSearches, setPlayerSearches] = useState<Record<string, string>>({})

  // --- Match predictions state ---
  const existingByFixture = new Map(existingMatchPreds.map(e => [e.fixture_id, e]))
  const [rows, setRows] = useState<Record<number, MatchRowState>>(() => {
    const initial: Record<number, MatchRowState> = {}
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
    existingMatchPreds.find(e => e.is_confidence_pick)?.fixture_id ?? null
  )

  function updateRow(fixtureId: number, patch: Partial<MatchRowState>) {
    setRows(prev => ({ ...prev, [fixtureId]: { ...prev[fixtureId], ...patch } }))
  }

  const seasonValid = !showSeasonPredictions || questions.every(q => answers[q.type_key] != null)
  const matchValid = !showMatchPredictions || (
    fixtures.every(f => {
      const r = rows[f.id]
      if (!r || r.winner === '') return false
      if (r.winner !== 'draw' && (r.margin === '' || Number(r.margin) < 1)) return false
      return r.homeTryBonus !== null && r.awayTryBonus !== null
    }) && confidenceFixtureId != null
  )
  const allValid = seasonValid && matchValid

  const hasExistingSeason = showSeasonPredictions && existingAnswers.length > 0
  const hasExistingMatch = showMatchPredictions && existingMatchPreds.length > 0
  const isUpdate = hasExistingSeason || hasExistingMatch

  async function submit() {
    if (!allValid) return
    setSaving(true)
    setMessage('')

    const calls: Promise<{ error?: string }>[] = []

    if (showSeasonPredictions) {
      const payload = questions.map(q => {
        const value = answers[q.type_key]
        const base = { type_key: q.type_key }
        if (q.answer_type === 'team') return { ...base, answer_team_id: value }
        if (q.answer_type === 'player') return { ...base, answer_player_id: value }
        if (q.answer_type === 'fixture') return { ...base, answer_fixture_id: value }
        return { ...base, answer_numeric: value }
      })
      calls.push(
        fetch('/api/rugby/season-predictions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ competition_id: competitionId, answers: payload }),
        }).then(r => r.json())
      )
    }

    if (showMatchPredictions && roundId) {
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
      calls.push(
        fetch('/api/rugby/match-predictions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ round_id: roundId, predictions }),
        }).then(r => r.json())
      )
    }

    const results = await Promise.all(calls)
    const errors = results.map(r => r.error).filter(Boolean) as string[]
    setSaving(false)
    if (errors.length > 0) {
      setMessage(errors.join(' — '))
      return
    }
    setMessage(isUpdate ? 'Updated!' : 'Confirmed!')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {showSeasonPredictions && (
        <div className="pop-panel pop-panel--blue p-5">
          <h2 className="pop-headline text-sm mb-4" style={{ color: 'var(--pop-white)' }}>Tournament Predictions</h2>
          <div className="space-y-4">
            {questions.map(q => (
              <div key={q.type_key}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--pop-blue)' }}>{q.label}</label>
                {q.answer_type === 'team' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {teams.map(t => {
                      const c = teamColours(t.name)
                      return (
                        <ChoiceButton
                          key={t.id}
                          label={t.name}
                          active={answers[q.type_key] === t.id}
                          fill={c.fill}
                          text={c.text}
                          onClick={() => setAnswers(prev => ({ ...prev, [q.type_key]: t.id }))}
                        />
                      )
                    })}
                  </div>
                )}
                {q.answer_type === 'fixture' && (
                  <select className="pop-input px-3 py-2 text-sm w-full" value={answers[q.type_key] ?? ''} onChange={e => setAnswers(prev => ({ ...prev, [q.type_key]: e.target.value ? Number(e.target.value) : null }))}>
                    <option value="">Select...</option>
                    {fixtureLabels.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
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
                      <div className="pop-input flex items-center justify-between px-3 py-2 text-sm pop-name">
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
                                className="pop-name block w-full text-left px-3 py-1.5 text-sm hover:opacity-80" style={{ background: 'var(--pop-surface)', color: 'var(--pop-white)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
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
          </div>
        </div>
      )}

      {showMatchPredictions && roundNumber && (
        <div className="pop-panel pop-panel--yellow p-5">
          <h2 className="pop-headline text-sm mb-4" style={{ color: 'var(--pop-white)' }}>Round {roundNumber} Match Predictions</h2>
          <div className="space-y-4">
            {fixtures.map(f => {
              const r = rows[f.id]
              return (
                <div key={f.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    <ChoiceButton label={f.homeTeam} active={r.winner === 'home'} fill={teamColours(f.homeTeam).fill} text={teamColours(f.homeTeam).text} onClick={() => updateRow(f.id, { winner: 'home', margin: r.margin })} />
                    <ChoiceButton label="Draw" active={r.winner === 'draw'} fill={DRAW_COLOURS.fill} text={DRAW_COLOURS.text} onClick={() => updateRow(f.id, { winner: 'draw', margin: '' })} />
                    <ChoiceButton label={f.awayTeam} active={r.winner === 'away'} fill={teamColours(f.awayTeam).fill} text={teamColours(f.awayTeam).text} onClick={() => updateRow(f.id, { winner: 'away', margin: r.margin })} />
                  </div>

                  {r.winner !== '' && r.winner !== 'draw' && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>Winning margin</span>
                      <input
                        type="number" min="1" placeholder="pts"
                        value={r.margin}
                        onChange={e => updateRow(f.id, { margin: e.target.value })}
                        className="pop-input px-2 py-1.5 text-sm w-20 text-center"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>🏉 {f.homeTeam} try bonus</p>
                      <div className="flex gap-1.5">
                        <ChoiceButton label="Yes" active={r.homeTryBonus === true} fill="var(--pop-green)" text="var(--pop-black)" onClick={() => updateRow(f.id, { homeTryBonus: true })} />
                        <ChoiceButton label="No" active={r.homeTryBonus === false} fill="var(--pop-red)" text="var(--pop-white)" onClick={() => updateRow(f.id, { homeTryBonus: false })} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>🏉 {f.awayTeam} try bonus</p>
                      <div className="flex gap-1.5">
                        <ChoiceButton label="Yes" active={r.awayTryBonus === true} fill="var(--pop-green)" text="var(--pop-black)" onClick={() => updateRow(f.id, { awayTryBonus: true })} />
                        <ChoiceButton label="No" active={r.awayTryBonus === false} fill="var(--pop-red)" text="var(--pop-white)" onClick={() => updateRow(f.id, { awayTryBonus: false })} />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setConfidenceFixtureId(f.id)}
                    className="pop-name w-full py-2.5 rounded-lg text-xs"
                    style={{
                      background: confidenceFixtureId === f.id ? 'var(--pop-orange)' : 'rgba(255,255,255,0.06)',
                      color: confidenceFixtureId === f.id ? 'var(--pop-black)' : 'rgba(255,255,255,0.8)',
                      border: confidenceFixtureId === f.id ? '2px solid var(--pop-orange)' : '2px solid rgba(255,255,255,0.12)',
                      boxShadow: confidenceFixtureId === f.id ? '0 0 16px rgba(250,97,0,0.5)' : 'none',
                      fontWeight: 900,
                    }}
                  >
                    {confidenceFixtureId === f.id ? '⭐ CONFIDENCE PICK' : 'Make this my confidence pick'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {message && (
        <p className="text-sm text-center" style={{ color: message === 'Confirmed!' || message === 'Updated!' ? 'var(--pop-green)' : 'var(--pop-red)' }}>{message}</p>
      )}

      <button onClick={submit} disabled={!allValid || saving} className="pop-button pop-button--green w-full py-3 text-base">
        {saving ? 'Saving…' : isUpdate ? 'Update My Picks' : 'Confirm My Picks'}
      </button>
    </div>
  )
}
