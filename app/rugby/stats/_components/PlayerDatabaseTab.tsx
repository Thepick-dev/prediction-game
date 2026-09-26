'use client'

import { Fragment, useMemo, useState } from 'react'
import type { RugbyPlayerSummary, RugbyPlayerPerformanceRow } from '../../../lib/rugbyPlayerDatabase'

const FORWARD_GROUPS = new Set(['Prop', 'Hooker', 'Second Row', 'Back Row'])
const SORT_KEYS = ['player', 'team', 'group', 'appearances', 'value', 'average_rating'] as const
type SortKey = typeof SORT_KEYS[number]

function fmt1(n: number) { return (Math.round(n * 10) / 10).toFixed(1) }

// A player's match-by-match history — the exact same "click a row to see
// the full stat breakdown" interaction the old flat per-performance table
// used, just nested under a player summary row instead of being the
// top-level list.
function PlayerMatchHistory({ performances }: { performances: RugbyPlayerPerformanceRow[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  if (performances.length === 0) {
    return <p className="text-sm py-3 px-2" style={{ color: 'var(--rugby-text-faint)' }}>No recorded performances yet.</p>
  }

  return (
    <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1.5px solid var(--rugby-line)' }}>
          {['Match', 'T', 'A', 'Metres', 'Tkl', 'Value', 'Rating'].map((label, i) => (
            <th key={label} className={`rugby-cond text-left py-1.5 px-2 uppercase tracking-wide whitespace-nowrap ${i > 0 ? 'text-right' : ''}`} style={{ color: 'var(--rugby-text-faint)' }}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {performances.map((r, i) => {
          const open = openIdx === i
          return (
            <Fragment key={`${r.season}-${r.round}-${r.player_id}`}>
              <tr
                onClick={() => setOpenIdx(open ? null : i)}
                className="cursor-pointer"
                style={{ borderBottom: '1px solid var(--rugby-line)', background: open ? 'var(--rugby-ink-3)' : undefined }}
              >
                <td className="py-1.5 px-2 whitespace-nowrap" style={{ color: 'var(--rugby-text-faint)', fontFamily: 'var(--font-rugby-cond)' }}>
                  {r.season} R{r.round}: {r.home_team} {r.home_score ?? '–'}-{r.away_score ?? '–'} {r.away_team}
                </td>
                <td className="py-1.5 px-2 text-right">{r.tries}</td>
                <td className="py-1.5 px-2 text-right">{r.try_assists}</td>
                <td className="py-1.5 px-2 text-right">{r.meters_run}</td>
                <td className="py-1.5 px-2 text-right">{r.tackles}</td>
                <td className="py-1.5 px-2 text-right whitespace-nowrap">
                  {r.value != null ? `£${r.value.toLocaleString()}` : '—'}
                  {r.value_is_estimated && <span className="ml-1" style={{ color: 'var(--rugby-text-faint)', fontSize: '9px' }}>(est.)</span>}
                </td>
                <td className="py-1.5 px-2 text-right">
                  {r.rating != null ? (
                    <span className="rugby-display" style={{ color: r.rating >= 60 ? '#3fa572' : r.rating < 40 ? '#e8574a' : 'var(--rugby-text-dim)' }}>{fmt1(r.rating)}</span>
                  ) : '—'}
                </td>
              </tr>
              {open && (
                <tr>
                  <td colSpan={7} style={{ background: 'var(--rugby-ink-3)', borderBottom: '1px solid var(--rugby-line)' }}>
                    <div className="p-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px]" style={{ color: 'var(--rugby-text-dim)' }}>
                      <span>Conversions: <b style={{ color: 'var(--rugby-text)' }}>{r.conversions}</b></span>
                      <span>Penalty goals: <b style={{ color: 'var(--rugby-text)' }}>{r.penalty_goals}</b></span>
                      <span>Drop goals: <b style={{ color: 'var(--rugby-text)' }}>{r.drop_goals}</b></span>
                      <span>Clean breaks: <b style={{ color: 'var(--rugby-text)' }}>{r.clean_breaks}</b></span>
                      <span>Offloads: <b style={{ color: 'var(--rugby-text)' }}>{r.offloads}</b></span>
                      <span>Tackles missed: <b style={{ color: 'var(--rugby-text)' }}>{r.tackles_missed}</b></span>
                      {r.yellow_card > 0 && <span>Yellow cards: <b style={{ color: '#e8574a' }}>{r.yellow_card}</b></span>}
                      {r.red_card > 0 && <span>Red cards: <b style={{ color: '#e8574a' }}>{r.red_card}</b></span>}
                      <span>{r.is_home ? 'Played at home' : `Played away vs ${r.opponent}`}</span>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

export default function PlayerDatabaseTab({ players }: { players: RugbyPlayerSummary[] }) {
  const [search, setSearch] = useState('')
  const [team, setTeam] = useState('')
  const [position, setPosition] = useState('')
  const [season, setSeason] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('average_rating')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const teams = useMemo(() => Array.from(new Set(players.map(p => p.team))).sort(), [players])
  const positions = useMemo(() => Array.from(new Set(players.map(p => p.group).filter((g): g is string => !!g))).sort(), [players])
  const seasons = useMemo(() => Array.from(new Set(players.flatMap(p => p.performances.map(perf => perf.season)))).sort((a, b) => b - a), [players])

  const totalPlayers = players.length
  const totalPerformances = players.reduce((sum, p) => sum + p.appearances, 0)
  const ratedPlayers = players.filter(p => p.average_rating != null)
  const avgRating = ratedPlayers.length ? ratedPlayers.reduce((sum, p) => sum + (p.average_rating ?? 0), 0) / ratedPlayers.length : 0

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return players.filter(p => {
      if (team && p.team !== team) return false
      if (position && p.group !== position) return false
      if (season && !p.performances.some(perf => String(perf.season) === season)) return false
      if (q && !p.player.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false
      return true
    })
  }, [players, search, team, position, season])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number, bv: string | number
      if (sortKey === 'player' || sortKey === 'team' || sortKey === 'group') { av = a[sortKey] ?? ''; bv = b[sortKey] ?? '' }
      else {
        av = a[sortKey] ?? (sortDir === 1 ? Infinity : -Infinity)
        bv = b[sortKey] ?? (sortDir === 1 ? Infinity : -Infinity)
      }
      if (typeof av === 'string') return av.localeCompare(bv as string) * sortDir
      return ((av as number) - (bv as number)) * sortDir
    })
  }, [filtered, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortKey(key); setSortDir(key === 'player' || key === 'team' || key === 'group' ? 1 : -1) }
    setExpandedId(null)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="rugby-panel px-4 py-2 text-center flex-1" style={{ minWidth: 110 }}>
          <div className="rugby-display text-xl">{totalPlayers.toLocaleString()}</div>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--rugby-text-faint)' }}>Players</div>
        </div>
        <div className="rugby-panel px-4 py-2 text-center flex-1" style={{ minWidth: 110 }}>
          <div className="rugby-display text-xl">{totalPerformances.toLocaleString()}</div>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--rugby-text-faint)' }}>Performances</div>
        </div>
        <div className="rugby-panel px-4 py-2 text-center flex-1" style={{ minWidth: 110 }}>
          <div className="rugby-display text-xl">{seasons.join('–')}</div>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--rugby-text-faint)' }}>Seasons</div>
        </div>
        <div className="rugby-panel px-4 py-2 text-center flex-1" style={{ minWidth: 110 }}>
          <div className="rugby-display text-xl">{fmt1(avgRating)}</div>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--rugby-text-faint)' }}>Avg rating</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search player or country…" className="rugby-input px-3 py-1.5 text-sm flex-1" style={{ minWidth: 160 }} />
        <select value={season} onChange={e => setSeason(e.target.value)} className="rugby-input px-2 py-1.5 text-sm">
          <option value="">Played in any season</option>
          {seasons.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={team} onChange={e => setTeam(e.target.value)} className="rugby-input px-2 py-1.5 text-sm">
          <option value="">All countries</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={position} onChange={e => setPosition(e.target.value)} className="rugby-input px-2 py-1.5 text-sm">
          <option value="">All positions</option>
          {positions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {(search || season || team || position) && (
          <button type="button" onClick={() => { setSearch(''); setSeason(''); setTeam(''); setPosition('') }} className="rugby-button rugby-button--ghost text-xs px-3 py-1.5">
            Reset
          </button>
        )}
        <span className="text-xs ml-auto" style={{ color: 'var(--rugby-text-faint)' }}>{sorted.length.toLocaleString()} shown</span>
      </div>

      <div className="rugby-panel overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 620 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--rugby-line)' }}>
              {([
                ['player', 'Player'], ['team', 'Country'], ['group', 'Position'],
                ['appearances', 'Apps'], ['value', 'Value'], ['average_rating', 'Avg Rating'],
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
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => {
              const isFwd = !!(p.group && FORWARD_GROUPS.has(p.group))
              const open = expandedId === p.player_id
              return (
                <Fragment key={p.player_id}>
                  <tr
                    onClick={() => setExpandedId(open ? null : p.player_id)}
                    className="cursor-pointer"
                    style={{ borderBottom: '1px solid var(--rugby-line)', background: open ? 'var(--rugby-ink-3)' : undefined }}
                  >
                    <td className="py-1.5 px-2 rugby-cond uppercase tracking-wide whitespace-nowrap">{p.player}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap">{p.team}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap">
                      <span className="rugby-badge" style={isFwd ? { background: 'rgba(255,194,46,0.15)', color: 'var(--rugby-floodlight)', borderColor: 'rgba(255,194,46,0.4)' } : undefined}>
                        {p.group ?? '?'}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right">{p.appearances}</td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">
                      {p.value != null ? `£${p.value.toLocaleString()}` : '—'}
                      {p.value_is_estimated && <span className="ml-1" style={{ color: 'var(--rugby-text-faint)', fontSize: '9px' }}>(est.)</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      {p.average_rating != null ? (
                        <span className="rugby-display" style={{ color: p.average_rating >= 60 ? '#3fa572' : p.average_rating < 40 ? '#e8574a' : 'var(--rugby-text-dim)' }}>{fmt1(p.average_rating)}</span>
                      ) : '—'}
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <PlayerMatchHistory performances={p.performances} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--rugby-text-faint)' }}>No players match those filters.</p>
        )}
      </div>
    </div>
  )
}
