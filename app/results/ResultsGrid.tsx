'use client'

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import KitBadge from '../../components/KitBadge'
import BotAvatar from '../../components/BotAvatar'
import TeamCrest from '../../components/TeamCrest'

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
  answer: string | null
  totalPoints: number | null
}

type Props = {
  competitionName: string
  gameweekNumber: number
  bonusCardName: string
  showScoring: boolean
  rows: GridRow[]
  questionText: string | null
  questionTally: { label: string; count: number }[]
}

const aonBg = { pending: '#A000FA', success: '#CCFA00', failed: '#FA003C' } as const
const aonLabel = { pending: 'AoN', success: 'AoN ✓', failed: 'AoN ✕' } as const

// A long name at a big fixed font would either force the whole column
// wider (pushing the row toward needing a scroll) or spill over its
// neighbour — this keeps every name on one line by trading size for
// length only when it's actually needed, so short names (most of them)
// stay at full, maximally-readable size.
function fitSize(text: string, base: number, min: number) {
  const len = text.length
  if (len <= 9) return base
  if (len <= 13) return Math.round(base * 0.84)
  if (len <= 17) return Math.round(base * 0.7)
  return Math.max(min, Math.round(base * 0.58))
}

export default function ResultsGrid({ competitionName, gameweekNumber, bonusCardName, showScoring, rows, questionText, questionTally }: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  async function handleShare() {
    if (!gridRef.current || !scrollRef.current) return
    setSharing(true)
    setShareError(null)

    // Same fix as the printable picks grid — html-to-image only captures
    // what's currently visible inside a scrolling container, so a wide
    // table gets silently cropped to screen width unless the container is
    // temporarily expanded to its full content width for the capture.
    const scrollEl = scrollRef.current
    const originalWidth = scrollEl.style.width
    const originalOverflow = scrollEl.style.overflow
    scrollEl.style.width = `${scrollEl.scrollWidth}px`
    scrollEl.style.overflow = 'visible'

    try {
      const node = gridRef.current
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: '#0A0A0A',
        width: node.scrollWidth,
        height: node.scrollHeight,
      })
      const filename = `${competitionName.replace(/\s+/g, '-').toLowerCase()}-gw${gameweekNumber}-results.png`

      const canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      if (canShareFiles) {
        const blob = await (await fetch(dataUrl)).blob()
        const file = new File([blob], filename, { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `${competitionName} — Gameweek ${gameweekNumber} Results` })
          return
        }
      }

      const link = document.createElement('a')
      link.href = dataUrl
      link.download = filename
      link.click()
      const text = encodeURIComponent(`${competitionName} — Gameweek ${gameweekNumber} Results 🏆 (image saved — attach it here!)`)
      window.open(`https://wa.me/?text=${text}`, '_blank')
    } catch {
      setShareError('Could not generate the image — try again.')
    } finally {
      scrollEl.style.width = originalWidth
      scrollEl.style.overflow = originalOverflow
      setSharing(false)
    }
  }

  return (
    <div className="mb-3">
      <div className="flex justify-end mb-2">
        <button
          onClick={handleShare}
          disabled={sharing}
          className="rounded px-3 py-1.5 text-xs font-bold disabled:opacity-50"
          style={{ backgroundColor: '#25D366', color: '#0b1a12' }}
        >
          {sharing ? 'Preparing...' : '📱 Share to WhatsApp'}
        </button>
      </div>
      {shareError && <p className="text-xs mb-2" style={{ color: '#FA003C' }}>{shareError}</p>}

      <div ref={gridRef} className="rounded-2xl p-4" style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-baseline gap-3 mb-3 flex-wrap">
          <p className="font-black uppercase" style={{ fontSize: '44px', color: '#CCFA00', fontFamily: 'var(--font-display), sans-serif', lineHeight: 1, textShadow: '0 0 8px rgba(204,250,0,0.5), 0 0 30px rgba(204,250,0,0.2)' }}>
            {competitionName} — GW{gameweekNumber}
          </p>
          <p className="font-black uppercase" style={{ fontSize: '16px', letterSpacing: '0.04em', color: 'rgba(255,255,255,0.5)' }}>
            {showScoring ? '🏆 Results' : 'Picks locked in'}
          </p>
        </div>

        {questionText && questionTally.length > 0 && (
          <div className="rounded-xl mb-3 px-4 py-2.5" style={{ background: 'rgba(160,0,250,0.14)', border: '1px solid rgba(160,0,250,0.45)' }}>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-black" style={{ fontSize: '16px', color: '#fff' }}>{questionText}</span>
              <div className="flex flex-wrap gap-2">
                {questionTally.map(t => (
                  <span key={t.label} className="px-2.5 py-1 rounded-lg font-black" style={{ fontSize: '14px', background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                    {t.label} <span style={{ color: '#CCFA00' }}>{t.count}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={scrollRef} className="overflow-x-auto">
          <table className="border-collapse" style={{ fontSize: '28px', minWidth: '1440px', width: '100%' }}>
            <thead>
              <tr>
                {['Player', 'Team', 'Result', 'Player 1', 'Player 2', 'Bonuses', 'Answer', 'Total'].map((h, i) => (
                  <th
                    key={h}
                    className="text-left whitespace-nowrap"
                    style={{
                      fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800,
                      color: 'rgba(255,255,255,0.45)', padding: '8px 14px',
                      borderBottom: '2px solid rgba(255,255,255,0.15)',
                      textAlign: i === 7 ? 'right' : 'left',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.userId}
                  style={{
                    background: row.isWinner ? 'linear-gradient(90deg, rgba(204,250,0,0.14), rgba(204,250,0,0.03))' : (i % 2 === 1 ? 'rgba(255,255,255,0.03)' : undefined),
                    boxShadow: row.isWinner ? 'inset 4px 0 0 #CCFA00' : undefined,
                  }}
                >
                  <td className="whitespace-nowrap" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex items-center gap-2 font-black uppercase" style={{ color: '#fff' }}>
                      <span className="shrink-0">
                        {row.isBot ? <BotAvatar size={36} /> : (
                          <KitBadge
                            pattern={row.kit?.pattern ?? 'solid'}
                            colour1={row.kit?.colour1 ?? '#1E4D6B'}
                            colour2={row.kit?.colour2 ?? '#F5ECD9'}
                            colour3={row.kit?.colour3}
                            size={36}
                          />
                        )}
                      </span>
                      <span style={{ fontSize: fitSize(row.name, 28, 16) }}>{row.name}</span>
                      {row.isWinner && <span className="px-2 py-0.5 rounded-lg shrink-0" style={{ fontSize: '12px', background: '#CCFA00', color: '#0A0A0A' }}>★ WIN</span>}
                      {row.isOwnPick && <span className="px-2 py-0.5 rounded-lg shrink-0" style={{ fontSize: '12px', background: '#A000FA', color: '#fff' }}>YOU</span>}
                      {row.isAutopick && <span className="px-2 py-0.5 rounded-lg shrink-0" style={{ fontSize: '12px', background: 'rgba(255,255,255,0.15)', color: '#fff' }} title="Autopicked">AP</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap font-black" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#00F2FA' }}>
                    <div className="flex items-center gap-2">
                      <TeamCrest teamId={row.teamId} teamName={row.team} size={34} />
                      <span>{row.team}{row.opponentCode && <span style={{ color: 'rgba(0,242,250,0.55)' }}> ({row.opponentCode})</span>}</span>
                      {row.isBanker && <span className="px-2 py-0.5 rounded-lg font-black" style={{ fontSize: '13px', background: '#7D37A5', color: '#fff' }}>★B</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap font-mono" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontSize: '20px' }}>
                    {showScoring ? `${row.teamPoints ?? 0}pt` : 'Pending'}
                  </td>
                  <td className="whitespace-nowrap uppercase" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}>
                    <span className="font-bold" style={{ fontSize: fitSize(row.player1Name, 28, 16) }}>{row.player1Name}</span>
                    {row.player1Goal && <span className="ml-2 px-1.5 rounded-lg font-black" style={{ fontSize: '13px', background: '#CCFA00', color: '#0A0A0A' }}>G</span>}
                    {row.player1Assist && <span className="ml-1 px-1.5 rounded-lg font-black" style={{ fontSize: '13px', background: 'rgba(204,250,0,0.25)', color: '#CCFA00' }}>A</span>}
                    {showScoring && <span className="ml-1.5 font-mono" style={{ fontSize: '20px', color: 'rgba(255,255,255,0.6)' }}>({row.player1Points ?? 0})</span>}
                    {row.aon?.onPlayer1 && (
                      <span className="ml-1.5 px-2 py-0.5 rounded-lg font-black" style={{ fontSize: '13px', background: aonBg[row.aon.outcome], color: row.aon.outcome === 'success' ? '#0A0A0A' : '#fff' }}>
                        {aonLabel[row.aon.outcome]}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap uppercase" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}>
                    <span className="font-bold" style={{ fontSize: fitSize(row.player2Name, 28, 16) }}>{row.player2Name}</span>
                    {row.player2Goal && <span className="ml-2 px-1.5 rounded-lg font-black" style={{ fontSize: '13px', background: '#CCFA00', color: '#0A0A0A' }}>G</span>}
                    {row.player2Assist && <span className="ml-1 px-1.5 rounded-lg font-black" style={{ fontSize: '13px', background: 'rgba(204,250,0,0.25)', color: '#CCFA00' }}>A</span>}
                    {showScoring && <span className="ml-1.5 font-mono" style={{ fontSize: '20px', color: 'rgba(255,255,255,0.6)' }}>({row.player2Points ?? 0})</span>}
                    {row.aon?.onPlayer2 && (
                      <span className="ml-1.5 px-2 py-0.5 rounded-lg font-black" style={{ fontSize: '13px', background: aonBg[row.aon.outcome], color: row.aon.outcome === 'success' ? '#0A0A0A' : '#fff' }}>
                        {aonLabel[row.aon.outcome]}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {row.bonusCard ? (
                      <span className="px-2 py-0.5 rounded-lg font-black" style={{ fontSize: '13px', background: '#00F2FA', color: '#0A0A0A' }}>
                        {bonusCardName}: {row.bonusCard.playerName}
                        {showScoring && row.bonusCard.points != null && ` +${row.bonusCard.points}`}
                      </span>
                    ) : (
                      <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '20px' }}>—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }}>
                    {row.answer ? <span style={{ fontSize: fitSize(row.answer, 22, 14) }}>{row.answer}</span> : <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '20px' }}>—</span>}
                  </td>
                  <td className="whitespace-nowrap text-right" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <span
                      className="inline-block font-mono font-black rounded-xl"
                      style={{
                        fontSize: '40px', color: showScoring ? '#0A0A0A' : 'rgba(255,255,255,0.4)',
                        background: showScoring ? '#CCFA00' : 'rgba(255,255,255,0.08)',
                        padding: showScoring ? '0 16px' : '0 12px', lineHeight: 1.5,
                      }}
                    >
                      {showScoring ? row.totalPoints ?? 0 : 'TBD'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-4 mt-3" style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>
          <span><span className="px-2 py-0.5 rounded-lg font-black" style={{ background: '#CCFA00', color: '#0A0A0A' }}>G</span> Goal</span>
          <span><span className="px-2 py-0.5 rounded-lg font-black" style={{ background: 'rgba(204,250,0,0.25)', color: '#CCFA00' }}>A</span> Assist</span>
          <span><span className="px-2 py-0.5 rounded-lg font-black" style={{ background: '#7D37A5', color: '#fff' }}>★B</span> Banker</span>
          <span><span className="px-2 py-0.5 rounded-lg font-black" style={{ background: aonBg.pending, color: '#fff' }}>AoN</span> pending</span>
          <span><span className="px-2 py-0.5 rounded-lg font-black" style={{ background: aonBg.success, color: '#0A0A0A' }}>AoN ✓</span> succeeded</span>
          <span><span className="px-2 py-0.5 rounded-lg font-black" style={{ background: aonBg.failed, color: '#fff' }}>AoN ✕</span> failed</span>
          <span><span className="px-2 py-0.5 rounded-lg font-black" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>AP</span> Autopick</span>
        </div>
      </div>
    </div>
  )
}
