'use client'

import { useRef, useState } from 'react'
import { shareElementAsImage } from '../lib/shareImage'
import KitBadge from '../../components/KitBadge'
import BotAvatar from '../../components/BotAvatar'
import TeamCrest from '../../components/TeamCrest'
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
const AON_LABEL = { pending: 'AoN', success: 'AoN ✓', failed: 'AoN ✕' } as const

function playerLine(name: string, points: number | null, goal: boolean, assist: boolean, showScoring: boolean) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      <FitName baseSize={11} minSize={7} className="uppercase font-bold" style={{ color: '#fff' }}>{name}</FitName>
      {goal && <span className="shrink-0 px-1 rounded font-black" style={{ fontSize: '8px', background: 'var(--pop-green)', color: 'var(--pop-black)' }}>G</span>}
      {assist && <span className="shrink-0 px-1 rounded font-black" style={{ fontSize: '8px', background: 'rgba(204,250,0,0.25)', color: 'var(--pop-green)' }}>A</span>}
      {showScoring && <span className="shrink-0 font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>({points ?? 0})</span>}
    </div>
  )
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

  const winnerRow = rows.find(r => r.isWinner)
  const live = !winnerRow && showScoring && rows.some(r => (r.totalPoints ?? 0) > 0)

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

        {winnerRow ? (
          <div className="flex items-center gap-3 mb-4 rounded-2xl px-4 py-3 flex-wrap" style={{ background: 'linear-gradient(135deg, rgba(255,210,63,0.2), rgba(255,210,63,0.04))', border: '1px solid rgba(255,210,63,0.45)' }}>
            <span style={{ fontSize: '36px', lineHeight: 1 }}>🏆</span>
            <span className="shrink-0">
              {winnerRow.isBot ? <BotAvatar size={44} /> : (
                <KitBadge pattern={winnerRow.kit?.pattern ?? 'solid'} colour1={winnerRow.kit?.colour1 ?? '#1E4D6B'} colour2={winnerRow.kit?.colour2 ?? '#F5ECD9'} colour3={winnerRow.kit?.colour3} size={44} />
              )}
            </span>
            <div className="min-w-0">
              <p className="font-black uppercase" style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#FFD23F' }}>GW{gameweekNumber} Winner</p>
              <FitName baseSize={26} minSize={16} className="pop-name" style={{ color: '#fff', textShadow: '0 0 6px rgba(255,210,63,0.7), 0 0 20px rgba(255,210,63,0.4)' }}>
                {winnerRow.name}
              </FitName>
            </div>
            <div className="text-right" style={{ marginLeft: 'auto' }}>
              <p className="font-black font-mono" style={{ fontSize: '36px', lineHeight: 1, color: '#FFD23F', textShadow: '0 0 6px rgba(255,210,63,0.7), 0 0 20px rgba(255,210,63,0.4)' }}>{winnerRow.totalPoints}</p>
              <p className="font-black uppercase" style={{ fontSize: '9px', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)' }}>points</p>
            </div>
          </div>
        ) : (
          <p className="font-black uppercase mb-3" style={{ fontSize: '12px', letterSpacing: '0.04em', color: live ? '#FA6100' : 'rgba(255,255,255,0.4)' }}>
            {live ? '🔴 Live — scores updating' : '🔒 Picks locked in'}
          </p>
        )}

        <table className="w-full" style={{ fontSize: '12px', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
          <thead>
            <tr className="text-left" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
              <th className="py-1.5 pr-0.5 uppercase tracking-wider" style={{ width: '7%' }}>#</th>
              <th className="py-1.5 px-1 uppercase tracking-wider" style={{ width: '29%' }}>Player</th>
              <th className="py-1.5 px-1 uppercase tracking-wider" style={{ width: '27%' }}>Team</th>
              <th className="py-1.5 px-1 uppercase tracking-wider" style={{ width: '22%' }}>Players</th>
              <th className="py-1.5 pl-1 text-right uppercase tracking-wider font-black" style={{ width: '15%' }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.userId}
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: row.suspended ? 'rgba(250,0,60,0.08)' : row.isWinner ? 'rgba(255,210,63,0.08)' : (i % 2 === 1 ? 'rgba(255,255,255,0.02)' : undefined),
                }}
              >
                <td className="py-2 pr-0.5 font-black align-top" style={{ color: '#fff' }}>{i + 1}</td>
                <td className="py-2 px-1 align-top" style={{ maxWidth: 0 }}>
                  <div className="flex items-center gap-1.5">
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
                </td>
                {row.suspended ? (
                  <td colSpan={3} className="py-2 px-1 align-top" style={{ fontSize: '10px' }}>
                    <span className="px-1.5 py-0.5 rounded font-black uppercase mr-1.5" style={{ fontSize: '9px', background: 'var(--pop-red)', color: '#fff' }}>Suspended</span>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{row.suspended.reason}</span>
                  </td>
                ) : (
                  <>
                    <td className="py-2 px-1 align-top">
                      <div className="flex items-center gap-1">
                        <TeamCrest teamId={row.teamId} teamName={row.team} size={16} />
                        <span className="font-black uppercase truncate" style={{ color: 'var(--pop-blue)', fontSize: '11px' }}>{row.team}</span>
                        {row.isBanker && <span className="shrink-0 px-1 rounded font-black" style={{ fontSize: '8px', background: 'var(--pop-orange)', color: '#fff' }}>★B</span>}
                      </div>
                      <div className="normal-case font-bold font-mono" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)' }}>
                        {row.opponentCode && `vs ${row.opponentCode} · `}{showScoring ? `${row.teamPoints ?? 0} pts` : 'Pending'}
                      </div>
                    </td>
                    <td className="py-2 px-1 align-top">
                      {playerLine(row.player1Name, row.player1Points, row.player1Goal, row.player1Assist, showScoring)}
                      {playerLine(row.player2Name, row.player2Points, row.player2Goal, row.player2Assist, showScoring)}
                    </td>
                  </>
                )}
                <td className="py-2 pl-1 text-right align-top">
                  <span className="font-black font-mono" style={{ fontSize: '20px', color: 'var(--pop-green)', fontVariantNumeric: 'tabular-nums' }}>
                    {row.suspended ? 0 : showScoring ? row.totalPoints ?? 0 : 'TBD'}
                  </span>
                  {!row.suspended && row.aon && (row.aon.onPlayer1 || row.aon.onPlayer2) && (
                    <div className="font-black uppercase" style={{ fontSize: '8px', color: AON_BG[row.aon.outcome] }}>{AON_LABEL[row.aon.outcome]}</div>
                  )}
                  {!row.suspended && row.bonusCard && (
                    <div className="normal-case font-bold" style={{ fontSize: '8px', color: 'var(--pop-blue)' }}>
                      {bonusCardName}{showScoring && row.bonusCard.points != null && ` +${row.bonusCard.points}`}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

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
