'use client'

import { Fragment, useMemo, useState } from 'react'
import type { RugbyPlayerSummary, RugbyPlayerStatAverages, RugbyPlayerPerformanceRow } from '../../../lib/rugbyPlayerDatabase'

const FORWARD_GROUPS = new Set(['Prop', 'Hooker', 'Second Row', 'Back Row'])
const SORT_KEYS = ['player', 'group', 'average_rating'] as const
type SortKey = typeof SORT_KEYS[number]

function fmt1(n: number) { return (Math.round(n * 10) / 10).toFixed(1) }

// Kit, 2026-09-27: every stat, averaged per match played ("100 tackles in
// 5 matches should show as 20"), each its own grid column — one line per
// player. Grouped by kind (attack/kicking/defence/discipline) with its own
// header band and colour tint, so a dense row of numbers still reads at a
// glance instead of needing every abbreviation memorised.
type StatGroup = 'Attack' | 'Kicking' | 'Defence' | 'Discipline'
const GROUP_COLORS: Record<StatGroup, string> = {
  Attack: '#3fa572', Kicking: '#d9a441', Defence: '#4a9fd8', Discipline: '#e8574a',
}
const GROUP_TINTS: Record<StatGroup, string> = {
  Attack: 'rgba(63,165,114,0.08)', Kicking: 'rgba(217,164,65,0.08)',
  Defence: 'rgba(74,159,216,0.08)', Discipline: 'rgba(232,87,74,0.08)',
}
const STAT_COLUMNS: { key: keyof RugbyPlayerStatAverages; label: string; title: string; group: StatGroup }[] = [
  { key: 'tries', label: 'Tries', title: 'Tries per match', group: 'Attack' },
  { key: 'try_assists', label: 'Ast', title: 'Assists per match', group: 'Attack' },
  { key: 'meters_run', label: 'Mtrs', title: 'Metres run per match', group: 'Attack' },
  { key: 'clean_breaks', label: 'Brks', title: 'Clean breaks per match', group: 'Attack' },
  { key: 'offloads', label: 'Offl', title: 'Offloads per match', group: 'Attack' },
  { key: 'conversions', label: 'Con', title: 'Conversions per match', group: 'Kicking' },
  { key: 'penalty_goals', label: 'Pen', title: 'Penalty goals per match', group: 'Kicking' },
  { key: 'drop_goals', label: 'Drop', title: 'Drop goals per match', group: 'Kicking' },
  { key: 'tackles', label: 'Tkl', title: 'Tackles per match', group: 'Defence' },
  { key: 'tackles_missed', label: 'Miss', title: 'Tackles missed per match', group: 'Defence' },
  { key: 'yellow_card', label: 'YC', title: 'Yellow cards per match', group: 'Discipline' },
  { key: 'red_card', label: 'RC', title: 'Red cards per match', group: 'Discipline' },
]
// Consecutive runs of the same group, for the category header band's colSpan.
const STAT_GROUP_RUNS: { group: StatGroup; count: number }[] = []
STAT_COLUMNS.forEach(c => {
  const last = STAT_GROUP_RUNS[STAT_GROUP_RUNS.length - 1]
  if (last && last.group === c.group) last.count++
  else STAT_GROUP_RUNS.push({ group: c.group, count: 1 })
})

