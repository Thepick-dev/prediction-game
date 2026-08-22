'use client'

import { useState, useEffect } from 'react'

type UserOption = { id: string; name: string }
type GameweekOption = { id: string; number: number; status: string }

// Whether a card causes a suspension is admin-controlled, not silently
// automatic — a checkbox, defaulted from the game's own rule (red always;
// yellow only once it's the player's 2nd unresolved one) but always
// editable, so the admin can see and change the actual consequence before
// it happens rather than a section quietly appearing or not. Which
// gameweek(s) a suspension covers is a plain checklist, not a derived
// "start + length" — the admin ticks exactly the weeks that are missed and
// sees that list spelled out in the summary before confirming.
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
  const [userId, setUserId] = useState('')
  const [cardType, setCardType] = useState<'yellow' | 'red'>('yellow')
  const [reason, setReason] = useState('')
  const [issuedGameweekId, setIssuedGameweekId] = useState(defaultGameweekId)
  const [causesSuspension, setCausesSuspension] = useState(false)
  const [checkedGameweekIds, setCheckedGameweekIds] = useState<Set<string>>(new Set())
  const [suspensionReason, setSuspensionReason] = useState('')
  const [confirming, setConfirming] = useState(false)

  const selected = users.find(u => u.id === userId) ?? null
  const unresolvedYellows = selected ? (unresolvedYellowCountByUserId[selected.id] ?? 0) : 0
  const autoTriggers = !!selected && (cardType === 'red' || (cardType === 'yellow' && unresolvedYellows >= 1))
  const nextSuspensionNumber = selected ? (nextSuspensionNumberByUserId[selected.id] ?? 1) : 1
  const isRed = cardType === 'red'

  // Re-derive the default every time the player/card type changes — auto-on
  // for red or a 2nd yellow, auto-off otherwise, but the admin can still
  // flip it manually afterwards for either case.
  useEffect(() => {
    setCausesSuspension(autoTriggers)
    if (autoTriggers) {
      const defaultCount = nextSuspensionNumber
      setCheckedGameweekIds(new Set(futureGameweeks.slice(0, defaultCount).map(g => g.id)))
    } else {
      setCheckedGameweekIds(new Set())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, cardType])

  function toggleGameweek(id: string) {
    setCheckedGameweekIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const checkedGameweeks = futureGameweeks.filter(g => checkedGameweekIds.has(g.id)).sort((a, b) => a.number - b.number)

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="competition_id" value={competitionId} />

      <div>
        <label className="block text-xs font-medium mb-1 text-gray-600">Player</label>
        <select value={userId} onChange={e => setUserId(e.target.value)} name="user_id" className="border rounded px-2 py-1.5 text-sm w-64" required>
          <option value="">Select a player...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
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
            {unresolvedYellows >= 1
              ? `${selected.name} already has an unresolved yellow this competition — this would be their 2nd.`
              : `${selected.name} has no unresolved yellow this competition yet — this would be their 1st.`}
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium mb-1 text-gray-600">Reason (shown to everyone on click)</label>
        <textarea name="reason" value={reason} onChange={e => setReason(e.target.value)} rows={2} className="border rounded px-2 py-1.5 text-sm w-full max-w-md" required />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1 text-gray-600">Which gameweek did this happen in?</label>
        <select name="issued_gameweek_id" value={issuedGameweekId} onChange={e => setIssuedGameweekId(e.target.value)} className="border rounded px-2 py-1.5 text-sm">
          {allGameweeks.map(gw => <option key={gw.id} value={gw.id}>GW{gw.number} ({gw.status})</option>)}
        </select>
      </div>

      <div className="border-2 rounded-lg p-3" style={{ borderColor: causesSuspension ? '#fca5a5' : '#e5e7eb', background: causesSuspension ? '#fef2f2' : '#fafafa' }}>
        <label className="inline-flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={isRed ? true : causesSuspension}
            disabled={isRed}
            onChange={e => setCausesSuspension(e.target.checked)}
          />
          This card causes a suspension
          {isRed && <span className="text-xs font-normal text-gray-500">(always true for a red)</span>}
        </label>
        <input type="hidden" name="causes_suspension" value={(isRed || causesSuspension) ? 'true' : 'false'} />

        {(isRed || causesSuspension) && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-gray-600">
              Tick every gameweek this suspension covers (suspension #{nextSuspensionNumber} for {selected?.name ?? 'this player'} — default follows the escalation pattern, tick or untick to change):
            </p>
            <div className="flex flex-wrap gap-2">
              {futureGameweeks.length === 0 && <span className="text-xs text-gray-400">No open/upcoming gameweek available to suspend them from.</span>}
              {futureGameweeks.map(gw => (
                <label key={gw.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border cursor-pointer" style={{ background: checkedGameweekIds.has(gw.id) ? '#fee2e2' : '#fff', borderColor: checkedGameweekIds.has(gw.id) ? '#f87171' : '#d1d5db' }}>
                  <input type="checkbox" name="suspension_gameweek_ids" value={gw.id} checked={checkedGameweekIds.has(gw.id)} onChange={() => toggleGameweek(gw.id)} />
                  GW{gw.number}
                </label>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600">Suspension reason (defaults to the card reason above)</label>
              <input name="suspension_reason" value={suspensionReason} onChange={e => setSuspensionReason(e.target.value)} placeholder={reason} className="border rounded px-2 py-1.5 text-sm w-full max-w-md" />
            </div>
          </div>
        )}
      </div>

      <div className="text-sm bg-gray-100 rounded-lg p-3">
        <strong>What happens:</strong>{' '}
        {selected ? (
          <>
            {selected.name} gets a {cardType} card.{' '}
            {(isRed || causesSuspension) ? (
              checkedGameweeks.length > 0
                ? <>They'll miss <strong>{checkedGameweeks.map(g => `GW${g.number}`).join(', ')}</strong> ({checkedGameweeks.length} gameweek{checkedGameweeks.length === 1 ? '' : 's'}, suspension #{nextSuspensionNumber}) — scoring zero those weeks but keeping every team/player/Banker/Bonus Card use.</>
                : <span className="text-red-600">Tick at least one gameweek above, or this card won't actually suspend them.</span>
            ) : (
              <>No suspension.</>
            )}
          </>
        ) : 'Select a player to see what this will do.'}
      </div>

      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">Confirm — {selected?.name} will see the reason immediately.</span>
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
