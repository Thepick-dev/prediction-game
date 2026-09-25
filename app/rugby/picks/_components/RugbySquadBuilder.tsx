'use client'

import { useMemo, useState } from 'react'
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

type SortKey = 'name' | 'team' | 'group' | 'value' | 'average_rating'

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

export default function RugbySquadBuilder(props: Props) {
  const { players, selectedIds, squadBudgetCap, mode } = props
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
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

  const teams = useMemo(() => Array.from(new Set(players.map(p => p.team))).sort(), [players])
  const positions = useMemo(() => Array.from(new Set(players.map(p => p.group).filter((g): g is string => !!g))).sort(), [players])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return players.filter(p => {
      if (teamFilter && p.team !== teamFilter) return false
      if (positionFilter && p.group !== positionFilter) return false
      if (q && !p.name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false
      return true
    })
  }, [players, search, teamFilter, positionFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number, bv: string | number
      if (sortKey === 'name' || sortKey === 'team' || sortKey === 'group') {
        av = a[sortKey] ?? ''; bv = b[sortKey] ?? ''
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
    else { setSortKey(key); setSortDir(key === 'name' || key === 'team' || key === 'group' ? 1 : -1) }
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

  return (
    <div>
      <div
        className="rugby-panel p-3 mb-3 flex items-center justify-between flex-wrap gap-2"
        style={overBudget ? { borderColor: '#e8574a', boxShadow: '0 0 14px rgba(232,87,74,0.3)' } : undefined}
      >
        {mode === 'draft' ? (
          <span className="rugby-cond text-sm uppercase tracking-wide">Squad: {totalSelected}/6</span>
        ) : (
          <span className="rugby-cond text-sm uppercase tracking-wide">
            Subs used {props.perRound ? 'this round' : 'this competition'}: {props.subsUsed}/{props.maxFreeSubs} free
          </span>
        )}
        {squadBudgetCap != null && (
          <span className="rugby-cond text-sm uppercase tracking-wide" style={{ color: overBudget ? '#e8574a' : 'var(--rugby-floodlight)' }}>
            {overBudget
              ? `£${(squadValueTotal - squadBudgetCap).toLocaleString()} over budget`
              : `£${(squadBudgetCap - squadValueTotal).toLocaleString()} remaining`}
            <span className="normal-case tracking-normal" style={{ color: 'var(--rugby-text-faint)', fontWeight: 400 }}> of £{squadBudgetCap.toLocaleString()}</span>
          </span>
        )}
      </div>

      {totalSelected > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {selectedIds.map(id => {
            const p = playerById.get(id)
            if (!p) return null
            return (
              <span key={id} className="rugby-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {p.name}
                {mode === 'draft' && (
                  <button type="button" onClick={() => props.onRemove(id)} style={{ color: '#e8574a' }}>✕</button>
                )}
              </span>
            )
          })}
        </div>
      )}

      {mode === 'manage' && swappingOutId != null && (
        <p className="text-xs mb-2" style={{ color: 'var(--rugby-floodlight)' }}>
          Pick a replacement for {playerById.get(swappingOutId)?.name ?? 'this player'} from the same team below.
        </p>
      )}
      {message && <p className="text-sm mb-2" style={{ color: '#e8574a' }}>{message}</p>}

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search player or country…" className="rugby-input px-3 py-1.5 text-sm flex-1" style={{ minWidth: 160 }}
        />
        <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="rugby-input px-2 py-1.5 text-sm">
          <option value="">All countries</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={positionFilter} onChange={e => setPositionFilter(e.target.value)} className="rugby-input px-2 py-1.5 text-sm">
          <option value="">All positions</option>
          {positions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {(search || teamFilter || positionFilter) && (
          <button type="button" onClick={() => { setSearch(''); setTeamFilter(''); setPositionFilter('') }} className="rugby-button rugby-button--ghost text-xs px-3 py-1.5">
            Reset
          </button>
        )}
        <span className="text-xs ml-auto" style={{ color: 'var(--rugby-text-faint)' }}>{sorted.length.toLocaleString()} shown</span>
      </div>

      <div className="rugby-panel overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--rugby-line)' }}>
              {([
                ['name', 'Player'], ['team', 'Country'], ['group', 'Position'], ['value', 'Value'], ['average_rating', 'Avg Rating'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  className="rugby-cond text-left py-2 px-2 uppercase tracking-wide cursor-pointer whitespace-nowrap select-none"
                  style={{ color: sortKey === key ? 'var(--rugby-floodlight)' : 'var(--rugby-text-faint)' }}
                >
                  {label}{sortKey === key ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              <th className="rugby-cond text-right py-2 px-2 uppercase tracking-wide" style={{ color: 'var(--rugby-text-faint)' }} />
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 50).map(p => {
              const action = rowAction(p)
              const isSelected = selectedSet.has(p.id)
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--rugby-line)', background: isSelected ? 'rgba(255,194,46,0.08)' : undefined }}>
                  <td className="py-1.5 px-2 rugby-cond uppercase tracking-wide whitespace-nowrap">{p.name}</td>
                  <td className="py-1.5 px-2 whitespace-nowrap">{p.team}</td>
                  <td className="py-1.5 px-2 whitespace-nowrap"><span className="rugby-badge">{p.group ?? '?'}</span></td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">{fmtValue(p.value, p.value_is_estimated)}</td>
                  <td className="py-1.5 px-2 text-right">
                    {p.average_rating != null ? (
                      <span className="rugby-display" style={{ color: p.average_rating >= 60 ? '#3fa572' : p.average_rating < 40 ? '#e8574a' : 'var(--rugby-text-dim)' }}>{fmtRating(p.average_rating)}</span>
                    ) : '—'}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <button
                      type="button" disabled={action.disabled} onClick={action.onClick}
                      className={action.onClick && !action.disabled ? 'rugby-button text-xs' : 'rugby-button rugby-button--ghost text-xs'}
                      style={{ padding: '4px 10px', opacity: action.disabled && !isSelected ? 0.5 : 1 }}
                    >
                      {action.label}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sorted.length > 50 && (
          <p className="text-xs text-center py-3" style={{ color: 'var(--rugby-text-faint)' }}>
            Showing the top 50 of {sorted.length.toLocaleString()} — search or filter to narrow it down.
          </p>
        )}
        {sorted.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--rugby-text-faint)' }}>No players match those filters.</p>
        )}
      </div>
    </div>
  )
}
