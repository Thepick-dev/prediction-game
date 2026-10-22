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

// Every logical field (team, player 1, player 2) gets its own full-width
// line within the card instead of sharing a narrow column with siblings —
// see the big comment on the component below for why this replaced the
// previous grid-of-columns design. A name can still run long, so FitName
// stays as a backstop, but with the whole card's width behind it instead
// of a ~30%-wide column slice, it essentially never needs to shrink for
// any name actually in use.
function PlayerLine({ name, points, goal, assist, showScoring, aonOutcome }: {
  name: string; points: number | null; goal: boolean; assist: boolean; showScoring: boolean; aonOutcome?: 'pending' | 'success' | 'failed'
}) {
  return (
    <div className="flex items-center min-w-0" style={{ gap: 4, flexWrap: 'wrap', rowGap: 2 }}>
      <FitName baseSize={13} minSize={10} className="uppercase font-bold" style={{ color: '#fff' }}>{name}</FitName>
      {goal && <span className="shrink-0 px-1 rounded font-black" style={{ fontSize: '9px', background: 'var(--pop-green)', color: 'var(--pop-black)' }}>G</span>}
      {assist && <span className="shrink-0 px-1 rounded font-black" style={{ fontSize: '9px', background: 'rgba(204,250,0,0.25)', color: 'var(--pop-green)' }}>A</span>}
      {aonOutcome && (
        <span
          className="shrink-0 inline-flex items-center justify-center rounded-full"
          style={{ width: 14, height: 14, background: AON_BG[aonOutcome] }}
          title={AON_TITLE[aonOutcome]}
        >
          {aonOutcome === 'success' ? <CheckIcon size={9} color={AON_FG[aonOutcome]} /> : aonOutcome === 'failed' ? <CrossIcon size={9} color={AON_FG[aonOutcome]} /> : <BoltIcon size={9} color={AON_FG[aonOutcome]} />}
        </span>
      )}
      {showScoring && <span className="shrink-0 font-mono" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>({points ?? 0})</span>}
    </div>
  )
}

// "Harvey Barnes" -> "HB" — initials of the nominated Bonus Card player
// (the same player for whoever plays it, never one the user picks
// themselves), for a compact tab next to Banker rather than the card's
// full name taking its own line under the points total.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0] ?? '').slice(0, 2).toUpperCase()
}

const INDENT = 38

