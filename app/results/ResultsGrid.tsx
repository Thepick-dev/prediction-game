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

// Two earlier versions both tried to fit # / Player / Team / P1 / P2 / Pts
// as SIX columns sharing one row. That's six distinct facts fighting for
// width on a 320px phone — the only way to keep every cell on one line
// (no wrapping, no truncating a real name like "Bruno Guimaraes") was to
// shrink everything until it read as a wall of tiny badges, which is
// exactly what "jumbled" meant. The fix isn't more styling, it's fewer
// columns at once: each entrant is now an IDENTITY line (#, player, team,
// total — four wide columns, real room) with a PICKS line directly under
// it (P1 | P2, each getting roughly half the row instead of a sixth of
// it). Both lines are still strictly single-line-per-cell internally —
// nothing here ever wraps onto a third line — so it's still the ordered,
// spreadsheet-like read that was asked for, just two aligned passes per
// row instead of one overcrowded one. Both lines share one background
// tint (zebra / own-pick / winner / suspended), so the pair always reads
// as one row, not two.
function StatBadge({ children, bg, fg, title }: { children: React.ReactNode; bg: string; fg: string; title: string }) {
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center rounded-full font-black"
      style={{ minWidth: 14, height: 14, padding: '0 3px', fontSize: '9px', background: bg, color: fg, lineHeight: 1 }}
      title={title}
    >
      {children}
    </span>
  )
}

