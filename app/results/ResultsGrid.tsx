'use client'

import React, { useRef, useState } from 'react'
import { shareElementAsImage } from '../lib/shareImage'
import KitBadge from '../../components/KitBadge'
import BotAvatar from '../../components/BotAvatar'
import FitName from '../../components/FitName'

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
  player1Fixture: { team: string; opponent: string } | null
  player2Name: string
  player2Points: number | null
  player2Goal: boolean
  player2Assist: boolean
  player2Fixture: { team: string; opponent: string } | null
  aon: { onPlayer1: boolean; onPlayer2: boolean; outcome: 'pending' | 'success' | 'failed' } | null
  bonusCard: { playerName: string; points: number | null } | null
  totalPoints: number | null
  // Season-to-date total THROUGH this gameweek (not today's live total —
  // viewing an old gameweek shows the standings as they stood then). This
  // is what the big number on the right shows now; totalPoints (this
  // gameweek alone) moved to its own "This Week" row instead — see the
  // main component's own comment for why.
  cumulativeTotal: number
  suspended: { reason: string; suspensionNumber: number } | null
}

type Props = {
  competitionName: string
  gameweekNumber: number
  bonusCardName: string
  showScoring: boolean
  rows: GridRow[]
}

// success/failed/"not yet known" -> green/red/grey — the pill always just
// reads "AON" (not the outcome in words), the colour alone carries the
// status, sitting right after whichever player's name actually has it
// on, not off in its own column.
const AON_PILL = {
  success: { bg: 'var(--pop-green)', fg: 'var(--pop-black)' },
  failed: { bg: 'var(--pop-red)', fg: '#fff' },
  pending: { bg: 'rgba(255,255,255,0.18)', fg: 'rgba(255,255,255,0.75)' },
} as const

function AonPill({ outcome }: { outcome?: 'pending' | 'success' | 'failed' }) {
  if (!outcome) return null
  const { bg, fg } = AON_PILL[outcome]
  return (
    <span
      className="shrink-0 rounded-full font-black uppercase"
      style={{ fontSize: '7px', padding: '1px 5px', background: bg, color: fg, letterSpacing: '0.03em' }}
      title={`All or Nothing — ${outcome === 'pending' ? 'played, result not known yet' : outcome}`}
    >
      AON
    </span>
  )
}

// Appended after a player's name — their own team's fixture this
// gameweek, abbreviated, with their own team kept at full brightness and
// the opponent dimmed, so it's clear at a glance which side of the "vs"
// is actually theirs. A player isn't necessarily on the picked team, so
// this is genuinely new information, not a repeat of the team row above it.
function PlayerFixture({ team, opponent }: { team: string; opponent: string }) {
  return (
    <span style={{ fontWeight: 900 }}>
      {' ('}{team}
      <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{' vs '}{opponent}{')'}</span>
    </span>
  )
}

