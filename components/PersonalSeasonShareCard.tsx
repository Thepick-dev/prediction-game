'use client'

import TicketModal from './TicketModal'

type SimpleAward = { emoji: string; title: string }
type WinnerLine = { winnerDisplay: string; detail: string }

type Props = {
  competitionName: string
  displayName: string
  position: number
  totalEntrants: number
  points: number
  isProvisional: boolean
  wonAwards: SimpleAward[]
  bestPlayer: WinnerLine
  bestTeam: WinnerLine
  onClose: () => void
}

function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

export default function PersonalSeasonShareCard({
  competitionName, displayName, position, totalEntrants, points, isProvisional,
  wonAwards, bestPlayer, bestTeam, onClose,
}: Props) {
  return (
    <TicketModal
      eyebrow={competitionName}
      title={`${displayName}'s Season`}
      subtitle={isProvisional ? 'Provisional — season still in progress' : 'Final'}
      filenameBase="my-season"
      onClose={onClose}
      popArt
    >
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center justify-between rounded-lg p-3" style={{ background: 'rgba(204,250,0,0.08)', border: '1px solid rgba(204,250,0,0.3)' }}>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Position</p>
            <p className="font-black" style={{ color: '#CCFA00' }}>{ordinal(position)} of {totalEntrants}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Points</p>
            <p className="font-black" style={{ color: '#CCFA00' }}>{points}</p>
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wider font-bold mb-1" style={{ color: '#A000FA' }}>🏆 Awards</p>
          {wonAwards.length === 0 ? (
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>None this season — there&apos;s always next time.</p>
          ) : (
            <p className="text-sm">{wonAwards.map(a => `${a.emoji} ${a.title}`).join('  ·  ')}</p>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wider font-bold mb-1" style={{ color: '#00F2FA' }}>⭐ Best Player{bestPlayer.winnerDisplay.includes('&') || bestPlayer.winnerDisplay.startsWith('Multiple') ? 's' : ''}</p>
          <p className="text-sm">{bestPlayer.winnerDisplay}{bestPlayer.detail ? ` — ${bestPlayer.detail}` : ''}</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wider font-bold mb-1" style={{ color: '#FA6100' }}>🛡️ Best Team</p>
          <p className="text-sm">{bestTeam.winnerDisplay}{bestTeam.detail ? ` — ${bestTeam.detail}` : ''}</p>
        </div>
      </div>
    </TicketModal>
  )
}
