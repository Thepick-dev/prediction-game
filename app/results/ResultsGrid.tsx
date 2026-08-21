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

      <div ref={gridRef} className="rounded-2xl p-7" style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="font-black uppercase" style={{ fontSize: '52px', color: '#CCFA00', fontFamily: 'var(--font-display), sans-serif', lineHeight: 1, textShadow: '0 0 8px rgba(204,250,0,0.5), 0 0 34px rgba(204,250,0,0.22)' }}>
          {competitionName} — Gameweek {gameweekNumber}
        </p>
        <p className="mb-6 font-black uppercase" style={{ fontSize: '19px', letterSpacing: '0.04em', color: 'rgba(255,255,255,0.55)' }}>
          {showScoring ? '🏆 Results' : 'Picks are locked in'}
        </p>

        {questionText && questionTally.length > 0 && (
          <div className="rounded-2xl mb-6 px-6 py-5" style={{ background: 'linear-gradient(135deg, rgba(160,0,250,0.28), rgba(160,0,250,0.1))', border: '2px solid rgba(160,0,250,0.6)' }}>
            <p className="font-black mb-3" style={{ fontSize: '23px', color: '#fff' }}>{questionText}</p>
            <div className="flex flex-wrap gap-3">
              {questionTally.map(t => (
                <span key={t.label} className="px-4 py-2 rounded-xl font-black" style={{ fontSize: '19px', background: 'rgba(255,255,255,0.12)', color: '#fff' }}>
                  {t.label}: <span style={{ color: '#CCFA00' }}>{t.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div ref={scrollRef} className="overflow-x-auto">
          <table className="border-collapse" style={{ fontSize: '22px', minWidth: '1420px', width: '100%' }}>
            <thead>
              <tr>
                {['Player', 'Team', 'Result', 'Player 1', 'Player 2', 'Bonuses', 'Answer', 'Total'].map((h, i) => (
                  <th
                    key={h}
                    className="text-left whitespace-nowrap"
                    style={{
                      fontSize: '17px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800,
                      color: 'rgba(255,255,255,0.5)', padding: '14px 18px',
                      borderBottom: '3px solid rgba(255,255,255,0.18)',
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
                  <td className="whitespace-nowrap" style={{ padding: '18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex items-center gap-3 font-black uppercase" style={{ color: '#fff' }}>
                      <span className="shrink-0">
                        {row.isBot ? <BotAvatar size={40} /> : (
                          <KitBadge
                            pattern={row.kit?.pattern ?? 'solid'}
                            colour1={row.kit?.colour1 ?? '#1E4D6B'}
                            colour2={row.kit?.colour2 ?? '#F5ECD9'}
                            colour3={row.kit?.colour3}
                            size={40}
                          />
                        )}
                      </span>
                      <span>{row.name}</span>
                      {row.isWinner && <span className="px-2.5 py-1 rounded-lg" style={{ fontSize: '14px', background: '#CCFA00', color: '#0A0A0A' }}>★ WINNER</span>}
                      {row.isOwnPick && <span className="px-2.5 py-1 rounded-lg" style={{ fontSize: '14px', background: '#A000FA', color: '#fff' }}>YOU</span>}
                      {row.isAutopick && <span className="px-2.5 py-1 rounded-lg" style={{ fontSize: '14px', background: 'rgba(255,255,255,0.15)', color: '#fff' }} title="Autopicked">AP</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap font-black" style={{ padding: '18px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#00F2FA' }}>
                    <div className="flex items-center gap-2.5">
                      <TeamCrest teamId={row.teamId} teamName={row.team} size={38} />
                      <span>{row.team}</span>
                      {row.isBanker && <span className="px-2.5 py-1 rounded-lg font-black" style={{ fontSize: '14px', background: '#7D37A5', color: '#fff' }}>★B</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap font-mono" style={{ padding: '18px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontSize: '18px' }}>
                    {showScoring ? `${row.teamPoints ?? 0} pts` : 'Pending'}
                  </td>
                  <td className="whitespace-nowrap" style={{ padding: '18px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}>
                    {row.player1Name}
                    {row.player1Goal && <span className="ml-2 px-2 rounded-lg font-black" style={{ fontSize: '14px', background: '#CCFA00', color: '#0A0A0A' }}>G</span>}
                    {row.player1Assist && <span className="ml-1.5 px-2 rounded-lg font-black" style={{ fontSize: '14px', background: 'rgba(204,250,0,0.25)', color: '#CCFA00' }}>A</span>}
                    {showScoring && <span className="ml-2 font-mono" style={{ fontSize: '18px', color: 'rgba(255,255,255,0.6)' }}>({row.player1Points ?? 0})</span>}
                    {row.aon?.onPlayer1 && (
                      <span className="ml-2 px-2.5 py-1 rounded-lg font-black" style={{ fontSize: '14px', background: aonBg[row.aon.outcome], color: row.aon.outcome === 'success' ? '#0A0A0A' : '#fff' }}>
                        {aonLabel[row.aon.outcome]}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap" style={{ padding: '18px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}>
                    {row.player2Name}
                    {row.player2Goal && <span className="ml-2 px-2 rounded-lg font-black" style={{ fontSize: '14px', background: '#CCFA00', color: '#0A0A0A' }}>G</span>}
                    {row.player2Assist && <span className="ml-1.5 px-2 rounded-lg font-black" style={{ fontSize: '14px', background: 'rgba(204,250,0,0.25)', color: '#CCFA00' }}>A</span>}
                    {showScoring && <span className="ml-2 font-mono" style={{ fontSize: '18px', color: 'rgba(255,255,255,0.6)' }}>({row.player2Points ?? 0})</span>}
                    {row.aon?.onPlayer2 && (
                      <span className="ml-2 px-2.5 py-1 rounded-lg font-black" style={{ fontSize: '14px', background: aonBg[row.aon.outcome], color: row.aon.outcome === 'success' ? '#0A0A0A' : '#fff' }}>
                        {aonLabel[row.aon.outcome]}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap" style={{ padding: '18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {row.bonusCard ? (
                      <span className="px-2.5 py-1 rounded-lg font-black" style={{ fontSize: '14px', background: '#00F2FA', color: '#0A0A0A' }}>
                        {bonusCardName}: {row.bonusCard.playerName}
                        {showScoring && row.bonusCard.points != null && ` +${row.bonusCard.points}`}
                      </span>
                    ) : (
                      <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap" style={{ padding: '18px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', fontSize: '19px' }}>
                    {row.answer ?? <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>}
                  </td>
                  <td className="whitespace-nowrap text-right" style={{ padding: '18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <span
                      className="inline-block font-mono font-black rounded-xl"
                      style={{
                        fontSize: '38px', color: showScoring ? '#0A0A0A' : 'rgba(255,255,255,0.4)',
                        background: showScoring ? '#CCFA00' : 'rgba(255,255,255,0.08)',
                        padding: showScoring ? '2px 16px' : '2px 12px',
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

        <div className="flex flex-wrap gap-5 mt-6" style={{ fontSize: '16px', color: 'rgba(255,255,255,0.55)' }}>
          <span><span className="px-2.5 py-1 rounded-lg font-black" style={{ background: '#CCFA00', color: '#0A0A0A' }}>G</span> Goal</span>
          <span><span className="px-2.5 py-1 rounded-lg font-black" style={{ background: 'rgba(204,250,0,0.25)', color: '#CCFA00' }}>A</span> Assist</span>
          <span><span className="px-2.5 py-1 rounded-lg font-black" style={{ background: '#7D37A5', color: '#fff' }}>★B</span> Banker</span>
          <span><span className="px-2.5 py-1 rounded-lg font-black" style={{ background: aonBg.pending, color: '#fff' }}>AoN</span> All or Nothing, pending</span>
          <span><span className="px-2.5 py-1 rounded-lg font-black" style={{ background: aonBg.success, color: '#0A0A0A' }}>AoN ✓</span> succeeded</span>
          <span><span className="px-2.5 py-1 rounded-lg font-black" style={{ background: aonBg.failed, color: '#fff' }}>AoN ✕</span> failed</span>
          <span><span className="px-2.5 py-1 rounded-lg font-black" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>AP</span> Autopick</span>
        </div>
      </div>
    </div>
  )
}
