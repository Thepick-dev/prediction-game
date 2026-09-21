'use client'

import TicketModal from './TicketModal'
import KitBadge from './KitBadge'

type Row = {
  name: string
  points: number
  is_bot?: boolean
  kit?: { pattern: string; colour1: string; colour2: string; colour3: string | null } | null
  is_reigning_champ?: boolean
  is_vibes_champion?: boolean
  streak?: number | null
  is_top_dog?: boolean
  bankers_used?: number
  rank_delta?: number | null
}

type Props = {
  competitionName: string
  standings: Row[]
  onClose: () => void
  popArt?: boolean
}

const MEDALS = ['🥇', '🥈', '🥉']

// Literal hex, not var(--pop-*) — see TicketModal's own note on why colour
// values here have to be plain strings for html-to-image to capture them
// reliably.
const GOLD = '#D9A441'
const GOLD_INK = '#241a12'
const RISE = '#3FA572'
const FALL = '#C9502E'

export default function LeaderboardShareCard({ competitionName, standings, onClose, popArt = false }: Props) {
  return (
    <TicketModal
      eyebrow={competitionName}
      title="League Standings"
      subtitle={new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
      filenameBase="league-standings"
      onClose={onClose}
      popArt={popArt}
    >
      <div className="px-5 py-4 space-y-1.5">
        {standings.map((row, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="flex flex-col items-end leading-none shrink-0" style={{ width: 16 }}>
              <span className="font-mono text-xs opacity-50">{i + 1}</span>
              {!!row.rank_delta && (
                <span className="font-mono" style={{ fontSize: '8px', color: row.rank_delta > 0 ? RISE : FALL }}>
                  {row.rank_delta > 0 ? '▲' : '▼'}{Math.abs(row.rank_delta)}
                </span>
              )}
            </span>
            {row.is_bot ? (
              <span className="inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden" style={{ width: 20, height: 20 }}>
                <img src="/logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </span>
            ) : row.kit ? (
              <KitBadge pattern={row.kit.pattern} colour1={row.kit.colour1} colour2={row.kit.colour2} colour3={row.kit.colour3} size={20} />
            ) : null}
            <span className="uppercase font-bold text-sm flex-1 min-w-0 truncate">
              {i < 3 ? `${MEDALS[i]} ` : ''}{row.name}
            </span>
            <span className="inline-flex items-center gap-1 shrink-0">
              {row.is_reigning_champ && <span title="Reigning Champion">👑</span>}
              {row.is_vibes_champion && <span title="Vibes Champion">😎</span>}
              {row.is_top_dog && <span title="Top Dog">🐕</span>}
              {!!row.streak && <span title={`${row.streak} weeks above average`}>🔥</span>}
              {!!row.bankers_used && (
                <span className="font-mono font-bold rounded" style={{ fontSize: '9px', padding: '1px 4px', background: GOLD, color: GOLD_INK }}>
                  B {row.bankers_used}/2
                </span>
              )}
            </span>
            <span className="font-bold text-sm shrink-0">{row.points} pts</span>
          </div>
        ))}
      </div>
    </TicketModal>
  )
}
