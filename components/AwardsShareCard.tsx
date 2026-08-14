'use client'

import TicketModal from './TicketModal'

type Award = { emoji: string; title: string; winner: string; detail: string }

type Props = {
  competitionName: string
  awards: Award[]
  onClose: () => void
  popArt?: boolean
  isProvisional?: boolean
}

export default function AwardsShareCard({ competitionName, awards, onClose, popArt = false, isProvisional = false }: Props) {
  return (
    <TicketModal
      eyebrow={competitionName}
      title="Awards"
      subtitle={isProvisional
        ? `Provisional as of ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
        : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
      filenameBase="awards"
      onClose={onClose}
      popArt={popArt}
    >
      <div className="px-5 py-4 space-y-2.5">
        {awards.map((a, i) => (
          <div key={i} className="flex items-center gap-2.5 text-sm">
            <span className="text-xl shrink-0">{a.emoji}</span>
            <div>
              <p className="uppercase font-bold leading-tight">{a.title} — {a.winner}</p>
              <p className="opacity-60 text-xs">{a.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </TicketModal>
  )
}
