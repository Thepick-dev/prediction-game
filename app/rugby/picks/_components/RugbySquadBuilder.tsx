'use client'

import { Fragment, useMemo, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import type { RugbyPlayerStatAverages, RugbyPlayerPerformanceRow } from '../../../lib/rugbyPlayerDatabase'

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
  appearances: number
  averages: RugbyPlayerStatAverages | null
  performances: RugbyPlayerPerformanceRow[]
}

const STAT_LABELS: [keyof RugbyPlayerStatAverages, string][] = [
  ['tries', 'Tries'], ['try_assists', 'Assists'], ['meters_run', 'Metres'],
  ['tackles', 'Tackles'], ['tackles_missed', 'Tackles Missed'], ['clean_breaks', 'Clean Breaks'],
  ['offloads', 'Offloads'], ['conversions', 'Conversions'], ['penalty_goals', 'Penalty Goals'],
  ['drop_goals', 'Drop Goals'], ['yellow_card', 'Yellow Cards'], ['red_card', 'Red Cards'],
]

function fmt1(n: number) { return (Math.round(n * 10) / 10).toFixed(1) }

// Same one-line, per-match-average breakdown as the Stats Hub Player
// Database — Kit, 2026-09-27: "this should all be available on the dream
// team section of picks too." Part of the always-visible top line, not
// behind a click.
function PlayerStatAverages({ averages }: { averages: RugbyPlayerStatAverages | null }) {
  if (!averages) {
    return <p className="text-xs py-2 px-2" style={{ color: 'var(--rugby-text-faint)' }}>No recorded performances yet.</p>
  }
  return (
    <div className="py-2 px-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px]" style={{ color: 'var(--rugby-text-dim)' }}>
      {STAT_LABELS.map(([key, label]) => (
        <span key={key}>{label}: <b style={{ color: 'var(--rugby-text)' }}>{fmt1(averages[key])}</b>/match</span>
      ))}
    </div>
  )
}

// Same individual match-by-match list as the Stats Hub Player Database —
// this is the click-to-expand content; the averages strip above is
// always visible.
function PlayerMatchLine({ r }: { r: RugbyPlayerPerformanceRow }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-1.5 px-2 text-[11px]" style={{ borderBottom: '1px solid var(--rugby-line)', color: 'var(--rugby-text-dim)' }}>
      <span className="rugby-cond uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--rugby-text-faint)' }}>
        {r.season} R{r.round}: {r.home_team} {r.home_score ?? '–'}–{r.away_score ?? '–'} {r.away_team}
      </span>
      <span>T <b style={{ color: 'var(--rugby-text)' }}>{r.tries}</b></span>
      <span>A <b style={{ color: 'var(--rugby-text)' }}>{r.try_assists}</b></span>
      <span>Conv <b style={{ color: 'var(--rugby-text)' }}>{r.conversions}</b></span>
      <span>Pen <b style={{ color: 'var(--rugby-text)' }}>{r.penalty_goals}</b></span>
      <span>Drop <b style={{ color: 'var(--rugby-text)' }}>{r.drop_goals}</b></span>
      <span>Metres <b style={{ color: 'var(--rugby-text)' }}>{r.meters_run}</b></span>
      <span>Tkl <b style={{ color: 'var(--rugby-text)' }}>{r.tackles}</b></span>
      <span>Tkl Missed <b style={{ color: 'var(--rugby-text)' }}>{r.tackles_missed}</b></span>
      <span>Breaks <b style={{ color: 'var(--rugby-text)' }}>{r.clean_breaks}</b></span>
      <span>Offloads <b style={{ color: 'var(--rugby-text)' }}>{r.offloads}</b></span>
      {r.yellow_card > 0 && <span style={{ color: '#e8574a' }}>YC {r.yellow_card}</span>}
      {r.red_card > 0 && <span style={{ color: '#e8574a' }}>RC {r.red_card}</span>}
      <span>Rating <b className="rugby-display" style={{ color: r.rating != null && r.rating >= 60 ? '#3fa572' : r.rating != null && r.rating < 40 ? '#e8574a' : 'var(--rugby-text-dim)' }}>{r.rating != null ? fmt1(r.rating) : '—'}</b></span>
    </div>
  )
}

function PlayerMatchList({ performances }: { performances: RugbyPlayerPerformanceRow[] }) {
  if (performances.length === 0) {
    return <p className="text-sm py-3 px-2" style={{ color: 'var(--rugby-text-faint)' }}>No recorded performances yet.</p>
  }
  return (
    <div>
      {performances.map((r, i) => <PlayerMatchLine key={`${r.season}-${r.round}-${i}`} r={r} />)}
    </div>
  )
}

