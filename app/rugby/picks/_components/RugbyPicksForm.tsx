'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import RugbySquadBuilder, { type BuilderPlayer } from './RugbySquadBuilder'
import MatchPredictionCarousel, { type FixtureInfo, type MatchRowState, type Winner } from './MatchPredictionCarousel'

type ExistingMatchPred = {
  fixture_id: number
  predicted_winner: Winner
  predicted_margin: number | null
  is_confidence_pick: boolean
  predicted_home_try_bonus: boolean | null
  predicted_away_try_bonus: boolean | null
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

  // --- Match predictions state --- owned here (not the carousel) since
  // it feeds the combined submit payload below.
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
    setSquadSelections(prev => [...prev, playerId])
  }
  function removeSquadPlayer(playerId: number) {
    setSquadSelections(prev => prev.filter(id => id !== playerId))
  }

  // Once the match-prediction carousel's last question is answered, slide
  // down to the Dream Team section — the only remaining cross-section
  // handoff now that the carousel owns its own internal question-by-
  // question progress.
  const squadSectionRef = useRef<HTMLDivElement | null>(null)
  function scrollToSquad() {
    if (!showSquadDraft) return
    // 'start' not 'center' — the squad section is much taller than the
    // viewport (a scrollable player table), so centering it would show a
    // random middle slice instead of the heading/budget bar at its top.
    requestAnimationFrame(() => squadSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
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
      {showMatchPredictions && (
        <MatchPredictionCarousel
          roundNumber={roundNumber}
          fixtures={fixtures}
          rows={rows}
          updateRow={updateRow}
          confidenceFixtureId={confidenceFixtureId}
          setConfidenceFixtureId={setConfidenceFixtureId}
          onAllAnswered={scrollToSquad}
        />
      )}

      {showSquadDraft && (
        <div className="rb3-panel rb3-panel--glow p-6" ref={squadSectionRef}>
          <h2 className="rb3-title mb-5" style={{ fontSize: 'clamp(24px, 6vw, 34px)' }}>Dream Team</h2>
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
        <p className="text-sm text-center font-medium" style={{ color: 'var(--rb3-danger)' }}>{message}</p>
      )}

      <button
        onClick={submit}
        disabled={!allValid || saving}
        className={`rb3-button w-full py-4 text-lg ${justSubmitted ? 'pop-celebrate' : ''}`}
      >
        {saving ? 'Saving…' : justSubmitted ? '✓ Submitted!' : isUpdate ? 'Update My Picks' : 'Confirm My Picks'}
      </button>
    </div>
  )
}
