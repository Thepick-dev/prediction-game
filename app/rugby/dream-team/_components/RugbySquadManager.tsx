'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type SquadSlot = { teamId: number; teamName: string; playerId: number; playerName: string; isKicker: boolean }

export default function RugbySquadManager({
  competitionId,
  slots,
  playersByTeam,
  subsUsed,
  maxFreeSubs,
  perRound = false,
  canSub,
}: {
  competitionId: string
  slots: SquadSlot[]
  playersByTeam: Record<number, { id: number; name: string }[]>
  subsUsed: number
  maxFreeSubs: number
  perRound?: boolean
  canSub: boolean
}) {
  const [subbingTeamId, setSubbingTeamId] = useState<number | null>(null)
  const [replacementId, setReplacementId] = useState<number | ''>('')
  const [replacementSearch, setReplacementSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  const subsRemaining = Math.max(0, maxFreeSubs - subsUsed)

  async function makeKicker(playerId: number) {
    setBusy(true)
    setMessage('')
    const res = await fetch('/api/rugby/squad/kicker', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competition_id: competitionId, player_id: playerId }),
    })
    const data = await res.json()
    if (!res.ok || data.error) setMessage(data.error ?? 'Could not update kicker')
    setBusy(false)
    router.refresh()
  }

  async function confirmSub(oldPlayerId: number) {
    if (!replacementId) return
    setBusy(true)
    setMessage('')
    const res = await fetch('/api/rugby/squad/sub', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competition_id: competitionId, old_player_id: oldPlayerId, new_player_id: replacementId }),
    })
    const data = await res.json()
    if (!res.ok || data.error) {
      setMessage(data.error ?? 'Could not make that substitution')
    } else {
      setSubbingTeamId(null)
      setReplacementId('')
    }
    setBusy(false)
    router.refresh()
  }

  return (
    <div>
      <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
        Subs used {perRound ? 'this round' : 'this competition'}: {subsUsed} / {maxFreeSubs} free. {subsRemaining === 0 && 'Any further sub will cost you points.'}
      </p>
      {message && <p className="text-sm mb-2" style={{ color: 'var(--pop-red)' }}>{message}</p>}
      <div className="space-y-2">
        {slots.map(slot => (
          <div key={slot.teamId} className="rounded-xl p-3 flex items-center justify-between flex-wrap gap-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div>
              <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--pop-blue)' }}>{slot.teamName}</p>
              <p className="pop-name text-base" style={{ color: 'var(--pop-white)' }}>
                {slot.playerName}
                {slot.isKicker && <span className="pop-badge pop-badge--orange ml-2" style={{ fontSize: '10px', padding: '2px 8px' }}>KICKER</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!slot.isKicker && (
                <button onClick={() => makeKicker(slot.playerId)} disabled={busy} className="text-xs underline" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Make kicker
                </button>
              )}
              {canSub && subbingTeamId !== slot.teamId && (
                <button onClick={() => { setSubbingTeamId(slot.teamId); setReplacementId(''); setReplacementSearch('') }} className="text-xs pop-button pop-button--blue" style={{ padding: '4px 10px' }}>
                  Substitute
                </button>
              )}
            </div>
            {subbingTeamId === slot.teamId && (
              <div className="w-full mt-1">
                {replacementId ? (
                  <div className="flex items-center gap-2">
                    <span className="pop-input pop-name px-2 py-1 text-sm flex-1" style={{ display: 'inline-block' }}>
                      {(playersByTeam[slot.teamId] ?? []).find(p => p.id === replacementId)?.name}
                    </span>
                    <button onClick={() => setReplacementId('')} className="text-xs" style={{ color: 'var(--pop-red)' }}>✕</button>
                    <button onClick={() => confirmSub(slot.playerId)} disabled={busy} className="pop-button pop-button--green text-xs" style={{ padding: '4px 10px' }}>
                      Confirm
                    </button>
                    <button onClick={() => setSubbingTeamId(null)} className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={replacementSearch}
                        onChange={e => setReplacementSearch(e.target.value)}
                        placeholder="Type a replacement's name..."
                        className="pop-input px-2 py-1 text-xs w-full"
                      />
                      {replacementSearch.trim().length >= 1 && (
                        <div className="mt-1 rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
                          {(playersByTeam[slot.teamId] ?? [])
                            .filter(p => p.id !== slot.playerId && p.name.toLowerCase().includes(replacementSearch.trim().toLowerCase()))
                            .slice(0, 8)
                            .map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => { setReplacementId(p.id); setReplacementSearch('') }}
                                className="block w-full text-left px-2 py-1 text-xs hover:opacity-80"
                                style={{ background: 'var(--pop-surface)', color: 'var(--pop-white)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                              >
                                {p.name}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => setSubbingTeamId(null)} className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Cancel</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