// Flags instead of country names — a fixed Unicode Emoji Tag Sequence for
// each Home Nation (there's no ISO country code for England/Scotland/
// Wales), everyone else from their ISO 3166-1 alpha-2 code via regional
// indicator symbols. Falls back to the plain country text (never blank)
// for anything not in this list, same defensive-fallback approach as
// every other optional/newer field on this page.
const HOME_NATION_FLAGS: Record<string, string> = {
  england: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  scotland: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  wales: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}',
}
const COUNTRY_ISO2: Record<string, string> = {
  ireland: 'ie', france: 'fr', italy: 'it',
  'new zealand': 'nz', australia: 'au', 'south africa': 'za', argentina: 'ar',
  fiji: 'fj', samoa: 'ws', tonga: 'to', georgia: 'ge', japan: 'jp',
  usa: 'us', 'united states': 'us', canada: 'ca', uruguay: 'uy', chile: 'cl',
  romania: 'ro', spain: 'es', portugal: 'pt', namibia: 'na', germany: 'de',
  netherlands: 'nl', belgium: 'be', poland: 'pl', 'czech republic': 'cz',
  kenya: 'ke', zimbabwe: 'zw', 'ivory coast': 'ci', "cote d'ivoire": 'ci',
  'hong kong': 'hk', korea: 'kr', 'south korea': 'kr', brazil: 'br',
  colombia: 'co', jamaica: 'jm', russia: 'ru', ukraine: 'ua', sweden: 'se',
  switzerland: 'ch', austria: 'at',
}
function countryFlag(name: string): string | null {
  const key = name.trim().toLowerCase()
  if (HOME_NATION_FLAGS[key]) return HOME_NATION_FLAGS[key]
  const iso = COUNTRY_ISO2[key]
  if (!iso) return null
  return iso.toUpperCase().split('').map(c => String.fromCodePoint(127397 + c.charCodeAt(0))).join('')
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
      if (sortKey === 'player' || sortKey === 'group') { av = a[sortKey] ?? ''; bv = b[sortKey] ?? '' }
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
    else { setSortKey(key); setSortDir(key === 'player' || key === 'group' ? 1 : -1) }
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

      {sorted.length > 0 && (
        <p className="text-[11px] mb-1.5 flex items-center gap-1" style={{ color: 'var(--rugby-text-faint)' }}>
          <span aria-hidden>↔</span> Player stays put — swipe or scroll sideways for every stat
        </p>
      )}

      {/* The panel itself clips to its chamfered shape with overflow:hidden
          — the scrolling region has to be a plain child div, never
          overflow-x-auto on the .rugby-panel element itself (that class's
          own overflow:hidden always wins the cascade and silently kills
          the scroll, which is exactly what happened before this rewrite). */}
      <div className="rugby-panel">
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="text-xs" style={{ borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th
                rowSpan={2}
                onClick={() => toggleSort('player')}
                className="rugby-cond text-left py-2 px-2 uppercase tracking-wide cursor-pointer whitespace-nowrap select-none"
                style={{ color: sortKey === 'player' ? 'var(--rugby-floodlight)' : 'var(--rugby-text-faint)', background: 'var(--rugby-ink-2)', position: 'sticky', left: 0, zIndex: 2, borderBottom: '2px solid var(--rugby-line)', borderRight: '1px solid var(--rugby-line)' }}
              >
                Player{sortKey === 'player' ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
              </th>
              <th
                rowSpan={2}
                onClick={() => toggleSort('group')}
                className="rugby-cond text-left py-2 px-2 uppercase tracking-wide cursor-pointer whitespace-nowrap select-none"
                style={{ color: sortKey === 'group' ? 'var(--rugby-floodlight)' : 'var(--rugby-text-faint)', borderBottom: '2px solid var(--rugby-line)' }}
              >
                Position{sortKey === 'group' ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
              </th>
              {STAT_GROUP_RUNS.map(({ group, count }) => (
                <th
                  key={group} colSpan={count}
                  className="rugby-cond text-center py-1 px-1.5 uppercase tracking-wide"
                  style={{ color: GROUP_COLORS[group], background: GROUP_TINTS[group], fontSize: '10px', letterSpacing: '0.08em', borderBottom: `1px solid ${GROUP_COLORS[group]}55` }}
                >
                  {group}
                </th>
              ))}
              <th
                rowSpan={2}
                onClick={() => toggleSort('average_rating')}
                className="rugby-cond text-right py-2 px-2 uppercase tracking-wide cursor-pointer whitespace-nowrap select-none"
                style={{ color: sortKey === 'average_rating' ? 'var(--rugby-floodlight)' : 'var(--rugby-text-faint)', background: 'var(--rugby-ink-2)', position: 'sticky', right: 0, zIndex: 2, borderBottom: '2px solid var(--rugby-line)', borderLeft: '1px solid var(--rugby-line)' }}
              >
                Power{sortKey === 'average_rating' ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
              </th>
            </tr>
            <tr style={{ borderBottom: '2px solid var(--rugby-line)' }}>
              {STAT_COLUMNS.map(({ key, label, title, group }) => (
                <th
                  key={key} title={title}
                  className="rugby-cond text-right py-1.5 px-1.5 uppercase tracking-wide whitespace-nowrap"
                  style={{ color: 'var(--rugby-text-faint)', background: GROUP_TINTS[group], fontSize: '10px' }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => {
              const isFwd = !!(p.group && FORWARD_GROUPS.has(p.group))
              const open = expandedId === p.player_id
              const flag = countryFlag(p.team)
              const colCount = 3 + STAT_COLUMNS.length
              const stickyBg = open ? 'var(--rugby-ink-3)' : 'var(--rugby-ink-2)'
              return (
                <Fragment key={p.player_id}>
                  <tr
                    onClick={() => setExpandedId(open ? null : p.player_id)}
                    className="cursor-pointer"
                    style={{ borderBottom: open ? 'none' : '1px solid var(--rugby-line)', background: open ? 'var(--rugby-ink-3)' : undefined }}
                  >
                    <td
                      className="py-1.5 px-2 rugby-cond uppercase tracking-wide whitespace-nowrap"
                      style={{ position: 'sticky', left: 0, background: stickyBg, borderRight: '1px solid var(--rugby-line)' }}
                    >
                      {open ? '▾' : '▸'} <span title={p.team}>{flag ?? ''}</span> {p.player}
                    </td>
                    <td className="py-1.5 px-2 whitespace-nowrap">
                      <span className="rugby-badge" style={isFwd ? { background: 'rgba(255,194,46,0.15)', color: 'var(--rugby-floodlight)', borderColor: 'rgba(255,194,46,0.4)' } : undefined}>
                        {p.group ?? '?'}
                      </span>
                    </td>
                    {STAT_COLUMNS.map(({ key, group }) => (
                      <td key={key} className="py-1.5 px-1.5 text-right rugby-num" style={{ color: 'var(--rugby-text-dim)', background: GROUP_TINTS[group] }}>
                        {p.averages ? fmt1(p.averages[key]) : '—'}
                      </td>
                    ))}
                    <td
                      className="py-1.5 px-2 text-right"
                      style={{ position: 'sticky', right: 0, background: stickyBg, borderLeft: '1px solid var(--rugby-line)' }}
                    >
                      {p.average_rating != null ? (
                        <span className="rugby-display" style={{ color: p.average_rating >= 60 ? '#3fa572' : p.average_rating < 40 ? '#e8574a' : 'var(--rugby-text-dim)' }}>{fmt1(p.average_rating)}</span>
                      ) : '—'}
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={colCount} style={{ padding: 0, borderBottom: '1px solid var(--rugby-line)' }}>
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
        {sorted.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--rugby-text-faint)' }}>No players match those filters.</p>
        )}
      </div>
    </div>
  )
}
