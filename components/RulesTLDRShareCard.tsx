'use client'

import TicketModal from './TicketModal'

type Props = {
  bonusCardName: string | null
  showBonusCard: boolean
  onClose: () => void
  popArt?: boolean
}

export default function RulesTLDRShareCard({ bonusCardName, showBonusCard, onClose, popArt = false }: Props) {
  return (
    <TicketModal
      eyebrow="LMS All-Stars"
      title="Rules — TL;DR"
      subtitle="The short version"
      filenameBase="lms-rules-tldr"
      onClose={onClose}
      popArt={popArt}
    >
      <div className="px-5 py-4 space-y-2.5" style={{ fontSize: '13px', lineHeight: 1.5 }}>
        <p>⚽ Predict Premier League results for roughly half a season. Most points wins.</p>
        <p>📅 Each gameweek: pick <strong>1 team + 2 players</strong> before the deadline.</p>
        <p>🔁 Each team usable once (twice for your tier-draft picks). Each player usable twice.</p>
        <p>⏰ Miss the deadline? You&apos;re autopicked — lowest-placed team, two well-known players.</p>
        <p>⭐ <strong>2 Bankers</strong> per competition — doubles your whole week&apos;s score.</p>
        <p>🎲 <strong>1 All or Nothing</strong> per competition — go big on an unused player: score, and you get a bonus 3rd use; blank, and you lose them for good.</p>
        {showBonusCard && bonusCardName && (
          <p>🃏 <strong>{bonusCardName}</strong> — a bonus nominated player everyone can cash in once, any gameweek, on top of your normal picks.</p>
        )}
        <p>📈 Bigger upsets score bigger points. Nobody&apos;s picks are visible until the deadline passes.</p>
      </div>
    </TicketModal>
  )
}
