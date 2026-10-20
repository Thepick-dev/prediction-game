'use client'

import TicketModal from './TicketModal'
import KitBadge from './KitBadge'
import FitName from './FitName'

type Row = {
  name: string
  points: number
  is_bot?: boolean
  kit?: { pattern: string; colour1: string; colour2: string; colour3: string | null } | null
  bankers_remaining: number
  team_points: number
  player_points: number
}

type Props = {
  competitionName: string
  standings: Row[]
  onClose: () => void
  popArt?: boolean
}

// Literal hex, not var(--pop-*) — see TicketModal's own note on why colour
// values here have to be plain strings for html-to-image to capture them
// reliably. Same fixed palette the ticket has always used for these.
const ORANGE = '#E2550A'
const BLUE = '#00AEEF'
const YELLOW = '#C77DFF'
const GREEN = '#CCFA00'
const PINK = '#E0186B'
const NAME_GLOW = '0 0 4px rgba(0,174,239,0.5), 0 0 12px rgba(0,174,239,0.28)'

// A literal mirror of the live leaderboard table — same six columns, same
// column order, same accent colours — rather than an adapted, differently-
// shaped summary. Confirmed directly against a screenshot of the real
// table: this should read as "that, as an image" at a glance, not as a
// separate design that happens to share some colours with it.
export default function LeaderboardShareCard({ competitionName, standings, onClose, popArt = false }: Props) {
  return (
    <TicketModal
      eyebrow={competitionName}
      title="Leaderboard"
      subtitle={new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
      filenameBase="league-standings"
      onClose={onClose}
      popArt={popArt}
    >
      <div className="px-3 py-3">
        <table className="w-full" style={{ fontSize: '11px', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
          <thead>
            <tr className="text-left" style={{ fontSize: '8px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
              <th className="py-1 pr-0.5 uppercase tracking-wider" style={{ width: '9%' }}>#</th>
              <th className="py-1 px-0.5 uppercase tracking-wider" style={{ width: '38%' }}>Player</th>
              <th className="py-1 px-0.5 text-right uppercase tracking-wider" style={{ width: '14%' }}>Bnk</th>
              <th className="py-1 px-0.5 text-right uppercase tracking-wider" style={{ width: '15%' }}>Team</th>
              <th className="py-1 px-0.5 text-right uppercase tracking-wider" style={{ width: '15%' }}>Plyr</th>
              <th className="py-1 pl-0.5 text-right uppercase tracking-wider font-black" style={{ width: '18%' }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <td className="py-1 pr-0.5 font-black" style={{ color: '#FFFFFF' }}>{i + 1}</td>
                <td className="py-1 px-0.5" style={{ maxWidth: 0 }}>
                  <div className="flex items-center gap-1">
                    {row.is_bot ? (
                      <span className="inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden" style={{ width: 18, height: 18 }}>
                        <img src="/logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </span>
                    ) : row.kit ? (
                      <span className="shrink-0"><KitBadge pattern={row.kit.pattern} colour1={row.kit.colour1} colour2={row.kit.colour2} colour3={row.kit.colour3} size={18} /></span>
                    ) : null}
                    <FitName baseSize={row.is_bot ? 10 : 13} minSize={8} className="pop-name" style={{ color: i === 0 ? PINK : '#FFFFFF', textShadow: NAME_GLOW }}>
                      {row.name}
                    </FitName>
                  </div>
                </td>
                <td className="py-1 px-0.5 text-right font-mono font-bold" style={{ color: ORANGE, fontVariantNumeric: 'tabular-nums' }}>{row.bankers_remaining}</td>
                <td className="py-1 px-0.5 text-right font-mono font-bold" style={{ color: BLUE, fontVariantNumeric: 'tabular-nums' }}>{row.team_points}</td>
                <td className="py-1 px-0.5 text-right font-mono font-bold" style={{ color: YELLOW, fontVariantNumeric: 'tabular-nums' }}>{row.player_points}</td>
                <td className="py-1 pl-0.5 text-right font-black font-mono" style={{ color: GREEN, fontVariantNumeric: 'tabular-nums', fontSize: '13px' }}>{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TicketModal>
  )
}
