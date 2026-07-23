'use client'

import TicketModal from './TicketModal'

type Row = { name: string; points: number }

type Props = {
  competitionName: string
  standings: Row[]
  onClose: () => void
}

export default function LeaderboardShareCard({ competitionName, standings, onClose }: Props) {
  return (
    <TicketModal
      eyebrow={competitionName}
      title="League Standings"
      subtitle={new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
      filenameBase="league-standings"
      onClose={onClose}
    >
      <div className="px-5 py-4 space-y-1.5">
        {standings.map((row, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="uppercase font-bold">
              {i === 0 ? '🏆 ' : `${i + 1}. `}{row.name}
            </span>
            <span className="font-bold">{row.points} pts</span>
          </div>
        ))}
      </div>
    </TicketModal>
  )
}
