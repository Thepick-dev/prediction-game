'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'

// Replaces both the old per-team search picker (initial draft) and the
// separate substitution manager (post-deadline) with one Player-Database-
// style browsable table — search/filter/sort every eligible player, with
// your squad-so-far, budget and (in manage mode) subs-remaining always
// visible above it. Kit's own words: "the Dream Team selection page should
// be more like the 'Player Database' page."

export type BuilderPlayer = {
  id: number
  name: string
  team: string
  team_id: number
  group: string | null
  value: number | null
  value_is_estimated: boolean
  average_rating: number | null
}

type SortKey = 'name' | 'value' | 'average_rating'

function fmtValue(value: number | null, estimated: boolean) {
  if (value == null) return '—'
  return `£${value.toLocaleString()}${estimated ? ' (est.)' : ''}`
}
function fmtRating(r: number | null) {
  if (r == null) return '—'
  return (Math.round(r * 10) / 10).toFixed(1)
}

type DraftProps = {
  mode: 'draft'
  players: BuilderPlayer[]
  selectedIds: number[]
  squadBudgetCap?: number | null
  onAdd: (playerId: number) => void
  onRemove: (playerId: number) => void
}
type ManageProps = {
  mode: 'manage'
  players: BuilderPlayer[]
  selectedIds: number[]
  squadBudgetCap?: number | null
  competitionId: string
  maxFreeSubs: number
  subsUsed: number
  perRound?: boolean
  canSub: boolean
}
type Props = DraftProps | ManageProps

// A quiet circular affordance for the common draft-mode case (add / this
// row is picked) — text pills on every one of 50 rows read as noise;
// the magenta glow is reserved for the row that's actually selected.
function RowDot({ state, onClick, title }: { state: 'add' | 'picked' | 'off'; onClick?: () => void; title?: string }) {
  if (state === 'picked') {
    const style: CSSProperties & { [key: `--${string}`]: string } = {
      width: 26, height: 26, border: 'none', cursor: 'pointer',
      background: 'var(--rb4-magenta)', color: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 14px var(--rb4-magenta)',
    }
    return (
      <button type="button" onClick={onClick} title={title} style={style}>
        <svg width="12" height="9" viewBox="0 0 16 12" fill="none"><path d="M1 6.2L5.5 10.5L15 1" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    )
  }
  const disabled = state === 'off'
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} style={{
      width: 26, height: 26, cursor: disabled ? 'not-allowed' : 'pointer',
      background: 'transparent', border: `1.5px solid ${disabled ? 'var(--rb4-border)' : 'var(--rb4-cyan)'}`,
      color: disabled ? 'var(--rb4-border)' : 'var(--rb4-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'border-color 150ms ease, color 150ms ease',
    }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
    </button>
  )
}

