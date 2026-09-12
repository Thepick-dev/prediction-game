'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { rugbyTeamColours as teamColours, rugbyLabelColour, DRAW_COLOURS } from '../../../lib/rugbyTeamColours'

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

// Toggle button used everywhere in this form for a binary/ternary choice —
// bold, filled when active, plenty of touch target, no small print. The
// one shared visual language behind winner picks, try-bonus calls, the
// confidence pick, and the kicker choice, so the whole page reads as one
// game, not several forms bolted together.
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

function PlayerSearchPicker({
  team, players, selectedId, onSelect, onClear,
}: {
  team: Team; players: Player[]; selectedId: number | ''; onSelect: (id: number) => void; onClear: () => void
}) {
  const [search, setSearch] = useState('')
  const selected = players.find(p => p.id === selectedId)
  const matches = search.trim().length >= 1 ? players.filter(p => p.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8) : []
  const colours = teamColours(team.name)

  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <p className="pop-name text-sm mb-2" style={{ color: rugbyLabelColour(team.name) }}>{team.name}</p>
      {selected ? (
        <div className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: `${colours.fill}22`, border: `1.5px solid ${colours.fill}` }}>
          <span className="pop-name text-base" style={{ color: 'var(--pop-white)' }}>{selected.name}</span>
          <button type="button" onClick={onClear} className="text-sm shrink-0 ml-2" style={{ color: 'var(--pop-red)' }}>✕</button>
        </div>
      ) : (
        <>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Type a player's name..." className="pop-input px-3 py-2 text-sm w-full" />
          {matches.length > 0 && (
            <div className="mt-1 rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
              {matches.map(p => (
                <button key={p.id} type="button" onClick={() => { onSelect(p.id); setSearch('') }}
                  className="pop-name block w-full text-left px-3 py-2 text-sm hover:opacity-80" style={{ background: 'var(--pop-surface)', color: 'var(--pop-white)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
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
  showSquadDraft,
  playersByTeam,
  existingSquadSelections,
  existingSquadKickerId,
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
  showSquadDraft: boolean
  playersByTeam: Record<number, Player[]>
  existingSquadSelections?: Record<number, number>
  existingSquadKickerId?: number
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [justSubmitted, setJustSubmitted] = useState(false)

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

  // --- Squad draft state ---
  const [squadSelections, setSquadSelections] = useState<Record<number, number | ''>>(existingSquadSelections ?? {})
  const [kickerPlayerId, setKickerPlayerId] = useState<number | ''>(existingSquadKickerId ?? '')

  function selectSquadPlayer(teamId: number, playerId: number) {
    const next = { ...squadSelections, [teamId]: playerId }
    setSquadSelections(next)
    advanceFrom(`squad-${teamId}`, { squadSelections: next })
  }
  function clearSquadPlayer(teamId: number) {
    const clearedPlayerId = squadSelections[teamId]
    setSquadSelections(prev => ({ ...prev, [teamId]: '' as const }))
    if (kickerPlayerId && kickerPlayerId === clearedPlayerId) setKickerPlayerId('')
  }

  // --- "Slide along" auto-advance: completing one item smoothly scrolls
  // to the next thing left to do, in page order (season questions, then
  // match fixtures, then squad teams). Each handler below computes
  // completeness from the NEW value directly (state hasn't re-rendered
  // yet at the point the handler runs), so this never lags a step behind.
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({})
  function registerStep(key: string) {
    return (el: HTMLDivElement | null) => { stepRefs.current[key] = el }
  }
  function orderedStepKeys(): string[] {
    const keys: string[] = []
    if (showSeasonPredictions) questions.forEach(q => keys.push(`season-${q.type_key}`))
    if (showMatchPredictions) fixtures.forEach(f => keys.push(`match-${f.id}`))
    if (showSquadDraft) teams.forEach(t => keys.push(`squad-${t.id}`))
    return keys
  }
  function isStepDone(key: string, next: { answers?: typeof answers; rows?: typeof rows; squadSelections?: typeof squadSelections }): boolean {
    const a = next.answers ?? answers
    const r = next.rows ?? rows
    const s = next.squadSelections ?? squadSelections
    if (key.startsWith('season-')) return a[key.slice(7)] != null
    if (key.startsWith('match-')) {
      const row = r[Number(key.slice(6))]
      if (!row || row.winner === '') return false
      if (row.winner !== 'draw' && (row.margin === '' || Number(row.margin) < 1)) return false
      return row.homeTryBonus !== null && row.awayTryBonus !== null
    }
    if (key.startsWith('squad-')) return !!s[Number(key.slice(6))]
    return true
  }
  function advanceFrom(key: string, next: { answers?: typeof answers; rows?: typeof rows; squadSelections?: typeof squadSelections }) {
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

  const seasonValid = !showSeasonPredictions || questions.every(q => answers[q.type_key] != null)
  const matchValid = !showMatchPredictions || (
    fixtures.every(f => {
      const r = rows[f.id]
      if (!r || r.winner === '') return false
      if (r.winner !== 'draw' && (r.margin === '' || Number(r.margin) < 1)) return false
      return r.homeTryBonus !== null && r.awayTryBonus !== null
    }) && confidenceFixtureId != null
  )
  const squadValid = !showSquadDraft || (teams.every(t => squadSelections[t.id]) && !!kickerPlayerId)
  const allValid = seasonValid && matchValid && squadValid

  const hasExistingSeason = showSeasonPredictions && existingAnswers.length > 0
  const hasExistingMatch = showMatchPredictions && existingMatchPreds.length > 0
  const hasExistingSquad = showSquadDraft && !!existingSquadSelections && Object.keys(existingSquadSelections).length > 0
  const isUpdate = hasExistingSeason || hasExistingMatch || hasExistingSquad

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

    if (showSquadDraft) {
      calls.push(
        fetch('/api/rugby/squad', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            competition_id: competitionId,
            picks: teams.map(t => ({ player_id: squadSelections[t.id] })),
            kicker_player_id: kickerPlayerId,
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
      {showSeasonPredictions && (
        <div className="pop-panel pop-panel--blue p-5">
          <h2 className="pop-headline text-sm mb-4" style={{ color: 'var(--pop-white)' }}>Tournament Predictions</h2>
          <div className="space-y-4">
            {questions.map(q => (
              <div key={q.type_key} ref={registerStep(`season-${q.type_key}`)}>
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
                          onClick={() => {
                            const next = { ...answers, [q.type_key]: t.id }
                            setAnswers(next)
                            advanceFrom(`season-${q.type_key}`, { answers: next })
                          }}
                        />
                      )
                    })}
                  </div>
                )}
                {q.answer_type === 'fixture' && (
                  <select className="pop-input px-3 py-2 text-sm w-full" value={answers[q.type_key] ?? ''} onChange={e => {
                    const next = { ...answers, [q.type_key]: e.target.value ? Number(e.target.value) : null }
                    setAnswers(next)
                    advanceFrom(`season-${q.type_key}`, { answers: next })
                  }}>
                    <option value="">Select...</option>
                    {fixtureLabels.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                )}
                {q.answer_type === 'numeric' && (
                  <input type="number" className="pop-input px-3 py-2 text-sm w-full max-w-[140px]" value={answers[q.type_key] ?? ''} onChange={e => {
                    const next = { ...answers, [q.type_key]: e.target.value ? Number(e.target.value) : null }
                    setAnswers(next)
                    if (e.target.value) advanceFrom(`season-${q.type_key}`, { answers: next })
                  }} />
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
                              <button key={p.id} type="button" onClick={() => {
                                const next = { ...answers, [q.type_key]: p.id }
                                setAnswers(next)
                                setPlayerSearches(prev => ({ ...prev, [q.type_key]: '' }))
                                advanceFrom(`season-${q.type_key}`, { answers: next })
                              }}
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
                <div key={f.id} ref={registerStep(`match-${f.id}`)} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
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
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>Winning margin</span>
                      <input
                        type="number" min="1" placeholder="pts"
                        value={r.margin}
                        onChange={e => {
                          const nextRow = { ...r, margin: e.target.value }
                          updateRow(f.id, nextRow)
                          if (e.target.value) advanceFrom(`match-${f.id}`, { rows: { ...rows, [f.id]: nextRow } })
                        }}
                        className="pop-input px-2 py-1.5 text-sm w-20 text-center"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>🏉 {f.homeTeam} try bonus</p>
                      <div className="flex gap-1.5">
                        <ChoiceButton label="Yes" active={r.homeTryBonus === true} fill="var(--pop-green)" text="var(--pop-black)" onClick={() => {
                          const nextRow = { ...r, homeTryBonus: true }
                          updateRow(f.id, nextRow)
                          advanceFrom(`match-${f.id}`, { rows: { ...rows, [f.id]: nextRow } })
                        }} />
                        <ChoiceButton label="No" active={r.homeTryBonus === false} fill="var(--pop-red)" text="var(--pop-white)" onClick={() => {
                          const nextRow = { ...r, homeTryBonus: false }
                          updateRow(f.id, nextRow)
                          advanceFrom(`match-${f.id}`, { rows: { ...rows, [f.id]: nextRow } })
                        }} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>🏉 {f.awayTeam} try bonus</p>
                      <div className="flex gap-1.5">
                        <ChoiceButton label="Yes" active={r.awayTryBonus === true} fill="var(--pop-green)" text="var(--pop-black)" onClick={() => {
                          const nextRow = { ...r, awayTryBonus: true }
                          updateRow(f.id, nextRow)
                          advanceFrom(`match-${f.id}`, { rows: { ...rows, [f.id]: nextRow } })
                        }} />
                        <ChoiceButton label="No" active={r.awayTryBonus === false} fill="var(--pop-red)" text="var(--pop-white)" onClick={() => {
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

      {showSquadDraft && (
        <div className="pop-panel pop-panel--orange p-5">
          <h2 className="pop-headline text-sm mb-2" style={{ color: 'var(--pop-white)' }}>Your Dream Team</h2>
          <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.75)' }}>
            Pick one player from each team — six in total — then mark one as your kicker.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {teams.map(team => (
              <div key={team.id} ref={registerStep(`squad-${team.id}`)}>
                <PlayerSearchPicker
                  team={team}
                  players={playersByTeam[team.id] ?? []}
                  selectedId={squadSelections[team.id] ?? ''}
                  onSelect={pid => selectSquadPlayer(team.id, pid)}
                  onClear={() => clearSquadPlayer(team.id)}
                />
              </div>
            ))}
          </div>
          {teams.every(t => squadSelections[t.id]) && (
            <div>
              <p className="text-xs uppercase tracking-wide font-bold mb-2" style={{ color: 'var(--pop-orange)' }}>Pick your kicker</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {teams.map(t => {
                  const pid = squadSelections[t.id]
                  if (!pid) return null
                  const player = (playersByTeam[t.id] ?? []).find(p => p.id === pid)
                  if (!player) return null
                  return (
                    <ChoiceButton
                      key={pid}
                      label={player.name}
                      active={kickerPlayerId === pid}
                      fill="var(--pop-orange)"
                      text="var(--pop-black)"
                      onClick={() => setKickerPlayerId(pid)}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {message && (
        <p className="text-sm text-center" style={{ color: 'var(--pop-red)' }}>{message}</p>
      )}

      <button
        onClick={submit}
        disabled={!allValid || saving}
        className={`pop-button w-full py-3 text-base ${justSubmitted ? 'pop-button--green pop-celebrate' : 'pop-button--green'}`}
      >
        {saving ? 'Saving…' : justSubmitted ? '✓ Submitted!' : isUpdate ? 'Update My Picks' : 'Confirm My Picks'}
      </button>
    </div>
  )
}
