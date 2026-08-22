'use client'

import { useState, useMemo } from 'react'

type UserOption = { id: string; name: string }
type GameweekOption = { id: string; number: number; status: string }

// Deliberately one combined form rather than a two-step wizard: whether
// this card triggers a suspension is computed live client-side (red always
// does; a yellow does if the player already has one unresolved yellow this
// competition) so the suspension fields simply appear inline rather than
// needing a page round-trip. The server action re-derives the same trigger
// condition itself before writing anything — this client-side check is
// only what decides which fields to *show*, never trusted as the source
// of truth for what actually happens.
export default function IssueCardForm({
  action,
  competitionId,
  users,
  allGameweeks,
  futureGameweeks,
  unresolvedYellowCountByUserId,
  nextSuspensionNumberByUserId,
  defaultGameweekId,
}: {
  action: (formData: FormData) => void
  competitionId: string
  users: UserOption[]
  allGameweeks: GameweekOption[]
  futureGameweeks: GameweekOption[]
  unresolvedYellowCountByUserId: Record<string, number>
  nextSuspensionNumberByUserId: Record<string, number>
  defaultGameweekId: string
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<UserOption | null>(null)
  const [cardType, setCardType] = useState<'yellow' | 'red'>('yellow')
  const [reason, setReason] = useState('')
  const [issuedGameweekId, setIssuedGameweekId] = useState(defaultGameweekId)
  const [suspensionStartId, setSuspensionStartId] = useState(futureGameweeks[0]?.id ?? '')
  const [suspensionReason, setSuspensionReason] = useState('')
  const [confirming, setConfirming] = useState(false)

  const matches = useMemo(() => {
    if (selected || query.length < 1) return []
    const q = query.toLowerCase()
    return users.filter(u => u.name.toLowerCase().includes(q)).slice(0, 10)
  }, [query, users, selected])

  const nextSuspensionNumber = selected ? (nextSuspensionNumberByUserId[selected.id] ?? 1) : 1
  const [gameweeksCount, setGameweeksCount] = useState(1)

  const willTriggerSuspension = !!selected && (
    cardType === 'red' || (cardType === 'yellow' && (unresolvedYellowCountByUserId[selected.id] ?? 0) >= 1)
  )

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="competition_id" value={competitionId} />
      <div>
        <label className="block text-xs font-medium mb-1 text-gray-600">Player</label>
        {selected ? (
          <div className="text-sm">
            <strong>{selected.name}</strong>
            <button type="button" onClick={() => setSelected(null)} className="ml-2 text-xs text-gray-400">change</button>
          </div>
        ) : (
          <div className="relative">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search player..."
              className="border rounded px-2 py-1.5 text-sm w-64"
            />
            {matches.length > 0 && (
              <div className="absolute z-10 bg-white border rounded shadow-lg mt-1 w-64 max-h-56 overflow-y-auto">
                {matches.map(u => (
                  <button key={u.id} type="button" onClick={() => { setSelected(u); setQuery('') }} className="block w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100">
                    {u.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <input type="hidden" name="user_id" value={selected?.id ?? ''} />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1 text-gray-600">Card</label>
        <div className="flex gap-3 text-sm">
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" name="card_type" value="yellow" checked={cardType === 'yellow'} onChange={() => setCardType('yellow')} /> 🟨 Yellow
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" name="card_type" value="red" checked={cardType === 'red'} onChange={() => setCardType('red')} /> 🟥 Red
          </label>
        </div>
        {selected && cardType === 'yellow' && (
          <p className="text-xs text-gray-400 mt-1">
            {(unresolvedYellowCountByUserId[selected.id] ?? 0) >= 1
              ? "This is their 2nd unresolved yellow this competition — it will trigger a suspension."
              : 'Their first unresolved yellow this competition — no suspension yet.'}
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium mb-1 text-gray-600">Reason (shown to everyone on click)</label>
        <textarea name="reason" value={reason} onChange={e => setReason(e.target.value)} rows={2} className="border rounded px-2 py-1.5 text-sm w-full max-w-md" required />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1 text-gray-600">Which gameweek is this for?</label>
        <select name="issued_gameweek_id" value={issuedGameweekId} onChange={e => setIssuedGameweekId(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
          {allGameweeks.map(gw => <option key={gw.id} value={gw.id}>GW{gw.number} ({gw.status})</option>)}
        </select>
      </div>

      {willTriggerSuspension && (
        <div className="border-l-4 border-red-400 bg-red-50 p-3 space-y-2">
          <p className="text-sm font-medium text-red-800">This triggers suspension #{nextSuspensionNumber} for {selected?.name}.</p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600">Starting gameweek</label>
              <select name="suspension_start_gameweek_id" value={suspensionStartId} onChange={e => setSuspensionStartId(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
                {futureGameweeks.length === 0 && <option value="">No open/upcoming gameweek available</option>}
                {futureGameweeks.map(gw => <option key={gw.id} value={gw.id}>GW{gw.number}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600">Length (gameweeks) — default follows the escalation pattern, edit to upgrade/downgrade</label>
              <input
                type="number" name="suspension_gameweeks_count" min={1} max={futureGameweeks.length || 1}
                value={gameweeksCount || nextSuspensionNumber}
                onChange={e => setGameweeksCount(parseInt(e.target.value) || 1)}
                className="border rounded px-2 py-1.5 text-sm w-20"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-600">Suspension reason (defaults to the card reason above)</label>
            <input name="suspension_reason" value={suspensionReason} onChange={e => setSuspensionReason(e.target.value)} placeholder={reason} className="border rounded px-2 py-1.5 text-sm w-full max-w-md" />
          </div>
        </div>
      )}

      <input type="hidden" name="triggers_suspension" value={willTriggerSuspension ? 'true' : 'false'} />

      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">
            Issue this {cardType} card{willTriggerSuspension ? ' and the suspension above' : ''}? {selected?.name} will see the reason immediately.
          </span>
          <button type="submit" disabled={!selected || !reason} className="text-xs bg-black text-white rounded px-3 py-1.5 disabled:opacity-50">Confirm</button>
          <button type="button" onClick={() => setConfirming(false)} className="text-xs bg-gray-200 text-gray-700 rounded px-2 py-1">Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} disabled={!selected || !reason} className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50">
          Issue Card
        </button>
      )}
    </form>
  )
}
