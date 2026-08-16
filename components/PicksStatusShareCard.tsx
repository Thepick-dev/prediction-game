'use client'

import TicketModal from './TicketModal'

type Props = {
  competitionName: string
  gwNumber: number
  deadline: string
  picked: string[]
  notPicked: string[]
  onClose: () => void
}

export default function PicksStatusShareCard({ competitionName, gwNumber, deadline, picked, notPicked, onClose }: Props) {
  return (
    <TicketModal
      eyebrow={competitionName}
      title={`GW${gwNumber} Pick Status`}
      subtitle={`Deadline ${new Date(deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}`}
      filenameBase={`gw${gwNumber}-pick-status`}
      onClose={onClose}
      popArt
    >
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-4">
          <img src="/logo.png" alt="Futzy" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          <p className="text-[11px] uppercase tracking-wider font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Futzy&apos;s taking the register...
          </p>
        </div>

        <p className="text-xs uppercase tracking-wider font-bold mb-1.5" style={{ color: '#CCFA00' }}>✅ Picked ({picked.length})</p>
        <p className="text-sm mb-3" style={{ lineHeight: 1.5 }}>{picked.length ? picked.join(', ') : '—'}</p>

        <p className="text-xs uppercase tracking-wider font-bold mb-1.5" style={{ color: '#FA6100' }}>⏳ Not yet ({notPicked.length})</p>
        <p className="text-sm" style={{ lineHeight: 1.5 }}>{notPicked.length ? notPicked.join(', ') : "Everyone's in!"}</p>
      </div>
    </TicketModal>
  )
}
