'use client'

import React, { useRef, useState } from 'react'
import { shareElementAsImage } from '../lib/shareImage'
import KitBadge from '../../components/KitBadge'
import BotAvatar from '../../components/BotAvatar'
import TeamCrest from '../../components/TeamCrest'
import FitName from '../../components/FitName'
import { CheckIcon, CrossIcon, BoltIcon } from '../../components/icons'

export type GridRow = {
  userId: string
  name: string
  isBot: boolean
  kit: { pattern: string; colour1: string; colour2: string; colour3: string | null } | null
  isOwnPick: boolean
  isWinner: boolean
  isAutopick: boolean
  teamId: number
  team: string
  opponentCode: string | null
  isBanker: boolean
  teamPoints: number | null
  player1Name: string
  player1Points: number | null
  player1Goal: boolean
  player1Assist: boolean
  player2Name: string
  player2Points: number | null
  player2Goal: boolean
  player2Assist: boolean
  aon: { onPlayer1: boolean; onPlayer2: boolean; outcome: 'pending' | 'success' | 'failed' } | null
  bonusCard: { playerName: string; points: number | null } | null
  totalPoints: number | null
  suspended: { reason: string; suspensionNumber: number } | null
}

type Props = {
  competitionName: string
  gameweekNumber: number
  bonusCardName: string
  showScoring: boolean
  rows: GridRow[]
}

const AON_BG = { pending: 'var(--pop-pink)', success: 'var(--pop-green)', failed: 'var(--pop-red)' } as const
const AON_FG = { pending: '#fff', success: 'var(--pop-black)', failed: '#fff' } as const
const AON_TITLE = { pending: 'All or Nothing — played, result pending', success: 'All or Nothing — succeeded', failed: 'All or Nothing — failed' } as const

// A dedicated column for ONE player, not half of a shared column — the
// badges sit on their own line below the name rather than crowding onto
// it, so FitName never has to fight goal/assist/AoN icons for room on a
// long name, and the points value gets real colour-coded weight (matching
// how the Leaderboard treats its own numeric columns) instead of small
// grey parenthetical text.
function PlayerCell({ name, points, goal, assist, showScoring, aonOutcome }: {
  name: string; points: number | null; goal: boolean; assist: boolean; showScoring: boolean; aonOutcome?: 'pending' | 'success' | 'failed'
}) {
  return (
    // w-full — this is itself a flex ITEM of its parent grid cell (a row-
    // direction flex container used purely for vertical centering), and
    // flex items default to shrink-to-content width, not "fill the main
    // axis." Without this, the cell's real width never reaches the
    // FitName below, which is the exact same circular-measurement bug as
    // before, one level deeper.
    <div className="flex flex-col items-start min-w-0 w-full" style={{ gap: 2 }}>
      <span className="min-w-0 w-full">
        <FitName baseSize={13} minSize={8} className="uppercase font-black" style={{ color: '#fff' }}>{name}</FitName>
      </span>
      <div className="flex items-center" style={{ gap: 3, flexWrap: 'wrap', rowGap: 2 }}>
        {showScoring && (
          <span className="font-mono font-black" style={{ fontSize: '13px', color: 'var(--pop-yellow)', fontVariantNumeric: 'tabular-nums' }}>{points ?? 0}</span>
        )}
        {goal && <span className="shrink-0 px-1 rounded font-black" style={{ fontSize: '8px', background: 'var(--pop-green)', color: 'var(--pop-black)' }}>G</span>}
        {assist && <span className="shrink-0 px-1 rounded font-black" style={{ fontSize: '8px', background: 'rgba(204,250,0,0.25)', color: 'var(--pop-green)' }}>A</span>}
        {aonOutcome && (
          <span
            className="shrink-0 inline-flex items-center justify-center rounded-full"
            style={{ width: 12, height: 12, background: AON_BG[aonOutcome] }}
            title={AON_TITLE[aonOutcome]}
          >
            {aonOutcome === 'success' ? <CheckIcon size={8} color={AON_FG[aonOutcome]} /> : aonOutcome === 'failed' ? <CrossIcon size={8} color={AON_FG[aonOutcome]} /> : <BoltIcon size={8} color={AON_FG[aonOutcome]} />}
          </span>
        )}
      </div>
    </div>
  )
}

// "Harvey Barnes" -> "HB" — initials of the nominated Bonus Card player
// (the same player for whoever plays it, never one the user picks
// themselves), for a compact tab rather than the card's full name taking
// its own line.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0] ?? '').slice(0, 2).toUpperCase()
}

