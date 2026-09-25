'use client'

import { useState } from 'react'
import { rugbyTeamColoursRb3 as teamColours, DRAW_COLOURS_RB3 as DRAW_COLOURS } from '../../../lib/rugbyTeamColours'
import ChoiceButton from './RugbyChoiceButton'

export type FixtureInfo = { id: number; homeTeam: string; awayTeam: string }
export type Winner = 'home' | 'away' | 'draw'
export type MatchRowState = {
  winner: Winner | ''
  margin: string
  homeTryBonus: boolean | null
  awayTryBonus: boolean | null
}

// A binary yes/no pick doesn't have a "team colour" — "yes" floods
// cyan (the system's own interactive accent), "no" floods a quiet
// muted purple so it still confirms the pick without reading as an
// alarm.
const YES_GLOW = '#00ffff'
const NO_GLOW = '#5b4a86'

// One question at a time, sliding through every fixture in the round —
// Kit's own words: "a series of sliding questions on a carousel. one
// question at a time. outcome of match; winning margin (n/a for draw);
// try bonus points; make this my confidence pick." Replaces the old
// all-fixtures-in-one-scroll block. The margin question only exists for a
// fixture once a non-draw winner is picked for it.
//
// Every handler below computes the NEXT step from a locally-built "what
// rows will look like after this answer" snapshot, synchronously, rather
// than reading the `rows` prop after a delay — `updateRow` triggers a
// state update in the parent that hasn't re-rendered this component yet
// by the time a click handler runs, so reading `rows` itself here would
// still see the OLD value and could compute the wrong next step (e.g.
// skip straight past the margin question that answer just created).
type StepKind = 'winner' | 'margin' | 'tryBonus' | 'confidence'
type Step = { fixtureIndex: number; kind: StepKind }
function stepKey(s: Step) { return `${s.fixtureIndex}-${s.kind}` }

function buildSteps(fixtures: FixtureInfo[], rowsSnapshot: Record<number, MatchRowState>): Step[] {
  const steps: Step[] = []
  fixtures.forEach((f, i) => {
    steps.push({ fixtureIndex: i, kind: 'winner' })
    if (rowsSnapshot[f.id]?.winner && rowsSnapshot[f.id].winner !== 'draw') {
      steps.push({ fixtureIndex: i, kind: 'margin' })
    }
    steps.push({ fixtureIndex: i, kind: 'tryBonus' })
    steps.push({ fixtureIndex: i, kind: 'confidence' })
  })
  return steps
}

function isStepAnswered(s: Step, fixtures: FixtureInfo[], rowsSnapshot: Record<number, MatchRowState>): boolean {
  const f = fixtures[s.fixtureIndex]
  const row = rowsSnapshot[f.id]
  if (!row) return false
  if (s.kind === 'winner') return row.winner !== ''
  if (s.kind === 'margin') return row.margin !== '' && Number(row.margin) >= 1
  if (s.kind === 'tryBonus') return row.homeTryBonus !== null && row.awayTryBonus !== null
  return true // confidence: both "yes" and "no" are valid, explicit answers
}

