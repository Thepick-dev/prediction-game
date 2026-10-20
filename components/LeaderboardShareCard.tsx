'use client'

import TicketModal from './TicketModal'
import KitBadge from './KitBadge'
import { truncateDisplayName } from '../app/lib/leaderboardBadges'

type Row = {
  name: string
  points: number
  is_bot?: boolean
  kit?: { pattern: string; colour1: string; colour2: string; colour3: string | null } | null
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
      <div className="px-5 py-4 space-y-2">
        {/* Mirrors the live leaderboard's own decluttered row: a bigger
            shirt and a bold, fixed-length name take the visual weight
            instead of a row of small status icons — those are a tap-to-
            expand detail on the site, which this static image has no
            equivalent for, so they're left off here rather than crammed in. */}
        {standings.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="flex flex-col items-end leading-none shrink-0" style={{ width: 18 }}>
              <span className="font-mono text-xs opacity-50">{i + 1}</span>
              {!!row.rank_delta && (
                <span className="font-mono" style={{ fontSize: '8px', color: row.rank_delta > 0 ? RISE : FALL }}>
                  {row.rank_delta > 0 ? '▲' : '▼'}{Math.abs(row.rank_delta)}
                </span>
              )}
            </span>
            {row.is_bot ? (
              <span className="inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden" style={{ width: 28, height: 28 }}>
                <img src="/logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </span>
            ) : row.kit ? (
              <KitBadge pattern={row.kit.pattern} colour1={row.kit.colour1} colour2={row.kit.colour2} colour3={row.kit.colour3} size={28} />
            ) : null}
            <span className="pop-name text-lg flex-1 min-w-0 truncate">
              {i < 3 ? `${MEDALS[i]} ` : ''}{truncateDisplayName(row.name)}
            </span>
            <span className="font-bold text-sm shrink-0">{row.points} pts</span>
          </div>
        ))}
      </div>
    </TicketModal>
  )
}