// A genuine aligned grid — # / Player / Team / P1 / P2 / Pts as real
// columns with one shared header, the same structural idea as the
// Leaderboard table, not a stack of free-form cards. The Leaderboard's
// own look is deliberately borrowed wherever it fits: the same KitBadge
// size and glowing FitName treatment for the player's own name, the same
// bold colour-coded font-mono numbers for every points value, the same
// big green total. What's different from the Leaderboard is purely that
// this row has more to show (a picked team plus two picked players, not
// just one running total) — Player 1 and Player 2 get their own full
// column each rather than being squeezed to share one, which is what
// gives each name and its points real room instead of fighting a
// neighbour for space.
export default function ResultsGrid({ competitionName, gameweekNumber, bonusCardName, showScoring, rows }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  const final = rows.some(r => r.isWinner)
  const live = !final && showScoring && rows.some(r => (r.totalPoints ?? 0) > 0)

  async function handleShare() {
    if (!cardRef.current) return
    setSharing(true)
    setShareError(null)
    try {
      await shareElementAsImage(cardRef.current, {
        filename: `${competitionName.replace(/\s+/g, '-').toLowerCase()}-gw${gameweekNumber}-results.png`,
        shareTitle: `${competitionName} — Gameweek ${gameweekNumber} Results`,
        whatsappText: `${competitionName} — Gameweek ${gameweekNumber} Results 🏆 (image saved — attach it here!)`,
        pixelRatio: 2,
      })
    } catch {
      setShareError('Could not generate the image — try again.')
    }
    setSharing(false)
  }

  // fr, not %  — percentage columns are computed against the full
  // container width with no regard for columnGap, so 6 columns summing to
  // 100% plus 5 non-zero gaps add up to MORE than the container's actual
  // width, and the panel's own overflow:hidden silently clipped the
  // right-most column as a result. fr units are specifically designed to
  // divide up the space that's left AFTER subtracting gaps, so the same
  // proportions (7:28:14:20:20:11) genuinely sum to the real available
  // width instead of exceeding it.
  const cols = '6fr 28fr 15fr 20fr 20fr 11fr'

  return (
    <div className="mb-4">
      <div ref={cardRef} className="pop-panel" style={{ overflow: 'hidden', padding: '16px 10px', background: 'var(--pop-black)' }}>
        <p className="font-black uppercase" style={{ fontSize: '13px', letterSpacing: '0.04em', color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
          {competitionName} — GW{gameweekNumber}
        </p>

        <p className="font-black uppercase mb-3" style={{ fontSize: '12px', letterSpacing: '0.04em', color: final ? 'var(--pop-green)' : live ? '#FA6100' : 'rgba(255,255,255,0.4)' }}>
          {final ? '✅ Final Result' : live ? '🔴 Live — scores updating' : '🔒 Picks locked in'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 4 }}>
          <div className="py-1.5 uppercase tracking-wider" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>#</div>
          <div className="py-1.5 uppercase tracking-wider" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>Player</div>
          <div className="py-1.5 uppercase tracking-wider" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>Team</div>
          <div className="py-1.5 uppercase tracking-wider" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>P1</div>
          <div className="py-1.5 uppercase tracking-wider" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>P2</div>
          <div className="py-1.5 text-right uppercase tracking-wider font-black" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>Pts</div>

          {rows.map((row, i) => {
            const rowBg = row.suspended ? 'rgba(250,0,60,0.08)' : row.isWinner ? 'rgba(255,210,63,0.08)' : (i % 2 === 1 ? 'rgba(255,255,255,0.02)' : undefined)
            const cellStyle: React.CSSProperties = {
              borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.06)' : undefined,
              background: rowBg,
              paddingTop: 10,
              paddingBottom: 10,
              minWidth: 0,
            }
            return (
              <React.Fragment key={row.userId}>
                <div style={{ ...cellStyle, display: 'flex', alignItems: 'center' }} className="font-black">
                  <span style={{ color: '#fff', fontSize: '14px' }}>{i + 1}</span>
                </div>

                <div style={{ ...cellStyle, display: 'flex', alignItems: 'center' }}>
                  {/* w-full — same fix as PlayerCell above: a flex item
                      inside the row-direction cell flex container above
                      doesn't fill its width by default. */}
                  <div className="flex items-center gap-1 min-w-0 w-full">
                    {row.isBot ? <BotAvatar size={24} /> : (
                      <span className="shrink-0">
                        <KitBadge pattern={row.kit?.pattern ?? 'solid'} colour1={row.kit?.colour1 ?? '#1E4D6B'} colour2={row.kit?.colour2 ?? '#F5ECD9'} colour3={row.kit?.colour3} size={24} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <FitName
                        baseSize={16} minSize={9} className="pop-name"
                        style={{
                          color: row.isOwnPick ? 'var(--pop-pink)' : '#fff',
                          textShadow: row.isOwnPick
                            ? '0 0 4px rgba(160,0,250,0.55), 0 0 12px rgba(160,0,250,0.3)'
                            : '0 0 4px rgba(0,174,239,0.5), 0 0 12px rgba(0,174,239,0.28)',
                        }}
                      >
                        {row.name}
                      </FitName>
                      {row.isAutopick && <div className="normal-case font-bold" style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)' }}>Autopick</div>}
                    </span>
                  </div>
                </div>

                {row.suspended ? (
                  <div style={{ ...cellStyle, gridColumn: 'span 3', display: 'flex', alignItems: 'center' }}>
                    <span className="px-1.5 py-0.5 rounded font-black uppercase mr-1.5 shrink-0" style={{ fontSize: '9px', background: 'var(--pop-red)', color: '#fff' }}>Suspended</span>
                    <span className="truncate" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{row.suspended.reason}</span>
                  </div>
                ) : (
                  <>
                    <div style={{ ...cellStyle, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div className="flex items-center min-w-0" style={{ gap: 2 }}>
                        <TeamCrest teamId={row.teamId} teamName={row.team} size={14} />
                        <span className="min-w-0 flex-1">
                          <FitName baseSize={13} minSize={8} className="font-black uppercase" style={{ color: 'var(--pop-blue)' }}>{row.team}</FitName>
                        </span>
                      </div>
                      <div className="flex items-center font-mono font-bold flex-wrap" style={{ gap: 3, fontSize: '10px', color: 'rgba(255,255,255,0.45)', rowGap: 2 }}>
                        <span>{showScoring ? `${row.teamPoints ?? 0}` : '—'}</span>
                        {row.isBanker && <span className="shrink-0 px-1 rounded font-black normal-case" style={{ fontSize: '8px', background: 'var(--pop-orange)', color: '#fff' }}>★B</span>}
                        {row.bonusCard && (
                          <span className="shrink-0 px-1 rounded font-black normal-case" style={{ fontSize: '8px', background: 'var(--pop-blue)', color: 'var(--pop-black)' }} title={bonusCardName}>
                            {initials(row.bonusCard.playerName)}{showScoring && row.bonusCard.points != null ? `:${row.bonusCard.points}` : ''}
                          </span>
                        )}
                      </div>
                      {row.opponentCode && (
                        <div className="normal-case font-bold" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>vs {row.opponentCode}</div>
                      )}
                    </div>

                    <div style={{ ...cellStyle, display: 'flex', alignItems: 'center' }}>
                      <PlayerCell name={row.player1Name} points={row.player1Points} goal={row.player1Goal} assist={row.player1Assist} showScoring={showScoring} aonOutcome={row.aon?.onPlayer1 ? row.aon.outcome : undefined} />
                    </div>

                    <div style={{ ...cellStyle, display: 'flex', alignItems: 'center' }}>
                      <PlayerCell name={row.player2Name} points={row.player2Points} goal={row.player2Goal} assist={row.player2Assist} showScoring={showScoring} aonOutcome={row.aon?.onPlayer2 ? row.aon.outcome : undefined} />
                    </div>
                  </>
                )}

                <div style={{ ...cellStyle, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <span className="font-black font-mono" style={{ fontSize: '21px', color: 'var(--pop-green)', fontVariantNumeric: 'tabular-nums' }}>
                    {row.suspended ? 0 : showScoring ? row.totalPoints ?? 0 : 'TBD'}
                  </span>
                </div>
              </React.Fragment>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
          <span><span className="px-1 rounded font-black" style={{ background: 'var(--pop-green)', color: 'var(--pop-black)' }}>G</span> Goal</span>
          <span><span className="px-1 rounded font-black" style={{ background: 'rgba(204,250,0,0.25)', color: 'var(--pop-green)' }}>A</span> Assist</span>
          <span><span className="px-1 rounded font-black" style={{ background: 'var(--pop-orange)', color: '#fff' }}>★B</span> Banker</span>
          <span><span className="px-1 rounded font-black" style={{ background: 'rgba(255,255,255,0.15)' }}>Autopick</span> deadline missed</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <button onClick={handleShare} disabled={sharing} className="pop-button px-3 py-1.5 text-xs disabled:opacity-60">
          {sharing ? 'Preparing...' : '📱 Share to WhatsApp'}
        </button>
        {shareError && <p style={{ fontSize: '11px', color: 'var(--pop-red)' }}>{shareError}</p>}
      </div>
    </div>
  )
}
