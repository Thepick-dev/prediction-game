'use client'

import TicketModal from './TicketModal'
import KitBadge from './KitBadge'

type Row = {
  name: string
  points: number
  is_bot?: boolean
  kit?: { pattern: string; colour1: string; colour2: string; colour3: string | null } | null
}

type Props = {
  competitionName: string
  standings: Row[]
  onClose: () => void
  popArt?: boolean
}

const MEDALS = ['🥇', '🥈', '🥉']

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
          <div key={i} className="flex items-center gap-2">
            <span className="font-mono text-xs w-4 text-right shrink-0 opacity-50">{i + 1}</span>
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
            <span className="font-bold text-sm shrink-0">{row.points} pts</span>
          </div>
        ))}
      </div>
    </TicketModal>
  )
}
