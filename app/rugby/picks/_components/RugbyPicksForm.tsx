'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { rugbyTeamColours as teamColours, DRAW_COLOURS } from '../../../lib/rugbyTeamColours'
import RugbySquadBuilder, { type BuilderPlayer } from './RugbySquadBuilder'

type Team = { id: number; name: string }
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

// Toggle button used everywhere in this form for a binary/ternary choice —
// bold, filled when active, plenty of touch target, no small print. The
// one shared visual language behind winner picks, try-bonus calls, and
// the confidence pick, so the whole page reads as one game, not several
// forms bolted together.
function ChoiceButton({ label, active, fill, text, onClick }: { label: string; active: boolean; fill: string; text: string; onClick: () => void }) {
  // Even unselected, every choice carries a visible tint of its own team
  // colour — a wall of identical grey boxes was exactly the "haven't
  // leant into the theme" problem. Only the active state goes to a full
  // fill; everything else still reads as belonging to its team at a
  // glance, not just after you've clicked it.
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rugby-choice-btn ${active ? 'rugby-choice-btn--active' : ''} rugby-cond uppercase tracking-wide w-full py-3 px-2 text-sm text-center`}
      style={{
        background: active ? fill : `linear-gradient(135deg, var(--rugby-ink-3), ${fill}2e)`,
        color: active ? text : 'var(--rugby-text)',
        border: active ? `2px solid ${fill}` : `2px solid ${fill}70`,
        boxShadow: active ? `0 6px 18px ${fill}66` : `0 0 12px ${fill}22`,
        fontWeight: active ? 900 : 700,
        letterSpacing: '0.05em',
      }}
    >
      {label}
    </button>
  )
}

export default function RugbyPicksForm({
  competitionId,
  showMatchPredictions,
  roundId,
  roundNumber,
  fixtures,
  existingMatchPreds,
  showSquadDraft,
  squadPlayers,
  existingSquadSelections,
  squadBudgetCap,
}: {
  competitionId: string
  showMatchPredictions: boolean
  roundId: string | null
  roundNumber: number | null
  fixtures: FixtureInfo[]
  existingMatchPreds: ExistingMatchPred[]
  showSquadDraft: boolean
  squadPlayers: BuilderPlayer[]
  existingSquadSelections?: number[]
  squadBudgetCap?: number | null
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [justSubmitted, setJustSubmitted] = useState(false)

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

  // --- Squad draft state --- a flat list of up to 6 player ids; the
  // RugbySquadBuilder itself enforces 2-per-team/6-total/budget from the
  // squadPlayers list's own team_id/value fields, so this component just
  // needs to hold the selection, not any team-grouping logic.
  const [squadSelections, setSquadSelections] = useState<number[]>(existingSquadSelections ?? [])

  function addSquadPlayer(playerId: number) {
    const next = [...squadSelections, playerId]
    setSquadSelections(next)
    advanceFrom('squad', { squadSelections: next })
  }
  function removeSquadPlayer(playerId: number) {
    setSquadSelections(prev => prev.filter(id => id !== playerId))
  }

  // --- "Slide along" auto-advance: completing one item smoothly scrolls
  // to the next thing left to do, in page order (match fixtures, then the
  // squad). Each handler below computes completeness from the NEW value
  // directly (state hasn't re-rendered yet at the point the handler
  // runs), so this never lags a step behind.
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({})
  function registerStep(key: string) {
    return (el: HTMLDivElement | null) => { stepRefs.current[key] = el }
  }
  function orderedStepKeys(): string[] {
    const keys: string[] = []
    if (showMatchPredictions) fixtures.forEach(f => keys.push(`match-${f.id}`))
    if (showSquadDraft) keys.push('squad')
    return keys
  }
  function isStepDone(key: string, next: { rows?: typeof rows; squadSelections?: typeof squadSelections }): boolean {
    const r = next.rows ?? rows
    const s = next.squadSelections ?? squadSelections
    if (key.startsWith('match-')) {
      const row = r[Number(key.slice(6))]
      if (!row || row.winner === '') return false
      if (row.winner !== 'draw' && (row.margin === '' || Number(row.margin) < 1)) return false
      return row.homeTryBonus !== null && row.awayTryBonus !== null
    }
    if (key === 'squad') return s.length > 0
    return true
  }
  function advanceFrom(key: string, next: { rows?: typeof rows; squadSelections?: typeof squadSelections }) {
    if (!isStepDone(key, next)) return // this step itself isn't finished yet — stay put
    const keys = orderedStepKeys()
    const idx = keys.indexOf(key)
    for (let i = idx + 1; i < keys.length; i++) {
      if (!isStepDone(keys[i], next)) {
        requestAnimationFrame(() => stepRefs.current[keys[i]]?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
        return
      }
    }
  }

  const matchValid = !showMatchPredictions || (
    fixtures.every(f => {
      const r = rows[f.id]
      if (!r || r.winner === '') return false
      if (r.winner !== 'draw' && (r.margin === '' || Number(r.margin) < 1)) return false
      return r.homeTryBonus !== null && r.awayTryBonus !== null
    }) && confidenceFixtureId != null
  )
  const squadValueById = new Map(squadPlayers.map(p => [p.id, p.value ?? 0]))
  const squadValueTotal = squadSelections.reduce((sum, id) => sum + (squadValueById.get(id) ?? 0), 0)
  const overBudget = squadBudgetCap != null && squadValueTotal > squadBudgetCap
  const squadValid = !showSquadDraft || (squadSelections.length === 6 && !overBudget)
  const allValid = matchValid && squadValid

  const hasExistingMatch = showMatchPredictions && existingMatchPreds.length > 0
  const hasExistingSquad = showSquadDraft && !!existingSquadSelections && existingSquadSelections.length > 0
  const isUpdate = hasExistingMatch || hasExistingSquad

  async function submit() {
    if (!allValid) return
    setSaving(true)
    setMessage('')

    const calls: Promise<{ error?: string }>[] = []

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

    if (showSquadDraft) {
      calls.push(
        fetch('/api/rugby/squad', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            competition_id: competitionId,
            picks: squadSelections.map(player_id => ({ player_id })),
          }),
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
    setJustSubmitted(true)
    setTimeout(() => setJustSubmitted(false), 1600)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {showMatchPredictions && roundNumber && (
        <div className="rugby-panel rugby-panel--gold p-5">
          <h2 className="rugby-cond text-sm mb-4 uppercase tracking-wide">Round {roundNumber} Match Predictions</h2>
          <div className="space-y-4">
            {fixtures.map(f => {
              const r = rows[f.id]
              return (
                <div
                  key={f.id} ref={registerStep(`match-${f.id}`)} className="rugby-panel p-4"
                  style={{ background: `linear-gradient(115deg, ${teamColours(f.homeTeam).fill}20, var(--rugby-ink-2) 35%, var(--rugby-ink-2) 65%, ${teamColours(f.awayTeam).fill}20)` }}
                >
                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    <ChoiceButton label={f.homeTeam} active={r.winner === 'home'} fill={teamColours(f.homeTeam).fill} text={teamColours(f.homeTeam).text} onClick={() => {
                      const nextRow = { ...r, winner: 'home' as Winner, margin: r.margin }
                      updateRow(f.id, nextRow)
                      advanceFrom(`match-${f.id}`, { rows: { ...rows, [f.id]: nextRow } })
                    }} />
                    <ChoiceButton label="Draw" active={r.winner === 'draw'} fill={DRAW_COLOURS.fill} text={DRAW_COLOURS.text} onClick={() => {
                      const nextRow = { ...r, winner: 'draw' as Winner, margin: '' }
                      updateRow(f.id, nextRow)
                      advanceFrom(`match-${f.id}`, { rows: { ...rows, [f.id]: nextRow } })
                    }} />
                    <ChoiceButton label={f.awayTeam} active={r.winner === 'away'} fill={teamColours(f.awayTeam).fill} text={teamColours(f.awayTeam).text} onClick={() => {
                      const nextRow = { ...r, winner: 'away' as Winner, margin: r.margin }
                      updateRow(f.id, nextRow)
                      advanceFrom(`match-${f.id}`, { rows: { ...rows, [f.id]: nextRow } })
                    }} />
                  </div>

                  {r.winner !== '' && r.winner !== 'draw' && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs" style={{ color: 'var(--rugby-text-dim)' }}>Winning margin</span>
                      <input
                        type="number" min="1" placeholder="pts"
                        value={r.margin}
                        onChange={e => {
                          const nextRow = { ...r, margin: e.target.value }
                          updateRow(f.id, nextRow)
                          if (e.target.value) advanceFrom(`match-${f.id}`, { rows: { ...rows, [f.id]: nextRow } })
                        }}
                        className="rugby-input px-2 py-1.5 text-sm w-20 text-center"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--rugby-text-faint)' }}>🏉 {f.homeTeam} try bonus</p>
                      <div className="flex gap-1.5">
                        <ChoiceButton label="Yes" active={r.homeTryBonus === true} fill="#1f8a4c" text="#ffffff" onClick={() => {
                          const nextRow = { ...r, homeTryBonus: true }
                          updateRow(f.id, nextRow)
                          advanceFrom(`match-${f.id}`, { rows: { ...rows, [f.id]: nextRow } })
                        }} />
                        <ChoiceButton label="No" active={r.homeTryBonus === false} fill="#c8342a" text="#ffffff" onClick={() => {
                          const nextRow = { ...r, homeTryBonus: false }
                          updateRow(f.id, nextRow)
                          advanceFrom(`match-${f.id}`, { rows: { ...rows, [f.id]: nextRow } })
                        }} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--rugby-text-faint)' }}>🏉 {f.awayTeam} try bonus</p>
                      <div className="flex gap-1.5">
                        <ChoiceButton label="Yes" active={r.awayTryBonus === true} fill="#1f8a4c" text="#ffffff" onClick={() => {
                          const nextRow = { ...r, awayTryBonus: true }
                          updateRow(f.id, nextRow)
                          advanceFrom(`match-${f.id}`, { rows: { ...rows, [f.id]: nextRow } })
                        }} />
                        <ChoiceButton label="No" active={r.awayTryBonus === false} fill="#c8342a" text="#ffffff" onClick={() => {
                          const nextRow = { ...r, awayTryBonus: false }
                          updateRow(f.id, nextRow)
                          advanceFrom(`match-${f.id}`, { rows: { ...rows, [f.id]: nextRow } })
                        }} />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setConfidenceFixtureId(f.id)}
                    className={`rugby-choice-btn ${confidenceFixtureId === f.id ? 'rugby-choice-btn--active' : ''} rugby-cond uppercase tracking-wide w-full py-2.5 text-xs`}
                    style={{
                      background: confidenceFixtureId === f.id ? 'linear-gradient(100deg, var(--rugby-floodlight), var(--rugby-floodlight-2))' : 'var(--rugby-ink-3)',
                      color: confidenceFixtureId === f.id ? '#241300' : 'var(--rugby-text-dim)',
                      border: confidenceFixtureId === f.id ? '2px solid var(--rugby-floodlight)' : '2px solid var(--rugby-line)',
                      boxShadow: confidenceFixtureId === f.id ? '0 6px 18px rgba(255,194,46,0.35)' : 'none',
                      fontWeight: 900, letterSpacing: '0.05em',
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

      {showSquadDraft && (
        <div className="rugby-panel rugby-panel--gold p-5" ref={registerStep('squad')}>
          <h2 className="rugby-cond text-sm mb-2 uppercase tracking-wide">Your Dream Team</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--rugby-text-dim)' }}>
            Pick 6 players, at most 2 from any one team.
          </p>
          <RugbySquadBuilder
            mode="draft"
            players={squadPlayers}
            selectedIds={squadSelections}
            squadBudgetCap={squadBudgetCap}
            onAdd={addSquadPlayer}
            onRemove={removeSquadPlayer}
          />
        </div>
      )}

      {message && (
        <p className="text-sm text-center" style={{ color: '#e8574a' }}>{message}</p>
      )}

      <button
        onClick={submit}
        disabled={!allValid || saving}
        className={`rugby-button w-full py-3 text-base ${justSubmitted ? 'pop-celebrate' : ''}`}
      >
        {saving ? 'Saving…' : justSubmitted ? '✓ Submitted!' : isUpdate ? 'Update My Picks' : 'Confirm My Picks'}
      </button>
    </div>
  )
}