type SortKey = 'name' | 'value' | 'average_rating' | 'appearances'

// Same forward/back distinction Player Database uses to colour the
// position badge — Kit, 2026-09-26: "the dream team bit of the picks page
// [should] more closely resemble the player database so people can see
// who they are picking."
const FORWARD_GROUPS = new Set(['Prop', 'Hooker', 'Second Row', 'Back Row'])

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
  captainId: number | null
  onSetCaptain: (playerId: number) => void
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
  captainId: number | null
  freeCaptainChangeUsed: boolean
  captainChangePenalty: number
}
type Props = DraftProps | ManageProps

// A quiet circular affordance for the common draft-mode case (add / this
// row is picked) — text pills on every one of 50 rows read as noise;
// the magenta glow is reserved for the row that's actually selected.
function RowDot({ state, onClick, title }: { state: 'add' | 'picked' | 'off'; onClick?: () => void; title?: string }) {
  if (state === 'picked') {
    const style: CSSProperties & { [key: `--${string}`]: string } = {
      width: 26, height: 26, border: 'none', cursor: 'pointer',
      background: 'var(--rugby-magenta)', color: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 14px var(--rugby-magenta)',
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
      background: 'transparent', border: `1.5px solid ${disabled ? 'var(--rugby-line)' : 'var(--rugby-floodlight-2)'}`,
      color: disabled ? 'var(--rugby-line)' : 'var(--rugby-floodlight-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
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
  const [expandedId, setExpandedId] = useState<number | null>(null)

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

  async function applyCaptainChange(playerId: number) {
    if (mode !== 'manage') return
    if (playerId === props.captainId) return
    if (!props.freeCaptainChangeUsed || confirm(`Changing captain again will cost ${props.captainChangePenalty} points. Continue?`)) {
      setBusy(true)
      setMessage('')
      const res = await fetch('/api/rugby/squad/captain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competition_id: props.competitionId, player_id: playerId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setMessage(data.error ?? 'Could not change captain')
      setBusy(false)
      router.refresh()
    }
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
      <div className="rugby-panel p-5 mb-4" style={overBudget ? { borderColor: '#ff3366', boxShadow: '0 0 24px rgba(255,51,102,0.25)' } : undefined}>
        <div className="flex items-end justify-between flex-wrap gap-3 mb-3">
          <div>
            <div className="rugby-hero-eyebrow">{mode === 'draft' ? '> Squad' : `> Subs ${props.perRound ? 'this round' : 'this competition'}`}</div>
            <div className="rugby-stat-number text-4xl">
              {mode === 'draft' ? `${totalSelected}/6` : `${props.subsUsed}/${props.maxFreeSubs}`}
            </div>
          </div>
          {squadBudgetCap != null && (
            <div className="text-right">
              <div className="rugby-hero-eyebrow">{overBudget ? '> Over budget' : '> Budget left'}</div>
              <div className="rugby-stat-number text-4xl" style={{ color: overBudget ? '#ff3366' : 'var(--rugby-floodlight)' }}>
                £{Math.abs(squadBudgetCap - squadValueTotal).toLocaleString()}
              </div>
            </div>
          )}
        </div>
        {squadBudgetCap != null && (
          <div className="rugby-progress-track" style={{ height: 4 }}>
            <div className="rugby-progress-fill" style={{ width: `${budgetPct}%`, background: overBudget ? '#ff3366' : 'var(--rugby-floodlight)', boxShadow: 'none' }} />
          </div>
        )}
      </div>

      {totalSelected > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {selectedIds.map(id => {
            const p = playerById.get(id)
            if (!p) return null
            const isCaptain = props.captainId === id
            return (
              <span key={id} className="rugby-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--rugby-magenta)', borderColor: 'var(--rugby-magenta)' }}>
                {isCaptain && <span title="Captain — scores extra every round">★</span>}
                {p.name}
                <button
                  type="button"
                  onClick={() => (mode === 'draft' ? props.onSetCaptain(id) : applyCaptainChange(id))}
                  disabled={mode === 'manage' && (isCaptain || busy)}
                  style={{ color: 'var(--rugby-magenta)', opacity: isCaptain ? 1 : 0.6, fontWeight: isCaptain ? 700 : 400 }}
                  title={isCaptain ? 'Current captain' : 'Make captain'}
                >
                  {isCaptain ? 'C' : 'make C'}
                </button>
                {mode === 'draft' && (
                  <button type="button" onClick={() => props.onRemove(id)} style={{ color: 'var(--rugby-magenta)', opacity: 0.8 }}>✕</button>
                )}
              </span>
            )
          })}
        </div>
      )}
      {mode === 'manage' && !props.freeCaptainChangeUsed && (
        <p className="text-xs mb-3" style={{ color: 'var(--rugby-text-faint)' }}>
          Your first captain change is free. After that, each change costs {props.captainChangePenalty} points.
        </p>
      )}

      {mode === 'manage' && swappingOutId != null && (
        <p className="text-sm mb-3" style={{ color: 'var(--rugby-text)' }}>
          Pick a replacement for {playerById.get(swappingOutId)?.name ?? 'this player'} from the same team below.
        </p>
      )}
      {message && <p className="text-sm mb-3" style={{ color: '#ff3366' }}>{message}</p>}

      <div className="mb-4">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="&gt; search player or country_" className="rugby-input px-1 py-2 text-sm w-full"
        />
      </div>

      {/* No overflow-x-auto / minWidth here — a table wide enough to need
          side-scrolling on mobile is a hard no (Kit: nothing on the site
          may ever require horizontal scrolling). Every cell wraps instead
          of forcing width. */}
      <div className="rugby-panel">
        <div className="rugby-terminal-bar">
          <span className="rugby-terminal-dot" style={{ background: 'var(--rugby-magenta)' }} />
          <span className="rugby-terminal-dot" style={{ background: 'var(--rugby-floodlight-2)' }} />
          <span className="rugby-terminal-dot" style={{ background: 'var(--rugby-floodlight)' }} />
          <span style={{ marginLeft: 6 }}>PLAYERS.DB</span>
        </div>
        <div className="px-4">
        <table className="rugby-table text-xs" style={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            <col style={{ width: '38%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '13%' }} />
          </colgroup>
          <thead>
            <tr>
              {([
                ['name', 'Player'], ['appearances', 'Apps'], ['value', 'Value'], ['average_rating', 'Power'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  className="cursor-pointer select-none"
                  style={{ color: sortKey === key ? 'var(--rugby-floodlight-2)' : 'var(--rugby-text)', opacity: sortKey === key ? 1 : 0.5 }}
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
              const isFwd = !!(p.group && FORWARD_GROUPS.has(p.group))
              const open = expandedId === p.id
              return (
                <Fragment key={p.id}>
                  <tr style={{ background: isSelected ? 'rgba(255,0,255,0.06)' : undefined }}>
                    <td
                      className="py-2 px-1 cursor-pointer"
                      onClick={() => setExpandedId(open ? null : p.id)}
                      style={isSelected ? { boxShadow: 'inset 2px 0 0 var(--rugby-magenta)' } : undefined}
                    >
                      <div style={{ color: 'var(--rugby-text)' }}>{open ? '▾' : '▸'} {p.name}</div>
                      <div className="flex items-center gap-1 flex-wrap mt-0.5" style={{ color: 'var(--rugby-text)', opacity: 0.6 }}>
                        <span>{p.team}</span>
                        {p.group && (
                          <span className="rugby-badge" style={isFwd ? { color: 'var(--rugby-floodlight)', borderColor: 'var(--rugby-floodlight)' } : { color: 'var(--rugby-floodlight-2)', borderColor: 'var(--rugby-floodlight-2)' }}>
                            {p.group}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-1 text-right rugby-num" style={{ color: 'var(--rugby-text)', opacity: 0.5 }}>{p.appearances}</td>
                    <td className="py-2 px-1 text-right rugby-num" style={{ color: 'var(--rugby-text)', opacity: 0.7 }}>{fmtValue(p.value, p.value_is_estimated)}</td>
                    <td className="py-2 px-1 text-right">
                      {p.average_rating != null ? (
                        <span className="rugby-stat-number" style={{ color: p.average_rating >= 60 ? 'var(--rugby-floodlight)' : p.average_rating < 40 ? '#ff3366' : 'var(--rugby-text)' }}>{fmtRating(p.average_rating)}</span>
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
                          className="rugby-button rugby-button--ghost text-xs"
                          style={{ padding: '5px 8px', whiteSpace: 'normal', width: '100%' }}
                        >
                          <span>{action.label}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                  <tr style={{ background: isSelected ? 'rgba(255,0,255,0.06)' : undefined }}>
                    <td colSpan={5} style={{ padding: 0, borderBottom: '1px solid var(--rugby-line)' }}>
                      <PlayerStatAverages averages={p.averages} />
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={5} style={{ padding: 0, borderBottom: '1px solid var(--rugby-line)' }}>
                        <p className="text-[10px] uppercase tracking-wide pt-2 px-2" style={{ color: 'var(--rugby-text-faint)' }}>Match by match ({p.appearances})</p>
                        <PlayerMatchList performances={p.performances} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        </div>
        <div className="rugby-statusbar">
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
