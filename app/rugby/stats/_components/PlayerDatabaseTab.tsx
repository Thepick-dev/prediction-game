'use client'

import { Fragment, useMemo, useState } from 'react'
import type { RugbyPlayerSummary, RugbyPlayerStatAverages, RugbyPlayerPerformanceRow } from '../../../lib/rugbyPlayerDatabase'

const FORWARD_GROUPS = new Set(['Prop', 'Hooker', 'Second Row', 'Back Row'])
const SORT_KEYS = ['player', 'team', 'group', 'appearances', 'average_rating'] as const
type SortKey = typeof SORT_KEYS[number]

function fmt1(n: number) { return (Math.round(n * 10) / 10).toFixed(1) }

const STAT_LABELS: [keyof RugbyPlayerStatAverages, string][] = [
  ['tries', 'Tries'], ['try_assists', 'Assists'], ['meters_run', 'Metres'],
  ['tackles', 'Tackles'], ['tackles_missed', 'Tackles Missed'], ['clean_breaks', 'Clean Breaks'],
  ['offloads', 'Offloads'], ['conversions', 'Conversions'], ['penalty_goals', 'Penalty Goals'],
  ['drop_goals', 'Drop Goals'], ['yellow_card', 'Yellow Cards'], ['red_card', 'Red Cards'],
]

// Kit, 2026-09-27: part of the always-visible top line, not the dropdown —
// every stat, averaged per match played ("100 tackles in 5 matches should
// show as 20").
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

// Kit, 2026-09-27, after an earlier pass wrongly replaced this with
// averages-only: "you've got rid of the individual match performances —
// that was not what I asked for! I want those!" — every match a player
// played, one match to a line (every stat on that one line, no further
// click into more detail).
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
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--rugby-text-faint)' }}>Avg Power Ranking</div>
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
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--rugby-line)' }}>
              {([
                ['player', 'Player'], ['team', 'Country'], ['group', 'Position'],
                ['appearances', 'Apps'], ['average_rating', 'Power Ranking'],
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
                    style={{ background: open ? 'var(--rugby-ink-3)' : undefined }}
                  >
                    <td className="py-1.5 px-2 rugby-cond uppercase tracking-wide whitespace-nowrap">{open ? '▾' : '▸'} {p.player}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap">{p.team}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap">
                      <span className="rugby-badge" style={isFwd ? { background: 'rgba(255,194,46,0.15)', color: 'var(--rugby-floodlight)', borderColor: 'rgba(255,194,46,0.4)' } : undefined}>
                        {p.group ?? '?'}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right">{p.appearances}</td>
                    <td className="py-1.5 px-2 text-right">
                      {p.average_rating != null ? (
                        <span className="rugby-display" style={{ color: p.average_rating >= 60 ? '#3fa572' : p.average_rating < 40 ? '#e8574a' : 'var(--rugby-text-dim)' }}>{fmt1(p.average_rating)}</span>
                      ) : '—'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--rugby-line)', background: open ? 'var(--rugby-ink-3)' : undefined }}>
                    <td colSpan={5} style={{ padding: 0 }}>
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
        {sorted.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--rugby-text-faint)' }}>No players match those filters.</p>
        )}
      </div>
    </div>
  )
}
