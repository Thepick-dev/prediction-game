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

      <div ref={gridRef} className="rounded-lg p-6" style={{ background: '#0A0A0A' }}>
        <p className="font-black uppercase" style={{ fontSize: '36px', color: '#CCFA00', fontFamily: 'var(--font-display), sans-serif', lineHeight: 1.05 }}>
          {competitionName} — Gameweek {gameweekNumber}
        </p>
        <p className="mb-5" style={{ fontSize: '16px', fontWeight: 700, color: 'rgba(255,255,255,0.45)' }}>
          {showScoring ? 'Results' : 'Picks — not yet scored'}
        </p>

        {questionText && questionTally.length > 0 && (
          <div className="rounded-lg mb-5 px-5 py-4" style={{ background: 'rgba(125,55,165,0.15)', border: '1px solid rgba(125,55,165,0.5)' }}>
            <p className="font-black mb-2.5" style={{ fontSize: '18px', color: '#fff' }}>{questionText}</p>
            <div className="flex flex-wrap gap-2.5">
              {questionTally.map(t => (
                <span key={t.label} className="px-3 py-1.5 rounded-lg font-black" style={{ fontSize: '16px', background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                  {t.label}: <span style={{ color: '#CCFA00' }}>{t.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div ref={scrollRef} className="overflow-x-auto">
          <table className="border-collapse" style={{ fontSize: '19px', minWidth: '1280px', width: '100%' }}>
            <thead>
              <tr>
                {['Player', 'Team', 'Result', 'Player 1', 'Player 2', 'Bonuses', 'Answer', 'Total'].map((h, i) => (
                  <th
                    key={h}
                    className="text-left whitespace-nowrap"
                    style={{
                      fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: 'rgba(255,255,255,0.45)', padding: '12px 16px',
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
                <tr key={row.userId} style={{ background: i % 2 === 1 ? 'rgba(255,255,255,0.03)' : undefined }}>
                  <td className="whitespace-nowrap" style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-center gap-2.5 font-black uppercase" style={{ color: '#fff' }}>
                      <span className="shrink-0">
                        {row.isBot ? <BotAvatar size={32} /> : (
                          <KitBadge
                            pattern={row.kit?.pattern ?? 'solid'}
                            colour1={row.kit?.colour1 ?? '#1E4D6B'}
                            colour2={row.kit?.colour2 ?? '#F5ECD9'}
                            colour3={row.kit?.colour3}
                            size={32}
                          />
                        )}
                      </span>
                      <span>{row.name}</span>
                      {row.isOwnPick && <span className="px-2 py-1 rounded" style={{ fontSize: '13px', background: '#A000FA', color: '#fff' }}>YOU</span>}
                      {row.isAutopick && <span className="px-2 py-1 rounded" style={{ fontSize: '13px', background: 'rgba(255,255,255,0.15)', color: '#fff' }} title="Autopicked">AP</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap font-black" style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', color: '#00F2FA' }}>
                    <div className="flex items-center gap-2">
                      <TeamCrest teamId={row.teamId} teamName={row.team} size={30} />
                      <span>{row.team}</span>
                      {row.isBanker && <span className="px-2 py-1 rounded font-black" style={{ fontSize: '13px', background: '#7D37A5', color: '#fff' }}>★B</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap font-mono" style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)', fontSize: '16px' }}>
                    {showScoring ? `${row.teamPoints ?? 0} pts` : 'Pending'}
                  </td>
                  <td className="whitespace-nowrap" style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', color: '#fff' }}>
                    {row.player1Name}
                    {row.player1Goal && <span className="ml-2 px-1.5 rounded font-black" style={{ fontSize: '13px', background: '#CCFA00', color: '#0A0A0A' }}>G</span>}
                    {row.player1Assist && <span className="ml-1 px-1.5 rounded font-black" style={{ fontSize: '13px', background: 'rgba(204,250,0,0.25)', color: '#CCFA00' }}>A</span>}
                    {showScoring && <span className="ml-2 font-mono" style={{ fontSize: '16px', color: 'rgba(255,255,255,0.6)' }}>({row.player1Points ?? 0})</span>}
                    {row.aon?.onPlayer1 && (
                      <span className="ml-2 px-2 py-1 rounded font-black" style={{ fontSize: '13px', background: aonBg[row.aon.outcome], color: row.aon.outcome === 'success' ? '#0A0A0A' : '#fff' }}>
                        {aonLabel[row.aon.outcome]}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap" style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', color: '#fff' }}>
                    {row.player2Name}
                    {row.player2Goal && <span className="ml-2 px-1.5 rounded font-black" style={{ fontSize: '13px', background: '#CCFA00', color: '#0A0A0A' }}>G</span>}
                    {row.player2Assist && <span className="ml-1 px-1.5 rounded font-black" style={{ fontSize: '13px', background: 'rgba(204,250,0,0.25)', color: '#CCFA00' }}>A</span>}
                    {showScoring && <span className="ml-2 font-mono" style={{ fontSize: '16px', color: 'rgba(255,255,255,0.6)' }}>({row.player2Points ?? 0})</span>}
                    {row.aon?.onPlayer2 && (
                      <span className="ml-2 px-2 py-1 rounded font-black" style={{ fontSize: '13px', background: aonBg[row.aon.outcome], color: row.aon.outcome === 'success' ? '#0A0A0A' : '#fff' }}>
                        {aonLabel[row.aon.outcome]}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap" style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {row.bonusCard ? (
                      <span className="px-2 py-1 rounded font-black" style={{ fontSize: '13px', background: '#00F2FA', color: '#0A0A0A' }}>
                        {bonusCardName}: {row.bonusCard.playerName}
                        {showScoring && row.bonusCard.points != null && ` +${row.bonusCard.points}`}
                      </span>
                    ) : (
                      <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap" style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.8)', fontSize: '17px' }}>
                    {row.answer ?? <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>}
                  </td>
                  <td className="whitespace-nowrap text-right font-mono font-black" style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', color: '#CCFA00', fontSize: '30px' }}>
                    {showScoring ? `${row.totalPoints ?? 0} pts` : 'Pending'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-4 mt-5" style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)' }}>
          <span><span className="px-2 py-1 rounded font-black" style={{ background: '#CCFA00', color: '#0A0A0A' }}>G</span> Goal</span>
          <span><span className="px-2 py-1 rounded font-black" style={{ background: 'rgba(204,250,0,0.25)', color: '#CCFA00' }}>A</span> Assist</span>
          <span><span className="px-2 py-1 rounded font-black" style={{ background: '#7D37A5', color: '#fff' }}>★B</span> Banker</span>
          <span><span className="px-2 py-1 rounded font-black" style={{ background: aonBg.pending, color: '#fff' }}>AoN</span> All or Nothing, pending</span>
          <span><span className="px-2 py-1 rounded font-black" style={{ background: aonBg.success, color: '#0A0A0A' }}>AoN ✓</span> succeeded</span>
          <span><span className="px-2 py-1 rounded font-black" style={{ background: aonBg.failed, color: '#fff' }}>AoN ✕</span> failed</span>
          <span><span className="px-2 py-1 rounded font-black" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>AP</span> Autopick</span>
        </div>
      </div>
    </div>
  )
}