export default function RugbySquadBuilder(props: Props) {
  const { players, selectedIds, squadBudgetCap, mode } = props
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('average_rating')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  // manage-mode-only: which currently-squadded player we're finding a
  // same-team replacement for.
  const [swappingOutId, setSwappingOutId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const teamCounts = useMemo(() => {
    const m = new Map<number, number>()
    selectedIds.forEach(id => {
      const p = playerById.get(id)
      if (p) m.set(p.team_id, (m.get(p.team_id) ?? 0) + 1)
    })
    return m
  }, [selectedIds, playerById])

  const totalSelected = selectedIds.length
  const squadValueTotal = selectedIds.reduce((sum, id) => sum + (playerById.get(id)?.value ?? 0), 0)
  const overBudget = squadBudgetCap != null && squadValueTotal > squadBudgetCap

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return players
    return players.filter(p => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
  }, [players, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number, bv: string | number
      if (sortKey === 'name') {
        av = a.name; bv = b.name
      } else {
        av = a[sortKey] ?? (sortDir === 1 ? Infinity : -Infinity)
        bv = b[sortKey] ?? (sortDir === 1 ? Infinity : -Infinity)
      }
      if (typeof av === 'string') return av.localeCompare(bv as string) * sortDir
      return ((av as number) - (bv as number)) * sortDir
    })
  }, [filtered, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortKey(key); setSortDir(key === 'name' ? 1 : -1) }
  }

  async function applySwap(newPlayerId: number) {
    if (mode !== 'manage' || swappingOutId == null) return
    setBusy(true)
    setMessage('')
    const res = await fetch('/api/rugby/squad/sub', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competition_id: props.competitionId, old_player_id: swappingOutId, new_player_id: newPlayerId }),
    })
    const data = await res.json()
    if (!res.ok || data.error) setMessage(data.error ?? 'Could not make that substitution')
    else setSwappingOutId(null)
    setBusy(false)
    router.refresh()
  }

  function rowAction(p: BuilderPlayer): { label: string; disabled: boolean; onClick?: () => void } {
    const isSelected = selectedSet.has(p.id)
    if (mode === 'draft') {
      if (isSelected) return { label: '✕ Remove', disabled: false, onClick: () => props.onRemove(p.id) }
      if ((teamCounts.get(p.team_id) ?? 0) >= 2) return { label: 'Team full', disabled: true }
      if (totalSelected >= 6) return { label: 'Squad full', disabled: true }
      return { label: '+ Add', disabled: false, onClick: () => props.onAdd(p.id) }
    }
    // manage mode
    if (!props.canSub) return { label: isSelected ? 'In squad' : '—', disabled: true }
    if (swappingOutId != null) {
      if (swappingOutId === p.id) return { label: 'Cancel', disabled: false, onClick: () => setSwappingOutId(null) }
      if (isSelected) return { label: 'In squad', disabled: true }
      const outPlayer = playerById.get(swappingOutId)
      if (!outPlayer || outPlayer.team_id !== p.team_id) return { label: 'Different team', disabled: true }
      return { label: busy ? '…' : '↔ Swap in', disabled: busy, onClick: () => applySwap(p.id) }
    }
    if (isSelected) return { label: 'Substitute', disabled: busy, onClick: () => setSwappingOutId(p.id) }
    return { label: '—', disabled: true }
  }

  const budgetPct = squadBudgetCap ? Math.min(100, (squadValueTotal / squadBudgetCap) * 100) : 0

  return (
    <div>
      <div className="rb4-panel p-5 mb-4" style={overBudget ? { borderColor: 'var(--rb4-danger)', boxShadow: '0 0 24px rgba(255,51,102,0.25)' } : undefined}>
        <div className="flex items-end justify-between flex-wrap gap-3 mb-3">
          <div>
            <div className="rb4-eyebrow">{mode === 'draft' ? '> Squad' : `> Subs ${props.perRound ? 'this round' : 'this competition'}`}</div>
            <div className="rb4-stat-number text-4xl">
              {mode === 'draft' ? `${totalSelected}/6` : `${props.subsUsed}/${props.maxFreeSubs}`}
            </div>
          </div>
          {squadBudgetCap != null && (
            <div className="text-right">
              <div className="rb4-eyebrow">{overBudget ? '> Over budget' : '> Budget left'}</div>
              <div className="rb4-stat-number text-4xl" style={{ color: overBudget ? 'var(--rb4-danger)' : 'var(--rb4-good)' }}>
                £{Math.abs(squadBudgetCap - squadValueTotal).toLocaleString()}
              </div>
            </div>
          )}
        </div>
        {squadBudgetCap != null && (
          <div className="rb4-progress-track" style={{ height: 4 }}>
            <div className="rb4-progress-fill" style={{ width: `${budgetPct}%`, background: overBudget ? 'var(--rb4-danger)' : 'var(--rb4-good)', boxShadow: 'none' }} />
          </div>
        )}
      </div>

      {totalSelected > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {selectedIds.map(id => {
            const p = playerById.get(id)
            if (!p) return null
            return (
              <span key={id} className="rb4-badge rb4-badge--magenta" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {p.name}
                {mode === 'draft' && (
                  <button type="button" onClick={() => props.onRemove(id)} style={{ color: 'var(--rb4-magenta)', opacity: 0.8 }}>✕</button>
                )}
              </span>
            )
          })}
        </div>
      )}

      {mode === 'manage' && swappingOutId != null && (
        <p className="text-sm mb-3" style={{ color: 'var(--rb4-fg)', fontFamily: 'var(--font-rb4-mono)' }}>
          Pick a replacement for {playerById.get(swappingOutId)?.name ?? 'this player'} from the same team below.
        </p>
      )}
      {message && <p className="text-sm mb-3" style={{ color: 'var(--rb4-danger)', fontFamily: 'var(--font-rb4-mono)' }}>{message}</p>}

      <div className="mb-4">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="&gt; search player or country_" className="rb4-input px-1 py-2 text-sm w-full"
        />
      </div>

      {/* No overflow-x-auto / minWidth here — a table wide enough to need
          side-scrolling on mobile is a hard no (Kit: nothing on the site
          may ever require horizontal scrolling). Every cell wraps instead
          of forcing width. */}
      <div className="rb4-panel rb4-panel--terminal">
        <div className="rb4-titlebar">
          <span className="rb4-dot" style={{ background: '#ff00ff' }} />
          <span className="rb4-dot" style={{ background: '#00ffff' }} />
          <span className="rb4-dot" style={{ background: '#ff9900' }} />
          <span style={{ marginLeft: 6 }}>PLAYERS.DB</span>
        </div>
        <div className="px-4">
        <table className="rb4-table text-xs" style={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            <col style={{ width: '46%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <tr>
              {([
                ['name', 'Player'], ['value', 'Value'], ['average_rating', 'Power'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  className="cursor-pointer select-none"
                  style={{ color: sortKey === key ? 'var(--rb4-cyan)' : 'var(--rb4-fg)', opacity: sortKey === key ? 1 : 0.5 }}
                >
                  {label}{sortKey === key ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 50).map(p => {
              const action = rowAction(p)
              const isSelected = selectedSet.has(p.id)
              const dotState: 'add' | 'picked' | 'off' = isSelected ? 'picked' : action.disabled ? 'off' : 'add'
              return (
                <tr key={p.id} style={{ background: isSelected ? 'rgba(255,0,255,0.06)' : undefined }}>
                  <td className="py-2 px-1" style={isSelected ? { boxShadow: 'inset 2px 0 0 var(--rb4-magenta)' } : undefined}>
                    <div style={{ color: 'var(--rb4-fg)' }}>{p.name}</div>
                    <div style={{ color: 'var(--rb4-fg)', opacity: 0.45 }}>{p.team}{p.group ? ` · ${p.group}` : ''}</div>
                  </td>
                  <td className="py-2 px-1 text-right rb4-num" style={{ color: 'var(--rb4-fg)', opacity: 0.7 }}>{fmtValue(p.value, p.value_is_estimated)}</td>
                  <td className="py-2 px-1 text-right">
                    {p.average_rating != null ? (
                      <span className="rb4-stat-number" style={{ color: p.average_rating >= 60 ? 'var(--rb4-good)' : p.average_rating < 40 ? 'var(--rb4-danger)' : 'var(--rb4-fg)' }}>{fmtRating(p.average_rating)}</span>
                    ) : '—'}
                  </td>
                  <td className="py-2 px-1 text-right">
                    {mode === 'draft' ? (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <RowDot state={dotState} onClick={action.onClick} title={action.disabled ? action.label : undefined} />
                      </div>
                    ) : (
                      <button
                        type="button" disabled={action.disabled} onClick={action.onClick}
                        className="rb4-button rb4-button--ghost text-xs"
                        style={{ padding: '5px 8px', whiteSpace: 'normal', width: '100%', transform: 'none' }}
                      >
                        <span>{action.label}</span>
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        <div className="rb4-statusbar">
          {sorted.length > 50
            ? `showing 50 / ${sorted.length.toLocaleString()} — search to narrow`
            : sorted.length === 0
              ? 'no players match that search'
              : `${sorted.length.toLocaleString()} player${sorted.length === 1 ? '' : 's'}`}
        </div>
      </div>
    </div>
  )
}
