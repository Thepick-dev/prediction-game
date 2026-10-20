'use client'

import TicketModal from './TicketModal'
import KitBadge from './KitBadge'
import FitName from './FitName'

type Row = {
  name: string
  points: number
  is_bot?: boolean
  kit?: { pattern: string; colour1: string; colour2: string; colour3: string | null } | null
  rank_delta?: number | null
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

const MEDALS = ['🥇', '🥈', '🥉']

// Literal hex, not var(--pop-*) — see TicketModal's own note on why colour
// values here have to be plain strings for html-to-image to capture them
// reliably. Matches the live leaderboard's own fixed palette for these
// (orange/blue/yellow for Bankers/Team/Player, a blue glow on every name
// echoing the page's own hero-title glow) regardless of which Pop Art
// variant happens to be active — the ticket has always used its own fixed
// colours rather than tracking the live variant exactly (see RISE/FALL
// below, neither of which is an exact pop-green/pop-red either).
const RISE = '#3FA572'
const FALL = '#C9502E'
const ORANGE = '#E2550A'
const BLUE = '#00AEEF'
const YELLOW = '#C77DFF'
const NAME_GLOW = '0 0 4px rgba(0,174,239,0.5), 0 0 12px rgba(0,174,239,0.28)'

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
      <div className="px-5 py-4 space-y-2.5">
        {/* Mirrors the live leaderboard's own row: full name (not cut) at a
            big, glowing size, bigger shirt, and the Bankers/Team/Player
            breakdown as its own small coloured line — same accent colours
            as the live columns, not grey, so it reads as data rather than
            a caption. Status icons (crown, streak, etc.) stay off — those
            are a tap-to-expand detail on the site with no equivalent here. */}
        {standings.map((row, i) => (
          <div key={i}>
            <div className="flex items-center gap-2">
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
              <FitName baseSize={row.is_bot ? 13 : 18} minSize={11} className="pop-name flex-1 min-w-0" style={{ textShadow: NAME_GLOW }}>
                {i < 3 ? `${MEDALS[i]} ` : ''}{row.name}
              </FitName>
              <span className="font-bold text-sm shrink-0">{row.points} pts</span>
            </div>
            <div className="flex items-center gap-2.5 font-mono font-bold" style={{ fontSize: '9px', paddingLeft: 18 + 28 + 16 }}>
              <span style={{ color: ORANGE }}>Bnk {row.bankers_remaining}</span>
              <span style={{ color: BLUE }}>Team {row.team_points}</span>
              <span style={{ color: YELLOW }}>Plyr {row.player_points}</span>
            </div>
          </div>
        ))}
      </div>
    </TicketModal>
  )
}