// A stacked list of cards, one per player, not a spreadsheet of aligned
// columns. The grid-of-columns version that came before this went through
// several rounds of real fixes (fixed row heights, flex-1 measurement
// corrections, badge line-wrapping) and still kept finding new ways to
// clip something, because the underlying shape of the problem never
// changed: cramming team code + badges + player names + points into
// narrow fixed-percentage column slices means any one of them can be
// starved of room by its neighbours, on some device, in some combination
// of badges, no matter how carefully each individual slice gets tuned.
// Giving every field (team line, player 1 line, player 2 line) the full
// width of the card instead removes that competition for space entirely
// — there's no longer a "20%-wide team column" for a banker badge to
// crowd a team code out of, because there's no narrow column at all.
// "Uniform" comes from every card following the exact same structure
// (header line, then team/player lines indented under it) rather than
// from forcing identical pixel heights — a card's height now follows its
// own content, so nothing is ever clipped to make rows match.
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

  return (
    <div className="mb-4">
      <div ref={cardRef} className="pop-panel" style={{ overflow: 'hidden', padding: 16, background: 'var(--pop-black)' }}>
        <p className="font-black uppercase" style={{ fontSize: '13px', letterSpacing: '0.04em', color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
          {competitionName} — GW{gameweekNumber}
        </p>

        <p className="font-black uppercase mb-3" style={{ fontSize: '12px', letterSpacing: '0.04em', color: final ? 'var(--pop-green)' : live ? '#FA6100' : 'rgba(255,255,255,0.4)' }}>
          {final ? '✅ Final Result' : live ? '🔴 Live — scores updating' : '🔒 Picks locked in'}
        </p>

        <div className="flex flex-col">
          {rows.map((row, i) => {
            const rowBg = row.suspended ? 'rgba(250,0,60,0.08)' : row.isWinner ? 'rgba(255,210,63,0.08)' : (i % 2 === 1 ? 'rgba(255,255,255,0.02)' : undefined)
            return (
              <div
                key={row.userId}
                style={{
                  borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.08)' : undefined,
                  background: rowBg,
                  padding: '10px 4px',
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="shrink-0 font-black text-center" style={{ width: 18, fontSize: '13px', color: '#fff' }}>{i + 1}</span>
                  {row.isBot ? <BotAvatar size={28} /> : (
                    <span className="shrink-0">
                      <KitBadge pattern={row.kit?.pattern ?? 'solid'} colour1={row.kit?.colour1 ?? '#1E4D6B'} colour2={row.kit?.colour2 ?? '#F5ECD9'} colour3={row.kit?.colour3} size={28} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <FitName baseSize={16} minSize={12} className="pop-name" style={{ color: row.isOwnPick ? 'var(--pop-pink)' : '#fff' }}>
                      {row.name}
                    </FitName>
                    {row.isAutopick && <div className="normal-case font-bold" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>Autopick</div>}
                  </span>
                  <span className="shrink-0 font-black font-mono" style={{ fontSize: '21px', color: 'var(--pop-green)', fontVariantNumeric: 'tabular-nums' }}>
                    {row.suspended ? 0 : showScoring ? row.totalPoints ?? 0 : 'TBD'}
                  </span>
                </div>

                {row.suspended ? (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5" style={{ paddingLeft: INDENT, fontSize: '10px' }}>
                    <span className="px-1.5 py-0.5 rounded font-black uppercase shrink-0" style={{ fontSize: '9px', background: 'var(--pop-red)', color: '#fff' }}>Suspended</span>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{row.suspended.reason}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center flex-wrap mt-1.5" style={{ paddingLeft: INDENT, gap: 5, rowGap: 2 }}>
                      <TeamCrest teamId={row.teamId} teamName={row.team} size={15} />
                      <FitName baseSize={12} minSize={10} className="font-black uppercase" style={{ color: 'var(--pop-blue)' }}>{row.team}</FitName>
                      <span className="font-bold font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)' }}>
                        {row.opponentCode && `vs ${row.opponentCode} · `}{showScoring ? `${row.teamPoints ?? 0} pts` : 'Pending'}
                      </span>
                      {row.isBanker && <span className="shrink-0 px-1 rounded font-black" style={{ fontSize: '9px', background: 'var(--pop-orange)', color: '#fff' }}>★B</span>}
                      {row.bonusCard && (
                        <span
                          className="shrink-0 px-1 rounded font-black"
                          style={{ fontSize: '9px', background: 'var(--pop-blue)', color: 'var(--pop-black)' }}
                          title={bonusCardName}
                        >
                          {initials(row.bonusCard.playerName)}{showScoring && row.bonusCard.points != null ? `: ${row.bonusCard.points}` : ''}
                        </span>
                      )}
                    </div>
                    <div className="mt-1" style={{ paddingLeft: INDENT }}>
                      <PlayerLine name={row.player1Name} points={row.player1Points} goal={row.player1Goal} assist={row.player1Assist} showScoring={showScoring} aonOutcome={row.aon?.onPlayer1 ? row.aon.outcome : undefined} />
                    </div>
                    <div className="mt-1" style={{ paddingLeft: INDENT }}>
                      <PlayerLine name={row.player2Name} points={row.player2Points} goal={row.player2Goal} assist={row.player2Assist} showScoring={showScoring} aonOutcome={row.aon?.onPlayer2 ? row.aon.outcome : undefined} />
                    </div>
                  </>
                )}
              </div>
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