export default function MatchPredictionCarousel({
  roundNumber, fixtures, rows, updateRow, confidenceFixtureId, setConfidenceFixtureId, onAllAnswered,
}: {
  roundNumber: number | null
  fixtures: FixtureInfo[]
  rows: Record<number, MatchRowState>
  updateRow: (fixtureId: number, patch: Partial<MatchRowState>) => void
  confidenceFixtureId: number | null
  setConfidenceFixtureId: (id: number | null) => void
  onAllAnswered?: () => void
}) {
  const [currentKey, setCurrentKey] = useState<string>(() => (fixtures.length ? stepKey({ fixtureIndex: 0, kind: 'winner' }) : ''))

  const steps = buildSteps(fixtures, rows)
  const currentIndex = Math.max(0, steps.findIndex(s => stepKey(s) === currentKey))
  const step = steps[currentIndex] ?? steps[0]

  if (!step || !fixtures[step.fixtureIndex]) return null

  const fixture = fixtures[step.fixtureIndex]
  const r = rows[fixture.id]
  const homeC = teamColours(fixture.homeTeam)
  const awayC = teamColours(fixture.awayTeam)

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(steps.length - 1, index))
    setCurrentKey(stepKey(steps[clamped]))
  }

  // The one function every answer routes through: apply the patch to a
  // local snapshot (not the prop), recompute steps from THAT snapshot,
  // and move to whatever comes after the current step in it.
  function answerAndAdvance(fixtureId: number, patch: Partial<MatchRowState>) {
    updateRow(fixtureId, patch)
    const rowsSnapshot = { ...rows, [fixtureId]: { ...rows[fixtureId], ...patch } }
    const freshSteps = buildSteps(fixtures, rowsSnapshot)
    const idx = freshSteps.findIndex(s => stepKey(s) === currentKey)
    if (idx === -1) return
    // The try-bonus step asks about two teams — one click only answers
    // half of it, so only advance once THIS step (not just this click)
    // is actually fully answered. Every other step type is a single
    // click = fully answered, so this never delays them.
    if (!isStepAnswered(freshSteps[idx], fixtures, rowsSnapshot)) return
    if (idx === freshSteps.length - 1) {
      if (freshSteps.every(s => isStepAnswered(s, fixtures, rowsSnapshot))) onAllAnswered?.()
      return
    }
    const nextKey = stepKey(freshSteps[idx + 1])
    setTimeout(() => setCurrentKey(nextKey), 150)
  }

  // Manual "Next" (margin's own button, and the ghost nav) — no patch to
  // apply, just move using the CURRENT rows prop, which is accurate here
  // since nothing just changed synchronously.
  function advance() {
    const idx = steps.findIndex(s => stepKey(s) === currentKey)
    if (idx === -1 || idx === steps.length - 1) {
      if (steps.every(s => isStepAnswered(s, fixtures, rows))) onAllAnswered?.()
      return
    }
    setCurrentKey(stepKey(steps[idx + 1]))
  }

  const isFirst = currentIndex === 0
  const canAdvance = isStepAnswered(step, fixtures, rows)

  return (
    <div className="rb4-panel rb4-panel--terminal">
      <div className="rb4-titlebar">
        <span className="rb4-dot" style={{ background: '#ff00ff' }} />
        <span className="rb4-dot" style={{ background: '#00ffff' }} />
        <span className="rb4-dot" style={{ background: '#ff9900' }} />
        <span style={{ marginLeft: 6 }}>MATCH_{String(step.fixtureIndex + 1).padStart(2, '0')}.EXE</span>
      </div>

      <div className="p-6">
        <div className="rb4-progress-track w-full mb-5">
          <div className="rb4-progress-fill" style={{ width: `${((currentIndex + 1) / steps.length) * 100}%` }} />
        </div>

        <div key={stepKey(step)}>
          <p className="rb4-title text-center mb-5" style={{ fontSize: 'clamp(20px, 5.5vw, 28px)' }}>
            {fixture.homeTeam} <span style={{ color: 'var(--rb4-orange)' }}>v</span> {fixture.awayTeam}
          </p>

          {step.kind === 'winner' && (
            <div className="flex flex-col gap-3">
              <ChoiceButton label={fixture.homeTeam} active={r.winner === 'home'} glow={homeC.fill}
                onClick={() => answerAndAdvance(fixture.id, { winner: 'home', margin: r.winner === 'draw' ? '' : r.margin })} />
              <ChoiceButton label="Draw" active={r.winner === 'draw'} glow={DRAW_COLOURS.fill}
                onClick={() => answerAndAdvance(fixture.id, { winner: 'draw', margin: '' })} />
              <ChoiceButton label={fixture.awayTeam} active={r.winner === 'away'} glow={awayC.fill}
                onClick={() => answerAndAdvance(fixture.id, { winner: 'away', margin: r.winner === 'draw' ? '' : r.margin })} />
            </div>
          )}

          {step.kind === 'margin' && (
            <div className="text-center">
              <p className="rb4-eyebrow mb-3">&gt; Winning margin</p>
              <input
                type="number" min="1" placeholder="00" autoFocus
                value={r.margin}
                onChange={e => updateRow(fixture.id, { margin: e.target.value })}
                className="rb4-input rb4-stat-number px-3 py-2 text-4xl w-28 text-center"
              />
              <button type="button" onClick={advance} disabled={!canAdvance} className="rb4-button w-full mt-5 py-3 text-sm">
                <span>Next &gt;</span>
              </button>
            </div>
          )}

          {step.kind === 'tryBonus' && (
            <>
              <p className="rb4-eyebrow text-center mb-3">&gt; Try bonus (4+ tries)?</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-center mb-2" style={{ color: 'var(--rb4-fg)', opacity: 0.6, fontFamily: 'var(--font-rb4-mono)' }}>{fixture.homeTeam}</p>
                  <div className="flex gap-1.5">
                    <ChoiceButton label="Yes" active={r.homeTryBonus === true} glow={YES_GLOW} onClick={() => answerAndAdvance(fixture.id, { homeTryBonus: true })} />
                    <ChoiceButton label="No" active={r.homeTryBonus === false} glow={NO_GLOW} onClick={() => answerAndAdvance(fixture.id, { homeTryBonus: false })} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-center mb-2" style={{ color: 'var(--rb4-fg)', opacity: 0.6, fontFamily: 'var(--font-rb4-mono)' }}>{fixture.awayTeam}</p>
                  <div className="flex gap-1.5">
                    <ChoiceButton label="Yes" active={r.awayTryBonus === true} glow={YES_GLOW} onClick={() => answerAndAdvance(fixture.id, { awayTryBonus: true })} />
                    <ChoiceButton label="No" active={r.awayTryBonus === false} glow={NO_GLOW} onClick={() => answerAndAdvance(fixture.id, { awayTryBonus: false })} />
                  </div>
                </div>
              </div>
            </>
          )}

          {step.kind === 'confidence' && (
            <>
              <p className="rb4-eyebrow text-center mb-3">&gt; Confidence pick? (scores extra)</p>
              <div className="grid grid-cols-2 gap-1.5">
                <ChoiceButton label="Yes" active={confidenceFixtureId === fixture.id} glow={YES_GLOW} onClick={() => {
                  setConfidenceFixtureId(fixture.id)
                  const idx = steps.findIndex(s => stepKey(s) === currentKey)
                  if (idx === steps.length - 1) { onAllAnswered?.(); return }
                  setTimeout(() => setCurrentKey(stepKey(steps[idx + 1])), 150)
                }} />
                <ChoiceButton label="No" active={confidenceFixtureId !== fixture.id} glow={NO_GLOW} onClick={() => {
                  if (confidenceFixtureId === fixture.id) setConfidenceFixtureId(null)
                  const idx = steps.findIndex(s => stepKey(s) === currentKey)
                  if (idx === steps.length - 1) { onAllAnswered?.(); return }
                  setTimeout(() => setCurrentKey(stepKey(steps[idx + 1])), 150)
                }} />
              </div>
            </>
          )}
        </div>

        {!isFirst && (
          <button type="button" onClick={() => goTo(currentIndex - 1)} className="text-xs mt-5" style={{ color: 'var(--rb4-cyan)', fontFamily: 'var(--font-rb4-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            &lt; back
          </button>
        )}
      </div>
    </div>
  )
}