// One label:points row of the 4-row list. "—" rather than 0 whenever
// there's genuinely nothing to show yet (scoring not live, or — for the
// Bonus Card row specifically — simply not played that week), so a real
// 0 (a team that lost, a player who didn't score) stays visually
// distinct from "nothing happened here at all."
function StatRow({ label, value, color, pill, bold }: {
  label: React.ReactNode; value: number | null; color: string; pill?: React.ReactNode; bold?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2" style={{ lineHeight: 1.1 }}>
      <span className="min-w-0 flex-1 flex items-center gap-1.5">
        <FitName
          baseSize={10} minSize={8} className="uppercase font-bold"
          style={{ color: bold ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.7)', letterSpacing: bold ? '0.03em' : undefined }}
        >
          {label}
        </FitName>
        {pill}
      </span>
      <span className="shrink-0 font-mono font-black" style={{ fontSize: '11px', color, fontVariantNumeric: 'tabular-nums' }}>
        {value ?? '—'}
      </span>
    </div>
  )
}

// One card per entrant — a big shirt + name (the headline, same
// treatment the Leaderboard gives its own name column), then exactly
// the 4 facts that make up this gameweek's score as a plain
// label-then-points list, PLUS a 5th "This Week" row summing them —
// with the season-to-date grand total standing on its own, big, on the
// right. Same two-tier shape as the Picks page's own live gameweek card
// (LiveGameweekTable.tsx) — "what happened this week" on the left,
// "where that leaves you overall" on the right — so the two pages read
// as one system rather than two different ones that happen to share a
// colour scheme. No crests, no G/A badges — everything on screen here
// was asked for explicitly, nothing extra layered on top of it.
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
      <div ref={cardRef} className="pop-panel" style={{ overflow: 'hidden', padding: '10px 8px' }}>
        <p className="font-black uppercase" style={{ fontSize: '12px', letterSpacing: '0.04em', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
          {competitionName} — GW{gameweekNumber}
        </p>

        <p className="font-black uppercase mb-2" style={{ fontSize: '11px', letterSpacing: '0.04em', color: final ? 'var(--pop-green)' : live ? '#FA6100' : 'rgba(255,255,255,0.4)' }}>
          {final ? '✅ Final Result' : live ? '🔴 Live — scores updating' : '🔒 Picks locked in'}
        </p>

        {rows.map((row, i) => {
          const rowBg = row.suspended ? 'rgba(250,0,60,0.08)' : row.isWinner ? 'rgba(255,210,63,0.08)' : row.isOwnPick ? 'rgba(160,0,250,0.06)' : (i % 2 === 1 ? 'rgba(255,255,255,0.035)' : undefined)
          return (
            <div key={row.userId} style={{ background: rowBg, padding: '5px 8px', borderRadius: 9 }}>
              {/* Header — shirt + name, both big and striking; rank kept
                  small since it's useful but isn't what this ask wanted
                  leading the card. */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="shrink-0 font-black" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>{i + 1}</span>
                {row.isBot ? <BotAvatar size={26} /> : (
                  <span className="shrink-0">
                    <KitBadge pattern={row.kit?.pattern ?? 'solid'} colour1={row.kit?.colour1 ?? '#1E4D6B'} colour2={row.kit?.colour2 ?? '#F5ECD9'} colour3={row.kit?.colour3} size={26} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <FitName
                    baseSize={16} minSize={11} className="pop-name"
                    style={{
                      color: row.isOwnPick ? 'var(--pop-pink)' : '#fff',
                      textShadow: row.isOwnPick
                        ? '0 0 4px rgba(160,0,250,0.55), 0 0 12px rgba(160,0,250,0.3)'
                        : '0 0 4px rgba(0,174,239,0.5), 0 0 12px rgba(0,174,239,0.28)',
                    }}
                  >
                    {row.name}
                  </FitName>
                  {row.isAutopick && <div className="normal-case font-bold" style={{ fontSize: '7px', color: 'rgba(255,255,255,0.4)' }}>Autopick — deadline missed</div>}
                </span>
                {row.isBanker && (
                  <span
                    className="shrink-0 inline-flex items-center justify-center rounded-full font-black"
                    style={{ width: 18, height: 18, fontSize: '9px', background: 'var(--pop-orange)', color: '#fff' }}
                    title="Banker — double points this week"
                  >
                    ★
                  </span>
                )}
              </div>

              {row.suspended ? (
                <div className="flex items-center flex-wrap gap-1.5">
                  <span className="px-1.5 py-0.5 rounded font-black uppercase shrink-0" style={{ fontSize: '9px', background: 'var(--pop-red)', color: '#fff' }}>Suspended</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{row.suspended.reason}</span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  {/* The 5 rows, left side */}
                  <div className="min-w-0 flex-1" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <StatRow
                      label={<>{row.team}{row.opponentCode && <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{' (vs '}{row.opponentCode}{')'}</span>}</>}
                      value={showScoring ? row.teamPoints ?? 0 : null}
                      color="var(--pop-blue)"
                    />
                    <StatRow
                      label={<>{row.player1Name}{row.player1Fixture && <PlayerFixture team={row.player1Fixture.team} opponent={row.player1Fixture.opponent} />}</>}
                      value={showScoring ? row.player1Points ?? 0 : null}
                      color="var(--pop-yellow)"
                      pill={<AonPill outcome={row.aon?.onPlayer1 ? row.aon.outcome : undefined} />}
                    />
                    <StatRow
                      label={<>{row.player2Name}{row.player2Fixture && <PlayerFixture team={row.player2Fixture.team} opponent={row.player2Fixture.opponent} />}</>}
                      value={showScoring ? row.player2Points ?? 0 : null}
                      color="var(--pop-yellow)"
                      pill={<AonPill outcome={row.aon?.onPlayer2 ? row.aon.outcome : undefined} />}
                    />
                    <StatRow
                      label={bonusCardName}
                      value={row.bonusCard ? (showScoring ? row.bonusCard.points ?? 0 : null) : null}
                      color="var(--pop-yellow)"
                    />
                    <div style={{ marginTop: 1, paddingTop: 1, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <StatRow
                        label="This Week"
                        value={showScoring ? row.totalPoints ?? 0 : null}
                        color="rgba(255,255,255,0.6)"
                        bold
                      />
                    </div>
                  </div>

                  {/* Season total, right side, big */}
                  <div className="shrink-0 flex items-center">
                    <span className="font-black font-mono" style={{ fontSize: '24px', color: 'var(--pop-green)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                      {row.cumulativeTotal}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex items-center justify-center rounded-full font-black" style={{ width: 12, height: 12, fontSize: '8px', background: 'var(--pop-orange)', color: '#fff' }}>★</span>
            Banker
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="rounded-full font-black uppercase" style={{ fontSize: '7px', padding: '2px 5px', background: 'var(--pop-green)', color: 'var(--pop-black)' }}>AON</span>
            <span className="rounded-full font-black uppercase" style={{ fontSize: '7px', padding: '2px 5px', background: 'var(--pop-red)', color: '#fff' }}>AON</span>
            <span className="rounded-full font-black uppercase" style={{ fontSize: '7px', padding: '2px 5px', background: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.75)' }}>AON</span>
            All or Nothing — green/grey/red = succeeded/pending/failed
          </span>
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