// slot: picks which colour the leading bar gets — since P1 and P2 no
// longer sit under their own "P1"/"P2" column headers (there's only one
// header row, for the identity line above), this is what keeps each pick
// legible as "which of the two" without needing a second header row.
function PlayerCell({ slot, name, points, goal, assist, showScoring, aonOutcome }: {
  slot: 1 | 2; name: string; points: number | null; goal: boolean; assist: boolean; showScoring: boolean; aonOutcome?: 'pending' | 'success' | 'failed'
}) {
  return (
    <div className="flex items-center min-w-0 w-full" style={{ gap: 4 }}>
      {/* A slim coloured bar, not a "1"/"2" digit — same job (marks which
          pick this is) for roughly a third of the width, which is what let
          the name column reclaim enough room to stop clipping ordinary
          names like "Odegaard" at narrow widths. */}
      <span
        className="shrink-0 rounded-full"
        style={{ width: 3, height: 13, background: slot === 1 ? 'var(--pop-blue)' : 'var(--pop-pink)', opacity: 0.6 }}
        title={`Pick ${slot}`}
      />
      <span className="min-w-0 flex-1">
        <FitName baseSize={13} minSize={9} className="uppercase font-black" style={{ color: '#fff' }}>{name}</FitName>
      </span>
      {showScoring && (
        <span className="shrink-0 font-mono font-black" style={{ fontSize: '13px', color: 'var(--pop-yellow)', fontVariantNumeric: 'tabular-nums' }}>{points ?? 0}</span>
      )}
      {goal && <StatBadge bg="var(--pop-green)" fg="var(--pop-black)" title="Goal">G</StatBadge>}
      {assist && <StatBadge bg="rgba(204,250,0,0.25)" fg="var(--pop-green)" title="Assist">A</StatBadge>}
      {aonOutcome && (
        <span
          className="shrink-0 inline-flex items-center justify-center rounded-full"
          style={{ width: 13, height: 13, background: AON_BG[aonOutcome] }}
          title={AON_TITLE[aonOutcome]}
        >
          {aonOutcome === 'success' ? <CheckIcon size={8} color={AON_FG[aonOutcome]} /> : aonOutcome === 'failed' ? <CrossIcon size={8} color={AON_FG[aonOutcome]} /> : <BoltIcon size={8} color={AON_FG[aonOutcome]} />}
        </span>
      )}
    </div>
  )
}

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

  // Identity line: # / Player / Team / Pts — four columns, each with real
  // room now there's nothing else sharing the row. fr, not % (percentage
  // columns ignore columnGap, so N of them plus non-zero gaps add up to
  // MORE than the container's real width and silently clip against the
  // panel's own overflow:hidden).
  const identityCols = '7fr 44fr 24fr 15fr'

  return (
    <div className="mb-4">
      <div ref={cardRef} className="pop-panel" style={{ overflow: 'hidden', padding: '16px 10px' }}>
        <p className="font-black uppercase" style={{ fontSize: '13px', letterSpacing: '0.04em', color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
          {competitionName} — GW{gameweekNumber}
        </p>

        <p className="font-black uppercase mb-3" style={{ fontSize: '12px', letterSpacing: '0.04em', color: final ? 'var(--pop-green)' : live ? '#FA6100' : 'rgba(255,255,255,0.4)' }}>
          {final ? '✅ Final Result' : live ? '🔴 Live — scores updating' : '🔒 Picks locked in'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: identityCols, columnGap: 6 }}>
          <div className="py-2 uppercase tracking-wider" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>#</div>
          <div className="py-2 uppercase tracking-wider" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>Player</div>
          <div className="py-2 uppercase tracking-wider" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>Team</div>
          <div className="py-2 text-right uppercase tracking-wider font-black" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>Pts</div>
        </div>

        {rows.map((row, i) => {
          // No borders anywhere in a row block — zebra striping (plus the
          // suspended/winner/own-pick tints, same priority as before) is
          // the only separator now, which is the literal "spreadsheet, but
          // without lines" look that was asked for.
          const rowBg = row.suspended ? 'rgba(250,0,60,0.08)' : row.isWinner ? 'rgba(255,210,63,0.08)' : row.isOwnPick ? 'rgba(160,0,250,0.06)' : (i % 2 === 1 ? 'rgba(255,255,255,0.035)' : undefined)
          const opponentTitle = row.opponentCode ? `${row.team} vs ${row.opponentCode}` : row.team
          return (
            <div key={row.userId} style={{ background: rowBg, paddingTop: 10, paddingBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: identityCols, columnGap: 6, alignItems: 'center' }}>
                <span className="font-black" style={{ color: '#fff', fontSize: '14px' }}>{i + 1}</span>

                <div className="flex items-center gap-1.5 min-w-0 w-full">
                  {row.isBot ? <BotAvatar size={24} /> : (
                    <span className="shrink-0">
                      <KitBadge pattern={row.kit?.pattern ?? 'solid'} colour1={row.kit?.colour1 ?? '#1E4D6B'} colour2={row.kit?.colour2 ?? '#F5ECD9'} colour3={row.kit?.colour3} size={24} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <FitName
                      baseSize={16} minSize={10} className="pop-name"
                      style={{
                        color: row.isOwnPick ? 'var(--pop-pink)' : '#fff',
                        textShadow: row.isOwnPick
                          ? '0 0 4px rgba(160,0,250,0.55), 0 0 12px rgba(160,0,250,0.3)'
                          : '0 0 4px rgba(0,174,239,0.5), 0 0 12px rgba(0,174,239,0.28)',
                      }}
                    >
                      {row.name}
                    </FitName>
                  </span>
                  {row.isAutopick && <StatBadge bg="rgba(255,255,255,0.15)" fg="rgba(255,255,255,0.7)" title="Autopick — deadline missed">A</StatBadge>}
                </div>

                <div className="flex items-center min-w-0" style={{ gap: 4 }} title={opponentTitle}>
                  <span className="shrink-0">
                    <TeamCrest teamId={row.teamId} teamName={row.team} size={18} />
                  </span>
                  <span className="shrink-0 font-mono font-black" style={{ fontSize: '14px', color: 'var(--pop-blue)', fontVariantNumeric: 'tabular-nums' }}>
                    {showScoring ? (row.teamPoints ?? 0) : '—'}
                  </span>
                  {row.isBanker && <StatBadge bg="var(--pop-orange)" fg="#fff" title="Banker — double points">★</StatBadge>}
                  {row.bonusCard && (
                    <StatBadge bg="var(--pop-blue)" fg="var(--pop-black)" title={`${bonusCardName} played${showScoring && row.bonusCard.points != null ? ` — ${row.bonusCard.points} pts` : ''}`}>
                      {showScoring && row.bonusCard.points != null ? row.bonusCard.points : '+'}
                    </StatBadge>
                  )}
                </div>

                <span className="font-black font-mono text-right" style={{ fontSize: '21px', color: 'var(--pop-green)', fontVariantNumeric: 'tabular-nums' }}>
                  {row.suspended ? 0 : showScoring ? row.totalPoints ?? 0 : 'TBD'}
                </span>
              </div>

              {/* Picks line — a small indent under "Player" above (past the
                  rank column) is enough to read as "this player's two
                  picks" without eating into the width the names need; the
                  coloured bar in PlayerCell does the rest of that job. */}
              {row.suspended ? (
                <div className="flex items-center" style={{ marginTop: 6, paddingLeft: 12 }}>
                  <span className="px-1.5 py-0.5 rounded font-black uppercase mr-1.5 shrink-0" style={{ fontSize: '9px', background: 'var(--pop-red)', color: '#fff' }}>Suspended</span>
                  <span className="truncate" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{row.suspended.reason}</span>
                </div>
              ) : (
                <div className="flex items-stretch" style={{ marginTop: 6, paddingLeft: 12, gap: 10 }}>
                  <div className="min-w-0" style={{ flex: '1 1 0%' }}>
                    <PlayerCell slot={1} name={row.player1Name} points={row.player1Points} goal={row.player1Goal} assist={row.player1Assist} showScoring={showScoring} aonOutcome={row.aon?.onPlayer1 ? row.aon.outcome : undefined} />
                  </div>
                  <div className="min-w-0" style={{ flex: '1 1 0%' }}>
                    <PlayerCell slot={2} name={row.player2Name} points={row.player2Points} goal={row.player2Goal} assist={row.player2Assist} showScoring={showScoring} aonOutcome={row.aon?.onPlayer2 ? row.aon.outcome : undefined} />
                  </div>
                </div>
              )}
            </div>
          )
        })}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
          <span className="inline-flex items-center gap-1"><StatBadge bg="var(--pop-green)" fg="var(--pop-black)" title="">G</StatBadge> Goal</span>
          <span className="inline-flex items-center gap-1"><StatBadge bg="rgba(204,250,0,0.25)" fg="var(--pop-green)" title="">A</StatBadge> Assist</span>
          <span className="inline-flex items-center gap-1"><StatBadge bg="var(--pop-orange)" fg="#fff" title="">★</StatBadge> Banker</span>
          <span className="inline-flex items-center gap-1"><StatBadge bg="var(--pop-blue)" fg="var(--pop-black)" title="">+</StatBadge> {bonusCardName}</span>
          <span className="inline-flex items-center gap-1"><StatBadge bg="rgba(255,255,255,0.15)" fg="rgba(255,255,255,0.7)" title="">A</StatBadge> Autopick</span>
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
