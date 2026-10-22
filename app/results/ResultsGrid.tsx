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

function playerLine(name: string, points: number | null, goal: boolean, assist: boolean, showScoring: boolean, aonOutcome?: 'pending' | 'success' | 'failed') {
  return (
    // flexWrap, not nowrap — when a long name plus every badge (goal,
    // assist, All-or-Nothing, points) can't all fit on one line even with
    // the name shrunk to its floor, the badges wrap to a second line
    // instead of clipping off the cell's right edge. FitName already
    // excludes wrapped-away siblings from its own width budget (it
    // detects "same line" by vertical overlap), so a wrapped badge row
    // lets the name render at full size rather than needlessly shrinking
    // to make room for content that's no longer sharing its line anyway.
    <div className="flex items-center min-w-0" style={{ gap: 2, flexWrap: 'wrap', rowGap: 1 }}>
      <FitName baseSize={11} minSize={7} className="uppercase font-bold" style={{ color: '#fff' }}>{name}</FitName>
      {goal && <span className="shrink-0 px-1 rounded font-black" style={{ fontSize: '8px', background: 'var(--pop-green)', color: 'var(--pop-black)' }}>G</span>}
      {assist && <span className="shrink-0 px-1 rounded font-black" style={{ fontSize: '8px', background: 'rgba(204,250,0,0.25)', color: 'var(--pop-green)' }}>A</span>}
      {/* A compact icon dot, not the old "AoN ✓" text badge — same info
          (colour + symbol + a title for the full wording on hover/tap),
          a third the width, sitting directly on whichever player it's
          actually on rather than a generic line under the row's total
          with no way to tell which of the two picks it applied to. */}
      {aonOutcome && (
        <span
          className="shrink-0 inline-flex items-center justify-center rounded-full"
          style={{ width: 12, height: 12, background: AON_BG[aonOutcome] }}
          title={AON_TITLE[aonOutcome]}
        >
          {aonOutcome === 'success' ? <CheckIcon size={8} color={AON_FG[aonOutcome]} /> : aonOutcome === 'failed' ? <CrossIcon size={8} color={AON_FG[aonOutcome]} /> : <BoltIcon size={8} color={AON_FG[aonOutcome]} />}
        </span>
      )}
      {showScoring && <span className="shrink-0 font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>({points ?? 0})</span>}
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

// Same visual language as the Leaderboard table (big glowing names, real
// narrow columns, FitName auto-shrink, no cramped spreadsheet feel) rather
// than a different, denser design that only shared some colours with it.
// Naturally responsive at any width — the old version rendered at a fixed
// 1440px canvas and shrank the whole thing to fit via a CSS transform,
// which is exactly why small text on it stopped being legible long before
// a WhatsApp thumbnail did. This is also now the single source for both
// the on-page table and the shared image: no question/poll content lives
// in here (that stays on the page, outside what gets captured) and there's
// no separate "ticket" version to drift out of sync with this one.
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

        {/* A real CSS grid, not an HTML table — table rows only ever treat
            `height` as a minimum and will still grow to fit whatever the
            tallest cell's content needs, which is exactly the "some rows
            bigger than others" behaviour this replaces. Grid rows at a
            fixed track size, paired with overflow: hidden on every cell,
            genuinely cap each row — content that would overflow clips
            instead of growing the row, so every row really is the same
            size no matter what it holds. */}
        <div style={{ display: 'grid', gridTemplateColumns: '7% 26% 20% 32% 15%', gridAutoRows: '70px', fontSize: '12px' }}>
          <div className="py-1.5 pr-0.5 uppercase tracking-wider" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>#</div>
          <div className="py-1.5 px-1 uppercase tracking-wider" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>Player</div>
          <div className="py-1.5 px-1 uppercase tracking-wider" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>Team</div>
          <div className="py-1.5 px-1 uppercase tracking-wider" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>Players</div>
          <div className="py-1.5 pl-1 text-right uppercase tracking-wider font-black" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>Pts</div>

          {rows.map((row, i) => {
            const rowBg = row.suspended ? 'rgba(250,0,60,0.08)' : row.isWinner ? 'rgba(255,210,63,0.08)' : (i % 2 === 1 ? 'rgba(255,255,255,0.02)' : undefined)
            const cellStyle: React.CSSProperties = { borderBottom: '1px solid rgba(255,255,255,0.06)', background: rowBg, overflow: 'hidden', display: 'flex', alignItems: 'center' }
            return (
              <React.Fragment key={row.userId}>
                <div className="py-2 pr-0.5 font-black" style={{ ...cellStyle, color: '#fff' }}>{i + 1}</div>
                <div className="py-2 px-1" style={{ ...cellStyle, minWidth: 0 }}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    {row.isBot ? <BotAvatar size={30} /> : (
                      <span className="shrink-0">
                        <KitBadge pattern={row.kit?.pattern ?? 'solid'} colour1={row.kit?.colour1 ?? '#1E4D6B'} colour2={row.kit?.colour2 ?? '#F5ECD9'} colour3={row.kit?.colour3} size={30} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <FitName baseSize={17} minSize={11} className="pop-name" style={{ color: row.isOwnPick ? 'var(--pop-pink)' : '#fff' }}>
                        {row.name}
                      </FitName>
                      {row.isAutopick && <div className="normal-case font-bold" style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)' }}>Autopick</div>}
                    </span>
                  </div>
                </div>
                {row.suspended ? (
                  <div className="py-2 px-1" style={{ ...cellStyle, gridColumn: 'span 2', fontSize: '10px' }}>
                    <span className="px-1.5 py-0.5 rounded font-black uppercase mr-1.5 shrink-0" style={{ fontSize: '9px', background: 'var(--pop-red)', color: '#fff' }}>Suspended</span>
                    <span className="truncate" style={{ color: 'rgba(255,255,255,0.6)' }}>{row.suspended.reason}</span>
                  </div>
                ) : (
                  <>
                    <div className="py-2 px-1" style={{ ...cellStyle, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', minWidth: 0 }}>
                      {/* The team code is the headline info for this cell —
                          nothing else shares this line's width budget, so
                          it never has to fight a banker badge or the bonus
                          card tab for room (that fight is exactly what was
                          flooring a 3-letter code like "BOU" to a single
                          clipped character). Badges move to the line below,
                          where only the already-truncating opponent text
                          yields room to them. */}
                      <div className="flex items-center gap-1 min-w-0">
                        <TeamCrest teamId={row.teamId} teamName={row.team} size={16} />
                        <span className="min-w-0 shrink">
                          <FitName baseSize={11} minSize={8} className="font-black uppercase" style={{ color: 'var(--pop-blue)' }}>{row.team}</FitName>
                        </span>
                      </div>
                      <div className="flex items-center gap-1 min-w-0" style={{ fontSize: '9px', flexWrap: 'wrap', rowGap: 1 }}>
                        <span className="normal-case font-bold font-mono truncate min-w-0" style={{ color: 'rgba(255,255,255,0.45)' }}>
                          {row.opponentCode && `vs ${row.opponentCode} · `}{showScoring ? `${row.teamPoints ?? 0} pts` : 'Pending'}
                        </span>
                        {row.isBanker && <span className="shrink-0 px-1 rounded font-black" style={{ fontSize: '8px', background: 'var(--pop-orange)', color: '#fff' }}>★B</span>}
                        {/* Compact initials+points tab, same treatment as
                            Banker, instead of the card's full name taking
                            its own line under the points total. */}
                        {row.bonusCard && (
                          <span
                            className="shrink-0 px-1 rounded font-black"
                            style={{ fontSize: '8px', background: 'var(--pop-blue)', color: 'var(--pop-black)' }}
                            title={bonusCardName}
                          >
                            {initials(row.bonusCard.playerName)}{showScoring && row.bonusCard.points != null ? `: ${row.bonusCard.points}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="py-2 px-1" style={{ ...cellStyle, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', minWidth: 0 }}>
                      {playerLine(row.player1Name, row.player1Points, row.player1Goal, row.player1Assist, showScoring, row.aon?.onPlayer1 ? row.aon.outcome : undefined)}
                      {playerLine(row.player2Name, row.player2Points, row.player2Goal, row.player2Assist, showScoring, row.aon?.onPlayer2 ? row.aon.outcome : undefined)}
                    </div>
                  </>
                )}
                <div className="py-2 pl-1 text-right" style={{ ...cellStyle, justifyContent: 'flex-end' }}>
                  <span className="font-black font-mono" style={{ fontSize: '20px', color: 'var(--pop-green)', fontVariantNumeric: 'tabular-nums' }}>
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
